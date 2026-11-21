/**
 * Build a Gmail web "compose" URL with recipient, subject and body pre-filled.
 * Opens in a new tab (the user must be signed in to Gmail). Used for all
 * "Contact Super Admin" actions instead of mailto:, which depends on a
 * desktop mail client being configured.
 */
export function buildGmailComposeUrl({ to = '', subject = '', body = '' } = {}) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function openGmailCompose(opts) {
  const url = buildGmailComposeUrl(opts);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  // Popup blocked → navigate a new tab via a temporary link
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
