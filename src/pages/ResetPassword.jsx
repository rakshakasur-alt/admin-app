import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  clearHotelIdCache,
  exchangeResetCode,
  resetPasswordWithOtp,
  supabase,
  updatePassword,
  verifyResetTokenHash,
} from '../lib/supabaseClient';
import PasswordField from '../components/PasswordField';
import useDocumentTitle from '../lib/useDocumentTitle';
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';

export default function ResetPassword() {
  useDocumentTitle('Reset Password');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // URL parameters if present
  const initialEmail = searchParams.get('email') || '';
  const initialToken = searchParams.get('token') || '';
  const initialCode = searchParams.get('code') || '';
  const initialTokenHash = searchParams.get('token_hash') || '';

  const [email, setEmail] = useState(initialEmail);
  const [resetCode, setResetCode] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isRecoveryActive, setIsRecoveryActive] = useState(false);
  const [activeUserEmail, setActiveUserEmail] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [entryMode, setEntryMode] = useState(initialToken || initialEmail ? 'code' : 'auto');

  const redirectTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let authSubscription = null;
    let fallbackTimer = null;

    async function handleAuthVerification() {
      // 1. Check for error parameters in hash or search
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
      const queryParams = new URLSearchParams(search);

      const errorDesc = hashParams.get('error_description') || queryParams.get('error_description');
      if (errorDesc && mounted) {
        setErrorMessage(decodeURIComponent(errorDesc.replace(/\+/g, ' ')));
      }

      if (!supabase) {
        if (mounted) setCheckingAuth(false);
        return;
      }

      // 2. Handle PKCE code exchange if present in query params
      if (initialCode) {
        try {
          const { data, error } = await exchangeResetCode(initialCode);
          if (error) {
            if (mounted) {
              setErrorMessage(error.message || 'The password reset link is invalid or has expired.');
            }
          } else if (mounted) {
            setIsRecoveryActive(true);
            if (data?.session?.user?.email) {
              setActiveUserEmail(data.session.user.email);
              if (!email) setEmail(data.session.user.email);
            }
          }
        } catch (err) {
          if (mounted) {
            setErrorMessage(err.message || 'The password reset link could not be verified.');
          }
        }
      }

      // 3. Handle token_hash verification if present in query params
      if (initialTokenHash) {
        try {
          const { data, error } = await verifyResetTokenHash(initialTokenHash);
          if (error) {
            if (mounted) {
              setErrorMessage(error.message || 'The password reset link is invalid or has expired.');
            }
          } else if (mounted) {
            setIsRecoveryActive(true);
            if (data?.session?.user?.email) {
              setActiveUserEmail(data.session.user.email);
              if (!email) setEmail(data.session.user.email);
            }
          }
        } catch (err) {
          if (mounted) {
            setErrorMessage(err.message || 'The password reset link could not be verified.');
          }
        }
      }

      // 4. Subscribe strictly to PASSWORD_RECOVERY event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return;
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryActive(true);
          if (session?.user?.email) {
            setActiveUserEmail(session.user.email);
            if (!email) setEmail(session.user.email);
          }
        }
        setCheckingAuth(false);
      });
      authSubscription = subscription;

      fallbackTimer = setTimeout(() => {
        if (mounted) setCheckingAuth(false);
      }, 1200);
    }

    handleAuthVerification();

    return () => {
      mounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [initialCode, initialTokenHash]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (passwordPolicyError(newPassword)) {
      setErrorMessage(passwordPolicyError(newPassword));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // Flow A: Recovery session is active (from email link or existing session)
      if (isRecoveryActive && entryMode !== 'code') {
        const { error } = await updatePassword(newPassword);
        if (error) throw error;
      }
      // Flow B: Direct credentials entry (Email + OTP/Token code + New Password)
      else {
        if (!email.trim()) {
          setErrorMessage('Please enter your account email address.');
          setLoading(false);
          return;
        }
        if (!resetCode.trim()) {
          setErrorMessage('Please enter the 6-digit code or recovery token from your email.');
          setLoading(false);
          return;
        }

        const { error } = await resetPasswordWithOtp({
          email: email.trim(),
          token: resetCode.trim(),
          newPassword,
        });
        if (error) throw error;
      }

      clearHotelIdCache();
      setSuccessMessage('Your password has been reset successfully! Redirecting to your dashboard…');
      redirectTimerRef.current = setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1500);
    } catch (err) {
      setErrorMessage(
        err.message ||
        'Failed to reset password. The code or link may have expired. Please request a new link.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: '440px',
        margin: '60px auto',
        background: '#fff',
        padding: '32px 28px',
        borderRadius: '20px',
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ marginBottom: '22px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
          Reset Account Credentials
        </h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
          {isRecoveryActive && entryMode !== 'code'
            ? 'Your recovery session has been verified. Choose a strong new password.'
            : 'Enter the recovery code from your email along with your new password.'}
        </p>
      </div>

      {/* Mode switcher tabs if user wants to toggle between session vs manual code */}
      <div
        style={{
          display: 'flex',
          background: '#f1f5f9',
          padding: '3px',
          borderRadius: '10px',
          marginBottom: '20px',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        <button
          type="button"
          onClick={() => setEntryMode('code')}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: 'none',
            borderRadius: '8px',
            background: entryMode === 'code' || !isRecoveryActive ? '#fff' : 'transparent',
            color: entryMode === 'code' || !isRecoveryActive ? '#0f172a' : '#64748b',
            boxShadow: entryMode === 'code' || !isRecoveryActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          🔑 Enter Reset Code
        </button>
        <button
          type="button"
          onClick={() => setEntryMode('link')}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: 'none',
            borderRadius: '8px',
            background: entryMode === 'link' && isRecoveryActive ? '#fff' : 'transparent',
            color: entryMode === 'link' && isRecoveryActive ? '#0f172a' : '#64748b',
            boxShadow: entryMode === 'link' && isRecoveryActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          🔗 Email Link {isRecoveryActive && '✓'}
        </button>
      </div>

      {/* Active session verification status badge */}
      {isRecoveryActive && entryMode !== 'code' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '18px',
            fontSize: '13px',
          }}
        >
          <span style={{ fontSize: '16px' }}>✓</span>
          <div>
            Verified session for: <strong>{activeUserEmail || 'Administrator'}</strong>
          </div>
        </div>
      )}

      {/* Success banner */}
      {successMessage && (
        <div
          style={{
            color: '#15803d',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '18px',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          {successMessage}
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div
          style={{
            color: '#991b1b',
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '18px',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
        {/* Email & Code fields (shown if not using verified link session, or in manual code mode) */}
        {(!isRecoveryActive || entryMode === 'code') && (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '13px', color: '#334155' }}>
                Account Email
              </label>
              <input
                required
                autoFocus={!email}
                autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@hotel.com"
                disabled={loading || Boolean(successMessage)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                  fontSize: '14px',
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>
                  Reset Code or Token
                </label>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Check your email</span>
              </div>
              <input
                required
                autoFocus={Boolean(email) && !resetCode}
                autoComplete="one-time-code"
                type="text"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="e.g. 123456 or token"
                disabled={loading || Boolean(successMessage)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </>
        )}

        <PasswordField
          id="reset-new-password"
          label="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={loading || Boolean(successMessage)}
          autoComplete="new-password"
          autoFocus={isRecoveryActive && entryMode !== 'code'}
          showStrength
          showRequirements
        />

        <PasswordField
          id="reset-confirm-password"
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter new password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          disabled={loading || Boolean(successMessage)}
          autoComplete="new-password"
          showMatch
          matchValue={newPassword}
        />

        <button
          type="submit"
          disabled={loading || Boolean(successMessage)}
          style={{
            background: '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 18px',
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: '14px',
            marginTop: '6px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? 'Updating credentials…'
            : isRecoveryActive && entryMode !== 'code'
            ? 'Update Password'
            : 'Verify Code & Set Password'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '13px' }}>
          <Link to="/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
            &larr; Back to sign in
          </Link>
          <Link to="/login" style={{ color: '#64748b', textDecoration: 'none' }}>
            Need a new link?
          </Link>
        </div>
      </form>
    </div>
  );
}
