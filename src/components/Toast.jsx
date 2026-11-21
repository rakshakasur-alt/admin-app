import { useState, useEffect } from 'react';

/**
 * Toast notification component
 *
 * Can be triggered directly by rendering `<Toast message="..." type="success|error|info" onClose={...} />`
 * or by dispatching window custom events:
 * `window.dispatchEvent(new CustomEvent('app-toast', { detail: { message: 'Dish updated', type: 'success' } }))`
 */
export function Toast({ message, type = 'info', duration = 4000, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const iconColor = type === 'success' ? 'var(--success-fg)' : type === 'error' ? 'var(--danger-fg)' : 'var(--accent)';
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--bg)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        padding: '12px 18px',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)',
        fontSize: '14px',
        fontWeight: 500,
        maxWidth: '400px',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
      <span style={{ fontWeight: 700, fontSize: '16px', color: iconColor }}>{icon}</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: '16px',
          fontWeight: 700,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Hook to manage toast messages
 */
export function useToast() {
  const [toast, setToast] = useState(null); // { message, type }

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const clearToast = () => setToast(null);

  return { toast, showToast, clearToast };
}

export default Toast;
