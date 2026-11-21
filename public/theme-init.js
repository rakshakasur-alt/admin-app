// Applies the saved theme before first paint (no flash).
// Kept as a file, not inline, so the Content-Security-Policy can use script-src 'self'.
// Immediately apply stored theme and dashboard font to avoid FOUC
(function() {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || t === 'light') {
    document.documentElement.setAttribute('data-theme', t);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  var f = localStorage.getItem('admin_dashboard_font');
  if (f) {
    document.documentElement.style.setProperty('--font-body', '"' + f + '", -apple-system, BlinkMacSystemFont, sans-serif');
    document.documentElement.style.setProperty('--font-title', '"' + f + '", sans-serif');
    document.documentElement.style.setProperty('--font-serif', '"' + f + '", Georgia, serif');
  }
})();
