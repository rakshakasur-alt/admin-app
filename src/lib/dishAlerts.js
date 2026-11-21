import { dishHasModel } from './dishModel';

/**
 * Per-dish "active alerts" shown on the Alerts page and counted on the
 * sidebar's Alert / Notifications tiles. Single source of truth so the
 * badge always matches the page.
 */
export function buildAlerts(dishes = []) {
  const alerts = [];
  for (const dish of dishes) {
    const hasImage = Boolean(dish.thumbnail_url || dish.image);
    const has3D = dishHasModel(dish);
    const hasAllergens = Boolean(dish.allergens && String(dish.allergens).trim().length > 0);
    const hasPrice = Boolean(dish.price && Number(dish.price) > 0);
    const isSuspended = Boolean(dish.is_suspended || dish.status === 'suspended');

    if (!hasImage) alerts.push({ type: 'missing_image', dish });
    if (!has3D) alerts.push({ type: 'missing_3d', dish });
    if (!hasAllergens) alerts.push({ type: 'missing_allergens', dish });
    if (!hasPrice) alerts.push({ type: 'missing_price', dish });
    if (isSuspended) alerts.push({ type: 'suspended', dish });
  }
  return alerts;
}

export function countActiveAlerts(dishes = []) {
  return buildAlerts(dishes).length;
}
