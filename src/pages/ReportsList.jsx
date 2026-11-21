import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Flag,
  Clock,
  PieChart,
  Search,
  CheckCircle,
  FileDown,
  ShieldCheck,
  AlertTriangle,
  X,
  Edit3,
  Maximize2,
  Camera,
  Coins,
  Box,
  TrendingUp,
  Sparkles,
  CheckCheck,
} from 'lucide-react';
import {
  deleteResolvedReport,
  fetchAdminData,
  fetchHotelReports,
  fetchSuperAdminEmail,
  fetchSuperAdminMessages,
  getCurrentHotel,
  markNotificationAsRead,
  peekAdminData,
  peekHotelReports,
  supabase,
  updateReportStatus
} from '../lib/supabaseClient';
import { ResolvedHistoryPanel, SuperAdminCompliancePanel } from '../components/ReportsSidePanels';
import useDocumentTitle from '../lib/useDocumentTitle';
import { formatCurrency } from '../lib/formatters';

const REASON_LABELS = {
  fake_image: 'Presentation • Photo Mismatch',
  wrong_dimensions: 'AR Model Bug • Scale & Portion',
  misleading_ar: 'AR Model Bug • Scale & Portion',
  wrong_price: 'Pricing Discrepancy',
  allergen_advisory: 'Dish Report • Allergen Advisory',
  other: 'Guest Feedback Issue',
};

const STATUS_CONFIG = {
  open: { label: 'Open', bg: 'var(--danger-subtle, #fef2f2)', text: 'var(--danger-fg, #ba1a1a)', border: 'rgba(186, 26, 26, 0.25)' },
  reviewing: { label: 'In Review', bg: 'var(--warning-subtle, #fef3c7)', text: 'var(--warning-fg, #b45309)', border: 'rgba(180, 83, 9, 0.25)' },
  resolved: { label: 'Resolved', bg: 'var(--success-subtle, #ecfdf5)', text: 'var(--success-fg, #15803d)', border: 'rgba(21, 128, 61, 0.25)' },
  dismissed: { label: 'Dismissed', bg: 'var(--bg-muted, #F0E8DC)', text: 'var(--text-muted, #7D6F63)', border: 'var(--border, #E8DED1)' },
};

const cardStyle = {
  background: 'var(--bg-card, #FFFFFF)',
  border: '1px solid var(--border, #E8DED1)',
  borderRadius: 'var(--radius-lg, 12px)',
  padding: '24px',
  boxShadow: 'var(--shadow-xs, 0 1px 2px 0 rgb(43 29 23 / 0.05))',
};

export default function ReportsList() {
  useDocumentTitle('Guest Content Reports');
  const [searchParams] = useSearchParams();
  const cachedReports = peekHotelReports();
  const [reports, setReports] = useState(() => (cachedReports || []).filter(r => !String(r.id).startsWith('rep-sample-') && !r.is_demo));
  const [hotel, setHotel] = useState(null);
  // Default view: only tickets still open for review (open + in review)
  const [filter, setFilter] = useState('active');
  const [issueFilter, setIssueFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(() => !cachedReports);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [message, setMessage] = useState('');
  const [adminMessages, setAdminMessages] = useState([]);
  const [adminMessagesLoading, setAdminMessagesLoading] = useState(true);
  const [suspendedDishes, setSuspendedDishes] = useState(() => (peekAdminData()?.dishes || []).filter(d => d.is_suspended));
  const [superAdminEmail, setSuperAdminEmail] = useState('rakshakasur@gmail.com');
  const [ownerEmail, setOwnerEmail] = useState('');

  async function loadData(force = false) {
    const curHotel = await getCurrentHotel();
    setHotel(curHotel);
    if (!curHotel?.id) {
      setLoading(false);
      setAdminMessagesLoading(false);
      return;
    }

    // Everything in parallel; the report list renders as soon as it arrives
    const reportsPromise = fetchHotelReports(curHotel.id, { force }).then(({ reports: data, error }) => {
      if (!error && Array.isArray(data)) {
        setReports(data.filter(r => !String(r.id).startsWith('rep-sample-') && !r.is_demo));
      }
      setLoading(false);
    });
    const messagesPromise = fetchSuperAdminMessages({ force }).then(({ messages }) => {
      setAdminMessages(messages || []);
      setAdminMessagesLoading(false);
    });
    const dishesPromise = fetchAdminData({ force }).then((data) => {
      setSuspendedDishes((data?.dishes || []).filter(d => d.is_suspended));
    }).catch(() => {});
    await Promise.all([reportsPromise, messagesPromise, dishesPromise]);
  }

  useEffect(() => {
    let channel = null;
    let mounted = true;
    let timer = null;
    loadData();
    fetchSuperAdminEmail().then(res => { if (mounted && res?.email) setSuperAdminEmail(res.email); }).catch(() => {});
    if (supabase) {
      supabase.auth.getUser().then(({ data }) => { if (mounted && data?.user?.email) setOwnerEmail(data.user.email); }).catch(() => {});
    }

    if (!supabase) return () => { mounted = false; };

    getCurrentHotel().then(h => {
      if (!mounted || !h?.id) return;
      const refresh = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { if (mounted) loadData(true); }, 400);
      };
      channel = supabase
        .channel(`hotel-reports-${h.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports', filter: `hotel_id=eq.${h.id}` }, refresh)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dishes', filter: `hotel_id=eq.${h.id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_notifications' }, refresh)
        .subscribe();
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, []);

  // Deep link from dashboard / menu: /reports?view=suspended
  useEffect(() => {
    if (searchParams.get('view') !== 'suspended') return;
    const t = setTimeout(() => {
      document.getElementById('super-admin-compliance')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => clearTimeout(t);
  }, [searchParams, suspendedDishes.length]);

  async function handleStatusChange(reportId, newStatus) {
    setActionInProgress(reportId);
    setMessage('');

    if (supabase && !reportId.startsWith('rep-sample-')) {
      const { error } = await updateReportStatus(reportId, newStatus);
      if (error) {
        setMessage(`Failed to update report: ${error.message}`);
        setActionInProgress(null);
        return;
      }
    }

    setReports(prev => prev.map(r => (r.id === reportId ? { ...r, status: newStatus } : r)));
    setMessage(newStatus === 'resolved'
      ? 'Report resolved — it is now listed under Resolved History.'
      : `Report marked as "${newStatus}".`);
    setActionInProgress(null);
  }

  async function handleResolveAllVerified() {
    const openReports = reports.filter(r => r.status === 'open' || r.status === 'reviewing');
    if (openReports.length === 0) {
      setMessage('No active or pending flags to resolve.');
      return;
    }
    setActionInProgress('all');
    const results = await Promise.all(openReports.map(r => updateReportStatus(r.id, 'resolved')));
    const failedIds = new Set(openReports.filter((_, i) => results[i]?.error).map(r => r.id));
    setReports(prev => prev.map(r => (
      (r.status === 'open' || r.status === 'reviewing') && !failedIds.has(r.id) ? { ...r, status: 'resolved' } : r
    )));
    setActionInProgress(null);
    setMessage(failedIds.size
      ? `${openReports.length - failedIds.size} resolved, ${failedIds.size} could not be updated.`
      : `All ${openReports.length} active tickets marked as resolved.`);
  }

  async function handleDeleteResolved(reportId) {
    const { error } = await deleteResolvedReport(reportId);
    if (error) {
      const msg = /permission denied/i.test(error.message || '')
        ? 'Delete is blocked by the database. Run supabase/functions/fix_debug_v3_bugs.sql once in the Supabase SQL editor.'
        : error.message;
      setMessage(msg);
      return { error: new Error(msg) };
    }
    setReports(prev => prev.filter(r => r.id !== reportId));
    setMessage('Resolved ticket deleted.');
    return { error: null };
  }

  async function handleMarkAdminMessageRead(id) {
    setAdminMessages(prev => prev.map(m => (m.id === id ? { ...m, is_read: true } : m)));
    await markNotificationAsRead(id);
  }

  function handleExportAuditLog() {
    const lines = [];
    lines.push('AR Hotel Menu SaaS - Guest Reports & Feedback Audit Log');
    lines.push(`Generated,"${new Date().toLocaleString()}"`);
    lines.push(`Hotel,"${hotel?.name || 'Hotel Restaurant'}"`);
    lines.push('');
    lines.push('ID,Dish Name,Category,Price,Reason / Issue,Status,Created At,Guest Feedback Details');

    reports.forEach(r => {
      const dishName = (r.dishes?.name || r.dish_name || 'N/A').replace(/"/g, '""');
      const cat = (r.dishes?.category || r.category || 'Dining').replace(/"/g, '""');
      const price = r.dishes?.price || r.price || 0;
      const reason = (r.reason_label || REASON_LABELS[r.reason] || r.reason || 'Issue').replace(/"/g, '""');
      const details = (r.details || '').replace(/"/g, '""');
      lines.push(`"${r.id}","${dishName}","${cat}",${price},"${reason}","${r.status}","${r.created_at}","${details}"`);
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `guest-reports-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const counts = useMemo(() => ({
    all: reports.length,
    active: reports.filter(r => r.status === 'open' || r.status === 'reviewing').length,
    open: reports.filter(r => r.status === 'open').length,
    reviewing: reports.filter(r => r.status === 'reviewing').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
    dismissed: reports.filter(r => r.status === 'dismissed').length,
  }), [reports]);

  const oldestOpenAge = useMemo(() => {
    const open = reports.filter(r => r.status === 'open' || r.status === 'reviewing');
    if (!open.length) return null;
    const oldest = Math.min(...open.map(r => new Date(r.created_at).getTime()));
    const mins = Math.max(0, Math.round((Date.now() - oldest) / 60000));
    if (mins < 60) return { value: mins, unit: mins === 1 ? 'min' : 'mins' };
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return { value: hrs, unit: hrs === 1 ? 'hour' : 'hours' };
    const days = Math.round(hrs / 24);
    return { value: days, unit: 'days' };
  }, [reports]);

  // Multi-tier filtering: Status tab, Secondary issue type, and Search input
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      // 1. Status Filter
      if (filter === 'active') {
        if (r.status !== 'open' && r.status !== 'reviewing') return false;
      } else if (filter !== 'all' && r.status !== filter) return false;

      // 2. Issue Category Filter
      if (issueFilter === 'ar') {
        const str = `${r.reason} ${r.reason_label || ''}`.toLowerCase();
        if (!str.includes('ar') && !str.includes('dimension') && !str.includes('scale') && !str.includes('model')) return false;
      } else if (issueFilter === 'pricing') {
        const str = `${r.reason} ${r.reason_label || ''}`.toLowerCase();
        if (!str.includes('price') && !str.includes('pricing')) return false;
      } else if (issueFilter === 'photo') {
        const str = `${r.reason} ${r.reason_label || ''}`.toLowerCase();
        if (!str.includes('photo') && !str.includes('image') && !str.includes('presentation') && !str.includes('portion')) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const dishName = (r.dishes?.name || r.dish_name || '').toLowerCase();
        const details = (r.details || '').toLowerCase();
        const reason = (r.reason_label || REASON_LABELS[r.reason] || r.reason || '').toLowerCase();
        if (!dishName.includes(q) && !details.includes(q) && !reason.includes(q)) return false;
      }

      return true;
    });
  }, [reports, filter, issueFilter, searchQuery]);

  return (
    <div style={{ width: '100%', minHeight: '100%', boxSizing: 'border-box', padding: '24px 32px 48px 32px', background: 'var(--bg)' }}>
      <style>{`
        .reports-layout-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (min-width: 1080px) {
          .reports-layout-grid {
            grid-template-columns: minmax(0, 1.95fr) minmax(320px, 1.05fr);
          }
        }
      `}</style>
      <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Breadcrumb & Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>
            <Link to="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
            <span>•</span>
            <span style={{ color: 'var(--accent, #C27835)' }}>Guest Content Reports</span>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)', color: 'var(--text, #271B14)', letterSpacing: '-0.02em' }}>
              Guest Content Reports &amp; Feedback
            </h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: 'var(--radius-full, 9999px)',
                background: 'var(--accent-subtle, #F8EFE6)',
                border: '1px solid var(--border)',
                color: 'var(--accent, #C27835)',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              {counts.open} Active {counts.open === 1 ? 'Discrepancy' : 'Discrepancies'}
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted, #7D6F63)', maxWidth: '780px', lineHeight: 1.5 }}>
            Live patron flags regarding dish photography, portion dimensions, 3D AR model physical scale, allergen advisories, or pricing synced with your restaurant point-of-sale.
          </p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportAuditLog}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-card, #FFFFFF)',
              color: 'var(--text, #271B14)',
              border: '1px solid var(--border, #E8DED1)',
              borderRadius: 'var(--radius, 8px)',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-xs)',
              transition: 'background 0.15s ease',
            }}
          >
            <FileDown size={15} color="var(--accent, #C27835)" />
            <span>Export Audit Log</span>
          </button>

          <button
            type="button"
            onClick={handleResolveAllVerified}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--primary, #271B14)',
              color: 'var(--primary-fg, #FFFFFF)',
              border: '1px solid var(--primary)',
              borderRadius: 'var(--radius, 8px)',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              transition: 'opacity 0.15s ease',
            }}
          >
            <CheckCheck size={15} />
            <span>Resolve All Verified</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius, 8px)',
            background: 'var(--accent-subtle, #F8EFE6)',
            color: 'var(--accent, #C27835)',
            fontSize: '12px',
            fontWeight: 600,
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => setMessage('')}
            style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Summary Strip (3 Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Card 1: Pending Guest Flags */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent, #C27835)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pending Guest Flags
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text, #271B14)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {String(counts.open).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '11px', color: counts.open > 0 ? 'var(--danger-fg, #ba1a1a)' : 'var(--success-fg, #15803d)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <AlertTriangle size={12} />
                  {counts.open > 0 ? `${counts.open} Action Needed` : 'All Clear'}
                </span>
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius, 8px)',
                background: 'var(--accent-subtle, rgba(194, 120, 53, 0.12))',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #C27835)',
              }}
            >
              <Flag size={20} />
            </div>
          </div>
          <div
            style={{
              marginTop: '14px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              background: 'var(--bg-subtle, #FAF7F2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: counts.open > 0 ? 'var(--danger-fg, #ba1a1a)' : 'var(--success-fg, #15803d)' }} />
              {counts.open > 0 ? 'Management Review required' : 'All reports addressed'}
            </span>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>Live Service</span>
          </div>
        </div>

        {/* Card 2: Oldest open ticket (real data, no demo numbers) */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent, #C27835)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Oldest Open Ticket
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
                <span style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text, #271B14)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {oldestOpenAge ? oldestOpenAge.value : '—'}
                </span>
                <span style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 600 }}>{oldestOpenAge ? oldestOpenAge.unit : 'none open'}</span>
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius, 8px)',
                background: 'var(--bg-subtle, #FAF7F2)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text)',
              }}
            >
              <Clock size={20} />
            </div>
          </div>
          <div
            style={{
              marginTop: '14px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              background: 'var(--bg-subtle, #FAF7F2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            <span>Waiting for your review</span>
            <span style={{ fontWeight: 600, color: 'var(--accent, #C27835)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <TrendingUp size={12} /> {counts.resolved} resolved so far
            </span>
          </div>
        </div>

        {/* Card 3: Category Breakdown */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent, #C27835)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Category Breakdown
              </span>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginTop: '6px' }}>
                {counts.open} Active / {counts.resolved + counts.dismissed} Handled
              </div>
            </div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius, 8px)',
                background: 'var(--bg-subtle, #FAF7F2)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #C27835)',
              }}
            >
              <PieChart size={20} />
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            {reports.length === 0 ? (
              <div style={{ padding: '8px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                No category discrepancies logged
              </div>
            ) : (
              (() => {
                const total = reports.length;
                const pricing = Math.round((reports.filter(r => (r.reason || '').includes('price')).length / total) * 100);
                const ar = Math.round((reports.filter(r => (r.reason || '').includes('ar') || (r.reason || '').includes('dimension')).length / total) * 100);
                const photo = Math.max(0, 100 - pricing - ar);
                return (
                  <>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-muted)', borderRadius: '9999px', display: 'flex', overflow: 'hidden' }}>
                      {pricing > 0 && <div style={{ height: '100%', width: `${pricing}%`, background: 'var(--danger-fg, #ba1a1a)' }} title={`Pricing ${pricing}%`} />}
                      {ar > 0 && <div style={{ height: '100%', width: `${ar}%`, background: 'var(--accent, #C27835)' }} title={`3D AR ${ar}%`} />}
                      {photo > 0 && <div style={{ height: '100%', width: `${photo}%`, background: 'var(--text-muted, #7D6F63)' }} title={`Photo/Other ${photo}%`} />}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger-fg, #ba1a1a)' }} /> Pricing {pricing}%
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent, #C27835)' }} /> 3D AR {ar}%
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted, #7D6F63)' }} /> Plating {photo}%
                      </span>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div style={{ ...cardStyle, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          {/* Status Pills */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: 'active', label: `Open for Review (${counts.active})` },
              { id: 'open', label: 'New', count: counts.open, isCritical: counts.open > 0 },
              { id: 'reviewing', label: `In Review (${counts.reviewing})` },
              { id: 'resolved', label: `Resolved (${counts.resolved})` },
              { id: 'dismissed', label: `Dismissed (${counts.dismissed})` },
              { id: 'all', label: `All (${counts.all})` },
            ].map(tab => {
              const isActive = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full, 9999px)',
                    border: '1px solid var(--border)',
                    background: isActive ? 'var(--primary, #271B14)' : 'var(--bg-subtle, #FAF7F2)',
                    color: isActive ? 'var(--primary-fg, #FFFFFF)' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '9999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: tab.isCritical ? 'var(--danger-fg, #ba1a1a)' : 'var(--bg-muted)',
                        color: tab.isCritical ? '#FFFFFF' : 'var(--text)',
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search dish, table or tag..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 34px',
                borderRadius: 'var(--radius, 8px)',
                background: 'var(--bg-subtle, #FAF7F2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Secondary Issue Type Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Filter By:
          </span>
          {[
            { id: 'all', label: 'All Issues', icon: null },
            { id: 'ar', label: '3D Model Scale & AR Bug', icon: <Box size={13} color="var(--accent)" /> },
            { id: 'pricing', label: 'Pricing Discrepancy', icon: <Coins size={13} /> },
            { id: 'photo', label: 'Portion / Photo Mismatch', icon: <Camera size={13} /> },
          ].map(opt => {
            const isSelected = issueFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIssueFilter(opt.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid var(--border)',
                  background: isSelected ? 'var(--bg-card, #FFFFFF)' : 'var(--bg-subtle, #FAF7F2)',
                  color: isSelected ? 'var(--text, #271B14)' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  boxShadow: isSelected ? 'var(--shadow-xs)' : 'none',
                }}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Dual-Column Layout (12 cols) */}
      <div className="reports-layout-grid">
        {/* LEFT COLUMN: Active Discrepancy Feed (~65%) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 2, minWidth: '340px' }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading guest content reports…
            </div>
          ) : filteredReports.length === 0 ? (
            <div
              style={{
                ...cardStyle,
                padding: '48px 24px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'var(--accent-subtle, #F8EFE6)',
                  color: 'var(--accent, #C27835)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <ShieldCheck size={28} />
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                No reports matching filter
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', maxWidth: '400px' }}>
                Your live menu is currently spotless with no open discrepancies under this view.
              </p>
            </div>
          ) : (
            filteredReports.map(report => {
              const dish = report.dishes || {
                name: report.dish_name || 'Signature Dish',
                category: report.category || 'Starters',
                price: report.price || 480,
                thumbnail_url: report.thumbnail_url,
                veg: report.veg ?? true,
                badge: report.badge,
              };

              const reasonLabel = report.reason_label || REASON_LABELS[report.reason] || report.reason || 'Dish Report';
              const isUrgent = report.priority === 'Urgent Priority' || report.reason === 'allergen_advisory';
              const conf = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;

              return (
                <article
                  key={report.id}
                  style={{
                    ...cardStyle,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    transition: 'box-shadow 0.2s ease',
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-full)',
                          background: isUrgent ? 'var(--danger-subtle, #ffdad6)' : 'var(--accent-subtle, #F8EFE6)',
                          color: isUrgent ? 'var(--danger-fg, #ba1a1a)' : 'var(--accent, #C27835)',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          border: `1px solid ${isUrgent ? 'rgba(186, 26, 26, 0.2)' : 'var(--border)'}`,
                        }}
                      >
                        {isUrgent ? <AlertTriangle size={12} /> : <Box size={12} />}
                        {reasonLabel}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--bg-subtle, #FAF7F2)',
                          color: 'var(--text-muted)',
                          fontSize: '11px',
                          fontWeight: 500,
                          border: '1px solid var(--border)',
                        }}
                      >
                        {report.priority || 'Standard'}
                      </span>
                      <span
                        style={{
                          background: conf.bg,
                          color: conf.text,
                          border: `1px solid ${conf.border}`,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {conf.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <Clock size={13} color="var(--accent)" />
                      <span>{report.time_label || new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  {/* Dish Context & Meta */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    {dish.thumbnail_url ? (
                      <img
                        src={dish.thumbnail_url}
                        alt={dish.name}
                        style={{ width: '90px', height: '90px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '90px',
                          height: '90px',
                          borderRadius: '10px',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '32px',
                          flexShrink: 0,
                        }}
                      >
                        🍽️
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                          {dish.name}
                        </h2>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent, #C27835)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {dish.category || 'Mains'} • {dish.price ? formatCurrency(dish.price, hotel?.currency || 'INR') : '—'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          {dish.veg ? 'Vegetarian' : 'Non-Veg'}
                        </span>
                        {dish.badge && (
                          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 600 }}>
                            {dish.badge}
                          </span>
                        )}
                        <Link
                          to={`/dish-form?id=${dish.id || report.dish_id || ''}`}
                          style={{ fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, marginLeft: '4px' }}
                        >
                          Edit Dish →
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Guest Feedback Callout Box */}
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 'var(--radius, 8px)',
                      background: 'var(--bg-subtle, #FAF7F2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                      <Sparkles size={14} color="var(--accent)" />
                      <span>{report.source || 'Patron Feedback via Tabletop QR Menu'}:</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.5, paddingLeft: '20px' }}>
                      "{report.details}"
                    </p>

                    {/* Scale / Portion Comparison Widget if present */}
                    {report.scale_metrics && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '6px', paddingLeft: '20px' }}>
                        <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Reported AR Display Scale</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{report.scale_metrics.ar_scale}</div>
                          </div>
                          <Maximize2 size={16} color="var(--accent)" />
                        </div>
                        <div style={{ padding: '10px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Actual Platter Spec (Kitchen)</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                              {report.scale_metrics.kitchen_spec}{' '}
                              <span style={{ fontSize: '11px', color: 'var(--danger-fg, #ba1a1a)' }}>({report.scale_metrics.variance})</span>
                            </div>
                          </div>
                          <AlertTriangle size={16} color="var(--danger-fg, #ba1a1a)" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {report.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={actionInProgress === report.id}
                          onClick={() => handleStatusChange(report.id, 'resolved')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '8px 14px',
                            borderRadius: 'var(--radius, 8px)',
                            background: 'var(--primary, #271B14)',
                            color: 'var(--primary-fg, #FFFFFF)',
                            border: '1px solid var(--primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-xs)',
                          }}
                        >
                          <CheckCircle size={14} />
                          <span>Mark as Resolved</span>
                        </button>
                      )}

                      <Link
                        to={`/dish-form?id=${dish.id || report.dish_id || ''}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '8px 14px',
                          borderRadius: 'var(--radius, 8px)',
                          background: 'var(--bg-subtle, #FAF7F2)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                          fontSize: '12px',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        <Edit3 size={14} />
                        <span>
                          {report.reason === 'wrong_dimensions' ? 'Reupload 3D Dimensions' : report.reason === 'allergen_advisory' ? 'Adjust Allergen Tags' : 'Edit Dish Profile'}
                        </span>
                      </Link>

                      {report.status !== 'reviewing' && report.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={actionInProgress === report.id}
                          onClick={() => handleStatusChange(report.id, 'reviewing')}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius, 8px)',
                            background: 'var(--warning-subtle)',
                            color: 'var(--warning-fg)',
                            border: '1px solid rgba(180, 83, 9, 0.3)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Mark In Review
                        </button>
                      )}
                    </div>

                    {report.status !== 'dismissed' && (
                      <button
                        type="button"
                        disabled={actionInProgress === report.id}
                        onClick={() => handleStatusChange(report.id, 'dismissed')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          padding: '6px 8px',
                        }}
                      >
                        <X size={14} />
                        <span>Dismiss Flag</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: Super Admin Compliance + Resolved History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minWidth: '320px' }}>
          <SuperAdminCompliancePanel
            messages={adminMessages}
            suspendedDishes={suspendedDishes}
            hotel={hotel}
            superAdminEmail={superAdminEmail}
            ownerEmail={ownerEmail}
            loading={adminMessagesLoading}
            onMarkRead={handleMarkAdminMessageRead}
          />
          <ResolvedHistoryPanel
            reports={reports}
            reasonLabels={REASON_LABELS}
            onDelete={handleDeleteResolved}
          />
        </div>
      </div>
    </div>
    </div>
  );
}
