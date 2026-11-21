/**
 * Which browser-storage keys belong to the signed-in account and must be
 * removed on logout (shared restaurant computers - security fix V13).
 *
 * Kept on purpose:
 *   theme, cookie_consent             device preferences, not personal
 *   remembered_admin_email            the user ticked "remember me"
 *   qr_menu_dish_drafts_<hotelId>,
 *   read_/dismissed_notifications_<hotelId>
 *                                     keyed by hotel, so another owner never
 *                                     sees them; keeps unsaved drafts safe
 */
const ACCOUNT_PREFIXES = [
  'hotel-', 'hotel_', 'admin_hotel_', 'current_hotel_',
  'admin_profile_',            // name, role, phone, avatar of the owner
  'sb-',                       // Supabase auth token (also removed by signOut)
];
const ACCOUNT_KEYS = new Set([
  'admin_dashboard_font',
  'demo_content_reports',
  'qr_menu_show_onboarding_walkthrough',
]);

export function isAccountScopedKey(key) {
  if (!key) return false;
  return ACCOUNT_KEYS.has(key) || ACCOUNT_PREFIXES.some((p) => key.startsWith(p));
}

/** Removes every account-scoped key from localStorage and clears sessionStorage. */
export function clearAccountStorage(local = globalThis.localStorage, session = globalThis.sessionStorage) {
  try {
    const keys = [];
    for (let i = 0; i < local.length; i++) {
      const k = local.key(i);
      if (isAccountScopedKey(k)) keys.push(k);
    }
    keys.forEach((k) => local.removeItem(k));
  } catch (_) {}
  try { session.clear(); } catch (_) {}
}
