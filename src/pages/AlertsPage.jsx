import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  fetchAdminData,
  fetchPlatformNotificationsForOwner,
  dismissNotification,
  dismissAllNotifications,
  supabase
} from '../lib/supabaseClient';
import useDocumentTitle from '../lib/useDocumentTitle';
import { buildAlerts } from '../lib/dishAlerts';

const ALERT_TYPES = {
  missing_image: {
    label: 'Missing Cover Image',
    description: (name) => `"${name}" has no photo. Guests see a placeholder — add an image to improve appeal.`,
    icon: '🖼️',
    color: 'var(--warning-fg, #b45309)',
    bg: 'var(--warning-subtle, #fef3c7)',
    border: 'rgba(180, 83, 9, 0.2)',
    severity: 'warning',
  },
  missing_3d: {
    label: 'Missing 3D / AR Model',
    description: (name) => `"${name}" has no GLB or USDZ model. The "View in 3D AR" button will be disabled for guests.`,
    icon: '📦',
    color: 'var(--accent, #C27835)',
    bg: 'rgba(194, 120, 53, 0.08)',
    border: 'rgba(194, 120, 53, 0.25)',
    severity: 'info',
  },
  missing_allergens: {
    label: 'Missing Allergen Info',
    description: (name) => `"${name}" has no allergen tags. This may present a compliance or guest safety risk.`,
    icon: '⚠️',
    color: 'var(--danger-fg, #b91c1c)',
    bg: 'var(--danger-subtle, #fef2f2)',
    border: 'rgba(185, 28, 28, 0.2)',
    severity: 'error',
  },
  missing_price: {
    label: 'Missing Price',
    description: (name) => `"${name}" has no price set. Guests will see ₹0 or no price on the menu card.`,
    icon: '💰',
    color: 'var(--danger-fg, #b91c1c)',
    bg: 'var(--danger-subtle, #fef2f2)',
    border: 'rgba(185, 28, 28, 0.2)',
    severity: 'error',
  },
  suspended: {
    label: 'Dish Suspended / Hidden',
    description: (name) => `"${name}" is suspended and hidden from the guest menu. Reactivate it when ready.`,
    icon: '🚫',
    color: 'var(--text-muted)',
    bg: 'var(--bg-subtle, #FAF7F2)',
    border: 'var(--border)',
    severity: 'neutral',
  },
};

const NOTIF_CONFIG = {
  info: { label: 'Announcement', bg: 'var(--accent-subtle, #eff6ff)', fg: 'var(--accent, #2563eb)', icon: 'ℹ️', border: 'rgba(59, 130, 246, 0.2)' },
  update: { label: 'Platform Update', bg: 'rgba(99, 102, 241, 0.1)', fg: '#6366f1', icon: '🚀', border: 'rgba(99, 102, 241, 0.25)' },
  warning: { label: 'Advisory', bg: 'var(--warning-subtle, #fffbeb)', fg: 'var(--warning-fg, #b45309)', icon: '⚠️', border: 'rgba(180, 83, 9, 0.25)' },
  critical: { label: 'Urgent Alert', bg: 'var(--danger-subtle, #fef2f2)', fg: 'var(--danger-fg, #dc2626)', icon: '🚨', border: 'rgba(220, 38, 38, 0.25)' }
};


const SEVERITY_ORDER = { error: 0, warning: 1, info: 2, neutral: 3 };

export default function AlertsPage() {
  useDocumentTitle('Alerts');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = searchParams.get('type');
  const [dishes, setDishes] = useState([]);
  const [platformNotifs, setPlatformNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState(ALERT_TYPES[initialType] ? initialType : 'all');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'notifications', 'dishes'

  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam && ALERT_TYPES[typeParam]) {
      setFilterType(typeParam);
    }
  }, [searchParams]);

  async function loadData() {
    try {
      const [adminRes, notifRes] = await Promise.all([
        fetchAdminData(),
        fetchPlatformNotificationsForOwner()
      ]);
      if (adminRes?.dishes) setDishes(adminRes.dishes);
      if (notifRes?.notifications) setPlatformNotifs(notifRes.notifications);
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    window.addEventListener('hotel-menu-data-updated', loadData);

    if (supabase) {
      const channel = supabase
        .channel('alerts-page-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_notifications' }, loadData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, loadData)
        .subscribe();

      return () => {
        window.removeEventListener('hotel-menu-data-updated', loadData);
        supabase.removeChannel(channel);
      };
    }

    return () => {
      window.removeEventListener('hotel-menu-data-updated', loadData);
    };
  }, []);

  async function handleDeleteNotif(notifId) {
    await dismissNotification(notifId);
    setPlatformNotifs(prev => prev.filter(n => n.id !== notifId));
  }

  async function handleDeleteAllNotifs() {
    const ids = platformNotifs.map(n => n.id);
    if (ids.length === 0) return;
    await dismissAllNotifications(ids);
    setPlatformNotifs([]);
  }

  const allAlerts = buildAlerts(dishes).sort(
    (a, b) => SEVERITY_ORDER[ALERT_TYPES[a.type].severity] - SEVERITY_ORDER[ALERT_TYPES[b.type].severity]
  );

  const filtered = filterType === 'all' ? allAlerts : allAlerts.filter(a => a.type === filterType);

  const typeCounts = Object.keys(ALERT_TYPES).reduce((acc, t) => {
    acc[t] = allAlerts.filter(a => a.type === t).length;
    return acc;
  }, {});

  return (
    <div style={{ width: '100%', minHeight: '100%', boxSizing: 'border-box', padding: '24px 32px 48px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: '1060px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Header */}
        <div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>
            <Link to="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Dashboard</Link>
            <span>•</span>
            <Link to="/reports" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Notifications</Link>
            <span>•</span>
            <span style={{ color: 'var(--accent, #C27835)' }}>Alert</span>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
                Menu Quality Alerts
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Auto-detected issues across your dish catalog. Fix these to improve guest experience and AR completeness.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: allAlerts.length > 0 ? 'var(--danger-fg, #b91c1c)' : 'var(--success-fg, #15803d)', background: allAlerts.length > 0 ? 'var(--danger-subtle, #fef2f2)' : 'var(--success-subtle, #ecfdf5)', border: `1px solid ${allAlerts.length > 0 ? 'rgba(185,28,28,0.2)' : 'rgba(21,128,61,0.2)'}`, padding: '4px 10px', borderRadius: '999px' }}>
                {allAlerts.length > 0 ? `${allAlerts.length} Active Alert${allAlerts.length !== 1 ? 's' : ''}` : '✓ All Clear'}
              </span>
            </div>
          </div>
        </div>

        {/* Platform & System Announcements Section */}
        <section style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px 24px',
          boxShadow: 'var(--shadow-xs)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📢</span>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                System Push Notifications &amp; Platform Announcements
              </h2>
              <span style={{ fontSize: '11px', background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
                {platformNotifs.length} Total
              </span>
            </div>

            {platformNotifs.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteAllNotifs}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid rgba(220, 38, 38, 0.3)',
                  background: 'var(--danger-subtle, #fef2f2)',
                  color: 'var(--danger-fg, #dc2626)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>🗑️</span>
                <span>Delete All Notifications</span>
              </button>
            )}
          </div>

          {platformNotifs.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
              No active platform announcements or system notices. All clear!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {platformNotifs.map((notif) => {
                const conf = NOTIF_CONFIG[notif.type] || NOTIF_CONFIG.info;
                return (
                  <div
                    key={notif.id}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: `1px solid ${conf.border}`,
                      borderLeft: `4px solid ${conf.fg}`,
                      background: 'var(--bg-subtle)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                      <span style={{ fontSize: '18px', marginTop: '2px' }}>{conf.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: conf.fg, background: conf.bg, padding: '1px 6px', borderRadius: '4px' }}>
                            {conf.label}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                            {notif.title}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            · {new Date(notif.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          {notif.message}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteNotif(notif.id)}
                      title="Delete notification"
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                        transition: 'all 0.15s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.color = '#dc2626';
                        e.currentTarget.style.borderColor = '#dc2626';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      <span>🗑️</span>
                      <span>Delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Catalog Dish Alerts Header */}
        <div style={{ marginTop: '8px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            Dish Quality &amp; Completeness Checks
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Issues detected across menu items affecting guest presentation and AR readiness.
          </p>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {Object.entries(ALERT_TYPES).map(([key, def]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterType(filterType === key ? 'all' : key)}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: `1px solid ${filterType === key ? def.border : 'var(--border)'}`,
                background: filterType === key ? def.bg : 'var(--bg-card)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                boxShadow: filterType === key ? 'var(--shadow-xs)' : 'none'
              }}
            >
              <div style={{ fontSize: '16px', marginBottom: '4px' }}>{def.icon}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: filterType === key ? def.color : 'var(--text)', lineHeight: 1.3 }}>{def.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: typeCounts[key] > 0 ? def.color : 'var(--text-muted)', marginTop: '4px' }}>
                {typeCounts[key]}
              </div>
            </button>
          ))}
        </div>

        {/* Alert list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading dish catalog…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '16px', fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                {filterType === 'all' ? 'No alerts — all dishes look great!' : `No "${ALERT_TYPES[filterType]?.label}" alerts`}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                {dishes.length === 0 ? 'Add your first dish to begin quality monitoring.' : 'Keep up the great work.'}
              </p>
            </div>
          ) : filtered.map((alert, i) => {
            const def = ALERT_TYPES[alert.type];
            const dish = alert.dish;
            return (
              <div
                key={`${alert.type}-${dish.id}-${i}`}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${def.border}`,
                  borderLeft: `4px solid ${def.color}`,
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <div style={{ fontSize: '22px', flexShrink: 0, marginTop: '1px' }}>{def.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: def.color, background: def.bg, border: `1px solid ${def.border}`, padding: '1px 7px', borderRadius: '4px' }}>
                      {def.label}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                      {dish.name}
                    </span>
                    {dish.category && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>· {dish.category}</span>
                    )}
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {def.description(dish.name)}
                  </p>
                </div>
                <Link
                  to={`/dish-form?id=${dish.id}`}
                  style={{
                    flexShrink: 0,
                    padding: '5px 12px',
                    borderRadius: '6px',
                    background: 'var(--primary, #271B14)',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  Fix →
                </Link>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
