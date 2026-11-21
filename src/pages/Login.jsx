import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearHotelIdCache, getAdminSession, getCurrentHotelId, requestPasswordReset, signInAdmin, supabase } from '../lib/supabaseClient';
import PasswordField from '../components/PasswordField';
import useDocumentTitle from '../lib/useDocumentTitle';
import { buildSuperAdminMailUrl, useSuperAdminEmail } from '../lib/superAdminContact';

export default function Login() {
  useDocumentTitle('Hotel Login');
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const superAdminEmail = useSuperAdminEmail();
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState(location.state?.infoMessage || '');
  const [loading, setLoading] = useState(false);

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    // Automatically match system theme
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    };
    applySystemTheme();
    mq.addEventListener?.('change', applySystemTheme);

    getAdminSession().then((session) => {
      if (session) navigate('/dashboard', { replace: true });
    });

    try {
      const savedEmail = localStorage.getItem('remembered_admin_email');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch (_) {}

    return () => {
      mq.removeEventListener?.('change', applySystemTheme);
    };
  }, [navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setInfoMessage('');

    if (rememberMe) {
      try { localStorage.setItem('remembered_admin_email', email.trim()); } catch (_) {}
    } else {
      try { localStorage.removeItem('remembered_admin_email'); } catch (_) {}
    }

    try {
      clearHotelIdCache();
      const { error } = await signInAdmin(email.trim(), password);

      if (error) {
        setLoading(false);
        setErrorMessage(error.message || 'Unable to sign in.');
        return;
      }

      // Resolve and cache hotel_id immediately after auth succeeds.
      let hotelId = await getCurrentHotelId(true);

      // If no hotel record exists yet, check if the user signed up with metadata
      if (!hotelId && supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        const meta = user?.user_metadata;
        if (meta?.hotel_name) {
          const { error: rpcErr } = await supabase.rpc('signup_hotel', {
            hotel_name: meta.hotel_name,
            hotel_subdomain: meta.subdomain || null,
          });
          if (rpcErr) {
            console.warn('[Login] signup_hotel attempt returned error:', rpcErr);
          }
          hotelId = await getCurrentHotelId(true);
          if (!hotelId && rpcErr) {
            setLoading(false);
            setErrorMessage(rpcErr.message || 'Could not complete hotel registration.');
            return;
          }
        }
      }

      setLoading(false);

      if (!hotelId) {
        setErrorMessage('Your account is not linked to a hotel yet. Please register your hotel on the signup page.');
        return;
      }

      try {
        sessionStorage.setItem('current_hotel_id', hotelId);
      } catch (_) {}
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setLoading(false);
      setErrorMessage(err?.message || 'Network error occurred during login. Please try again.');
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    setResetLoading(true);
    setResetError('');
    setResetMessage('');

    const { error } = await requestPasswordReset(resetEmail.trim());
    setResetLoading(false);

    if (error && (error.message?.includes('configured') || error.message?.includes('network'))) {
      setResetError(error.message);
      return;
    }

    // Always show generic success message to prevent account enumeration
    setResetMessage('Check your email for a reset link. If an account is registered with that address, you will receive instructions shortly.');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        position: 'relative',
      }}
    >

      <style>{`
        .login-split-left {
          flex: 1.1;
          background: var(--bg-card);
          border-right: 1px solid var(--border);
          padding: 60px 48px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: sticky;
          top: 0;
          height: 100vh;
          box-sizing: border-box;
          overflow-y: auto;
        }
        .login-split-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          height: 100vh;
          box-sizing: border-box;
          overflow: hidden;
        }
        .login-form-card {
          width: 100%;
          max-width: 420px;
          max-height: calc(100vh - 48px);
          box-sizing: border-box;
          background: var(--bg-card);
          border: 1px solid var(--border);
          borderRadius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          padding: 36px 32px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .login-form-card::-webkit-scrollbar {
          width: 6px;
        }
        .login-form-card::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 4px;
        }
        @media (max-width: 900px) {
          .login-split-left {
            display: none !important;
          }
          .login-split-right {
            height: auto;
            min-height: 100vh;
            overflow-y: auto;
          }
          .login-form-card {
            max-height: none;
            overflow-y: visible;
          }
        }
      `}</style>

      {/* Left Info Panel: Product & How it helps */}
      <div className="login-split-left">
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: '24px',
              fontFamily: 'var(--font-body)',
            }}
          >
            Digital Dining & AR Menu
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-title)',
              fontSize: '34px',
              fontWeight: 700,
              lineHeight: 1.2,
              color: 'var(--text)',
              margin: '0 0 16px',
              letterSpacing: '-0.02em',
            }}
          >
            Elevate every table with immersive digital menus.
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '15px',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              margin: '0 0 36px',
            }}
          >
            Empower your restaurant with real-time dish availability, instant QR ordering, and photorealistic 3D AR previews that delight diners and boost guest spend.
          </p>

          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '16px',
                  flexShrink: 0,
                }}
              >
                ✨
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '15px', color: 'var(--text)', marginBottom: '2px' }}>
                  Interactive 3D & AR Previews
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Guests visualize portion size and presentation on their physical table before placing orders.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '16px',
                  flexShrink: 0,
                }}
              >
                ⚡
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '15px', color: 'var(--text)', marginBottom: '2px' }}>
                  Live Menu & Price Control
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Toggle 86'd items, update descriptions, and adjust prices instantly across all tables.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '16px',
                  flexShrink: 0,
                }}
              >
                📱
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '15px', color: 'var(--text)', marginBottom: '2px' }}>
                  Zero-Friction QR Access
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  No app download needed. Diners scan and browse menus instantly on iOS and Android.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="login-split-right">
        <div className="login-form-card">
          {showForgot ? (
            <div>
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: '8px',
                  fontSize: '22px',
                  fontFamily: 'var(--font-title)',
                  fontWeight: 600,
                  color: 'var(--text)',
                  letterSpacing: '-0.02em',
                }}
              >
                Reset Password
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '13px', margin: '0 0 20px', lineHeight: 1.5 }}>
                Enter your account email and we'll send you a secure link to reset your password.
              </p>

              {resetMessage && (
                <div
                  style={{
                    color: 'var(--text)',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    fontFamily: 'var(--font-body)',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>✓ Reset link sent!</div>
                  <div>{resetMessage}</div>
                </div>
              )}

              {resetError && (
                <div
                  style={{
                    color: 'var(--text)',
                    marginBottom: '16px',
                    fontSize: '13px',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {resetError}
                </div>
              )}

              <form onSubmit={handleResetSubmit} style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Account Email
                  </label>
                  <input
                    required
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="owner@hotel.com"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--input-bg)',
                      color: 'var(--input-fg)',
                      fontSize: '14px',
                      fontFamily: 'var(--font-body)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  style={{
                    width: '100%',
                    background: '#2B1D17',
                    color: '#FAF6F0',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    padding: '11px 18px',
                    fontWeight: 600,
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)',
                    cursor: resetLoading ? 'wait' : 'pointer',
                  }}
                >
                  {resetLoading ? 'Sending reset link…' : 'Send reset link'}
                </button>

                <div style={{ marginTop: '12px', fontSize: '13px', fontFamily: 'var(--font-body)' }}>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(false); setResetMessage(''); setResetError(''); }}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    &larr; Back to sign in
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div>
              <h1
                style={{
                  margin: '0 0 4px',
                  fontSize: '22px',
                  fontFamily: 'var(--font-title)',
                  fontWeight: 600,
                  color: 'var(--text)',
                  letterSpacing: '-0.02em',
                }}
              >
                Sign in
              </h1>
              <p style={{ margin: '0 0 28px', fontSize: '13px', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
                Hotel owner admin dashboard
              </p>

              {infoMessage && (
                <div
                  style={{
                    color: 'var(--text)',
                    marginBottom: '14px',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {infoMessage}
                </div>
              )}


              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Email
                  </label>
                  <input
                    required
                    autoFocus
                    autoComplete="username"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="admin@hotel.com"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--input-bg)',
                      color: 'var(--input-fg)',
                      fontSize: '14px',
                      fontFamily: 'var(--font-body)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', marginBottom: '0' }}>
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgot(true);
                        setResetEmail(email.trim());
                        setResetMessage('');
                        setResetError('');
                      }}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PasswordField
                    label=""
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    inputStyle={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      background: 'var(--input-bg)',
                      color: 'var(--input-fg)',
                      fontSize: '14px',
                      fontFamily: 'var(--font-body)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2B1D17' }}
                  />
                  <label htmlFor="remember-me" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Remember my email
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    background: '#2B1D17',
                    color: '#FAF6F0',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    padding: '11px 18px',
                    fontWeight: 600,
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)',
                    cursor: loading ? 'wait' : 'pointer',
                  }}
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>

                {errorMessage && (
                  <div
                    style={{
                      color: 'var(--text)',
                      fontSize: '13px',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {errorMessage}
                  </div>
                )}


                <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                  New hotel?{' '}
                  <Link to="/signup" style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'underline' }}>
                    Register your hotel &rarr;
                  </Link>
                </div>
                <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                  <a href={buildSuperAdminMailUrl(superAdminEmail, 'loginHelp', { email: email.trim() })} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
                    Need help? <span style={{ color: 'var(--text)', fontWeight: 600 }}>Contact support &rarr;</span>
                  </a>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
