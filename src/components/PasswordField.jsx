import { useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '../lib/passwordPolicy';

/**
 * PasswordField — Enhanced Accessible Password Input
 *
 * Features:
 * - Show / Hide password toggle (eye icon)
 * - Real-time Caps Lock detection & warning
 * - Live password strength meter (Weak / Medium / Strong)
 * - Minimum requirements checklist (8+ chars, number, letter)
 * - Live confirm-password match indicator
 * - Full autoComplete & autoFocus support
 */
export default function PasswordField({
  id,
  name,
  label = 'Password',
  value = '',
  onChange,
  onBlur,
  placeholder = '••••••••',
  required = false,
  minLength = 8,
  disabled = false,
  autoComplete = 'current-password',
  autoFocus = false,
  showStrength = false,
  showRequirements = false,
  showMatch = false,
  matchValue = '',
  error = '',
  theme = 'light',
  style = {},
  inputStyle = {},
  labelStyle = {},
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);

  const isDark = theme === 'dark';

  // Caps Lock detection
  function handleKeyDown(e) {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  }

  function handleKeyUp(e) {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  }

  // Password strength calculation (0 to 3)
  const hasMinLength = value.length >= MIN_PASSWORD_LENGTH;
  const hasNumber = /\d/.test(value);
  const hasLetter = /[a-zA-Z]/.test(value);
  const hasSpecialOrUpper = /[A-Z]/.test(value) && /[^A-Za-z0-9]/.test(value);

  let strengthScore = 0;
  if (value.length >= 8) strengthScore++;
  if (hasMinLength && (hasNumber || hasLetter)) strengthScore++;
  if (hasMinLength && hasNumber && hasLetter && hasSpecialOrUpper) strengthScore++;

  const strengthLabels = ['Too weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];

  // Confirm password match check
  const passwordsMatch = showMatch && matchValue && value && value === matchValue;
  const passwordsMismatch = showMatch && matchValue && value && value !== matchValue;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            ...labelStyle,
          }}
        >
          {label}
        </label>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          disabled={disabled}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          style={{
            width: '100%',
            padding: '10px 44px 10px 14px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--input-bg)',
            color: 'var(--input-fg)',
            fontSize: '14px',
            fontFamily: 'var(--font-body)',
            boxSizing: 'border-box',
            outline: 'none',
            opacity: disabled ? 0.6 : 1,
            transition: 'border-color 0.2s',
            ...inputStyle,
          }}
        />

        {/* Show/Hide eye button */}
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          tabIndex={-1}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          title={showPassword ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute',
            right: '10px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            color: 'var(--input-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            borderRadius: '6px',
          }}
        >
          {showPassword ? (
            // Eye off icon SVG
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          ) : (
            // Eye icon SVG
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          )}
        </button>
      </div>

      {/* Caps Lock Warning */}
      {capsLockActive && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            color: isDark ? '#fbbf24' : '#b45309',
            fontWeight: 600,
            marginTop: '2px',
          }}
        >
          <span>⇪</span> Caps Lock is ON
        </div>
      )}

      {/* Strength indicator */}
      {showStrength && value.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>Password Strength:</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: strengthColors[Math.min(strengthScore, 2)],
              }}
            >
              {strengthLabels[Math.min(strengthScore, 2)]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px', height: '4px' }}>
            {[0, 1, 2].map((step) => (
              <div
                key={step}
                style={{
                  flex: 1,
                  borderRadius: '2px',
                  background:
                    step <= strengthScore
                      ? strengthColors[Math.min(strengthScore, 2)]
                      : isDark
                      ? 'rgba(255,255,255,0.1)'
                      : '#e2e8f0',
                  transition: 'background 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Requirements checklist */}
      {showRequirements && value.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '6px', fontSize: '11px' }}>
          <div style={{ color: hasMinLength ? (isDark ? '#34d399' : '#16a34a') : isDark ? '#94a3b8' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{hasMinLength ? '✓' : '○'}</span> {MIN_PASSWORD_LENGTH}+ characters
          </div>
          <div style={{ color: hasNumber ? (isDark ? '#34d399' : '#16a34a') : isDark ? '#94a3b8' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{hasNumber ? '✓' : '○'}</span> 1+ number
          </div>
          <div style={{ color: hasLetter ? (isDark ? '#34d399' : '#16a34a') : isDark ? '#94a3b8' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{hasLetter ? '✓' : '○'}</span> 1+ letter
          </div>
        </div>
      )}

      {/* Confirm Password Match Indicator */}
      {showMatch && (
        <div style={{ marginTop: '2px', fontSize: '12px', fontWeight: 600 }}>
          {passwordsMatch && (
            <span style={{ color: isDark ? '#34d399' : '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✓ Passwords match
            </span>
          )}
          {passwordsMismatch && (
            <span style={{ color: isDark ? '#f87171' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✕ Passwords do not match
            </span>
          )}
        </div>
      )}

      {/* Field error */}
      {error && (
        <div style={{ color: 'var(--text)', fontSize: '12px', marginTop: '4px', fontFamily: 'var(--font-body)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
