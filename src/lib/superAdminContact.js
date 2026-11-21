import { useEffect, useState } from 'react';
import { buildGmailComposeUrl, openGmailCompose } from './gmail';
import { fetchSuperAdminEmail } from './supabaseClient';

/**
 * Every "contact the Super Admin" action in the hotel admin app goes through
 * e-mail: it opens a compose window addressed to the Super Admin with a
 * pre-written template (subject + body with the hotel's details filled in).
 * No phone numbers, chat or in-app forms.
 */

export const SUPER_ADMIN_FALLBACK_EMAIL = 'rakshakasur@gmail.com';

/** Super Admin contact address from the platform (cached), with a fallback. */
export function useSuperAdminEmail() {
  const [email, setEmail] = useState(SUPER_ADMIN_FALLBACK_EMAIL);
  useEffect(() => {
    let mounted = true;
    Promise.resolve()
      .then(() => fetchSuperAdminEmail())
      .then((res) => { if (mounted && res?.email) setEmail(res.email); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);
  return email;
}

function hotelLines(hotel, ownerEmail) {
  return [
    '— Hotel details —',
    `Hotel: ${hotel?.name || '—'}`,
    `Hotel ID: ${hotel?.id || '—'}`,
    `Subdomain: ${hotel?.subdomain || '—'}`,
    `Plan: ${hotel?.plan || 'free'}`,
    `Status: ${hotel?.status || '—'}`,
    `Owner e-mail: ${ownerEmail || hotel?.contact_email || '—'}`,
  ];
}

function signOff(hotel, ownerEmail) {
  return ['', 'Thank you,', ownerEmail || hotel?.name || ''];
}

/** Pre-built e-mail templates: each returns { subject, body }. */
export const SUPER_ADMIN_TEMPLATES = {
  support: ({ hotel, ownerEmail } = {}) => ({
    subject: `Support request – ${hotel?.name || 'Hotel'}`,
    body: [
      'Hello Super Admin team,',
      '',
      'I need help with:',
      '- ',
      '',
      ...hotelLines(hotel, ownerEmail),
      ...signOff(hotel, ownerEmail),
    ].join('\n'),
  }),
  suspendedAccount: ({ hotel, ownerEmail } = {}) => ({
    subject: `Suspended hotel account – review request${hotel?.name ? ` – ${hotel.name}` : ''}`,
    body: [
      'Hello Super Admin team,',
      '',
      'My hotel account has been suspended. Please review it and let me know what needs to be fixed.',
      '',
      'Details / what we have corrected:',
      '- ',
      '',
      ...hotelLines(hotel, ownerEmail),
      ...signOff(hotel, ownerEmail),
    ].join('\n'),
  }),
  billing: ({ hotel, ownerEmail } = {}) => ({
    subject: `Plan change request – ${hotel?.name || 'Hotel'}`,
    body: [
      'Hello Super Admin team,',
      '',
      `We are currently on the ${hotel?.plan === 'pro' ? 'Pro' : 'Free'} plan and would like to:`,
      '- [ ] Upgrade to Pro',
      '- [ ] Downgrade / cancel',
      '- [ ] Ask a billing question',
      '',
      ...hotelLines(hotel, ownerEmail),
      ...signOff(hotel, ownerEmail),
    ].join('\n'),
  }),
  loginHelp: ({ email } = {}) => ({
    subject: 'Hotel admin sign-in help',
    body: [
      'Hello Super Admin team,',
      '',
      'I cannot sign in to the hotel admin console.',
      '',
      `Login e-mail: ${email || ''}`,
      'Hotel name: ',
      'What happens when I try to sign in: ',
      '',
      'Thank you',
    ].join('\n'),
  }),
};

export function buildSuperAdminMailUrl(to, templateKey, data) {
  const make = SUPER_ADMIN_TEMPLATES[templateKey] || SUPER_ADMIN_TEMPLATES.support;
  return buildGmailComposeUrl({ to: to || SUPER_ADMIN_FALLBACK_EMAIL, ...make(data) });
}

export function openSuperAdminMail(to, templateKey, data) {
  const make = SUPER_ADMIN_TEMPLATES[templateKey] || SUPER_ADMIN_TEMPLATES.support;
  openGmailCompose({ to: to || SUPER_ADMIN_FALLBACK_EMAIL, ...make(data) });
}
