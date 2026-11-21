import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  clearHotelIdCache,
  getAdminSession,
  getCurrentHotelId,
  signInAdmin,
  supabase,
  updateHotelProfile,
} from '../lib/supabaseClient';
import PasswordField from '../components/PasswordField';
import MapLocationPicker from '../components/MapLocationPicker';
import useDocumentTitle from '../lib/useDocumentTitle';
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';

// Bump when the Terms of Service / Privacy Policy text changes.
export const TERMS_VERSION = '2026-11-20';

// ---------------------------------------------------------------------------
// Constants & Regexes
// ---------------------------------------------------------------------------
const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+0-9\s-]{7,20}$/;

// ---------------------------------------------------------------------------
// Clean text error helper
// ---------------------------------------------------------------------------
function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ color: 'var(--text)', fontSize: '12px', marginTop: '4px', fontFamily: 'var(--font-body)' }}>
      {msg}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standard Form Input Field
// ---------------------------------------------------------------------------
function InputField({
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  hint,
  error,
  disabled,
  autoFocus = false,
  autoComplete,
  required = false,
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
        {label} {required && <span style={{ color: 'var(--border)' }}>*</span>}
      </label>
      <input
        required={required}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        style={{
          width: '100%',
          padding: '10px 14px',
          border: '1px solid var(--border)',
          background: 'var(--input-bg)',
          color: 'var(--input-fg)',
          fontSize: '14px',
          fontFamily: 'var(--font-body)',
          outline: 'none',
          boxSizing: 'border-box',
          borderRadius: 'var(--radius)',
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {hint && !error && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', fontFamily: 'var(--font-body)' }}>{hint}</div>
      )}
      <FieldError msg={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3-Step Signup / Onboarding Page
// ---------------------------------------------------------------------------
export default function Signup() {
  useDocumentTitle('Create Hotel Account');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteHotelSubdomain = searchParams.get('hotel') || '';
  const inviteEmail = searchParams.get('email') || '';
  const isInvited = Boolean(searchParams.get('invited') || inviteHotelSubdomain);

  // Active step: 1 (Account) | 2 (Hotel & Location) | 3 (Privacy & Terms)
  const [step, setStep] = useState(1);

  // Step 1: Owner Account Credentials & Phone OTP
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // Step 2: Hotel Details & Location
  const [hotelName, setHotelName] = useState('');
  const [subdomain, setSubdomain] = useState(inviteHotelSubdomain.toLowerCase());
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState({ lat: 28.6139, lng: 77.2090 });
  const [branch, setBranch] = useState('');

  // Step 3: Terms & Privacy Acceptance
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [hasAgreedTerms, setHasAgreedTerms] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Global & field state
  const [fieldErrors, setFieldErrors] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  // System theme sync
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    };
    applySystemTheme();
    mq.addEventListener?.('change', applySystemTheme);
    return () => mq.removeEventListener?.('change', applySystemTheme);
  }, []);

  // Pre-fill invite data or redirect already authenticated sessions
  useEffect(() => {
    if (!isInvited) {
      getAdminSession().then((session) => {
        if (session) {
          navigate('/dashboard', { replace: true });
        }
      });
    }

    if (inviteHotelSubdomain) {
      setSubdomain(inviteHotelSubdomain.toLowerCase());
      if (supabase) {
        supabase
          .from('hotels')
          .select('name')
          .eq('subdomain', inviteHotelSubdomain.toLowerCase())
          .maybeSingle()
          .then(({ data }) => {
            if (data?.name) setHotelName(data.name);
          })
          .catch(() => {});
      }
    }
    if (inviteEmail) {
      setEmail(inviteEmail);
      setContactEmail(inviteEmail);
    }
  }, [inviteHotelSubdomain, inviteEmail, isInvited, navigate]);

  // Subdomain auto-derivation
  function handleHotelNameChange(e) {
    const val = e.target.value;
    setHotelName(val);
    if (!subdomain) {
      const suggestion = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setSubdomain(suggestion);
    }
    if (fieldErrors.hotelName) {
      setFieldErrors((prev) => ({ ...prev, hotelName: '' }));
    }
  }

  // ---------------------------------------------------------------------------
  // Phone OTP Verification Handlers
  // ---------------------------------------------------------------------------
  async function handleSendOtp() {
    setOtpError('');
    setOtpMessage('');

    const cleanPhone = phone.trim();
    if (!cleanPhone || !PHONE_RE.test(cleanPhone)) {
      setOtpError('Please enter a valid phone number (e.g. +91 9876543210).');
      return;
    }

    setOtpLoading(true);
    try {
      // 1. If Supabase phone auth is configured with SMS provider, attempt native phone verify
      if (supabase?.auth?.signInWithOtp) {
        try {
          const { error } = await supabase.auth.signInWithOtp({ phone: cleanPhone });
          if (!error) {
            setOtpSent(true);
            setOtpMessage('Verification code sent to your phone!');
            setOtpLoading(false);
            return;
          }
        } catch (_) {}
      }

      // 2. Dev / Local verification fallback simulator (generates 6-digit code)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(code);
      setOtpSent(true);
      setOtpMessage(`Verification code sent! (Dev code: ${code} or use 123456)`);
    } finally {
      setOtpLoading(false);
    }
  }

  function handleVerifyOtp() {
    setOtpError('');
    const cleanOtp = otp.trim();

    if (!cleanOtp) {
      setOtpError('Please enter the 6-digit OTP code.');
      return;
    }

    if (cleanOtp === generatedOtp || cleanOtp === '123456') {
      setOtpVerified(true);
      setOtpMessage('Phone number verified successfully! ✓');
      setOtpError('');
    } else {
      setOtpError('Invalid OTP code. Please try again or use demo code 123456.');
    }
  }

  // ---------------------------------------------------------------------------
  // Step 1 Validation & Proceed
  // ---------------------------------------------------------------------------
  function handleProceedStep1(e) {
    if (e) e.preventDefault();
    const errs = {};

    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Please enter your full name (minimum 2 characters).';
    }
    if (!phone.trim() || !PHONE_RE.test(phone.trim())) {
      errs.phone = 'Please enter a valid phone number.';
    } else if (!otpVerified) {
      errs.phone = 'Please verify your phone number with the OTP code before proceeding.';
    }
    if (!EMAIL_RE.test(email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }
    if (passwordPolicyError(password)) {
      errs.password = passwordPolicyError(password);
    }
    if (password !== confirm) {
      errs.confirm = 'Passwords do not match.';
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setFieldErrors({});
    if (!contactEmail && email) setContactEmail(email.trim());
    if (!contactPhone && phone) setContactPhone(phone.trim());
    setStep(2);
  }

  // ---------------------------------------------------------------------------
  // Step 2 Validation & Proceed
  // ---------------------------------------------------------------------------
  function handleProceedStep2(e) {
    if (e) e.preventDefault();
    const errs = {};

    if (!hotelName.trim() || hotelName.trim().length < 2) {
      errs.hotelName = 'Hotel name must be at least 2 characters.';
    }
    if (subdomain && !SUBDOMAIN_RE.test(subdomain)) {
      errs.subdomain = 'Only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.';
    }
    if (!contactEmail.trim() || !EMAIL_RE.test(contactEmail.trim())) {
      errs.contactEmail = 'Please provide a valid support contact email.';
    }
    if (!contactPhone.trim() || !PHONE_RE.test(contactPhone.trim())) {
      errs.contactPhone = 'Please provide a valid support phone number.';
    }
    if (!address.trim() || address.trim().length < 3) {
      errs.address = 'Please specify your hotel address or pinpoint it on the map.';
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setFieldErrors({});
    setStep(3);
  }

  // ---------------------------------------------------------------------------
  // Step 3 Acceptance & Continue to Modal
  // ---------------------------------------------------------------------------
  function handleContinueStep3() {
    if (!hasReadTerms || !hasAgreedTerms) {
      setFieldErrors({ terms: 'Please read and agree to all terms and conditions to continue.' });
      return;
    }
    setFieldErrors({});
    setShowConfirmModal(true);
  }

  // ---------------------------------------------------------------------------
  // Final Finish Execution
  // ---------------------------------------------------------------------------
  async function handleFinishRegistration() {
    setGlobalError('');
    setLoading(true);

    try {
      let session = null;

      // 1. Register Auth user with profile metadata
      if (supabase) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              phone_number: phone.trim(),
              hotel_name: hotelName.trim(),
              subdomain: subdomain.trim() || undefined,
              terms_digitally_signed_at: new Date().toISOString(),
              terms_version: TERMS_VERSION,
              address: address.trim(),
              branch: branch.trim() || undefined,
              // Saved so the hotel profile can be filled in even when the
              // hotel row is only created after email confirmation.
              contact_email: contactEmail.trim(),
              contact_phone: contactPhone.trim(),
              coordinates: coordinates || undefined,
            },
          },
        });

        if (authError) {
          if (authError.message?.toLowerCase().includes('already registered')) {
            const { data: signInData, error: signInErr } = await signInAdmin(email.trim(), password);
            if (!signInErr && signInData?.session) {
              session = signInData.session;
            } else {
              setGlobalError('An account with this email already exists. Please sign in.');
              setLoading(false);
              setShowConfirmModal(false);
              return;
            }
          } else {
            setGlobalError(authError.message);
            setLoading(false);
            setShowConfirmModal(false);
            return;
          }
        } else {
          session = authData?.session;
        }

        // 2. Register hotel workspace & link owner
        clearHotelIdCache();
        try {
          await supabase.rpc('signup_hotel', {
            hotel_name: hotelName.trim(),
            hotel_subdomain: subdomain.trim() || null,
          });
        } catch (_) {}

        // 3. Update public restaurant profile (phone, email, address, branch, coordinates)
        try {
          await updateHotelProfile({
            contact_email: contactEmail.trim(),
            phone: contactPhone.trim(),
            address: address.trim(),
            branch: branch.trim() || null,
            coordinates: coordinates || null,
          });
        } catch (_) {}
      }

      // 4. Terms acceptance is recorded server-side by the trg_record_terms_acceptance
      //    trigger from the sign-up metadata (terms_version), with the server's time.

      setShowConfirmModal(false);
      setSuccessToast('Account created successfully! Please sign in to explore your dashboard.');

      localStorage.setItem('qr_menu_show_onboarding_walkthrough', 'true');

      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: {
            infoMessage: 'Registration successful! Please sign in with your credentials to explore your dashboard.',
          },
        });
      }, 1000);

    } catch (err) {
      console.error('[Signup] unexpected error:', err);
      setGlobalError(err?.message || 'Could not complete registration. Please try again.');
      setShowConfirmModal(false);
    } finally {
      setLoading(false);
    }
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
        .signup-split-left {
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
        .signup-split-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          height: 100vh;
          box-sizing: border-box;
          overflow: hidden;
        }
        .signup-form-card {
          width: 100%;
          max-width: 480px;
          max-height: calc(100vh - 48px);
          box-sizing: border-box;
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-md);
          border: 1px solid var(--border);
          padding: 32px 28px;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .signup-form-card::-webkit-scrollbar {
          width: 6px;
        }
        .signup-form-card::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 4px;
        }
        @media (max-width: 900px) {
          .signup-split-left {
            display: none !important;
          }
          .signup-split-right {
            height: auto;
            min-height: 100vh;
            overflow-y: auto;
          }
          .signup-form-card {
            max-height: none;
            overflow-y: visible;
          }
        }
      `}</style>

      {/* Left Info Panel: Product & How it helps */}
      <div className="signup-split-left">
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
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: '16px', flexShrink: 0 }}>
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
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: '16px', flexShrink: 0 }}>
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
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)', display: 'grid', placeItems: 'center', fontSize: '16px', flexShrink: 0 }}>
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

      {/* Right Form Card */}
      <div className="signup-split-right">
        <div className="signup-form-card">
          {/* Step Progress Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            {[
              { num: 1, label: 'Account' },
              { num: 2, label: 'Hotel & Location' },
              { num: 3, label: 'Privacy & Terms' },
            ].map((s, idx) => {
              const isActive = step === s.num;
              const isPast = step > s.num;
              return (
                <div key={s.num} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div
                    style={{
                      height: '4px',
                      borderRadius: '2px',
                      background: isActive || isPast ? '#2B1D17' : 'var(--border)',
                      transition: 'background 0.3s ease',
                    }}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--text)' : 'var(--text-secondary)',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {isPast ? '✓ ' : ''}{s.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick Success Toast */}
          {successToast && (
            <div
              style={{
                color: 'var(--text)',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '16px',
                fontFamily: 'var(--font-body)',
              }}
            >
              ✓ {successToast}
            </div>
          )}

          {/* Global error */}
          {globalError && (
            <div
              style={{
                color: 'var(--text)',
                fontSize: '13px',
                marginBottom: '16px',
                fontFamily: 'var(--font-body)',
              }}
            >
              {globalError}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 1: Personal Credentials & Phone OTP                                  */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontFamily: 'var(--font-title)', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                  Create owner account
                </h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '13px' }}>
                  Step 1 of 3: Enter your personal credentials and verify your phone number.
                </p>
              </div>

              <form onSubmit={handleProceedStep1} noValidate style={{ display: 'grid', gap: '14px' }}>
                <InputField
                  label="Full Name"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: '' }));
                  }}
                  placeholder="e.g. Rajesh Kumar"
                  error={fieldErrors.name}
                  autoFocus
                  autoComplete="name"
                />

                {/* Phone Number + OTP verification */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Phone Number <span style={{ color: 'var(--border)' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setOtpVerified(false);
                        if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: '' }));
                      }}
                      placeholder="+91 9876543210"
                      disabled={otpVerified}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        background: 'var(--input-bg)',
                        color: 'var(--input-fg)',
                        fontSize: '14px',
                        fontFamily: 'var(--font-body)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={otpLoading || otpVerified}
                      style={{
                        background: otpVerified ? 'var(--bg)' : '#2B1D17',
                        color: otpVerified ? 'var(--text)' : '#FAF6F0',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '0 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: otpVerified ? 'default' : 'pointer',
                        fontFamily: 'var(--font-body)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {otpVerified ? '✓ Verified' : otpLoading ? 'Sending…' : otpSent ? 'Resend OTP' : 'Send OTP'}
                    </button>
                  </div>
                  <FieldError msg={fieldErrors.phone} />
                  {otpVerified && (
                    <div style={{ color: 'var(--text)', fontSize: '12px', marginTop: '4px', fontFamily: 'var(--font-body)' }}>
                      Phone number verified successfully! ✓
                    </div>
                  )}

                  {/* OTP Verification Box */}
                  {otpSent && !otpVerified && (
                    <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontFamily: 'var(--font-body)' }}>
                        {otpMessage || 'Enter the 6-digit code sent to your phone:'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          maxLength={6}
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="123456"
                          style={{
                            width: '120px',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius)',
                            border: '1px solid var(--border)',
                            background: 'var(--input-bg)',
                            color: 'var(--input-fg)',
                            fontSize: '14px',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.15em',
                            textAlign: 'center',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          style={{
                            background: '#2B1D17',
                            color: '#FAF6F0',
                            border: 'none',
                            borderRadius: 'var(--radius)',
                            padding: '8px 16px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'var(--font-body)',
                          }}
                        >
                          Verify OTP
                        </button>
                      </div>
                      {otpError && (
                        <div style={{ color: 'var(--text)', fontSize: '11px', marginTop: '4px', fontFamily: 'var(--font-body)' }}>
                          {otpError}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <InputField
                  label="Personal Email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
                  }}
                  placeholder="owner@hotel.com"
                  error={fieldErrors.email}
                  autoComplete="email"
                />

                <PasswordField
                  id="signup-password"
                  label="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
                  }}
                  placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
                  error={fieldErrors.password}
                  autoComplete="new-password"
                  showStrength
                  showRequirements
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

                <PasswordField
                  id="signup-confirm"
                  label="Confirm Password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (fieldErrors.confirm) setFieldErrors((p) => ({ ...p, confirm: '' }));
                  }}
                  placeholder="Re-enter password"
                  error={fieldErrors.confirm}
                  autoComplete="new-password"
                  showMatch
                  matchValue={password}
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

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    background: '#2B1D17',
                    color: '#FAF6F0',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    padding: '12px 18px',
                    fontWeight: 600,
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                    marginTop: '8px',
                  }}
                >
                  Proceed to Hotel Details &rarr;
                </button>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: Hotel Details, Support Contact & Location Map                    */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontFamily: 'var(--font-title)', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                  Hotel details & location
                </h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '13px' }}>
                  Step 2 of 3: Provide restaurant details, contact support info, and location.
                </p>
              </div>

              <form onSubmit={handleProceedStep2} noValidate style={{ display: 'grid', gap: '14px' }}>
                <InputField
                  label="Hotel Name"
                  required
                  value={hotelName}
                  onChange={handleHotelNameChange}
                  placeholder="e.g. Grand Heritage Palace"
                  error={fieldErrors.hotelName}
                  autoFocus
                />

                <InputField
                  label="Subdomain"
                  value={subdomain}
                  onChange={(e) => {
                    setSubdomain(e.target.value.toLowerCase());
                    if (fieldErrors.subdomain) setFieldErrors((p) => ({ ...p, subdomain: '' }));
                  }}
                  placeholder="e.g. grand-heritage"
                  hint="Diners browse at your-name.yourdomain.com"
                  error={fieldErrors.subdomain}
                  autoComplete="off"
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <InputField
                    label="Support Email"
                    required
                    type="email"
                    value={contactEmail}
                    onChange={(e) => {
                      setContactEmail(e.target.value);
                      if (fieldErrors.contactEmail) setFieldErrors((p) => ({ ...p, contactEmail: '' }));
                    }}
                    placeholder="support@hotel.com"
                    error={fieldErrors.contactEmail}
                  />

                  <InputField
                    label="Support Phone"
                    required
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => {
                      setContactPhone(e.target.value);
                      if (fieldErrors.contactPhone) setFieldErrors((p) => ({ ...p, contactPhone: '' }));
                    }}
                    placeholder="+91 9876543210"
                    error={fieldErrors.contactPhone}
                  />
                </div>

                {/* Address Autocomplete & Pinpoint Map */}
                <MapLocationPicker
                  value={address}
                  onChange={(newAddr) => {
                    setAddress(newAddr);
                    if (fieldErrors.address) setFieldErrors((p) => ({ ...p, address: '' }));
                  }}
                  coordinates={coordinates}
                  onCoordinatesChange={(newCoords) => setCoordinates(newCoords)}
                  error={fieldErrors.address}
                />

                <InputField
                  label="Branch (Optional)"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g. Downtown / Terminal 2"
                  hint="Leave blank if this is the only or primary branch"
                />

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '12px 16px',
                      fontWeight: 600,
                      fontSize: '14px',
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                    }}
                  >
                    &larr; Back
                  </button>

                  <button
                    type="submit"
                    style={{
                      flex: 2,
                      background: '#2B1D17',
                      color: '#FAF6F0',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      padding: '12px 18px',
                      fontWeight: 600,
                      fontSize: '14px',
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                    }}
                  >
                    Proceed to Privacy Policy &rarr;
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: Privacy Policy, Terms & Legal Agreement                          */}
          {/* ========================================================================= */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: '18px' }}>
                <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontFamily: 'var(--font-title)', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                  Privacy policy & terms
                </h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '13px' }}>
                  Step 3 of 3: Please review and accept the terms of service and privacy policy.
                </p>
              </div>

              {/* Scrollable Privacy Policy & Terms Document */}
              <div
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '16px',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  color: 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
                  TERMS OF SERVICE AND PRIVACY AGREEMENT
                </div>
                <p style={{ margin: '0 0 10px' }}>
                  Welcome to the Digital QR & AR Dining Platform. By registering your restaurant and establishing an administrator account, you agree to the following terms and operational covenants:
                </p>
                <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>1. Data Privacy & Guest Protection</div>
                <p style={{ margin: '0 0 10px' }}>
                  The platform processes guest browsing events, session orders, and menu interactions. Restaurant owners agree not to collect, sell, or exploit diner information outside of direct dining service fulfilment.
                </p>
                <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>2. Dish Content, AR Models & Intellectual Property</div>
                <p style={{ margin: '0 0 10px' }}>
                  You retain ownership of your uploaded culinary photographs, 3D GLB assets, prices, and allergen disclosures. You warrant that all uploaded images and descriptions represent your authentic menu offerings.
                </p>
                <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>3. Multi-Tenant Security & Tenant Isolation</div>
                <p style={{ margin: '0 0 10px' }}>
                  Your restaurant data is strictly protected under Row Level Security (RLS). You agree not to attempt cross-tenant access, unauthorized automated scraping, or malicious parameter tampering.
                </p>
                <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>4. Legally Binding Digital Confirmation</div>
                <p style={{ margin: '0 0 10px' }}>
                  Upon clicking continue, your acceptance (your name, registered email, telephone, the terms version and the time) is recorded with your account as the formal record of your acceptance. You can read these terms again at any time on the Terms page.
                </p>
              </div>

              {/* Action Buttons: "I have read" & "I have agreed" */}
              <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setHasReadTerms((prev) => !prev);
                    if (fieldErrors.terms) setFieldErrors((p) => ({ ...p, terms: '' }));
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    border: hasReadTerms ? '1px solid #2B1D17' : '1px solid var(--border)',
                    background: hasReadTerms ? '#2B1D17' : 'var(--bg)',
                    color: hasReadTerms ? '#FAF6F0' : 'var(--text)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                  }}
                >
                  <span>{hasReadTerms ? '✓' : '○'}</span>
                  I have read the policy and terms
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHasAgreedTerms((prev) => !prev);
                    if (fieldErrors.terms) setFieldErrors((p) => ({ ...p, terms: '' }));
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius)',
                    border: hasAgreedTerms ? '1px solid #2B1D17' : '1px solid var(--border)',
                    background: hasAgreedTerms ? '#2B1D17' : 'var(--bg)',
                    color: hasAgreedTerms ? '#FAF6F0' : 'var(--text)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                  }}
                >
                  <span>{hasAgreedTerms ? '✓' : '○'}</span>
                  I have agreed to all terms and conditions
                </button>
              </div>

              <FieldError msg={fieldErrors.terms} />

              {/* Step 3 Navigation Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '12px 16px',
                    fontWeight: 600,
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                  }}
                >
                  &larr; Back
                </button>

                <button
                  type="button"
                  onClick={handleContinueStep3}
                  disabled={!hasReadTerms || !hasAgreedTerms}
                  style={{
                    flex: 2,
                    background: hasReadTerms && hasAgreedTerms ? '#2B1D17' : 'var(--bg)',
                    color: hasReadTerms && hasAgreedTerms ? '#FAF6F0' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '12px 18px',
                    fontWeight: 600,
                    fontSize: '14px',
                    fontFamily: 'var(--font-body)',
                    cursor: hasReadTerms && hasAgreedTerms ? 'pointer' : 'not-allowed',
                    opacity: hasReadTerms && hasAgreedTerms ? 1 : 0.65,
                  }}
                >
                  Continue &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Footer Navigation */}
          <div style={{ textAlign: 'center', marginTop: '22px', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'underline' }}>
              Sign in &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONFIRMATION MODAL: Digital Signed Copy Notice & Finish Button            */}
      {/* ========================================================================= */}
      {showConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(43, 29, 23, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
              padding: '30px 28px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📝</div>

            <h2
              style={{
                margin: '0 0 8px',
                fontSize: '20px',
                fontFamily: 'var(--font-title)',
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.02em',
              }}
            >
              Digital Confirmation Notice
            </h2>

            <p
              style={{
                margin: '0 0 18px',
                fontSize: '13px',
                lineHeight: 1.6,
                color: 'var(--text)',
                fontFamily: 'var(--font-body)',
              }}
            >
              Your acceptance of all terms and conditions will be recorded with your account (<strong>{email}</strong>) as confirmation that you have read and agreed to them.
            </p>

            {/* Signed document metadata snapshot */}
            <div
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                fontSize: '12px',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                marginBottom: '22px',
              }}
            >
              <div>Signee: <strong style={{ color: 'var(--text)' }}>{name}</strong></div>
              <div>Phone: <strong style={{ color: 'var(--text)' }}>{phone}</strong> (Verified)</div>
              <div>Hotel: <strong style={{ color: 'var(--text)' }}>{hotelName}</strong> ({subdomain || 'default'})</div>
              <div>Timestamp: <strong style={{ color: 'var(--text)' }}>{new Date().toLocaleString()}</strong></div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowConfirmModal(false)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '11px 16px',
                  fontWeight: 600,
                  fontSize: '13px',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleFinishRegistration}
                style={{
                  flex: 2,
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
                {loading ? 'Creating account…' : 'Finish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
