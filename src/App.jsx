import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronsUpDown,
  User,
  ChevronRight,
  HelpCircle,
  ExternalLink,
  FileText,
  Shield,
  LogOut
} from 'lucide-react';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import DishForm from './pages/DishForm';
import MenuCatalog from './pages/MenuCatalog';
import Analytics from './pages/Analytics';
import ReportsList from './pages/ReportsList';
import AlertsPage from './pages/AlertsPage';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ErrorBoundary from './components/ErrorBoundary';
import ThemeToggle from './components/ThemeToggle';
import NotificationBell from './components/NotificationBell';
import AdminProfileModal from './components/AdminProfileModal';
import { fetchAdminData, fetchSuperAdminMessages, getAdminSession, getCurrentHotel, refreshCurrentHotelRow, signOutAdmin, supabase } from './lib/supabaseClient';
import { countActiveAlerts } from './lib/dishAlerts';
import { buildSuperAdminMailUrl, useSuperAdminEmail } from './lib/superAdminContact';
import useOnlineStatus from './lib/useOnlineStatus';


/** Sidebar count pill — always visible; muted when the count is 0. */
function CountBadge({ count = 0, small = false, title }) {
  const active = count > 0;
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        background: active ? 'var(--accent-subtle)' : 'var(--bg-muted, transparent)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        border: '1px solid var(--border)',
        borderRadius: '999px',
        fontSize: small ? '9px' : '10px',
        fontWeight: 700,
        padding: small ? '0 5px' : '1px 6px',
        lineHeight: 1.4,
        minWidth: small ? '16px' : '18px',
        textAlign: 'center',
        opacity: active ? 1 : 0.75,
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SuspendedAccountScreen({ onLogout }) {
  const superAdminEmail = useSuperAdminEmail();
  const [hotel, setHotel] = useState(null);
  const [ownerEmail, setOwnerEmail] = useState('');
  useEffect(() => {
    let mounted = true;
    getCurrentHotel().then((h) => { if (mounted && h) setHotel(h); }).catch(() => {});
    getAdminSession().then((session) => {
      const email = session?.user?.email || '';
      if (mounted && email) setOwnerEmail(email);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  const mailUrl = buildSuperAdminMailUrl(superAdminEmail, 'suspendedAccount', { hotel, ownerEmail });
  return (
    <div
      style={{
        maxWidth: '560px',
        margin: '80px auto',
        background: 'var(--bg-card, #ffffff)',
        color: 'var(--text)',
        borderRadius: '16px',
        padding: '36px 32px',
        textAlign: 'center',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
      <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 800, color: '#dc2626' }}>
        Hotel Account Suspended
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Your hotel account and dashboard access have been suspended by the platform administrator.
        All uploaded dishes, menus, and public QR standees are currently blocked and taken offline.
      </p>
      <p style={{ margin: '0 0 28px', fontSize: '13px', color: 'var(--text-muted)' }}>
        If you believe this is a mistake, please reach out to platform support at{' '}
        <a href={mailUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>
          {superAdminEmail}
        </a>
      </p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a
          href={mailUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: 'var(--accent, #C27835)',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '13px',
            textDecoration: 'none',
          }}
        >
          Email Super Admin
        </a>
        <button
          type="button"
          onClick={onLogout}
          style={{
            background: 'var(--primary, #271B14)',
            color: '#fff',
            border: 'none',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentHotel, setCurrentHotel] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [ownerName, setOwnerName] = useState(
    () => localStorage.getItem('admin_profile_name') || ''
  );
  const [avatarUrl, setAvatarUrl] = useState(
    () => localStorage.getItem('admin_profile_avatar') || ''
  );
  const [openReportsCount, setOpenReportsCount] = useState(0);
  const [unreadAdminMsgCount, setUnreadAdminMsgCount] = useState(0);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [dishMenuDropdownOpen, setDishMenuDropdownOpen] = useState(true);
  const [notificationsDropdownOpen, setNotificationsDropdownOpen] = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const profileContainerRef = useRef(null);
  // Real reachability (not just navigator.onLine) — the dot turns red when the internet drops
  const isOnline = useOnlineStatus();
  const superAdminEmail = useSuperAdminEmail();

  // Listen for admin profile changes across modals
  useEffect(() => {
    function handleProfileUpdate(e) {
      if (e.detail?.avatar) setAvatarUrl(e.detail.avatar);
      if (e.detail?.name) setOwnerName(e.detail.name);
    }
    window.addEventListener('admin-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('admin-profile-updated', handleProfileUpdate);
  }, []);

  // Sync dashboard typography dynamically
  useEffect(() => {
    const savedFont = localStorage.getItem('admin_dashboard_font');
    if (savedFont) {
      document.documentElement.style.setProperty('--font-body', `"${savedFont}", -apple-system, BlinkMacSystemFont, sans-serif`);
      document.documentElement.style.setProperty('--font-title', `"${savedFont}", sans-serif`);
      document.documentElement.style.setProperty('--font-serif', `"${savedFont}", Georgia, serif`);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let channel = null;

    async function loadOpenReportsCount(hotelId, force = false) {
      const { count } = await supabase
        .from('content_reports')
        .select('id', { count: 'exact', head: true })
        .eq('hotel_id', hotelId)
        .in('status', ['open', 'reviewing']);
      if (mounted && count !== null) setOpenReportsCount(count || 0);
      // Unread Super Admin messages also live on the Guest Reports page
      const { unreadCount } = await fetchSuperAdminMessages({ force });
      if (mounted) setUnreadAdminMsgCount(unreadCount || 0);
    }

    // Active dish alerts (same rules as the Alerts page)
    async function loadAlertsCount() {
      try {
        const { dishes } = await fetchAdminData();
        if (mounted) setActiveAlertsCount(countActiveAlerts(dishes || []));
      } catch (_) {}
    }

    async function loadIdentity() {
      const session = await getAdminSession();
      if (!mounted) return;
      if (session?.user?.email) setUserEmail(session.user.email);
      const metaName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;
      if (metaName && !localStorage.getItem('admin_profile_name')) setOwnerName(metaName);
      const metaAvatar = session?.user?.user_metadata?.avatar_url;
      if (metaAvatar && !localStorage.getItem('admin_profile_avatar')) setAvatarUrl(metaAvatar);

      const h = await getCurrentHotel();
      if (!mounted) return;
      if (h) {
        setCurrentHotel({ ...h });
        if (h.owner_name && !metaName && !localStorage.getItem('admin_profile_name')) setOwnerName(h.owner_name);
      }

      if (h?.id && supabase) {
        loadOpenReportsCount(h.id);
        loadAlertsCount();
        // Realtime subscription for report updates (debounced)
        let timer = null;
        channel = supabase
          .channel(`nav-reports-${h.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports', filter: `hotel_id=eq.${h.id}` }, () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadOpenReportsCount(h.id), 400);
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_notifications' }, () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadOpenReportsCount(h.id, true), 400);
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `hotel_id=eq.${h.id}` }, () => {
            setTimeout(loadAlertsCount, 600);
          })
          .subscribe();
      }
    }

    // Keep the layout's hotel (plan badge, profile details, logo) in sync
    // with saves and super-admin changes without a page reload.
    async function syncHotel() {
      const h = await getCurrentHotel();
      if (mounted && h) setCurrentHotel({ ...h });
      loadAlertsCount();
      if (h?.id) loadOpenReportsCount(h.id);
    }
    window.addEventListener('hotel-menu-data-updated', syncHotel);
    window.addEventListener('hotel-row-updated', syncHotel);

    loadIdentity();
    return () => {
      mounted = false;
      window.removeEventListener('hotel-menu-data-updated', syncHotel);
      window.removeEventListener('hotel-row-updated', syncHotel);
      if (channel && supabase) supabase.removeChannel(channel);
    };
  }, []);

  // Re-read the hotel row whenever the profile modal is opened so the plan
  // (e.g. upgraded to Pro by the super admin) is always current.
  useEffect(() => {
    if (!profileModalOpen) return;
    refreshCurrentHotelRow().then((h) => { if (h) setCurrentHotel({ ...h }); }).catch(() => {});
  }, [profileModalOpen]);

  async function handleLogout() {
    await signOutAdmin();
    navigate('/login', { replace: true });
  }

  const reportsBadgeCount = openReportsCount + unreadAdminMsgCount;

  const displayOwnerName = ownerName || currentHotel?.owner_name || (userEmail ? userEmail.split('@')[0] : 'Hotel Owner');

  const initials = (displayOwnerName || currentHotel?.name || userEmail || 'GT')
    .split(' ')
    .filter(Boolean)
    .map(s => s[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'GT';

  // Highlight strictly the single open page
  const isDashboardActive = location.pathname === '/dashboard' || location.pathname === '/';
  const isAddDishActive = location.pathname.startsWith('/dish-form');
  const isEditMenuActive = location.pathname.startsWith('/menu');
  const isDishMenuSectionActive = isAddDishActive || isEditMenuActive;
  const isAnalyticsActive = location.pathname.startsWith('/analytics');
  const isReportsActive = location.pathname.startsWith('/reports') || location.pathname.startsWith('/guest-reports');
  const isAlertsActive = location.pathname.startsWith('/notifications/alerts');
  const isNotificationsSectionActive = isReportsActive || isAlertsActive;


  useEffect(() => {
    function handleClickOutside(e) {
      if (profileContainerRef.current && !profileContainerRef.current.contains(e.target)) {
        setProfilePopoverOpen(false);
      }
    }
    if (profilePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profilePopoverOpen]);

  const getNavLinkStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '12px',
    fontWeight: active ? 600 : 500,
    color: active ? 'var(--text)' : 'var(--text-muted)',
    background: active ? 'var(--bg-subtle)' : 'transparent',
    borderLeft: active ? '4px solid var(--accent)' : '4px solid transparent',
    transition: 'background var(--transition), color var(--transition)'
  });

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', height: '100vh', maxHeight: '100vh', overflow: 'hidden', background: 'var(--bg)', color: 'var(--text)' }}>
        {/* Left Sidebar Navigation - Fixed to left, top and bottom */}
        <aside
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            width: '256px',
            height: '100vh',
            maxHeight: '100vh',
            background: 'var(--bg-sidebar, var(--bg-card))',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '2px 0 12px rgba(0, 0, 0, 0.15)',
            zIndex: 40,
            overflow: 'hidden'
          }}
          data-purpose="main-navigation-sidebar"
        >
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
            {/* Platform Brand Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--brand-mark-bg, #271B14)',
                  color: 'var(--brand-mark-fg, #fde68a)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: 'var(--brand-mark-shadow, 0 2px 6px rgba(0,0,0,0.12))',
                  border: '1.5px solid var(--brand-mark-ring, #C27835)'
                }}
              >
                {/* Platform Logo: Fork and Knife on a Plate */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {/* Plate outer circle */}
                  <circle cx="12" cy="12" r="10" stroke="var(--brand-mark-ring, #C27835)" strokeWidth="1.5" />
                  {/* Plate inner rim */}
                  <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1" opacity="0.6" />
                  {/* Fork on the left */}
                  <path d="M8.5 7v4a1.5 1.5 0 0 0 1.5 1.5M10 12.5V17M11.5 7v4a1.5 1.5 0 0 1-1.5 1.5M10 7v5" stroke="currentColor" strokeWidth="1.3" />
                  {/* Knife on the right */}
                  <path d="M14 7v10M14 7c1.5 1 1.5 4 0 5" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1 className="font-serif-luxury" style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.02em' }}>
                  QR Menu
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span
                    data-testid="admin-status-dot"
                    title={isOnline ? 'Online' : 'Disconnected'}
                    style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isOnline ? '#10b981' : '#ef4444',
                      boxShadow: isOnline ? '0 0 6px rgba(16, 185, 129, 0.4)' : '0 0 6px rgba(239, 68, 68, 0.4)',
                      transition: 'background var(--transition)'
                    }}
                  />
                  <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em', color: isOnline ? 'var(--accent)' : '#ef4444', textTransform: 'uppercase' }}>
                    {isOnline ? 'Admin Console' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>

            {/* Nav items - strictly highlight only open page */}
            <nav style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Link to="/dashboard" style={getNavLinkStyle(isDashboardActive)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="16" height="16" fill="none" stroke={isDashboardActive ? 'var(--accent)' : 'currentColor'} strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Dashboard</span>
                </div>
                {isDashboardActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />}
              </Link>

              {/* Dish Form / Menu dropdown item */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  onClick={() => setDishMenuDropdownOpen(prev => !prev)}
                  style={{
                    ...getNavLinkStyle(isDishMenuSectionActive),
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  data-testid="nav-dish-form-menu"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="16" height="16" fill="none" stroke={isDishMenuSectionActive ? 'var(--accent)' : 'currentColor'} strokeWidth="1.8" viewBox="0 0 24 24">
                      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Dish Form / Menu</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      style={{
                        transform: (dishMenuDropdownOpen || isDishMenuSectionActive) ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        color: isDishMenuSectionActive ? 'var(--accent)' : 'var(--text-muted)'
                      }}
                    >
                      <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                {/* Submenu with 2 pages: Add Dish & Edit Menu */}
                {(dishMenuDropdownOpen || isDishMenuSectionActive) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '28px', paddingRight: '4px', paddingTop: '2px', paddingBottom: '2px' }}>
                    <Link
                      to="/dish-form"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '11px',
                        fontWeight: isAddDishActive ? 600 : 500,
                        color: isAddDishActive ? 'var(--text)' : 'var(--text-muted)',
                        background: isAddDishActive ? 'var(--bg-subtle)' : 'transparent',
                        borderLeft: isAddDishActive ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'background var(--transition), color var(--transition)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isAddDishActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                        <span>Add Dish</span>
                      </div>
                      {isAddDishActive && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)' }} />}
                    </Link>

                    <Link
                      to="/menu"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '11px',
                        fontWeight: isEditMenuActive ? 600 : 500,
                        color: isEditMenuActive ? 'var(--text)' : 'var(--text-muted)',
                        background: isEditMenuActive ? 'var(--bg-subtle)' : 'transparent',
                        borderLeft: isEditMenuActive ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'background var(--transition), color var(--transition)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isEditMenuActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                        <span>Edit Menu</span>
                      </div>
                      {isEditMenuActive && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)' }} />}
                    </Link>
                  </div>
                )}
              </div>

              <Link to="/analytics" style={getNavLinkStyle(isAnalyticsActive)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="16" height="16" fill="none" stroke={isAnalyticsActive ? 'var(--accent)' : 'currentColor'} strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Analytics & AR</span>
                </div>
                {isAnalyticsActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} />}
              </Link>

              {/* Notifications (was Guest Reports) with sub-items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  onClick={() => setNotificationsDropdownOpen(prev => !prev)}
                  style={{
                    ...getNavLinkStyle(isNotificationsSectionActive),
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg width="16" height="16" fill="none" stroke={isNotificationsSectionActive ? 'var(--accent)' : 'currentColor'} strokeWidth="1.8" viewBox="0 0 24 24">
                      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Notifications</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* Total = guest reports + active alerts (always shown) */}
                    <CountBadge count={reportsBadgeCount + activeAlertsCount} title={`${reportsBadgeCount} guest report item(s) · ${activeAlertsCount} active alert(s)`} />
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                      style={{ transform: (notificationsDropdownOpen || isNotificationsSectionActive) ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', color: isNotificationsSectionActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                      <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                {(notificationsDropdownOpen || isNotificationsSectionActive) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '28px', paddingRight: '4px', paddingTop: '2px', paddingBottom: '2px' }}>
                    <Link
                      to="/reports"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderRadius: '6px', textDecoration: 'none',
                        fontSize: '11px',
                        fontWeight: isReportsActive ? 600 : 500,
                        color: isReportsActive ? 'var(--text)' : 'var(--text-muted)',
                        background: isReportsActive ? 'var(--bg-subtle)' : 'transparent',
                        borderLeft: isReportsActive ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'background var(--transition), color var(--transition)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isReportsActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                        <span>Guest Reports</span>
                      </div>
                      <CountBadge count={reportsBadgeCount} small title={`${openReportsCount} open guest report(s)${unreadAdminMsgCount ? ` · ${unreadAdminMsgCount} unread Super Admin message(s)` : ''}`} />
                    </Link>

                    <Link
                      to="/notifications/alerts"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderRadius: '6px', textDecoration: 'none',
                        fontSize: '11px',
                        fontWeight: isAlertsActive ? 600 : 500,
                        color: isAlertsActive ? 'var(--text)' : 'var(--text-muted)',
                        background: isAlertsActive ? 'var(--bg-subtle)' : 'transparent',
                        borderLeft: isAlertsActive ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'background var(--transition), color var(--transition)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isAlertsActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }} />
                        <span>Alert</span>
                      </div>
                      <CountBadge count={activeAlertsCount} small title={`${activeAlertsCount} active alert(s)`} />
                    </Link>
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div
            ref={profileContainerRef}
            id="sidebarProfileContainer"
            style={{
              padding: '12px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-subtle, #FAF7F2)',
              position: 'relative'
            }}
          >
            {/* Luxury Profile Menu Popover (Positioned directly above profile block) */}
            {profilePopoverOpen && (
              <div
                id="profilePopover"
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '10px',
                  right: '10px',
                  background: 'var(--bg-card, #FFFFFF)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xl, 12px)',
                  boxShadow: '0 12px 30px rgba(39, 27, 20, 0.16)',
                  padding: '8px',
                  zIndex: 100,
                  animation: 'fadeIn 0.15s ease-out'
                }}
              >
                {/* Popover Header with Signed In info */}
                <div
                  style={{
                    padding: '8px 10px',
                    marginBottom: '6px',
                    borderBottom: '1px solid var(--border)',
                    background: 'var(--bg-subtle, #FAF7F2)',
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span
                      style={{
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                        color: 'var(--accent, #C27835)',
                        background: 'var(--accent-subtle, rgba(194, 120, 53, 0.12))',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}
                    >
                      Hotel Admin
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '10px',
                        color: 'var(--success-fg, #15803d)',
                        fontWeight: 600
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669' }} />
                      Active
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {userEmail || 'admin@restaurant.com'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentHotel?.branch || 'General Manager'}
                  </p>
                </div>

                {/* Navigation List Inside Popover */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {/* 1. Profile (Triggers Modal) */}
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePopoverOpen(false);
                      setProfileModalOpen(true);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={15} color="var(--accent, #C27835)" />
                      <span style={{ fontWeight: 500 }}>Profile</span>
                    </div>
                    <ChevronRight size={14} color="var(--text-muted)" />
                  </button>

                  {/* 2. Help & Support */}
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePopoverOpen(false);
                      setHelpModalOpen(true);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <HelpCircle size={15} color="var(--text-muted)" />
                      <span style={{ fontWeight: 500 }}>Help &amp; Support</span>
                    </div>
                    <ExternalLink size={13} color="var(--text-muted)" />
                  </button>

                  {/* 3. Terms & Conditions */}
                  <Link
                    to="/terms"
                    onClick={() => setProfilePopoverOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 500,
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <FileText size={15} color="var(--text-muted)" />
                    <span>Terms &amp; Conditions</span>
                  </Link>

                  {/* 4. Privacy Policy */}
                  <Link
                    to="/privacy"
                    onClick={() => setProfilePopoverOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 500,
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Shield size={15} color="var(--text-muted)" />
                    <span>Privacy Policy</span>
                  </Link>
                </div>

                {/* Divider & Log out */}
                <div style={{ paddingTop: '6px', marginTop: '4px', borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePopoverOpen(false);
                      handleLogout();
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--danger-fg, #b91c1c)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--danger-subtle, #fef2f2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <LogOut size={14} color="var(--danger-fg, #b91c1c)" />
                    <span>Log out</span>
                  </button>
                </div>
              </div>
            )}

            {/* Theme Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ThemeToggle />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Theme</span>
              </div>
            </div>

            {/* Interactive Clickable Profile Card (Opens Popover) */}
            <button
              type="button"
              id="profileCardToggle"
              data-testid="admin-profile-trigger"
              onClick={() => setProfilePopoverOpen(prev => !prev)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'var(--bg-card)',
                border: `1px solid ${profilePopoverOpen ? 'var(--accent, #C27835)' : 'var(--border)'}`,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: 'var(--shadow-xs)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent, #C27835)')}
              onMouseLeave={(e) => {
                if (!profilePopoverOpen) e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--accent-subtle, rgba(194, 120, 53, 0.12))',
                  color: 'var(--accent, #C27835)',
                  fontWeight: 700,
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '1px solid var(--border)',
                  overflow: 'hidden'
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Owner Avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  initials
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayOwnerName}
                </p>
              </div>
              <ChevronsUpDown size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            </button>
          </div>
        </aside>

        {/* Right Main Content Pane */}
        <div style={{ marginLeft: '256px', width: 'calc(100vw - 256px)', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <main style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }} className="custom-scrollbar">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dish-form" element={<DishForm />} />
              <Route path="/menu" element={<MenuCatalog />} />
              <Route path="/table-manager" element={<Navigate to="/dashboard" replace />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reports" element={<ReportsList />} />
              <Route path="/guest-reports" element={<Navigate to="/reports" replace />} />
              <Route path="/notifications/alerts" element={<AlertsPage />} />
              <Route path="/settings" element={<div style={{ padding: '28px', color: 'var(--text)' }}><h2 className="font-serif-luxury" style={{ fontSize: '20px', margin: '0 0 8px' }}>Settings</h2><p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Hotel configuration and preferences.</p></div>} />
              <Route
                path="/terms"
                element={
                  <div style={{ width: '100%', minHeight: '100%', boxSizing: 'border-box', padding: '24px 32px 48px 32px', background: 'var(--bg)' }}>
                    <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h1 className="font-serif-luxury" style={{ fontSize: '26px', margin: 0, color: 'var(--text)' }}>Terms &amp; Service Agreement</h1>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        This multi-tenant restaurant and hotel software agreement outlines service uptime guarantees, tenant isolation standards via Supabase Row-Level Security, digital menu content compliance, and WebAR asset projection integrity.
                      </p>
                      <div style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: 'var(--text)' }}>1. Content Compliance &amp; Allergen Accuracy</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          Hotel administrators are responsible for ensuring pricing, dish photographs, dietary allergen tags, and 3D AR model dimensions accurately mirror kitchen offerings served to patrons.
                        </p>
                      </div>
                      <div style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: 'var(--text)' }}>2. Tenant Isolation &amp; Data Ownership</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          All dish models, menu catalogs, reports, and table telemetry are isolated strictly per tenant boundary. Data is never shared across hotel organizations.
                        </p>
                      </div>
                    </div>
                  </div>
                }
              />
              <Route
                path="/privacy"
                element={
                  <div style={{ width: '100%', minHeight: '100%', boxSizing: 'border-box', padding: '24px 32px 48px 32px', background: 'var(--bg)' }}>
                    <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h1 className="font-serif-luxury" style={{ fontSize: '26px', margin: 0, color: 'var(--text)' }}>Privacy Policy &amp; Security</h1>
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        We value patron privacy. Guest tabletop menu interactions, 3D AR sessions, and digital dish inspections run entirely in standard WebXR without requiring patron camera feed recording, user tracking cookies, or patron personal data storage.
                      </p>
                      <div style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: 'var(--text)' }}>Camera Stream Privacy</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          WebAR floor and plane detection is computed client-side by browser hardware APIs. No patron room video or spatial mapping data is ever transmitted to or stored on our servers.
                        </p>
                      </div>
                    </div>
                  </div>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>

        {/* Palace Administration & Preferences Modal */}
        <AdminProfileModal
          isOpen={profileModalOpen}
          onClose={() => {
            setProfileModalOpen(false);
            const savedName = localStorage.getItem('admin_profile_name');
            if (savedName) setOwnerName(savedName);
            const savedAvatar = localStorage.getItem('admin_profile_avatar');
            if (savedAvatar) setAvatarUrl(savedAvatar);
          }}
          hotel={currentHotel}
          userEmail={userEmail}
          ownerName={displayOwnerName}
          avatarUrl={avatarUrl}
          initials={initials}
          onUpdateProfile={({ name: newName, avatar: newAvatar }) => {
            if (newName) setOwnerName(newName);
            if (newAvatar) setAvatarUrl(newAvatar);
          }}
          onUpdateHotel={(updated) => setCurrentHotel(prev => ({ ...prev, ...updated }))}
        />

        {/* Help & Support Modal */}
        {helpModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1300,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px'
            }}
            onClick={() => setHelpModalOpen(false)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '440px',
                background: 'var(--bg-card, #FFFFFF)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: 'var(--shadow-xl)',
                textAlign: 'center'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  margin: '0 auto 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <HelpCircle size={24} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
                Platform Support &amp; Concierge
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Need assistance with your 3D models, QR standee printing, or live dining room setup? Contact the Super Admin by e-mail — a request with your hotel details is pre-filled for you.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', textAlign: 'left', fontSize: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Super Admin E-mail</span>
                  <div style={{ fontWeight: 600, color: 'var(--accent)', marginTop: '2px', wordBreak: 'break-all' }}>{superAdminEmail}</div>
                </div>
              </div>
              <a
                href={buildSuperAdminMailUrl(superAdminEmail, 'support', { hotel: currentHotel, ownerEmail: userEmail })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setHelpModalOpen(false)}
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  background: 'var(--accent, #C27835)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}
              >
                Email Super Admin
              </a>
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                style={{
                  width: '100%',
                  padding: '9px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--primary, #271B14)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close Desk
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

function ProtectedRoute({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [hotelStatus, setHotelStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel = null;
    let isMounted = true;
    let lastCheck = Date.now();

    async function checkHotelStatus() {
      lastCheck = Date.now();
      try {
        const h = await refreshCurrentHotelRow();
        if (isMounted && h?.status) setHotelStatus(h.status);
        window.dispatchEvent(new CustomEvent('hotel-row-updated'));
      } catch (err) {
        console.error('[ProtectedRoute] error checking status:', err);
      }
    }

    async function init() {
      const currentSession = await getAdminSession();
      if (!isMounted) return;
      setSession(currentSession);

      if (currentSession && supabase) {
        // getCurrentHotel() is cached and de-duplicated: the layout, the
        // dashboard and this guard share ONE lookup per session.
        const hotel = await getCurrentHotel();
        if (!isMounted) return;
        setHotelStatus(hotel?.status || 'verified');

        if (hotel?.id) {
          // Realtime is the primary signal (status / plan changes by super
          // admin). No interval polling: with many hotels online that would
          // hammer the database every few seconds per open tab.
          channel = supabase
            .channel(`live-hotel-status-${hotel.id}`)
            .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'hotels', filter: `id=eq.${hotel.id}` },
              (payload) => {
                if (!isMounted || !payload?.new) return;
                if (payload.new.status) setHotelStatus(payload.new.status);
                checkHotelStatus();
              }
            )
            .subscribe();
        }
      } else if (isMounted) {
        setHotelStatus('verified');
      }

      if (isMounted) setLoading(false);
    }

    init();

    // Fallback when the tab regains focus (throttled to once a minute)
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60_000) {
        checkHotelStatus();
      }
    };
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  async function handleLogout() {
    await signOutAdmin();
    navigate('/login', { replace: true });
  }

  if (loading) return (
    <div style={{ padding: '24px', display: 'flex', gap: '16px', flexDirection: 'column' }}>
      <div className="skeleton" style={{ height: '56px', width: '100%', borderRadius: 0 }} />
      <div style={{ padding: '24px', display: 'flex', gap: '16px' }}>
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: '100px', flex: 1 }} />)}
      </div>
    </div>
  );
  if (!session) return <Navigate to="/login" replace />;
  if (hotelStatus === 'suspended') {
    return <SuspendedAccountScreen onLogout={handleLogout} />;
  }
  return children;
}

function AuthRecoveryRedirector() {
  const navigate = useNavigate();

  useEffect(() => {
    // 1. If URL has recovery tokens in hash or search, immediately redirect to /reset-password
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const params = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));

    const type = params.get('type') || hashParams.get('type');
    const isRecovery =
      type === 'recovery' ||
      hash.includes('type=recovery') ||
      search.includes('type=recovery');

    if (isRecovery && window.location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }

    if (!supabase) return;

    // 2. Listen to Supabase auth events for PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthRecoveryRedirector />
        <Routes>
          <Route path="/login"          element={<Login />} />
          <Route path="/signup"         element={<Signup />} />
          {/* Public legal pages — no auth required */}
          <Route path="/terms"          element={<TermsOfService />} />
          <Route path="/privacy"        element={<PrivacyPolicy />} />
          <Route path="*"               element={<AdminLayout />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

