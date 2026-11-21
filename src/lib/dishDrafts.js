// ---------------------------------------------------------------------------
// Dish drafts — TEXT ONLY.
// Drafts live in this browser (localStorage), scoped per hotel. Images,
// videos and 3D models are intentionally never stored in a draft.
// ---------------------------------------------------------------------------

const LEGACY_KEY = 'qr_menu_dish_form_draft';
const MAX_DRAFTS = 50;

function storageKey(hotelId) {
  return `qr_menu_dish_drafts_${hotelId || 'default'}`;
}

function read(hotelId) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(hotelId)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function write(hotelId, drafts) {
  try {
    localStorage.setItem(storageKey(hotelId), JSON.stringify(drafts.slice(0, MAX_DRAFTS)));
  } catch (_) {}
}

/** Strip everything that is not plain text (media URLs, model files…). */
export function toTextOnlyDraft(form = {}) {
  return {
    name: String(form.name || ''),
    category: String(form.category || 'Main'),
    price: form.price ?? '',
    description: String(form.description || ''),
    veg: Boolean(form.veg),
    is_bestseller: Boolean(form.is_bestseller),
    is_special: Boolean(form.is_special),
    is_jain: Boolean(form.is_jain),
    spice_level: Number(form.spice_level) || 1,
    allergens: String(form.allergens || ''),
    portion_variants: (Array.isArray(form.portion_variants) ? form.portion_variants : []).map((v, i) => ({
      id: v.id || `variant-${Date.now()}-${i}`,
      name: String(v.name || ''),
      price: v.price ?? '',
      model_glb_url: '',
      model_usdz_url: '',
    })),
  };
}

/** Lists drafts (newest first). Migrates the old single-draft key once. */
export function listDrafts(hotelId) {
  let drafts = read(hotelId);
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && (parsed.name || parsed.description)) {
        drafts = [{ id: `draft-${Date.now()}`, updatedAt: new Date().toISOString(), form: toTextOnlyDraft(parsed) }, ...drafts];
        write(hotelId, drafts);
      }
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch (_) {}
  return drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/** Creates or updates a draft. Returns the saved draft. */
export function saveDraft(hotelId, form, draftId = null) {
  const drafts = read(hotelId);
  const id = draftId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const draft = { id, updatedAt: new Date().toISOString(), form: toTextOnlyDraft(form) };
  const next = [draft, ...drafts.filter(d => d.id !== id)];
  write(hotelId, next);
  return draft;
}

export function deleteDraft(hotelId, draftId) {
  write(hotelId, read(hotelId).filter(d => d.id !== draftId));
}
