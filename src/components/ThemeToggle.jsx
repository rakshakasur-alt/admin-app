import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

/**
 * ThemeToggle — Sun/Moon button.
 * Reads/writes data-theme on <html> and persists to localStorage.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  function toggle() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '54px',
        height: '28px',
        padding: '2px',
        borderRadius: '999px',
        border: '1px solid var(--border)',
        background: isDark ? '#12161A' : '#EFE7DB',
        cursor: 'pointer',
        flexShrink: 0,
        boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.2)',
        transition: 'background 250ms ease, border-color 250ms ease'
      }}
    >
      {/* Background icon hints */}
      <span
        style={{
          position: 'absolute',
          left: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDark ? 0.35 : 0,
          transform: isDark ? 'scale(0.85) rotate(0deg)' : 'scale(0.5) rotate(-45deg)',
          transition: 'all 250ms ease',
          color: '#f59e0b',
          pointerEvents: 'none'
        }}
      >
        <Sun size={12} strokeWidth={2.5} />
      </span>

      <span
        style={{
          position: 'absolute',
          right: '7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: !isDark ? 0.35 : 0,
          transform: !isDark ? 'scale(0.85) rotate(0deg)' : 'scale(0.5) rotate(45deg)',
          transition: 'all 250ms ease',
          color: 'var(--text-muted)',
          pointerEvents: 'none'
        }}
      >
        <Moon size={12} strokeWidth={2.5} />
      </span>

      {/* Sliding thumb */}
      <span
        style={{
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: isDark ? '#242C33' : '#FFFFFF',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: isDark ? 'translateX(26px)' : 'translateX(0px)',
          transition: 'transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), background 250ms ease',
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.25)',
          color: isDark ? '#E0A96D' : '#d97706'
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: isDark ? 'rotate(360deg)' : 'rotate(0deg)',
            transition: 'transform 300ms ease'
          }}
        >
          {isDark ? <Moon size={13} strokeWidth={2.2} /> : <Sun size={13} strokeWidth={2.2} />}
        </span>
      </span>
    </button>
  );
}
