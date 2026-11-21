import { useEffect, useRef, useState } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { fetchPlatformNotificationsForOwner, getCurrentHotelId, markAllNotificationsAsRead, markNotificationAsRead, supabase } from '../lib/supabaseClient';

const TYPE_CONFIG = {
  info: { label: 'Info', bg: 'var(--accent-subtle, #eff6ff)', fg: 'var(--accent, #2563eb)', icon: 'ℹ️' },
  update: { label: 'Update', bg: 'rgba(99, 102, 241, 0.15)', fg: '#6366f1', icon: '🚀' },
  warning: { label: 'Advisory', bg: 'var(--warning-subtle, #fffbeb)', fg: 'var(--warning-fg, #b45309)', icon: '⚠️' },
  critical: { label: 'Alert', bg: 'var(--danger-subtle, #fef2f2)', fg: 'var(--danger-fg, #dc2626)', icon: '🚨' }
};

/**
 * Platform updates bell. Shows system-generated updates about this hotel's
 * condition only. Super Admin messages live in Guest Reports → Super Admin
 * Compliance. Read items are persisted and never re-appear after refresh.
 */
// Router-aware navigate that also works when the bell is rendered outside a
// <Router> (e.g. isolated component tests). The branch never changes during
// a component's lifetime, so hook order stays stable.
function useSafeNavigate() {
  const inRouter = useInRouterContext();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return inRouter ? useNavigate() : (to) => window.location.assign(to);
}

export default function NotificationBell() {
  const navigate = useSafeNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef(null);

  async function loadNotifs(force = false) {
    const { notifications: notifs, unreadCount: count } = await fetchPlatformNotificationsForOwner({ force });
    setNotifications(notifs || []);
    setUnreadCount(count || 0);
  }

  useEffect(() => {
    let mounted = true;
    let channel = null;
    loadNotifs();

    const refresh = () => { if (mounted) loadNotifs(true); };
    window.addEventListener('hotel-menu-data-updated', refresh);

    if (supabase) {
      getCurrentHotelId().then((hotelId) => {
        if (!mounted || !hotelId) return;
        channel = supabase
          .channel(`admin-platform-updates-${hotelId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_notifications' }, refresh)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports', filter: `hotel_id=eq.${hotelId}` }, refresh)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dishes', filter: `hotel_id=eq.${hotelId}` }, refresh)
          .subscribe();
      });
    }

    return () => {
      mounted = false;
      window.removeEventListener('hotel-menu-data-updated', refresh);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, []);

  // Close when clicked outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  async function handleMarkOneRead(notifId) {
    setNotifications(prev => prev.filter(n => n.id !== notifId));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await markNotificationAsRead(notifId);
  }

  async function handleOpen(notif) {
    await handleMarkOneRead(notif.id);
    if (notif.link) {
      setIsOpen(false);
      navigate(notif.link);
    }
  }

  async function handleMarkAllRead() {
    const unreadIds = notifications.map(n => n.id);
    if (unreadIds.length === 0) return;
    setNotifications([]);
    setUnreadCount(0);
    await markAllNotificationsAsRead(unreadIds);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Platform Notifications"
        style={{
          background: isOpen ? 'var(--bg-muted)' : 'transparent',
          border: 'none',
          color: 'var(--text)',
          width: '34px',
          height: '34px',
          borderRadius: 'var(--radius)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background var(--transition)'
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: 'var(--danger-fg, #ef4444)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 800,
              padding: '0 4px',
              minWidth: '16px',
              height: '16px',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '42px',
            right: 0,
            width: '360px',
            maxHeight: '480px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'modalEnter 0.15s ease-out'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-subtle)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                Platform Updates
              </span>
              {unreadCount > 0 && (
                <span style={{ fontSize: '11px', background: 'var(--accent-subtle)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', maxHeight: '340px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>🔕</div>
                You're all caught up.
              </div>
            ) : (
              notifications.map((notif) => {
                const conf = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleOpen(notif)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--accent-subtle, rgba(59, 130, 246, 0.05))',
                      cursor: 'pointer',
                      transition: 'background var(--transition)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px' }}>{conf.icon}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                          {notif.title}
                        </span>
                      </div>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent, #2563eb)', flexShrink: 0, marginTop: '4px' }} />
                    </div>

                    <p style={{ margin: '4px 0 6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      {notif.message}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-placeholder)' }}>
                      <span>{new Date(notif.created_at).toLocaleDateString()}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkOneRead(notif.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Mark as read
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar Link to Alerts Page */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              textAlign: 'center'
            }}
          >
            <a
              href="/notifications/alerts"
              onClick={(e) => {
                e.preventDefault();
                setIsOpen(false);
                navigate('/notifications/alerts');
              }}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--accent)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>View all catalog alerts</span>
              <span>→</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
