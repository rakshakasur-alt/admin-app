import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  UserCheck,
  BookOpen,
  Box,
  Crown,
  UtensilsCrossed
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  getCurrentHotel,
  getCurrentHotelId,
  getDishArRanking,
  getEngagementTimeline,
  getVisitorCount,
  normalizeRange,
  supabase
} from '../lib/supabaseClient';
import useDocumentTitle from '../lib/useDocumentTitle';
import { formatCurrency } from '../lib/formatters';

function TrendBadge({ value, isPercentagePoints = false, days = 7, fallback = null }) {
  const displayVal = value !== undefined && value !== null ? value : fallback;
  if (displayVal === null || displayVal === undefined) return null;

  const numVal = typeof displayVal === 'number' ? displayVal : parseFloat(displayVal);
  const isPositive = numVal > 0;
  const isNegative = numVal < 0;
  const isNeutral = numVal === 0;

  const color = isPositive ? 'var(--success-fg, #15803d)' : isNegative ? 'var(--danger-fg, #b91c1c)' : 'var(--text-muted)';
  const bg = isPositive ? 'var(--success-subtle, #ecfdf5)' : isNegative ? 'var(--danger-subtle, #fef2f2)' : 'var(--bg-muted)';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '11px',
        fontWeight: 600,
        color,
        background: bg,
        border: `1px solid ${isPositive ? 'rgba(21, 128, 61, 0.2)' : isNegative ? 'rgba(185, 28, 28, 0.2)' : 'var(--border)'}`,
        padding: '2px 6px',
        borderRadius: 'var(--radius-sm, 6px)',
      }}
    >
      {isPositive && <TrendingUp size={11} />}
      {isNegative && <TrendingDown size={11} />}
      {isNeutral && <Minus size={11} />}
      <span>
        {isPositive ? '+' : ''}{displayVal}{isPercentagePoints ? ' pts' : '%'} vs previous {days === 1 ? 'day' : `${days}d`}
      </span>
    </div>
  );
}

const cardStyle = {
  background: 'var(--bg-card, #FFFFFF)',
  border: '1px solid var(--border, #E8DED1)',
  borderRadius: 'var(--radius-lg, 12px)',
  padding: '20px',
  boxShadow: 'var(--shadow-xs, 0 1px 2px 0 rgb(43 29 23 / 0.05))',
};

export default function Analytics() {
  useDocumentTitle('Analytics');
  const [metrics, setMetrics] = useState({
    totalVisits: 0,
    uniqueVisitors: 0,
    totalArViews: 0,
    conversionRate: '0%',
  });
  const [dishesRanking, setDishesRanking] = useState([]);
  const [timeline, setTimeline] = useState([]);
  // Range: a preset number of days, or a custom { start, end } (YYYY-MM-DD)
  const [timeRangeDays, setTimeRangeDays] = useState(7);
  const [customRange, setCustomRange] = useState(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = localIso(new Date());
  const [draftStart, setDraftStart] = useState(() => localIso(new Date(Date.now() - 6 * 86400000)));
  const [draftEnd, setDraftEnd] = useState(todayIso);
  const activeRange = customRange || timeRangeDays;
  const rangeKey = customRange ? `${customRange.start}_${customRange.end}` : String(timeRangeDays);
  const periodDays = normalizeRange(activeRange).days;
  const rangeLabel = customRange
    ? `${new Date(`${customRange.start}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(`${customRange.end}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
    : timeRangeDays === 'lifetime' ? 'Lifetime' : timeRangeDays === 1 ? 'Today' : `Last ${timeRangeDays} Days`;
  const [loading, setLoading] = useState(true);
  const [hotelCurrency, setHotelCurrency] = useState('INR');

  useEffect(() => {
    let isMounted = true;
    let channel = null;

    let reloadTimer = null;
    let firstLoad = true;
    async function loadAnalytics() {
      // Skeleton only on the first load of a range; live refreshes are silent
      if (firstLoad) setLoading(true);
      firstLoad = false;
      const [stats, ranking, timelineData, hotel] = await Promise.all([
        getVisitorCount(activeRange),
        getDishArRanking(activeRange, { force: true }),
        getEngagementTimeline(activeRange),
        getCurrentHotel()
      ]);

      if (isMounted) {
        setMetrics(stats || {});
        setDishesRanking(ranking || []);
        setTimeline(timelineData || []);
        if (hotel?.currency) setHotelCurrency(hotel.currency);
        setLoading(false);
      }
    }

    loadAnalytics();

    // Set up realtime channel subscription for events, dishes, and hotel updates
    if (supabase) {
      getCurrentHotelId().then((hotelId) => {
        if (!isMounted || !hotelId) return;

        channel = supabase
          .channel(`analytics-live-${hotelId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'menu_events',
              filter: `hotel_id=eq.${hotelId}`,
            },
            () => {
              if (!isMounted) return;
              clearTimeout(reloadTimer);
              reloadTimer = setTimeout(loadAnalytics, 1500);
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'dishes',
              filter: `hotel_id=eq.${hotelId}`,
            },
            () => {
              if (!isMounted) return;
              clearTimeout(reloadTimer);
              reloadTimer = setTimeout(loadAnalytics, 1500);
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'hotels',
              filter: `id=eq.${hotelId}`,
            },
            () => {
              if (!isMounted) return;
              clearTimeout(reloadTimer);
              reloadTimer = setTimeout(loadAnalytics, 1500);
            }
          )
          .subscribe();
      });
    }

    // Auto-refresh when the tab becomes visible again (throttled)
    let lastFocusLoad = Date.now();
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible' && isMounted && Date.now() - lastFocusLoad > 60_000) {
        lastFocusLoad = Date.now();
        loadAnalytics();
      }
    };
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    window.addEventListener('hotel-menu-data-updated', loadAnalytics);

    return () => {
      isMounted = false;
      clearTimeout(reloadTimer);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.removeEventListener('hotel-menu-data-updated', loadAnalytics);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  function handleExportCSV() {
    const lines = [];
    lines.push('AR Hotel Menu SaaS - Analytics Export');
    lines.push(`Generated,"${new Date().toLocaleString()}"`);
    lines.push(`Timeframe,"${rangeLabel}"`);
    lines.push('');
    lines.push('--- SUMMARY KPI METRICS ---');
    lines.push('Metric,Current Value,Trend vs Prior Period');
    lines.push(`Unique Visitors,${metrics.uniqueVisitors || 0},${(metrics.trends?.uniqueVisitors > 0 ? '+' : '') + (metrics.trends?.uniqueVisitors || 0)}%`);
    lines.push(`New Visitors,${metrics.newVisitors || 0},`);
    lines.push(`Returning (Regular) Visitors,${metrics.returningVisitors || 0},${(metrics.trends?.returningVisitors > 0 ? '+' : '') + (metrics.trends?.returningVisitors || 0)}%`);
    lines.push(`Total Menu Visits,${metrics.totalVisits || 0},${(metrics.trends?.totalVisits > 0 ? '+' : '') + (metrics.trends?.totalVisits || 0)}%`);
    lines.push(`Dish Views (detail pages opened),${metrics.totalDishViews || 0},${(metrics.trends?.totalDishViews > 0 ? '+' : '') + (metrics.trends?.totalDishViews || 0)}%`);
    lines.push(`AR Views (3D opened on camera),${metrics.totalArViews || 0},${(metrics.trends?.totalArViews > 0 ? '+' : '') + (metrics.trends?.totalArViews || 0)}%`);
    lines.push(`AR Conversion Rate (AR views / dish views),${metrics.conversionRate || '0%'},${(metrics.trends?.conversionRate > 0 ? '+' : '') + (metrics.trends?.conversionRate || 0)} pts`);
    lines.push('');
    lines.push('--- DAILY ENGAGEMENT TIMELINE ---');
    lines.push('Period,Menu Visits,Dish Views,AR Views');
    (timeline || []).forEach(row => {
      lines.push(`"${row.date}",${row.visits || 0},${row.dishViews || 0},${row.arViews || 0}`);
    });
    lines.push('');
    lines.push('--- DISH AR POPULARITY RANKINGS ---');
    lines.push('Rank,Dish Name,Category,Price,Has 3D Model,AR Views,Dish Views,AR Conversion,Score (AR + Dish Views)');
    (dishesRanking || []).forEach((dish, idx) => {
      const name = (dish.name || '').replace(/"/g, '""');
      const cat = (dish.category || '').replace(/"/g, '""');
      lines.push(`${idx + 1},"${name}","${cat}",${dish.price || 0},${dish.hasModel ? 'Yes' : 'No'},${dish.arViews || 0},${dish.dishViews || 0},${dish.arConversion || 0}%,${dish.score || 0}`);
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `hotel-analytics-${rangeKey}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Derive category breakdown from dishesRanking
  const categoryStats = useMemo(() => {
    if (!dishesRanking || dishesRanking.length === 0) {
      return [];
    }

    // AR conversion per category = AR views ÷ dish views in that category
    const catMap = {};
    dishesRanking.forEach((d) => {
      const cat = d.category || 'Mains';
      if (!catMap[cat]) catMap[cat] = { ar: 0, views: 0 };
      catMap[cat].ar += d.arViews || 0;
      catMap[cat].views += d.dishViews || 0;
    });

    const entries = Object.entries(catMap)
      .filter(([, v]) => v.ar > 0 || v.views > 0)
      .map(([name, v]) => ({
        name,
        rate: v.views > 0 ? Math.min(100, Math.round((v.ar / v.views) * 100)) : (v.ar > 0 ? 100 : 0),
        ar: v.ar,
        views: v.views,
      }))
      .sort((a, b) => b.rate - a.rate || b.views - a.views)
      .map((e, idx) => ({ ...e, color: idx < 2 ? 'var(--accent, #C27835)' : 'var(--text-muted, #7D6F63)' }));

    return entries.slice(0, 4);
  }, [dishesRanking]);

  return (
    <div style={{ width: '100%', minHeight: '100%', boxSizing: 'border-box', padding: '24px 32px 48px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '1240px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & Breadcrumbs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>
              <Link to="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
              <span>•</span>
              <span style={{ color: 'var(--text-muted)' }}>Analytics</span>
              <span>•</span>
              <span style={{ color: 'var(--accent, #C27835)' }}>AR Performance Console</span>
            </nav>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)', color: 'var(--text, #271B14)', letterSpacing: '-0.02em' }}>
                Guest &amp; AR Analytics
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-full, 9999px)',
                  background: 'var(--bg-card, #FFFFFF)',
                  border: '1px solid var(--border, #E8DED1)',
                  color: 'var(--accent, #C27835)',
                  fontSize: '11px',
                  fontWeight: 600,
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <span style={{ position: 'relative', display: 'flex', width: '8px', height: '8px' }}>
                  <span
                    style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: '#10b981',
                      opacity: 0.75,
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }}
                  />
                  <span
                    style={{
                      position: 'relative',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#059669',
                    }}
                  />
                </span>
                Live Telemetry Active
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text-muted, #7D6F63)', maxWidth: '720px', lineHeight: 1.5 }}>
              Immersion telemetry, 3D model interaction rates, dining room spatial engagement, and post-visualization order conversions across palace dining saloons.
            </p>
          </div>

          {/* Actions & Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', alignSelf: 'flex-start' }}>
            <div
              style={{
                display: 'inline-flex',
                padding: '3px',
                borderRadius: 'var(--radius, 8px)',
                background: 'var(--bg-muted, #F0E8DC)',
                border: '1px solid var(--border, #E8DED1)',
              }}
            >
              {[
                { days: 1, label: '1 Day' },
                { days: 7, label: '7 Days' },
                { days: 30, label: '30 Days' },
                { days: 'lifetime', label: 'Lifetime' },
              ].map(opt => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => { setCustomRange(null); setShowCustomPicker(false); setTimeRangeDays(opt.days); }}
                  style={{
                    border: 'none',
                    background: !customRange && timeRangeDays === opt.days ? 'var(--bg-card, #FFFFFF)' : 'transparent',
                    color: !customRange && timeRangeDays === opt.days ? 'var(--accent, #C27835)' : 'var(--text-muted, #7D6F63)',
                    fontWeight: !customRange && timeRangeDays === opt.days ? 700 : 500,
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    boxShadow: !customRange && timeRangeDays === opt.days ? 'var(--shadow-xs)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCustomPicker(prev => !prev)}
                aria-expanded={showCustomPicker}
                style={{
                  border: 'none',
                  background: customRange ? 'var(--bg-card, #FFFFFF)' : 'transparent',
                  color: customRange ? 'var(--accent, #C27835)' : 'var(--text-muted, #7D6F63)',
                  fontWeight: customRange ? 700 : 500,
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm, 6px)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  boxShadow: customRange ? 'var(--shadow-xs)' : 'none',
                }}
              >
                {customRange ? `📅 ${rangeLabel}` : 'Custom'}
              </button>
            </div>

            {showCustomPicker && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draftStart || !draftEnd) return;
                  const [start, end] = draftStart <= draftEnd ? [draftStart, draftEnd] : [draftEnd, draftStart];
                  setCustomRange({ start, end });
                  setShowCustomPicker(false);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', padding: '6px 10px', borderRadius: 'var(--radius, 8px)', background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xs)' }}
              >
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  From
                  <input type="date" value={draftStart} max={todayIso} onChange={(e) => setDraftStart(e.target.value)} style={{ fontSize: '12px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                </label>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  To
                  <input type="date" value={draftEnd} max={todayIso} onChange={(e) => setDraftEnd(e.target.value)} style={{ fontSize: '12px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                </label>
                <button type="submit" style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: 'var(--primary-fg, #fff)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Apply
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-card, #FFFFFF)',
                color: 'var(--text, #271B14)',
                border: '1px solid var(--border, #E8DED1)',
                borderRadius: 'var(--radius, 8px)',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-xs)',
                transition: 'background 0.15s ease',
              }}
            >
              <Download size={14} color="var(--accent, #C27835)" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Cards Grid (3 Equal Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {loading ? (
          <>
            <div className="skeleton" style={{ height: '135px', borderRadius: 'var(--radius-lg)' }} />
            <div className="skeleton" style={{ height: '135px', borderRadius: 'var(--radius-lg)' }} />
            <div className="skeleton" style={{ height: '135px', borderRadius: 'var(--radius-lg)' }} />
          </>
        ) : (
          <>
            {/* Card 1: Unique Visitors */}
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Unique Visitors / Diners
                  </span>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius, 8px)',
                      background: 'var(--bg-subtle, #FAF7F2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent, #C27835)',
                    }}
                  >
                    <UserCheck size={16} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
                  <span style={{ fontSize: '30px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text, #271B14)', letterSpacing: '-0.02em' }}>
                    {(metrics?.uniqueVisitors ?? 0).toLocaleString()}
                  </span>
                  <TrendBadge value={metrics?.trends?.uniqueVisitors} days={periodDays} />
                </div>
              </div>
              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <span><strong style={{ color: 'var(--text)' }}>{(metrics?.newVisitors ?? 0).toLocaleString()}</strong> new</span>
                  <span><strong style={{ color: 'var(--text)' }}>{(metrics?.returningVisitors ?? 0).toLocaleString()}</strong> returning (regular)</span>
                </div>
                <span title="Each guest device gets an anonymous ID derived from the device itself (no cookies needed), so other browser profiles or incognito on the same phone are still one visitor. Unique = different devices that opened the menu. Returning = devices that opened the menu again 30+ minutes after their previous visit, or had visited before this period. New = unique − returning.">
                  ⓘ Unique = distinct guest devices. Returning = came back 30+ min later or visited before this period.
                </span>
              </div>
            </div>

            {/* Card 2: Total Digital Menu Visits */}
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Total Menu Visits
                  </span>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius, 8px)',
                      background: 'var(--bg-subtle, #FAF7F2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent, #C27835)',
                    }}
                  >
                    <BookOpen size={16} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
                  <span style={{ fontSize: '30px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text, #271B14)', letterSpacing: '-0.02em' }}>
                    {(metrics?.totalVisits ?? 0).toLocaleString()}
                  </span>
                  <TrendBadge value={metrics?.trends?.totalVisits} days={periodDays} />
                </div>
              </div>
              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
                Total page opens across standees
              </div>
            </div>

            {/* Card 3: Total AR 3D Views */}
            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Total AR 3D Views
                  </span>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius, 8px)',
                      background: 'var(--accent-subtle, rgba(194, 120, 53, 0.12))',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent, #C27835)',
                    }}
                  >
                    <Box size={16} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
                  <span style={{ fontSize: '30px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--accent, #C27835)', letterSpacing: '-0.02em' }}>
                    {(metrics?.totalArViews ?? 0).toLocaleString()}
                  </span>
                  <TrendBadge value={metrics?.trends?.totalArViews} days={periodDays} />
                </div>
              </div>
              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
                3D models opened live on a guest's camera
              </div>
            </div>
          </>
        )}
      </div>

      {/* Middle Section: Engagement Timeline + AR Conversion by Category */}
      <div
        className="analytics-middle-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)',
          gap: '16px',
          alignItems: 'stretch',
        }}
      >
        <style>{`
          @media (max-width: 1024px) {
            .analytics-middle-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>

        {/* Left: Engagement & Immersion Timeline */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                  Engagement &amp; Immersion Timeline
                </h2>
                <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Comparison of standard digital menu sessions vs. tactile WebAR dish projections
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#80756F' }} />
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>Menu Visits</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82A0' }} />
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>Dish Views</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent, #C27835)' }} />
                  <span style={{ color: 'var(--accent, #C27835)', fontWeight: 600 }}>AR Views</span>
                </div>
                {(() => {
                  const peak = (timeline || []).reduce((best, row) => {
                    const total = (row.visits || 0) + (row.dishViews || 0) + (row.arViews || 0);
                    return total > (best?.total || 0) ? { date: row.date, total } : best;
                  }, null);
                  return peak ? (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full, 9999px)',
                        background: 'var(--bg-subtle, #FAF7F2)',
                        border: '1px solid var(--border)',
                        fontSize: '11px',
                        color: 'var(--accent, #C27835)',
                        fontWeight: 600,
                      }}
                    >
                      Peak: {peak.date}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Recharts Area Container */}
            <div style={{ width: '100%', height: 260, marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="arGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C27835" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#C27835" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="menuGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#80756F" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#80756F" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card, #FFFFFF)',
                      borderRadius: '8px',
                      color: 'var(--text, #271B14)',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="visits"
                    name="Menu Visits"
                    stroke="#80756F"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#menuGlow)"
                  />
                  <Area
                    type="monotone"
                    dataKey="dishViews"
                    name="Dish Views"
                    stroke="#3B82A0"
                    strokeWidth={2}
                    fillOpacity={0}
                    fill="none"
                  />
                  <Area
                    type="monotone"
                    dataKey="arViews"
                    name="AR Views"
                    stroke="#C27835"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#arGlow)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Substrip mini stats (3 Equal Tiles) */}
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
            <div style={{ padding: '10px 14px', borderRadius: 'var(--radius, 8px)', background: 'var(--bg-subtle, #FAF7F2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                AR Conversion Rate
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent, #C27835)' }}>
                  {metrics.conversionRate || '0%'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }} title="AR views (3D opened on camera) ÷ dish views (dish details opened)">AR ÷ Dish views</span>
              </div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 'var(--radius, 8px)', background: 'var(--bg-subtle, #FAF7F2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                Dish Views
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                  {(metrics.totalDishViews || 0).toLocaleString()}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Details opened</span>
              </div>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 'var(--radius, 8px)', background: 'var(--bg-subtle, #FAF7F2)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                Unique Visitors
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                  {(metrics.uniqueVisitors || 0).toLocaleString()}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Devices</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: AR Conversion by Category */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                  AR Conversion by Category
                </h2>
                <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                  AR views ÷ dish views per menu section
                </p>
              </div>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius, 8px)',
                  background: 'var(--accent-subtle, rgba(194, 120, 53, 0.12))',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent, #C27835)',
                }}
              >
                <UtensilsCrossed size={16} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', marginTop: '22px' }}>
              {categoryStats.length === 0 ? (
                <div style={{ padding: '32px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No category AR interactions recorded yet
                </div>
              ) : (
                categoryStats.map((cat, idx) => (
                  <div key={cat.name || idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                        {cat.name}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: idx < 2 ? 'var(--accent, #C27835)' : 'var(--text-muted)',
                        }}
                      >
                        {cat.rate}% AR conv. <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>({cat.ar}/{cat.views})</span>
                      </span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '6px',
                        background: 'var(--bg-muted, #F0E8DC)',
                        borderRadius: 'var(--radius-full, 9999px)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, cat.rate))}%`,
                          height: '100%',
                          background: cat.color || (idx < 2 ? 'var(--accent, #C27835)' : 'var(--text-muted)'),
                          borderRadius: 'var(--radius-full, 9999px)',
                          transition: 'width 0.4s ease-out',
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Card: Dishes Ranked by AR Views & Engagement */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
              Dishes Ranked by AR Views &amp; Engagement
            </h2>
            <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
              Rank = AR views (3D opened on camera) + dish views (dish details opened). Highest total ranks first.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent, #C27835)',
                background: 'var(--accent-subtle, rgba(194, 120, 53, 0.12))',
                border: '1px solid var(--border)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm, 6px)',
              }}
            >
              Top {dishesRanking.length > 0 ? Math.min(dishesRanking.length, 10) : 10} Performed
            </span>
          </div>
        </div>

        {dishesRanking.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No dish engagement logged yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '10px 12px', width: '56px', textAlign: 'center' }}>Rank</th>
                  <th style={{ padding: '10px 12px' }}>Dish &amp; Culinary Profile</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }} title="Times the 3D model was opened live on a camera">AR Views</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }} title="Times guests opened this dish's details">View Rate</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }} title="AR views ÷ dish views">AR Conv.</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }} title="AR views + dish views">Score</th>
                </tr>
              </thead>
              <tbody>
                {dishesRanking.slice(0, 10).map((dish, idx) => {
                  const viewCount = dish.arViews ?? 0;
                  const dishViewCount = dish.dishViews ?? 0;
                  const hasModel = Boolean(dish.hasModel);

                  return (
                    <tr
                      key={dish.dishId || dish.id || idx}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {idx < 3 ? (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: idx === 0 ? '#fef3c7' : idx === 1 ? '#e2e8f0' : '#ffedd5',
                              color: idx === 0 ? '#b45309' : idx === 1 ? '#334155' : '#9a3412',
                              fontWeight: 700,
                              fontSize: '11px',
                            }}
                          >
                            <Crown size={13} />
                          </div>
                        ) : (
                          <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '12px' }}>
                            #{idx + 1}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {dish.thumbnail_url ? (
                            <img
                              src={dish.thumbnail_url}
                              alt={dish.name}
                              style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '8px',
                                background: 'var(--bg-subtle, #FAF7F2)',
                                border: '1px solid var(--border)',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: '18px',
                              }}
                            >
                              🍽️
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', fontSize: '13px' }}>
                              {dish.name}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {dish.category || 'Mains'} • {dish.veg ? 'Veg' : 'Non-Veg'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', fontSize: '13px' }}>
                        {dish.price ? formatCurrency(dish.price, hotelCurrency) : '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {hasModel ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full, 9999px)',
                              background: 'var(--success-subtle, #ecfdf5)',
                              color: 'var(--success-fg, #15803d)',
                              border: '1px solid rgba(21, 128, 61, 0.25)',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success-fg, #15803d)' }} />
                            3D Active
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full, 9999px)',
                              background: 'var(--bg-muted, #F0E8DC)',
                              color: 'var(--text-muted)',
                              fontSize: '11px',
                              fontWeight: 500,
                            }}
                          >
                            2D View Only
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--accent, #C27835)', fontSize: '14px' }}>
                        {viewCount.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--text)', fontSize: '13px' }}>
                        {dishViewCount.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--success-fg, #15803d)', fontWeight: 600, fontSize: '12px' }}>
                          {dishViewCount > 0 || viewCount > 0 ? `${dish.arConversion ?? 0}%` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', fontSize: '13px' }}>
                        {(dish.score ?? viewCount + dishViewCount).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
