import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { fetchAdminData, fetchHotelReports, fetchQrMerchUrl, getCurrentHotel, getDishArRanking, normalizeGuestUrl, peekAdminData, peekHotelReports, resolveHotelPlan, updateHotelTheme, supabase } from '../lib/supabaseClient';
import StandeeModal, { renderStandeeToCanvas, downloadCanvasAsPng, STANDEE_TEMPLATES, ensureTemplateFontsLoaded, getStandeePrintSize, scaleCanvasToPrintSize, getPrintPixelScale } from '../components/StandeeModal';
import NotificationBell from '../components/NotificationBell';
import useDocumentTitle from '../lib/useDocumentTitle';
import { formatCurrency } from '../lib/formatters';
import { dishHasModel } from '../lib/dishModel';

const cardStyle = {
  background: 'var(--bg)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
  padding: '20px',
  border: '1px solid var(--border)'
};

// ── Hotel Menu QR Card ───────────────────────────────────────────────────────
function HotelQrCard({ guestMenuUrl, hotelName, hotelSubdomain, hotelPlan = 'free', hotelStatus = 'verified', cardStyle, themeConfig, themeReady = true, onUpdateThemeConfig, dishes = [] }) {
  const [showStandeeModal, setShowStandeeModal] = useState(false);
  const [downloadingStandee, setDownloadingStandee] = useState(false);
  const [showMerchNotice, setShowMerchNotice] = useState(false);
  const [merchUrl, setMerchUrl] = useState('');
  const standeeCanvasRef = useRef(null);
  const targetUrl = normalizeGuestUrl(guestMenuUrl || '');
  const isPendingApproval = (hotelStatus || '').toLowerCase() === 'pending';

  // Stable object identity: the modal only re-syncs when the SAVED standee
  // actually changes, not on every dashboard re-render.
  const standeeKey = JSON.stringify(themeConfig?.standee || {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activeStandee = useMemo(() => themeConfig?.standee || {}, [standeeKey]);
  const initialStandeeConfig = useMemo(
    () => ({ ...(themeConfig?.standee || {}), plan: hotelPlan }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [standeeKey, hotelPlan]
  );
  const activeTplId = activeStandee.templateId || 'circle-logo';
  const activeTpl = STANDEE_TEMPLATES.find(t => t.id === activeTplId) || STANDEE_TEMPLATES[0];

  useEffect(() => {
    let mounted = true;
    fetchQrMerchUrl().then((res) => {
      if (!mounted) return;
      const u = (typeof res === 'string' ? res : res?.url) || '';
      if (u) setMerchUrl(u);
    }).catch(() => {});
    ensureTemplateFontsLoaded();
    return () => { mounted = false; };
  }, []);

  // Render active standee / styled QR onto the dashboard card's canvas
  useEffect(() => {
    let mounted = true;
    const canvas = standeeCanvasRef.current;
    // Never paint the built-in default template while the hotel's SAVED
    // standee is still loading — that was the "default standee flashes on
    // refresh, then the selected one appears" bug.
    if (!canvas || !targetUrl || !themeReady) return;

    renderStandeeToCanvas(canvas, {
      templateId: activeTpl.id,
      title: activeStandee.name || activeStandee.title || hotelName || 'Your Hotel Name',
      hotelName: hotelName || activeStandee.name || activeStandee.title || 'Your Hotel Name',
      description: activeStandee.tagline || activeStandee.description || '',
      centerLogoUrl: activeStandee.centerLogoUrl || themeConfig?.headerData?.uploadedHeaders?.[0] || themeConfig?.logoUrl || '',
      standeeTitle: activeStandee.standeeTitle || 'MENU',
      scanCallout: activeStandee.scanCallout || 'SCAN TO VIEW',
      label1: activeStandee.label1 || 'FOOD',
      label2: activeStandee.label2 || 'DRINKS',
      label3: activeStandee.label3 || 'SPECIALS',
      extraSlots: activeStandee.extraSlots || {},
      theme: activeStandee.theme || activeTpl.config.theme,
      cardBgColor: activeStandee.cardBgColor || activeTpl.config.cardBgColor,
      qrDotColor: activeStandee.qrDotColor || activeTpl.config.qrDotColor,
      qrBgColor: activeStandee.qrBgColor || activeTpl.config.qrBgColor,
      qrEyeShape: activeStandee.qrEyeShape || activeTpl.config.qrEyeShape,
      qrDotStyle: activeStandee.qrDotStyle || activeTpl.config.qrDotStyle,
      qrBgImageUrl: activeStandee.qrBgImageUrl || activeTpl.config.qrBgImageUrl,
      guestMenuUrl: targetUrl,
      showWatermark: activeTpl.tier === 'pro' && hotelPlan !== 'pro',
      dishPhotos: Array.isArray(dishes) ? dishes.map(d => (Array.isArray(d.gallery) && d.gallery[0]) || d.image).filter(Boolean) : []
    }).catch(() => {});

    return () => { mounted = false; };
  }, [targetUrl, activeStandee, activeTpl, hotelName, themeConfig?.logoUrl, themeConfig?.headerData, hotelPlan, dishes, themeReady]);

  async function handleDownloadStandee() {
    if (!themeReady) return;
    const fileName = `${(hotelName || hotelSubdomain || 'hotel').replace(/\s+/g, '-').toLowerCase()}-standee.png`;
    // Create dedicated offscreen full-resolution canvas for crystal clear print-quality download
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = activeTpl.nativeWidth || (activeTpl.tier === 'pro' ? 887 : 1024);
    exportCanvas.height = activeTpl.nativeHeight || (activeTpl.tier === 'pro' ? 1774 : 1536);
    const { widthCm, heightCm } = getStandeePrintSize(activeTpl, activeStandee.printSize?.widthCm || 10);

    const renderOptions = {
      templateId: activeTpl.id,
      title: activeStandee.name || activeStandee.title || hotelName || 'Your Hotel Name',
      hotelName: hotelName || activeStandee.name || activeStandee.title || 'Your Hotel Name',
      description: activeStandee.tagline || activeStandee.description || '',
      centerLogoUrl: activeStandee.centerLogoUrl || themeConfig?.headerData?.uploadedHeaders?.[0] || themeConfig?.logoUrl || '',
      standeeTitle: activeStandee.standeeTitle || 'MENU',
      scanCallout: activeStandee.scanCallout || 'SCAN TO VIEW',
      label1: activeStandee.label1 || 'FOOD',
      label2: activeStandee.label2 || 'DRINKS',
      label3: activeStandee.label3 || 'SPECIALS',
      extraSlots: activeStandee.extraSlots || {},
      theme: activeStandee.theme || activeTpl.config?.theme,
      cardBgColor: activeStandee.cardBgColor || activeTpl.config?.cardBgColor,
      qrDotColor: activeStandee.qrDotColor || activeTpl.config?.qrDotColor,
      qrBgColor: activeStandee.qrBgColor || activeTpl.config?.qrBgColor,
      qrEyeShape: activeStandee.qrEyeShape || activeTpl.config?.qrEyeShape,
      qrDotStyle: activeStandee.qrDotStyle || activeTpl.config?.qrDotStyle,
      qrBgImageUrl: activeStandee.qrBgImageUrl || activeTpl.config?.qrBgImageUrl,
      guestMenuUrl: targetUrl,
      showWatermark: activeTpl.tier === 'pro' && hotelPlan !== 'pro',
      dishPhotos: Array.isArray(dishes) ? dishes.map(d => (Array.isArray(d.gallery) && d.gallery[0]) || d.image).filter(Boolean) : [],
      // Render natively at 300 DPI print size (sharp text, no upscaling blur)
      pixelScale: getPrintPixelScale(activeTpl, widthCm)
    };

    setDownloadingStandee(true);
    try {
      await renderStandeeToCanvas(exportCanvas, renderOptions);
      downloadCanvasAsPng(scaleCanvasToPrintSize(exportCanvas, widthCm, heightCm), fileName);
    } catch (err) {
      console.warn('[Dashboard] handleDownloadStandee offscreen render error, falling back to card canvas:', err);
      try {
        const fallback = document.createElement('canvas');
        await renderStandeeToCanvas(fallback, { ...renderOptions, centerLogoUrl: '', pixelScale: 1 });
        downloadCanvasAsPng(scaleCanvasToPrintSize(fallback, widthCm, heightCm), fileName);
      } catch (fallbackErr) {
        console.error('[Dashboard] standee download failed:', fallbackErr);
        window.alert('Could not generate the standee image. Please open "Customize Standee & QR" and download from there.');
      }
    } finally {
      setDownloadingStandee(false);
    }
  }

  function handleExploreMerch() {
    if (merchUrl && (merchUrl.startsWith('http://') || merchUrl.startsWith('https://'))) {
      window.open(merchUrl, '_blank', 'noopener,noreferrer');
    } else {
      setShowMerchNotice(true);
    }
  }

  const isLocalhost = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');

  return (
    <section
      style={{
        background: 'var(--bg-card, var(--bg))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '12px 14px',
        boxShadow: 'var(--shadow-xs)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        flex: 1
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
            Hotel Menu QR Code
          </h2>
          {hotelPlan === 'pro' ? (
            <span style={{ fontSize: '9px', background: 'rgba(194, 120, 53, 0.15)', color: 'var(--accent)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '999px', fontWeight: 700 }}>
              ⭐ PRO UNLOCKED
            </span>
          ) : (
            <span style={{ fontSize: '9px', background: 'var(--bg-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '999px', fontWeight: 600 }}>
              FREE TIER
            </span>
          )}
        </div>
        {isPendingApproval ? (
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.15)', color: '#b45309', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
            🔒 Under Review
          </span>
        ) : (
          <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-subtle)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
            Live Table QR
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 0', flex: 1, minHeight: 0, perspective: '900px' }}>
        <style>{`
          @keyframes qrFloat3D {
            0%, 100% {
              transform: rotateY(-6deg) rotateX(4deg) translateY(0px);
              box-shadow: 0 12px 24px -4px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(194, 120, 53, 0.15);
            }
            50% {
              transform: rotateY(6deg) rotateX(-2deg) translateY(-8px);
              box-shadow: 0 20px 32px -4px rgba(0, 0, 0, 0.28), 0 8px 16px rgba(194, 120, 53, 0.25);
            }
          }
          .qr-standee-3d-box {
            animation: qrFloat3D 6s ease-in-out infinite;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            transform-style: preserve-3d;
          }
          .qr-standee-3d-box:hover {
            animation-play-state: paused;
            transform: rotateY(0deg) rotateX(0deg) translateY(-4px) scale(1.03) !important;
            box-shadow: 0 22px 38px -4px rgba(0, 0, 0, 0.32), 0 10px 20px rgba(194, 120, 53, 0.3) !important;
          }
        `}</style>
        <div
          className="qr-standee-3d-box"
          style={{
            background: 'var(--bg-subtle)',
            borderRadius: '10px',
            padding: '8px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            width: '100%',
            maxWidth: '160px',
            cursor: 'pointer'
          }}
          onClick={() => { if (themeReady) setShowStandeeModal(true); }}
          title={themeReady ? 'Click to customize Standee & QR' : 'Loading your saved standee…'}
        >
          <div
            style={{
              width: '120px',
              height: '180px',
              borderRadius: '6px',
              overflow: 'hidden',
              background: themeReady ? (activeTpl.previewCardBg || '#ffffff') : 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            {!themeReady && (
              <div className="skeleton" aria-label="Loading saved standee" style={{ position: 'absolute', inset: 0 }} />
            )}
            <canvas
              ref={standeeCanvasRef}
              style={{ width: '100%', height: '100%', objectFit: 'contain', visibility: themeReady ? 'visible' : 'hidden' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
            <span style={{ fontSize: '10px' }}>✨</span>
            <p className="font-serif-luxury" style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text)', margin: 0 }}>
              Live AR Menu Standee
            </p>
          </div>
          <p style={{ fontSize: '8px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Interactive 3D table scan
          </p>
        </div>
      </div>

      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setShowStandeeModal(true)}
          disabled={!themeReady}
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: '7px',
            border: 'none',
            background: 'var(--primary)',
            color: 'var(--primary-fg)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            boxShadow: 'var(--shadow-xs)'
          }}
        >
          <svg style={{ width: '13px', height: '13px', color: 'var(--primary-fg)' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Customize Standee &amp; QR
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <button
            type="button"
            onClick={handleDownloadStandee}
            disabled={downloadingStandee || !themeReady}
            style={{
              padding: '5px 6px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              color: 'var(--text)',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
            title="Download Standee PNG"
          >
            <svg style={{ width: '12px', height: '12px', color: 'var(--accent)' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {downloadingStandee ? 'Preparing…' : 'Download Standee'}
          </button>
          <button
            type="button"
            onClick={handleExploreMerch}
            style={{
              padding: '5px 6px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text)',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
          >
            <svg style={{ width: '12px', height: '12px', color: 'var(--accent)' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            Physical Standee &amp; Merch ↗
          </button>
        </div>
      </div>

      {showMerchNotice && (
        <div
          onClick={() => setShowMerchNotice(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            zIndex: 1400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🛍️</div>
            <h3 className="font-serif-luxury" style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
              Physical Standees & Merch
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Custom laser-engraved wooden table tents, frosted acrylic standees, and branded physical QR merchandise can be ordered here.
            </p>
            <button
              type="button"
              onClick={() => setShowMerchNotice(false)}
              style={{
                background: 'var(--primary, #271B14)',
                color: 'var(--primary-fg, #ffffff)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}

      <StandeeModal
        isOpen={showStandeeModal}
        onClose={() => setShowStandeeModal(false)}
        hotelName={hotelName}
        hotelSubdomain={hotelSubdomain}
        hotelPlan={hotelPlan}
        hotelStatus={hotelStatus}
        guestMenuUrl={targetUrl}
        dishPhotos={Array.isArray(dishes) ? dishes.map(d => (Array.isArray(d.gallery) && d.gallery[0]) || d.image).filter(Boolean) : []}
        adminLogoUrl={
          themeConfig?.headerData?.uploadedHeaders?.[0] ||
          themeConfig?.headerData?.logoUrl ||
          themeConfig?.logoUrl ||
          themeConfig?.standee?.centerLogoUrl ||
          ''
        }
        initialStandeeConfig={initialStandeeConfig}
        onSaveConfig={async (newStandeeConfig) => {
          if (onUpdateThemeConfig) {
            await onUpdateThemeConfig({ standee: newStandeeConfig });
          }
        }}
      />
    </section>
  );
}



// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  // Render instantly from the last loaded data (if any) while refreshing
  const cachedData = peekAdminData();
  const cachedHotel = cachedData?.hotel || null;
  const [dishes, setDishes] = useState(() => cachedData?.dishes || []);
  const [themeConfig, setThemeConfig] = useState(() => cachedData?.theme_config || null);
  // True once the hotel's saved theme (incl. the selected standee) is known
  const [themeReady, setThemeReady] = useState(() => Boolean(cachedData));
  // 'loading' | 'verified' | 'pending' | 'suspended' | 'unknown'
  const [hotelStatus, setHotelStatus] = useState(() => cachedHotel?.status || 'loading');
  const [hotelName, setHotelName] = useState(() => cachedHotel?.name || '');
  const [hotelSubdomain, setHotelSubdomain] = useState(() => cachedHotel?.subdomain || '');
  const [hotelMenuId, setHotelMenuId] = useState(() => cachedHotel?.menu_id || '');
  const [hotelCurrency, setHotelCurrency] = useState(() => cachedHotel?.currency || 'INR');
  const [hotelPlan, setHotelPlan] = useState(() => resolveHotelPlan(cachedHotel));
  const [hotelContact, setHotelContact] = useState(() => ({
    phone: cachedHotel?.phone || '',
    contact_email: cachedHotel?.contact_email || '',
    operating_hours: cachedHotel?.operating_hours || ''
  }));
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSubdomain, setCopiedSubdomain] = useState(false);

  // Guest reports & flaggers state
  const [reports, setReports] = useState(() => peekHotelReports() || []);
  const [selectedReportTab, setSelectedReportTab] = useState('all');
  const [arRanking, setArRanking] = useState([]);

  // Dismissible & permanent onboarding checklist state
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => {
    try {
      return localStorage.getItem('admin_onboarding_completed') === 'true';
    } catch (_) {
      return false;
    }
  });

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem('admin_onboarding_dismissed') === 'true';
    } catch (_) {
      return false;
    }
  });

  function handleDismissOnboarding() {
    setOnboardingDismissed(true);
    setOnboardingCompleted(true);
    try {
      localStorage.setItem('admin_onboarding_dismissed', 'true');
      localStorage.setItem('admin_onboarding_completed', 'true');
    } catch (_) {}
  }

  const [showWalkthroughModal, setShowWalkthroughModal] = useState(() => {
    try {
      return localStorage.getItem('qr_menu_show_onboarding_walkthrough') === 'true';
    } catch (_) {
      return false;
    }
  });

  function handleCloseWalkthrough() {
    setShowWalkthroughModal(false);
    try {
      localStorage.removeItem('qr_menu_show_onboarding_walkthrough');
    } catch (_) {}
  }

  useDocumentTitle('Dashboard');

  function handleCopySubdomain() {
    if (!hotelSubdomain) return;
    navigator.clipboard?.writeText(hotelSubdomain).then(() => {
      setCopiedSubdomain(true);
      setTimeout(() => setCopiedSubdomain(false), 2000);
    });
  }

  useEffect(() => {
    let isMounted = true;
    let channel = null;
    let lastLoad = 0;
    let realtimeTimer = null;

    function applyHotel(hotel) {
      if (!hotel) return;
      if (hotel.status) setHotelStatus(hotel.status);
      setHotelPlan(resolveHotelPlan(hotel));
      if (hotel.name) setHotelName(hotel.name);
      if (hotel.subdomain) setHotelSubdomain(hotel.subdomain);
      if (hotel.menu_id) setHotelMenuId(hotel.menu_id);
      if (hotel.currency) setHotelCurrency(hotel.currency);
      setHotelContact({
        phone: hotel.phone || '',
        contact_email: hotel.contact_email || '',
        operating_hours: hotel.operating_hours || ''
      });
    }

    async function loadData(force = false) {
      lastLoad = Date.now();
      if (!supabase) {
        // Local / offline mode
        if (isMounted) {
          setHotelStatus('verified');
          setHotelPlan('pro');
          setHotelName('Local Demo Hotel');
          setHotelSubdomain('demo');
          setHotelMenuId('demo-menu');
        }
      }

      // Cached + de-duplicated: shared with the sidebar and route guard
      let hotel = null;
      if (supabase) {
        hotel = await getCurrentHotel();
        if (!isMounted) return;
        if (!hotel) {
          setHotelStatus('unknown');
          return;
        }
        applyHotel(hotel);
      }

      if (hotel?.id && supabase && !channel) {
        const scheduleReload = () => {
          clearTimeout(realtimeTimer);
          realtimeTimer = setTimeout(() => { if (isMounted) loadData(true); }, 400);
        };
        channel = supabase
          .channel(`dashboard-realtime-${hotel.id}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hotels', filter: `id=eq.${hotel.id}` }, (payload) => {
            if (isMounted && payload.new) applyHotel({ ...hotel, ...payload.new });
            scheduleReload();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter: `hotel_id=eq.${hotel.id}` }, scheduleReload)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports', filter: `hotel_id=eq.${hotel.id}` }, scheduleReload)
          .subscribe();
      }

      // ── All independent requests run in parallel ───────────────────────
      // settle(): one failing loader (sync throw or rejection) never blocks the rest
      const settle = (fn) => {
        try {
          return Promise.resolve(fn()).catch(() => null);
        } catch (_) {
          return Promise.resolve(null);
        }
      };
      const [data, reportRes, ranking] = await Promise.all([
        settle(() => fetchAdminData({ force })),
        settle(() => fetchHotelReports(null, { force })),
        settle(() => getDishArRanking(null, { force })),
      ]);
      if (!isMounted) return;

      if (data) {
        setDishes(data.dishes || []);
        setThemeConfig(data.theme_config || { blockOrder: ['image', 'info', 'showcase'] });
        applyHotel(data.hotel);
      }
      // Even if the request failed, stop waiting (the last saved theme, if
      // any, is used by fetchAdminData's offline fallback).
      setThemeReady(true);
      if (Array.isArray(reportRes?.reports)) setReports(reportRes.reports);
      if (Array.isArray(ranking)) setArRanking(ranking);
    }

    loadData();
    const handleDataUpdated = () => loadData();
    window.addEventListener('hotel-menu-data-updated', handleDataUpdated);

    const handleLogoUpdate = (e) => {
      if (e.detail?.logoUrl !== undefined) {
        setThemeConfig(prev => ({ ...(prev || {}), logoUrl: e.detail.logoUrl }));
      }
    };
    window.addEventListener('hotel-logo-updated', handleLogoUpdate);

    // Refresh on tab focus, at most once a minute (realtime covers the rest)
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible' && isMounted && Date.now() - lastLoad > 60_000) {
        loadData(true);
      }
    };
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      isMounted = false;
      clearTimeout(realtimeTimer);
      window.removeEventListener('hotel-menu-data-updated', handleDataUpdated);
      window.removeEventListener('hotel-logo-updated', handleLogoUpdate);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const isLocalDev = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '0.0.0.0' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(window.location.hostname)
  );

  const configuredGuestUrl = import.meta.env.VITE_GUEST_APP_URL;
  const guestAppBaseUrl = normalizeGuestUrl(
    (isLocalDev && typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
      ? `https://${window.location.hostname}:4175`
      : (configuredGuestUrl || (typeof window !== 'undefined' ? `https://${window.location.hostname}:4175` : 'https://localhost:4175'))
  );

  let guestMenuUrl;
  if (hotelMenuId && hotelSubdomain) {
    const configuredDomain = configuredGuestUrl
      ? configuredGuestUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : (typeof window !== 'undefined' ? window.location.host : 'localhost:4175');
    guestMenuUrl = isLocalDev
      ? `${guestAppBaseUrl.replace(/\/$/, '')}/menu/1?hotel=${encodeURIComponent(hotelSubdomain)}`
      : `https://${hotelSubdomain}.${configuredDomain}/menu/1`;
  } else if (hotelSubdomain) {
    guestMenuUrl = `${guestAppBaseUrl.replace(/\/$/, '')}/hotel/${encodeURIComponent(hotelSubdomain)}/menu`;
  } else if (hotelMenuId) {
    guestMenuUrl = `${guestAppBaseUrl.replace(/\/$/, '')}/menu/${hotelMenuId}`;
  } else {
    guestMenuUrl = `${guestAppBaseUrl.replace(/\/$/, '')}/menu/1`;
  }

  const guestMenuPreviewUrl = `${guestMenuUrl}${guestMenuUrl.includes('?') ? '&' : '?'}preview=true`;

  function handleCopyGuestLink() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(guestMenuUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  }

  return (
    <>
      {/* ── Welcome Onboarding Walkthrough Modal ──────────────────────────── */}
      {showWalkthroughModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="walkthrough-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(6px)'
          }}
        >
          <div
            style={{
              background: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-subtle, #faf7f2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(194, 120, 53, 0.15)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px'
                  }}
                >
                  🏨
                </div>
                <div>
                  <h2
                    id="walkthrough-title"
                    className="font-serif-luxury"
                    style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}
                  >
                    Welcome to Your AR Menu Dashboard!
                  </h2>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Your hotel account is registered and ready to customize.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseWalkthrough}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '18px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                aria-label="Close walkthrough"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Approval Notice Box */}
              <div
                style={{
                  background: 'linear-gradient(90deg, #FFFBEB 0%, #FEF3C7 100%)',
                  border: '1px solid #F59E0B',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  display: 'flex',
                  gap: '12px',
                  color: '#92400E'
                }}
              >
                <span style={{ fontSize: '20px', flexShrink: 0, marginTop: '2px' }}>ℹ️</span>
                <div style={{ fontSize: '12px', lineHeight: 1.5 }}>
                  <strong style={{ display: 'block', fontSize: '13px', marginBottom: '2px', color: '#78350F' }}>
                    Your Hotel is Currently Under Review
                  </strong>
                  The details, dishes, and customizations you upload are saved securely, but will be displayed to guests only after approval from the Super Admin. You can preview your menu anytime in preview mode!
                </div>
              </div>

              {/* Guided Steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(194, 120, 53, 0.15)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                    1
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                      Add Your Dishes &amp; 3D AR Models
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Upload dish photos, 3D GLB/USDZ files, portion options, dietary badges, and prices.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(194, 120, 53, 0.15)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                    2
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                      Customize Brand &amp; Standee Layout
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Choose bespoke standee templates, header banners, brand colors, and restaurant typography.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(194, 120, 53, 0.15)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                    3
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                      Live Preview &amp; Standee Unlocks
                    </h4>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Click "Preview Menu" anytime to review your dishes. Table QR standee downloads unlock immediately upon Super Admin approval.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-subtle, #faf7f2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '12px'
              }}
            >
              <button
                type="button"
                onClick={handleCloseWalkthrough}
                style={{
                  padding: '10px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--primary, #271B14)',
                  color: 'var(--primary-fg, #ffffff)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <span>Get Started</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending / suspended verification banner ────────────────────────── */}
      {hotelStatus !== 'loading' && hotelStatus !== 'verified' && (
        <section
          data-purpose="account-status-banner"
          style={{
            borderRadius: '8px',
            border: hotelStatus === 'suspended' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--banner-border, rgba(194, 120, 53, 0.3))',
            background: hotelStatus === 'suspended'
              ? 'linear-gradient(90deg, #7f1d1d 0%, #991b1b 100%)'
              : 'var(--banner-bg, linear-gradient(90deg, #9E5B21 0%, #B26B29 50%, #8C4F1A 100%))',
            color: '#ffffff',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            marginBottom: '14px',
            boxShadow: 'var(--shadow-xs)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.2)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                flexShrink: 0
              }}
            >
              {hotelStatus === 'suspended' ? 'Account Suspended' : 'Pending Verification'}
            </span>
            <p style={{ margin: 0, fontSize: '12px', color: 'rgba(254, 243, 199, 0.95)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {hotelStatus === 'suspended'
                ? 'Your hotel has been suspended. Guest menus and QR codes are offline.'
                : 'Your hotel is currently under review. The details, dishes, and customizations you upload are saved securely, but will be displayed to guests only after approval from the Super Admin.'}
            </p>
          </div>
          <button
            type="button"
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              borderRadius: '4px',
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fef3c7',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              cursor: 'default'
            }}
          >
            Status: In Review
          </button>
        </section>
      )}



      <div style={{ width: '100%', height: '100%', maxHeight: '100%', boxSizing: 'border-box', padding: '10px 18px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ maxWidth: '1440px', width: '100%', height: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'space-between', minHeight: 0 }}>
        {/* ── Hotel Brand Profile Header ────────────────────────────────────── */}
        <div
          data-purpose="hotel-brand-profile-header"
          style={{
            background: 'var(--bg-card, #FFFFFF)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            padding: '8px 16px',
            boxShadow: 'var(--shadow-xs)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            {/* Logo / Monogram crest */}
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: themeConfig?.logoUrl ? 'var(--bg-card, #fff)' : 'var(--brand-mark-bg, #271B14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--brand-mark-fg, #fde68a)',
                boxShadow: 'var(--brand-mark-shadow, var(--shadow-sm))',
                flexShrink: 0,
                border: '1.5px solid var(--brand-mark-ring, rgba(194, 120, 53, 0.4))',
                overflow: 'hidden'
              }}
            >
              {themeConfig?.logoUrl ? (
                <img src={themeConfig.logoUrl} alt={hotelName || 'Hotel logo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M12 21V11m0 0a4 4 0 00-4-4H6a2 2 0 00-2 2v2a4 4 0 004 4h4zm0 0a4 4 0 014-4h2a2 2 0 012 2v2a4 4 0 01-4 4h-4zM6 3v4m12-4v4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1
                  className="font-serif-luxury"
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {hotelName || (hotelStatus === 'loading' ? 'Loading...' : 'Hotel & Restaurant Admin')}
                </h1>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: 600,
                    background: hotelStatus === 'verified' ? 'var(--success-subtle, #ecfdf5)' : 'var(--warning-subtle, #fef3c7)',
                    color: hotelStatus === 'verified' ? 'var(--success-fg, #15803d)' : 'var(--warning-fg, #b45309)',
                    border: '1px solid var(--border)',
                    flexShrink: 0
                  }}
                >
                  {hotelStatus === 'verified' ? '✓ Verified' : '⏳ Pending'}
                </span>
              </div>

              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary, var(--text-muted))', fontWeight: 500, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '850px' }}>
                {hotelContact?.description || 'Interactive 3D digital menu and hospitality guest experience platform.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <NotificationBell />
            <a
              href={guestMenuPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '7px',
                border: '1px solid var(--border)',
                background: 'var(--bg-subtle)',
                color: 'var(--text)',
                fontSize: '11px',
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)'
              }}
            >
              <svg style={{ width: '13px', height: '13px', color: 'var(--accent)' }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview Menu
            </a>
          </div>
        </div>

        {/* ── Getting Started Onboarding Checklist ─────────────────────────── */}
        {(() => {
          const checklistSteps = [
            {
              id: 'dish',
              label: 'Add your first menu dish',
              desc: 'Upload dish photos, 3D models, portion variants and pricing.',
              done: dishes.length > 0,
              linkText: 'View dishes →',
              to: '/dish-form'
            },
            {
              id: 'brand',
              label: 'Brand your guest menu & standee',
              desc: 'Customize your menu header, brand colors, QR style, and standee layout.',
              done: Boolean(themeConfig?.headerData?.background || themeConfig?.headerData?.title || themeConfig?.standee?.templateId),
              linkText: 'Customize →',
              action: () => window.open(guestMenuPreviewUrl, '_blank')
            },
            {
              id: 'qr',
              label: 'Open & test live guest menu',
              desc: 'Experience your menu in real-time and preview 3D AR dishes as a guest.',
              done: dishes.length > 0,
              linkText: 'Open Live Preview →',
              action: () => window.open(guestMenuPreviewUrl, '_blank')
            }
          ];

          const completedCount = checklistSteps.filter(s => s.done).length;
          const isAllDone = completedCount >= checklistSteps.length;

          if (isAllDone && !onboardingCompleted) {
            try {
              localStorage.setItem('admin_onboarding_completed', 'true');
            } catch (_) {}
          }

          const showOnboarding = !onboardingCompleted && !onboardingDismissed && !isAllDone && hotelStatus !== 'loading';
          if (!showOnboarding) return null;

          const progressPct = Math.round((completedCount / checklistSteps.length) * 100);

          return (
            <section
              style={{
                background: 'var(--bg-card, #FFFFFF)',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                padding: '8px 14px',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                flexShrink: 0
              }}
              data-purpose="onboarding-checklist-card"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '5px',
                      background: 'rgba(194, 120, 53, 0.15)',
                      border: '1px solid var(--border)',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      flexShrink: 0
                    }}
                  >
                    🚀
                  </div>
                  <h3 className="font-serif-luxury" style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Getting Started Checklist
                  </h3>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--accent)',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)' }} />
                    {completedCount} of {checklistSteps.length} complete ({progressPct}%)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '80px', height: '5px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                  </div>
                  <button
                    type="button"
                    onClick={handleDismissOnboarding}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                    title="Dismiss checklist"
                  >
                    Dismiss ✕
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '100%' }}>
                {checklistSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: step.done ? 'var(--success-subtle, #ecfdf5)' : 'var(--bg-card, #fff)',
                          color: step.done ? 'var(--success-fg, #15803d)' : 'var(--text-muted)',
                          border: `1px solid ${step.done ? 'var(--success, #16a34a)' : 'var(--border)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '1px'
                        }}
                      >
                        {step.done ? '✓' : idx + 1}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h4 className="font-serif-luxury" style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                          {step.label}
                        </h4>
                        <p style={{ margin: '1px 0 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {step.desc}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: step.done ? 'var(--success-subtle, #ecfdf5)' : 'var(--bg-card, #fff)',
                          color: step.done ? 'var(--success-fg, #15803d)' : 'var(--accent)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        {step.done ? 'Completed' : (idx === 1 ? 'In Progress' : 'Up next')}
                      </span>
                      {step.to ? (
                        <Link to={step.to} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                          {step.linkText}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={step.action}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: '10px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}
                        >
                          {step.linkText}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* ── 12-Column Reorganized Dashboard Grid ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '10px', alignItems: 'stretch', flex: 1, minHeight: 0, width: '100%' }} data-purpose="reorganized-dashboard-grid">
          
          {/* Left Column (7 cols): Stat Tiles + Guest Reports */}
          <div style={{ gridColumn: 'span 7 / span 7', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0, height: '100%' }}>
            
            {/* 3 Stat Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '100%', flexShrink: 0 }}>
              <Link to="/menu" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
                <article style={{ flex: 1, background: 'var(--bg-card, #FFFFFF)', borderRadius: '10px', border: '1px solid var(--border)', padding: '10px 12px', boxShadow: 'var(--shadow-xs)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Total Dishes</span>
                    <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 700, background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {dishes.length > 0 ? 'Active' : 'Empty'}
                    </span>
                  </div>
                  <div style={{ margin: '4px 0', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span className="font-serif-luxury" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{dishes.length}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dishes</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a' }} />
                    {new Set(dishes.map(d => d.category).filter(Boolean)).size} categories
                  </p>
                </article>
              </Link>

              <Link to="/menu?filter=no-ar" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
                <article style={{ flex: 1, background: 'var(--bg-card, #FFFFFF)', borderRadius: '10px', border: '1px solid var(--border)', padding: '10px 12px', boxShadow: 'var(--shadow-xs)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>No AR Dishes</span>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: '4px' }}>Needs 3D</span>
                  </div>
                  <div style={{ margin: '4px 0', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span className="font-serif-luxury" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
                      {dishes.filter(d => !dishHasModel(d)).length}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>2D only</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)' }}>
                    {dishes.length > 0 ? Math.round((dishes.filter(d => !dishHasModel(d)).length / dishes.length) * 100) : 0}% pending
                  </p>
                </article>
              </Link>

              <Link to="/menu?filter=suspended" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
                <article style={{ flex: 1, background: 'var(--bg-card, #FFFFFF)', borderRadius: '10px', border: '1px solid var(--border)', padding: '10px 12px', boxShadow: 'var(--shadow-xs)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Suspended Dishes</span>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: '4px' }}>Hidden</span>
                  </div>
                  <div style={{ margin: '4px 0', display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                    <span className="font-serif-luxury" style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
                      {dishes.filter(d => d.is_suspended || d.status === 'suspended').length}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Inactive</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)' }}>Seasonal rotation</p>
                </article>
              </Link>
            </div>

            {/* Guest Reports & Flaggers Card - NO DEMO DATA */}
            {(() => {
              // Only tickets still waiting for review — resolved / dismissed
              // tickets live in Guest Reports → Resolved History.
              const guestFlagItems = (Array.isArray(reports) ? reports : [])
                .filter(r => !r.status || r.status === 'open' || r.status === 'reviewing')
                .map((r, i) => {
                const dishId = r.dish_id || r.dishes?.id;
                const dishName = r.dishes?.name || r.dish_name || 'Menu Dish';
                const reportType = r.report_type || r.reason || 'Dish Report';
                const isAr = (reportType || '').toLowerCase().includes('ar') || r.reason === 'wrong_dimensions';
                const isPricing = (reportType || '').toLowerCase().includes('price');
                return {
                  id: r.id || `rep-${i}`,
                  dish_id: dishId,
                  dish_name: dishName,
                  table_number: r.status === 'reviewing' ? 'In Review' : 'Guest Flag',
                  tag: isAr ? 'AR Bug' : isPricing ? 'Pricing' : 'Guest Report',
                  type: isAr ? 'ar' : (isPricing ? 'pricing' : 'dish'),
                  time_ago: r.created_at ? new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Recent',
                  title: r.reason ? (r.reason.replace(/_/g, ' ') + ':') : 'Guest Feedback:',
                  description: r.details || r.comment || 'Issue reported on item.',
                  actionUrl: dishId ? `/dish-form?id=${dishId}` : '/reports'
                };
              });

              // Dishes suspended by the Super Admin
              const suspendedDishItems = (Array.isArray(dishes) ? dishes : [])
                .filter(d => d.is_suspended)
                .map(d => ({
                  id: `suspended-${d.id}`,
                  dish_id: d.id,
                  dish_name: d.name,
                  table_number: 'Platform Action',
                  tag: 'Suspended',
                  type: 'dish',
                  time_ago: 'Urgent',
                  title: 'Suspended by Super Admin:',
                  description: d.suspended_reason || 'This dish is hidden from guests until the platform reactivates it.',
                  actionUrl: '/reports?view=suspended'
                }));

              // Catalog health: dishes missing photos
              const missingPhotoItems = (Array.isArray(dishes) ? dishes : [])
                .filter(d => !d.thumbnail_url && !d.image && (!d.gallery || d.gallery.length === 0))
                .map(d => ({
                  id: `missing-photo-${d.id}`,
                  dish_id: d.id,
                  dish_name: d.name,
                  table_number: 'Catalog Alert',
                  tag: 'Photo Missing',
                  type: 'dish',
                  time_ago: 'Action Req',
                  title: 'Missing Photo:',
                  description: `No photo uploaded for ${d.name}. Add a photo to improve guest appeal.`,
                  actionUrl: '/notifications/alerts?type=missing_image'
                }));

              // Catalog health: dishes missing 3D models
              const missingModelItems = (Array.isArray(dishes) ? dishes : [])
                .filter(d => !d.model_glb_url && !d.model_url && !d.usdz_url && !d.model_usdz_url)
                .map(d => ({
                  id: `missing-model-${d.id}`,
                  dish_id: d.id,
                  dish_name: d.name,
                  table_number: 'AR Alert',
                  tag: 'Model Missing',
                  type: 'ar',
                  time_ago: 'Action Req',
                  title: 'Needs 3D Model:',
                  description: `No AR 3D model asset found. Upload GLB/USDZ file to activate 3D AR.`,
                  actionUrl: `/dish-form?id=${d.id}`
                }));

              // In-app error: suspended hotel status
              const statusAlertItems = hotelStatus === 'suspended' ? [{
                id: 'alert-suspended',
                dish_id: null,
                dish_name: 'Hotel Account',
                table_number: 'App Error',
                tag: 'App Error',
                type: 'dish',
                time_ago: 'Urgent',
                title: 'Account Suspended:',
                description: 'Your hotel account is suspended. Digital menus and QR codes are offline.',
                actionUrl: '/reports'
              }] : [];

              const allFlags = [
                ...statusAlertItems,
                ...suspendedDishItems,
                ...guestFlagItems,
                ...missingPhotoItems,
                ...missingModelItems
              ];

              const displayedReports = allFlags.filter(r => {
                if (selectedReportTab === 'dish') return r.type === 'dish';
                if (selectedReportTab === 'ar') return r.type === 'ar' || r.type === 'pricing';
                return true;
              });

              return (
                <section
                  style={{
                    background: 'var(--bg-card, #FFFFFF)',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    padding: '10px 14px',
                    boxShadow: 'var(--shadow-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    flex: 1,
                    minHeight: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                        Guest Reports &amp; Flaggers
                      </h2>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'var(--accent)',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          padding: '1px 6px',
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)' }} />
                        {displayedReports.length} Pending Alerts
                      </span>
                    </div>

                    {/* Filter tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'var(--bg-subtle)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedReportTab('all')}
                        style={{
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: 'none',
                          background: selectedReportTab === 'all' ? 'var(--primary)' : 'transparent',
                          color: selectedReportTab === 'all' ? 'var(--primary-fg)' : 'var(--text-muted)',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        All Flags
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedReportTab('dish')}
                        style={{
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: 'none',
                          background: selectedReportTab === 'dish' ? 'var(--primary)' : 'transparent',
                          color: selectedReportTab === 'dish' ? 'var(--primary-fg)' : 'var(--text-muted)',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Dish Issues
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedReportTab('ar')}
                        style={{
                          padding: '2px 7px',
                          borderRadius: '4px',
                          border: 'none',
                          background: selectedReportTab === 'ar' ? 'var(--primary)' : 'transparent',
                          color: selectedReportTab === 'ar' ? 'var(--primary-fg)' : 'var(--text-muted)',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        AR &amp; Pricing
                      </button>
                    </div>
                  </div>

                  {/* Reports list - real reports, platform announcements, missing photos/models, and app errors */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '5px 0', flex: 1, minHeight: 0, overflowY: 'auto' }} className="custom-scrollbar">
                    {displayedReports.length === 0 ? (
                      <div style={{ padding: '16px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>No active flags</span>
                        <span style={{ fontSize: '10px' }}>All catalog health, platform notices, and guest reports are clear</span>
                      </div>
                    ) : (
                      displayedReports.map((item) => (
                        <article
                          key={item.id}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  fontSize: '8px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  background: (item.tag === 'App Error' || item.tag === 'In-App Error' || item.tag === 'Suspended')
                                    ? 'var(--danger-subtle, #fef2f2)'
                                    : item.tag === 'Notice'
                                      ? 'var(--info-subtle, #eff6ff)'
                                      : (item.tag === 'Photo Missing' || item.tag === 'Model Missing')
                                        ? 'rgba(194, 120, 53, 0.15)'
                                        : item.tag === 'AR Bug'
                                          ? 'var(--bg-card, #fff)'
                                          : 'rgba(194, 120, 53, 0.15)',
                                  color: (item.tag === 'App Error' || item.tag === 'In-App Error' || item.tag === 'Suspended')
                                    ? 'var(--danger-fg, #b91c1c)'
                                    : item.tag === 'Notice'
                                      ? 'var(--info-fg, #1d4ed8)'
                                      : 'var(--accent)',
                                  border: '1px solid var(--border)'
                                }}
                              >
                                {item.tag}
                              </span>
                              <h3 className="font-serif-luxury" style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                                {item.dish_name}
                              </h3>
                              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>• {item.table_number}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{item.time_ago}</span>
                              <Link
                                to={item.actionUrl || (item.dish_id ? `/dish-form?id=${item.dish_id}` : '/reports')}
                                style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
                              >
                                Resolve
                              </Link>
                            </div>
                          </div>
                          <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <strong style={{ color: 'var(--text)' }}>{item.title} </strong>
                            {item.description}
                          </p>
                        </article>
                      ))
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    <span>{displayedReports.length} alert{displayedReports.length === 1 ? '' : 's'} · scroll for more</span>
                    <Link to="/reports" style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                      View all guest reports →
                    </Link>
                  </div>
                </section>
              );
            })()}
          </div>

          {/* Right Column (5 cols): QR Code & Standee Card */}
          <div style={{ gridColumn: 'span 5 / span 5', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
            <HotelQrCard
              guestMenuUrl={guestMenuUrl}
              hotelName={hotelName}
              hotelSubdomain={hotelSubdomain}
              hotelPlan={hotelPlan}
              hotelStatus={hotelStatus}
              cardStyle={cardStyle}
              themeConfig={themeConfig}
              themeReady={themeReady}
              dishes={dishes}
              onUpdateThemeConfig={async (themePatch) => {
                // Optimistic, then persist as a merge onto the server copy
                setThemeConfig(prev => ({ ...(prev || {}), ...themePatch }));
                const { data: savedTheme, error } = await updateHotelTheme(themePatch);
                if (!error && savedTheme) setThemeConfig(savedTheme);
              }}
            />
          </div>
        </div>

        {/* ── Top Dishes by AR Engagement Card ─────────────────────────────── */}
        {(() => {
          const has3D = dishHasModel;

          const sourceList = dishes.map((d) => {
            const ranked = arRanking.find((r) => String(r.dishId) === String(d.id));
            return {
              ...d,
              ar_views: ranked ? ranked.arViews : (d.ar_views || 0),
              dish_views: ranked ? (ranked.dishViews || 0) : 0,
              score: ranked ? (ranked.score ?? ranked.arViews) : (d.ar_views || 0),
              ar_conversion: ranked ? (ranked.arConversion || 0) : 0,
              // Same rule as the guest app: base model OR any portion model
              hasModel: has3D(d)
            };
          });


          // Rank = AR views + dish views (same as the Analytics page)
          const sortedDishes = [...sourceList].sort((a, b) => {
            if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
            const aViews = a.ar_views || 0;
            const bViews = b.ar_views || 0;
            if (bViews !== aViews) return bViews - aViews;
            const a3d = has3D(a);
            const b3d = has3D(b);
            if (a3d !== b3d) return b3d ? 1 : -1;
            return (a.name || '').localeCompare(b.name || '');
          });

          const rankedDishes = sortedDishes.slice(0, 5);

          return (
            <section
              style={{
                background: 'var(--bg-card, #FFFFFF)',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                padding: '8px 14px',
                boxShadow: 'var(--shadow-xs)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                flexShrink: 0
              }}
              data-purpose="top-dishes-ar-engagement"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 className="font-serif-luxury" style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Top Dishes by AR Engagement
                  </h2>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--accent)',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    👑 Ranked by AR + Dish Views
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                    Past 30 Days
                  </span>
                  <Link
                    to="/analytics"
                    style={{
                      fontWeight: 600,
                      fontSize: '11px',
                      color: 'var(--accent)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    Full AR engagement analytics →
                  </Link>
                </div>
              </div>

              {/* Dish ranking tiles - strictly real dishes, no demo data */}
              {rankedDishes.length === 0 ? (
                <div style={{ padding: '14px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px dashed var(--border)' }}>
                  <span>No dishes added to menu yet.</span>
                  <Link to="/dish-form" style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>+ Add First Dish</Link>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rankedDishes.length}, 1fr)`, gap: '8px', width: '100%' }}>
                  {rankedDishes.map((dish, idx) => {
                    const is3dActive = dish.hasModel ?? has3D(dish);
                    const arViews = dish.ar_views || 0;
                    const viewPct = dish.dish_views > 0
                      ? `${dish.dish_views.toLocaleString()} views · ${dish.ar_conversion}% AR`
                      : '—';
                    const crownColor = idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : null;
                    const rankBadgeBg = idx === 0 ? 'var(--rank-1-bg, #fef3c7)' : idx === 1 ? 'var(--rank-2-bg, #e2e8f0)' : idx === 2 ? 'var(--rank-3-bg, #ffedd5)' : 'var(--bg-subtle)';
                    const rankBadgeColor = idx === 0 ? 'var(--rank-1-fg, #b45309)' : idx === 1 ? 'var(--rank-2-fg, #334155)' : idx === 2 ? 'var(--rank-3-fg, #9a3412)' : 'var(--text-muted)';

                    return (
                      <article
                        key={dish.id || idx}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '3px',
                          cursor: 'default'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {crownColor ? (
                              <span style={{ color: crownColor, fontWeight: 700, fontSize: '11px', lineHeight: 1 }}>👑</span>
                            ) : (
                              <span style={{ width: '12px', display: 'inline-block' }} />
                            )}
                            <span
                              style={{
                                width: '17px',
                                height: '17px',
                                borderRadius: '50%',
                                background: rankBadgeBg,
                                color: rankBadgeColor,
                                border: '1px solid var(--border)',
                                fontSize: '9px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {idx + 1}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className="font-serif-luxury" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', lineHeight: 1 }}>
                              {arViews.toLocaleString()}
                            </span>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>AR views</span>
                          </div>
                        </div>

                        <div>
                          <h3 className="font-serif-luxury" style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {dish.name}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            <span>{dish.category}</span>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent)' }}>
                              {formatCurrency(dish.price, hotelCurrency)}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
                          <span
                            style={{
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontSize: '8px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background: is3dActive ? 'var(--success-subtle, #ecfdf5)' : 'var(--bg-card, #f1f5f9)',
                              color: is3dActive ? 'var(--success-fg, #15803d)' : 'var(--text-muted)',
                              border: '1px solid var(--border)'
                            }}
                          >
                            {is3dActive ? '3D Active' : '2D Only'}
                          </span>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {viewPct}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })()}
        </div>
      </div>
    </>
  );
}
