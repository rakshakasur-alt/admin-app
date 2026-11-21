/**
 * Single source of truth for "does this dish have a 3D/AR model?" in the admin app.
 *
 * Mirrors guest-app `dishHasModel` (guest-app/src/pages/Menu.jsx): a dish is 3D
 * available when the base dish OR any of its portion variants has a model.
 * Previously admin pages only looked at the base dish, so dishes whose models
 * were uploaded per-portion showed "2D only" in admin but "3D" to guests.
 */
export function isValidModelUrl(u) {
  return Boolean(u && String(u).trim() && u !== 'null' && u !== 'undefined');
}

export function parsePortionVariants(variants) {
  if (typeof variants === 'string') {
    try { variants = JSON.parse(variants); } catch (_) { variants = []; }
  }
  return Array.isArray(variants) ? variants : [];
}

export function dishHasModel(dish) {
  if (!dish) return false;
  if (
    isValidModelUrl(dish.model_url) ||
    isValidModelUrl(dish.model_glb_url) ||
    isValidModelUrl(dish.model_usdz_url) ||
    isValidModelUrl(dish.usdz_url)
  ) return true;
  return parsePortionVariants(dish.portion_variants).some(
    (v) => v && (isValidModelUrl(v.model_glb_url) || isValidModelUrl(v.model_usdz_url) || isValidModelUrl(v.model_url))
  );
}

export default dishHasModel;
