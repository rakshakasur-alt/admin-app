import { createClient } from '@supabase/supabase-js';
import { loadPersistedAdminData, savePersistedAdminData } from './mockData';
import { cachedFetch, clearCache, invalidateCache, peekCache } from './dataCache';
import { clearAccountStorage } from './logoutCleanup';
import { dishHasModel } from './dishModel';

export { peekCache };

// ---------------------------------------------------------------------------
// Supabase client — anon key only, safe to ship in the browser bundle
// ---------------------------------------------------------------------------
const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ---------------------------------------------------------------------------
// Local (offline / demo) session keys
// ---------------------------------------------------------------------------
const LOCAL_SESSION_KEY  = 'hotel-admin-session';
const LOCAL_HOTEL_ID_KEY = 'hotel-admin-hotel-id';

// ---------------------------------------------------------------------------
// User-bound hotel cache & in-flight promise deduplication
// Bound strictly to authenticated user.id. Cleared on sign-out or user change.
// ---------------------------------------------------------------------------
let _cachedUserId = null;
let _cachedHotel = null; // { id, name, subdomain, menu_id, status, theme_config, owner_id }
let _inFlightHotelPromise = null;

// Auth state listener: immediately clear in-memory cache on user switch or sign-out
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    const nextUserId = session?.user?.id || null;
    // TOKEN_REFRESHED / INITIAL_SESSION for the same user must NOT wipe caches,
    // otherwise every page navigation after a token refresh re-runs the full
    // hotel lookup chain.
    if (event === 'SIGNED_OUT' || !nextUserId || (_cachedUserId && nextUserId !== _cachedUserId)) {
      clearHotelIdCache();
    }
  });
}

// Any write that dispatches 'hotel-menu-data-updated' invalidates cached admin
// data first (module-level listener → registered before any page listener).
if (typeof window !== 'undefined') {
  window.addEventListener('hotel-menu-data-updated', () => {
    invalidateCache('adminData:');
    invalidateCache('arRanking:');
    invalidateCache('platformUpdates:');
  });
}

const HOTEL_BASE_COLUMNS = 'id, name, subdomain, menu_id, status, theme_config, owner_id, currency';

function isMissingColumnError(error) {
  return Boolean(error) && (error.code === '42703' || error.code === 'PGRST204' || /column/i.test(error.message || ''));
}

/** Resolve the effective plan: the `plan` column is authoritative. */
export function resolveHotelPlan(hotel) {
  if (!hotel) return 'free';
  const col = typeof hotel.plan === 'string' ? hotel.plan.toLowerCase() : '';
  if (col === 'pro' || col === 'free') return col;
  // Older databases without the `plan` column only store it in theme_config
  return hotel.theme_config?.plan === 'pro' ? 'pro' : 'free';
}

/**
 * getCurrentHotel()
 *
 * Returns the full hotel record belonging strictly to the currently authenticated user.
 * Verified against hotels.owner_id and hotel_owners table.
 * Never leaks data from another user and never claims unowned hotels.
 */
export async function getCurrentHotel(forceRefresh = false) {
  if (!supabase) {
    if (!forceRefresh && _cachedHotel) return _cachedHotel;
    let localId = null;
    if (typeof window !== 'undefined') {
      try {
        localId = sessionStorage.getItem('current_hotel_id') || localStorage.getItem(LOCAL_HOTEL_ID_KEY) || 'local-demo-hotel';
      } catch (_) {}
    }
    _cachedHotel = {
      id: localId || 'local-demo-hotel',
      name: 'Local Demo Hotel',
      subdomain: 'demo',
      menu_id: 'demo-menu',
      status: 'verified',
      theme_config: null,
    };
    return _cachedHotel;
  }

  if (!forceRefresh && _cachedHotel && _cachedUserId) {
    return _cachedHotel;
  }

  if (_inFlightHotelPromise && !forceRefresh) {
    return _inFlightHotelPromise;
  }

  _inFlightHotelPromise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        clearHotelIdCache();
        return null;
      }

      // If user changed, clear stale cache
      if (_cachedUserId && _cachedUserId !== user.id) {
        clearHotelIdCache();
      }

      // Select every hotel column (phone, contact_email, address, branch, plan, logo…)
      // so the profile modal and plan badge always see real saved values.
      async function executeHotelSelect(buildQuery) {
        let res = await buildQuery('*');
        if (res.error && isMissingColumnError(res.error)) {
          res = await buildQuery(HOTEL_BASE_COLUMNS);
        }
        return res;
      }

      let hotel = null;

      // 1. Direct ownership lookup: hotels where owner_id = user.id
      const { data: directHotel } = await executeHotelSelect(cols =>
        supabase
          .from('hotels')
          .select(cols)
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      );

      if (directHotel) {
        hotel = directHotel;
      }

      // 2. Co-owner lookup via hotel_owners table
      if (!hotel) {
        const { data: ownerRows } = await supabase
          .from('hotel_owners')
          .select('hotel_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (ownerRows && ownerRows.length > 0) {
          const { data: linkedHotel } = await executeHotelSelect(cols =>
            supabase
              .from('hotels')
              .select(cols)
              .eq('id', ownerRows[0].hotel_id)
              .maybeSingle()
          );

          if (linkedHotel) {
            hotel = linkedHotel;
          }
        }
      }

      // 3. Match an invited hotel pre-created by a super admin.
      //    Only the claim RPC may assign ownership (server-side, email match only).
      if (!hotel && user.email) {
        try {
          const { data: claimRes } = await supabase.rpc('claim_hotel_by_owner_email');
          if (claimRes?.success && claimRes?.hotel_id) {
            const { data: claimedHotel } = await executeHotelSelect(cols =>
              supabase
                .from('hotels')
                .select(cols)
                .eq('id', claimRes.hotel_id)
                .maybeSingle()
            );
            if (claimedHotel) {
              hotel = claimedHotel;
            }
          }
        } catch (_) {}
      }

      // 4. Trust user metadata hotel_id only if RLS confirms this user owns it.
      //    Never auto-write ownership from the client.
      if (!hotel && user.user_metadata?.hotel_id) {
        const { data: metaHotel } = await executeHotelSelect(cols =>
          supabase
            .from('hotels')
            .select(cols)
            .eq('id', user.user_metadata.hotel_id)
            .maybeSingle()
        );

        if (metaHotel && metaHotel.owner_id === user.id) {
          hotel = metaHotel;
        }
      }

      // 5. Fallback for platform administrator testing/managing hotels
      if (!hotel) {
        try {
          const { data: isSuperAdmin } = await supabase.rpc('is_platform_admin');
          if (isSuperAdmin) {
            const { data: platformHotel } = await executeHotelSelect(cols =>
              supabase
                .from('hotels')
                .select(cols)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            );
            if (platformHotel) {
              hotel = platformHotel;
            }
          }
        } catch (_) {}
      }

      // 6. Auto-heal: If user signed up with hotel_name metadata but no hotel was created yet
      if (!hotel && user.user_metadata?.hotel_name) {
        try {
          const { data: rpcRes } = await supabase.rpc('signup_hotel', {
            hotel_name: user.user_metadata.hotel_name,
            hotel_subdomain: user.user_metadata.subdomain || null,
          });
          const resolvedHotelId = rpcRes?.hotel_id;
          if (resolvedHotelId) {
            const { data: createdHotel } = await executeHotelSelect(cols =>
              supabase
                .from('hotels')
                .select(cols)
                .eq('id', resolvedHotelId)
                .maybeSingle()
            );
            if (createdHotel) {
              hotel = createdHotel;
            }
          }
        } catch (_) {}
      }

      if (hotel) {
        // Ensure menu_id exists
        if (!hotel.menu_id) {
          const newMenuId = crypto?.randomUUID?.() || null;
          if (newMenuId) {
            hotel.menu_id = newMenuId;
            try {
              await supabase.from('hotels').update({ menu_id: newMenuId }).eq('id', hotel.id);
            } catch (_) {}
          }
        }

        // Ensure hotel.plan is resolved (plan column is authoritative)
        hotel.plan = resolveHotelPlan(hotel);

        // Contact details typed during signup are stored in auth metadata.
        // If the hotel row was created later (e.g. after email confirmation),
        // copy them onto the hotel once so the Profile tab shows them.
        try {
          await backfillHotelProfileFromSignup(hotel, user);
        } catch (_) {}

        _cachedUserId = user.id;
        _cachedHotel = hotel;

        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('current_hotel_id', hotel.id);
            sessionStorage.setItem('current_hotel_user_id', user.id);
          } catch (_) {}
        }
      } else {
        _cachedUserId = user.id;
        _cachedHotel = null;
        console.warn('[supabaseClient] getCurrentHotel: no hotel found for user', user.id);
      }

      return _cachedHotel;
    } finally {
      _inFlightHotelPromise = null;
    }
  })();

  return _inFlightHotelPromise;
}

/**
 * getCurrentHotelId()
 * Returns the active hotel id for the current user.
 */
export async function getCurrentHotelId(forceRefresh = false) {
  const hotel = await getCurrentHotel(forceRefresh);
  return hotel?.id || null;
}

async function backfillHotelProfileFromSignup(hotel, user) {
  const meta = user?.user_metadata || {};
  const candidates = {
    contact_email: meta.contact_email || user?.email || null,
    phone: meta.contact_phone || meta.phone_number || null,
    address: meta.address || null,
    branch: meta.branch || null,
    coordinates: meta.coordinates || null,
  };
  const updates = {};
  for (const [col, value] of Object.entries(candidates)) {
    // Only fill columns that exist on this database and are still empty
    if (value && col in hotel && (hotel[col] === null || hotel[col] === '')) {
      updates[col] = typeof value === 'string' ? value.trim() : value;
    }
  }
  if (!Object.keys(updates).length) return;
  const { error } = await supabase.from('hotels').update(updates).eq('id', hotel.id);
  if (!error) Object.assign(hotel, updates);
}

export function clearHotelIdCache() {
  clearCache();
  _cachedUserId = null;
  _cachedHotel = null;
  _inFlightHotelPromise = null;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('current_hotel_id');
      sessionStorage.removeItem('current_hotel_user_id');
      localStorage.removeItem('current_hotel_id');
      localStorage.removeItem('admin_hotel_name');
      localStorage.removeItem('admin_hotel_subdomain');
      localStorage.removeItem('admin_hotel_menu_id');
      localStorage.removeItem('hotel_theme_config');
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export async function signInAdmin(email, password) {
  if (!supabase) {
    if (import.meta.env.PROD) {
      return {
        data: null,
        error: new Error('Authentication unavailable: Supabase configuration is missing in production.'),
      };
    }
    if (email === 'admin@hotel.com' && password === 'admin123') {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email }));
      localStorage.setItem(LOCAL_HOTEL_ID_KEY, 'local-demo-hotel');
      _cachedHotel = {
        id: 'local-demo-hotel',
        name: 'Local Demo Hotel',
        subdomain: 'demo',
        menu_id: 'demo-menu',
        status: 'verified',
        theme_config: null,
      };
      _cachedUserId = email;
      return { data: { user: { email } }, error: null };
    }
    return { data: null, error: new Error('Use admin@hotel.com / admin123 for local demo login.') };
  }

  const result = await supabase.auth.signInWithPassword({ email, password });

  if (!result.error) {
    // Pre-warm the hotel_id cache after sign-in (non-blocking)
    getCurrentHotelId().catch(() => {});
  }

  return result;
}

export async function getAdminSession() {
  if (!supabase) {
    return JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOutAdmin() {
  clearHotelIdCache();
  if (!supabase) {
    if (typeof window !== 'undefined') clearAccountStorage();
    return { error: null };
  }
  try {
    return await supabase.auth.signOut();
  } finally {
    // Runs even if signOut fails (e.g. offline): this device is cleaned anyway.
    if (typeof window !== 'undefined') clearAccountStorage();
  }
}

// ---------------------------------------------------------------------------
// fetchAdminData
// Reads only this user's hotel dishes/theme — hotel and menu_id are verified
// against the authenticated user session. Cached (stale-while-revalidate):
// pass { force: true } after realtime events to bypass the cache.
// ---------------------------------------------------------------------------
export async function fetchAdminData({ force = false } = {}) {
  if (!supabase) {
    return loadPersistedAdminData();
  }

  const hotel = await getCurrentHotel(false);
  if (!hotel?.id) {
    console.warn('[supabaseClient] fetchAdminData: no verified hotel for current user');
    return {
      dishes: [],
      tables: [],
      theme_config: null,
      hotel: null,
    };
  }

  return cachedFetch(`adminData:${hotel.id}`, () => loadAdminDataFromServer(hotel), { maxAgeMs: 20_000, force });
}

/** Synchronous read of the last loaded admin data (or undefined). */
export function peekAdminData() {
  if (!_cachedHotel?.id) return undefined;
  return peekCache(`adminData:${_cachedHotel.id}`);
}

async function loadAdminDataFromServer(hotel) {
  const hotelId = hotel.id;
  const menuId = hotel.menu_id;
  const cachedDishesKey = `hotel_cache_dishes_${hotelId}`;

  // Cryptographically isolated queries: match hotel_id AND menu_id if menuId is present
  const dishesQuery = menuId
    ? supabase.from('dishes').select('*').eq('hotel_id', hotelId).eq('menu_id', menuId)
    : supabase.from('dishes').select('*').eq('hotel_id', hotelId);

  const [
    { data: dishes, error: dishesError },
    { data: hotelData, error: hotelError },
  ] = await Promise.all([
    dishesQuery.order('created_at', { ascending: false }),
    supabase.from('hotels').select('*').eq('id', hotelId).maybeSingle(),
  ]);

  if (dishesError) console.error('[supabaseClient] dishes fetch error:', dishesError.message);
  if (hotelError)  console.error('[supabaseClient] hotel fetch error:',  hotelError.message);

  if (hotelData) {
    hotelData.plan = resolveHotelPlan(hotelData);
    if (_cachedHotel && _cachedHotel.id === hotelId) {
      Object.assign(_cachedHotel, hotelData);
    }
  }

  // The server copy of theme_config is authoritative. A local copy is only
  // used when the network request failed (offline), never to override the
  // server — stale local copies used to resurrect old templates and plans.
  let themeConfig = hotelData?.theme_config ?? null;
  if (!hotelData) {
    themeConfig = hotel.theme_config ?? null;
    try {
      const local = localStorage.getItem(`hotel_theme_config_${hotelId}`);
      if (local && !themeConfig) themeConfig = JSON.parse(local);
    } catch (_) {}
  }

  // Strip legacy __SYSTEM__ sentinel rows and soft-deleted dishes
  let finalDishes = (dishes || []).filter(d => d.category !== '__SYSTEM__' && !d.deleted_at);
  if (dishesError) {
    try {
      const cached = JSON.parse(localStorage.getItem(cachedDishesKey) || 'null');
      if (Array.isArray(cached) && cached.length) finalDishes = cached;
    } catch (_) {}
  } else {
    try { localStorage.setItem(cachedDishesKey, JSON.stringify(finalDishes)); } catch (_) {}
  }

  const resolvedHotel = hotelData || hotel;
  if (resolvedHotel) resolvedHotel.plan = resolveHotelPlan(resolvedHotel);

  return {
    dishes:       finalDishes,
    tables:       [],
    theme_config: themeConfig,
    hotel:        resolvedHotel,
  };
}

/**
 * Re-read just the hotel row (1 query) and merge into the session cache.
 * Use this instead of getCurrentHotel(true), which re-runs the whole
 * ownership lookup chain.
 */
export async function refreshCurrentHotelRow() {
  const hotel = await getCurrentHotel();
  if (!supabase || !hotel?.id) return hotel;
  const { data } = await supabase.from('hotels').select('*').eq('id', hotel.id).maybeSingle();
  if (data && _cachedHotel?.id === data.id) {
    Object.assign(_cachedHotel, data);
    _cachedHotel.plan = resolveHotelPlan(_cachedHotel);
  }
  return _cachedHotel;
}

// ---------------------------------------------------------------------------
// updateHotelTheme
// Merges the given theme patch onto the LATEST server theme_config so that
// independent editors (standee modal, logo upload, header editor) never wipe
// each other's keys. `plan` is billing data and is never written from here.
// ---------------------------------------------------------------------------
export async function updateHotelTheme(themeConfigOrPatch) {
  const hotelId = await getCurrentHotelId();
  const { plan: _ignoredPlan, ...patch } = themeConfigOrPatch || {};

  let baseTheme = _cachedHotel?.id === hotelId ? (_cachedHotel.theme_config || {}) : {};
  if (supabase && hotelId) {
    const { data } = await supabase.from('hotels').select('theme_config').eq('id', hotelId).maybeSingle();
    if (data) baseTheme = data.theme_config || {};
  }
  const nextTheme = { ...baseTheme, ...patch };
  if (baseTheme.plan !== undefined) nextTheme.plan = baseTheme.plan;

  if (hotelId) {
    try {
      localStorage.setItem(`hotel_theme_config_${hotelId}`, JSON.stringify(nextTheme));
      if (_cachedHotel && _cachedHotel.id === hotelId) {
        _cachedHotel.theme_config = nextTheme;
      }
    } catch (_) {}
  }

  if (!supabase) {
    window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
    return { data: nextTheme, error: null };
  }
  if (!hotelId) return { data: null, error: new Error('No hotel linked to this account.') };

  const { error } = await supabase
    .from('hotels')
    .update({ theme_config: nextTheme })
    .eq('id', hotelId);

  if (error) console.error('[supabaseClient] updateHotelTheme error:', error.message);
  window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
  return { data: nextTheme, error };
}

/**
 * Save the hotel brand logo permanently: theme_config.logoUrl (read by the
 * guest menu + standees) and the logo_url column when it exists.
 */
export async function updateHotelLogo(logoUrl) {
  const { error } = await updateHotelTheme({ logoUrl: logoUrl || '' });
  if (error) return { error };
  if (supabase) {
    const hotelId = await getCurrentHotelId();
    const { error: colErr } = await supabase.from('hotels').update({ logo_url: logoUrl || null }).eq('id', hotelId);
    if (colErr && !isMissingColumnError(colErr)) return { error: colErr };
    if (_cachedHotel) _cachedHotel.logo_url = logoUrl || null;
  }
  window.dispatchEvent(new CustomEvent('hotel-logo-updated', { detail: { logoUrl } }));
  return { error: null };
}

// ---------------------------------------------------------------------------
// updateHotelProfile
// Updates public restaurant details: name, phone, email, hours, currency,
// address, branch, coordinates. If the database is missing an optional
// column the update is retried without it instead of failing entirely.
// ---------------------------------------------------------------------------
export async function updateHotelProfile(profileData) {
  const hotelId = await getCurrentHotelId();
  if (!hotelId) return { error: new Error('No hotel linked to this account.') };

  const updates = {};
  if (profileData.name !== undefined) updates.name = profileData.name ? String(profileData.name).trim() : null;
  if (profileData.phone !== undefined) updates.phone = profileData.phone ? String(profileData.phone).trim() : null;
  if (profileData.contact_email !== undefined) updates.contact_email = profileData.contact_email ? String(profileData.contact_email).trim().toLowerCase() : null;
  if (profileData.operating_hours !== undefined) updates.operating_hours = profileData.operating_hours ? String(profileData.operating_hours).trim() : null;
  if (profileData.currency !== undefined) updates.currency = profileData.currency ? String(profileData.currency).trim().toUpperCase() : 'INR';
  if (profileData.address !== undefined) updates.address = profileData.address ? String(profileData.address).trim() : null;
  if (profileData.branch !== undefined) updates.branch = profileData.branch ? String(profileData.branch).trim() : null;
  if (profileData.coordinates !== undefined) updates.coordinates = profileData.coordinates || null;
  if (updates.name === null) delete updates.name; // name is NOT NULL

  if (!supabase) {
    if (_cachedHotel) {
      Object.assign(_cachedHotel, updates);
    }
    window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
    return { data: _cachedHotel, error: null };
  }

  let payload = { ...updates };
  let data = null;
  let error = null;
  const skipped = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ data, error } = await supabase
      .from('hotels')
      .update(payload)
      .eq('id', hotelId)
      .select('*')
      .maybeSingle());
    if (!error || !isMissingColumnError(error)) break;
    const missing = Object.keys(payload).find(col => (error.message || '').includes(col));
    if (!missing) break;
    skipped.push(missing);
    delete payload[missing];
    if (!Object.keys(payload).length) { error = null; break; }
  }

  if (error) {
    console.error('[supabaseClient] updateHotelProfile error:', error.message);
    return { data: null, error };
  }
  if (!data) {
    return { data: null, error: new Error('Hotel profile was not updated (no matching hotel or permission denied).') };
  }

  // Columns the database does not have yet (run fix_debug_v1_bugs.sql) are
  // kept in theme_config so nothing the owner typed is lost.
  if (skipped.length) {
    const extra = {};
    skipped.forEach(col => { extra[col] = updates[col]; });
    await updateHotelTheme({ profile: { ...(data.theme_config?.profile || {}), ...extra } });
    Object.assign(data, extra);
  }

  data.plan = resolveHotelPlan(data);
  if (_cachedHotel && _cachedHotel.id === hotelId) {
    Object.assign(_cachedHotel, data);
  }

  window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// saveDish  (insert or update)
//
// INSERT: hotel_id is always sourced from getCurrentHotelId() — the caller
//         cannot supply or override it.
// UPDATE: guarded with .eq('hotel_id', hotelId) so an attacker who knows
//         another hotel's dish UUID cannot overwrite it.
// ---------------------------------------------------------------------------
export async function saveDish(dish, editId) {
  if (!supabase) {
    const currentData = loadPersistedAdminData();
    const nextDish    = { ...dish, id: editId || `dish-${Date.now()}` };
    const nextDishes  = editId
      ? currentData.dishes.map(item => (item.id === editId ? nextDish : item))
      : [...currentData.dishes, nextDish];
    return { data: savePersistedAdminData(nextDishes, currentData.tables), error: null };
  }

  const hotel = await getCurrentHotel();
  if (!hotel?.id) return { data: null, error: new Error('No hotel linked to this account.') };
  const hotelId = hotel.id;

  try {
    // Always strip hotel_id from caller payload — we inject it ourselves.
    // Suspension is controlled by the super admin only, and `status` /
    // timestamps are not writable dish columns.
    const {
      hotel_id: _ignored,
      is_suspended: _suspended,
      suspended_reason: _suspendedReason,
      status: _status,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...rawDish
    } = dish;
    const safeDish = {
      ...rawDish,
      ...(rawDish.price !== undefined ? { price: Number(rawDish.price) || 0 } : {}),
      ...(rawDish.name ? { name: String(rawDish.name).replace(/<[^>]*>?/gm, '').trim() } : {}),
    };

    const menuId = rawDish.menu_id || hotel.menu_id;

    let data, error;

    if (editId) {
      ({ data, error } = await supabase
        .from('dishes')
        .update(safeDish)
        .eq('id', editId)
        .eq('hotel_id', hotelId)   // IDOR guard
        .select());
    } else {
      ({ data, error } = await supabase
        .from('dishes')
        .insert({ ...safeDish, hotel_id: hotelId, ...(menuId ? { menu_id: menuId } : {}) })
        .select());
    }

    // Schema compat: new columns (dimensions, portion_variants, highlights, allergens, is_jain, spice_level) may not exist on older DB
    if (error?.message?.includes('column')) {
      const candidateCols = ['portion_variants', 'is_bestseller', 'is_special', 'is_jain', 'spice_level', 'allergens', 'breadth_cm', 'width_cm', 'height_cm'];
      const compat = { ...safeDish };
      let strippedAny = false;
      for (const col of candidateCols) {
        if (error.message.includes(col)) {
          delete compat[col];
          strippedAny = true;
        }
      }
      if (strippedAny) {
        if (editId) {
          ({ data, error } = await supabase
            .from('dishes').update(compat).eq('id', editId).eq('hotel_id', hotelId).select());
        } else {
          ({ data, error } = await supabase
            .from('dishes').insert({ ...compat, hotel_id: hotelId, ...(menuId ? { menu_id: menuId } : {}) }).select());
        }
      }
    }

    if (error) return { data: null, error };
    if (!data?.length) {
      return {
        data: null,
        error: new Error(
          editId
            ? 'Dish not updated — it may not exist or may belong to a different hotel.'
            : 'Dish was not inserted.',
        ),
      };
    }
    window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
    return { data: data[0], error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ---------------------------------------------------------------------------
// saveDishesBulk
// Inserts many dishes (CSV import) in batched multi-row inserts.
// Returns { inserted, failed: [{ index, name, message }] }.
// ---------------------------------------------------------------------------
export async function saveDishesBulk(dishList, { onProgress } = {}) {
  const rows = Array.isArray(dishList) ? dishList : [];
  if (!rows.length) return { inserted: 0, failed: [], error: null };

  if (!supabase) {
    const currentData = loadPersistedAdminData();
    const stamped = rows.map((d, i) => ({ ...d, id: `dish-${Date.now()}-${i}` }));
    savePersistedAdminData([...currentData.dishes, ...stamped], currentData.tables);
    return { inserted: stamped.length, failed: [], error: null };
  }

  const hotel = await getCurrentHotel();
  if (!hotel?.id) return { inserted: 0, failed: [], error: new Error('No hotel linked to this account.') };

  const clean = rows.map(d => ({
    name: String(d.name || '').replace(/<[^>]*>?/gm, '').trim(),
    category: String(d.category || 'Main').replace(/<[^>]*>?/gm, '').trim() || 'Main',
    price: Number(d.price) || 0,
    description: d.description ? String(d.description).replace(/<[^>]*>?/gm, '').trim() : null,
    veg: Boolean(d.veg),
    is_bestseller: Boolean(d.is_bestseller),
    is_special: Boolean(d.is_special),
    is_jain: Boolean(d.is_jain),
    spice_level: Math.min(3, Math.max(1, Number(d.spice_level) || 1)),
    allergens: d.allergens ? String(d.allergens).trim() : null,
    portion_variants: Array.isArray(d.portion_variants) ? d.portion_variants : [],
    hotel_id: hotel.id,
    ...(hotel.menu_id ? { menu_id: hotel.menu_id } : {}),
  }));

  const BATCH = 50;
  let inserted = 0;
  const failed = [];
  for (let start = 0; start < clean.length; start += BATCH) {
    const batch = clean.slice(start, start + BATCH);
    let { data, error } = await supabase.from('dishes').insert(batch).select('id');

    // Older schemas: drop optional columns the DB does not know about
    if (error && isMissingColumnError(error)) {
      const optional = ['is_jain', 'spice_level', 'portion_variants', 'allergens', 'is_special', 'is_bestseller'];
      const stripped = batch.map(row => {
        const copy = { ...row };
        optional.forEach(col => { if ((error.message || '').includes(col)) delete copy[col]; });
        return copy;
      });
      ({ data, error } = await supabase.from('dishes').insert(stripped).select('id'));
    }

    if (error) {
      // Fall back to row-by-row so one bad row doesn't sink the batch
      for (let i = 0; i < batch.length; i++) {
        const { error: rowErr } = await supabase.from('dishes').insert(batch[i]);
        if (rowErr) failed.push({ index: start + i, name: batch[i].name, message: rowErr.message });
        else inserted += 1;
      }
    } else {
      inserted += data?.length ?? batch.length;
    }
    if (onProgress) onProgress(Math.min(clean.length, start + BATCH), clean.length);
  }

  window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
  return { inserted, failed, error: null };
}

// ---------------------------------------------------------------------------
// deleteDish
// Permanently deletes a dish from the database with an IDOR guard (hotel_id = getCurrentHotelId())
// ---------------------------------------------------------------------------
export async function deleteDish(dishId) {
  if (!supabase) {
    const currentData = loadPersistedAdminData();
    const nextDishes  = currentData.dishes.filter(d => d.id !== dishId);
    window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
    return {
      error: savePersistedAdminData(nextDishes, currentData.tables) ? null : new Error('Delete failed'),
    };
  }

  const hotelId = await getCurrentHotelId();
  if (!hotelId) return { error: new Error('No hotel linked to this account.') };

  // 1. Direct table hard delete from public.dishes
  const { error } = await supabase
    .from('dishes')
    .delete()
    .eq('id', dishId)
    .eq('hotel_id', hotelId); // IDOR tenant guard

  if (!error) {
    window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
    return { error: null };
  }

  // 2. Fallback to delete_dish RPC if table delete was blocked
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_dish', { p_dish_id: dishId });
    if (!rpcError && rpcData?.success) {
      window.dispatchEvent(new CustomEvent('hotel-menu-data-updated'));
      return { error: null };
    }
  } catch (_) {}

  console.error('[supabaseClient] deleteDish error:', error?.message);
  return { error };
}

// ---------------------------------------------------------------------------
// normalizeGuestUrl
// Ensures guest menu URLs for local development are properly https://-prefixed
// ---------------------------------------------------------------------------
export function normalizeGuestUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let res = url.trim();
  if (res.startsWith('http://localhost:4175')) {
    res = res.replace('http://localhost:4175', 'https://localhost:4175');
  } else if (res.startsWith('http://127.0.0.1:4175')) {
    res = res.replace('http://127.0.0.1:4175', 'https://127.0.0.1:4175');
  } else if (res.startsWith('http://0.0.0.0:4175')) {
    res = res.replace('http://0.0.0.0:4175', 'https://0.0.0.0:4175');
  } else if (res.startsWith('http://') && res.includes(':4175')) {
    res = res.replace('http://', 'https://');
  }
  return res;
}

// ---------------------------------------------------------------------------
// saveTable  (insert)
// hotel_id is always sourced from the session — never from the caller.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Table management stubs (tables removed in favor of single hotel menu QR)
// ---------------------------------------------------------------------------
export async function saveTable() {
  return { data: null, error: null };
}

export async function updateTable() {
  return { data: null, error: null };
}

export async function deleteTable() {
  return { error: null };
}

// ---------------------------------------------------------------------------
// Upload helpers — prefixed with hotel_id for multi-tenant asset isolation
// Enforces allowed file types and size limits matching storage.buckets policies
// ---------------------------------------------------------------------------

export const STORAGE_LIMITS = {
  headerImage: {
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
  },
  // Dish photos: JPG / PNG only, 10 MB of photos per dish (see lib/mediaAspect.js)
  dishImage: {
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    allowedExtensions: ['jpg', 'jpeg', 'png'],
  },
  // Dish videos: MP4 only, 15 MB of video per dish
  dishVideo: {
    maxSizeBytes: 15 * 1024 * 1024, // 15 MB
    allowedExtensions: ['mp4'],
  },
  dishModel: {
    maxSizeBytes: 25 * 1024 * 1024, // 25 MB
    allowedExtensions: ['glb', 'usdz', 'gltf'],
  },
};

// Content-Type sent to Storage is derived from the (already validated)
// extension, never from the browser-supplied file.type. Bucket MIME lists
// and storage policies enforce the same mapping server-side.
const CONTENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', usdz: 'model/vnd.usdz+zip',
};
export function contentTypeForExtension(ext) {
  return CONTENT_TYPES[String(ext || '').toLowerCase()] || null;
}

export async function uploadHeaderImage(file) {
  if (!file) return { url: '', error: null };

  const extension = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
  if (!STORAGE_LIMITS.headerImage.allowedExtensions.includes(extension)) {
    return { url: '', error: new Error('Invalid image format. Allowed formats: JPG, PNG, WebP, GIF, AVIF.') };
  }
  if (file.size > STORAGE_LIMITS.headerImage.maxSizeBytes) {
    return { url: '', error: new Error('Header image exceeds maximum size of 5 MB.') };
  }

  if (!supabase) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve({ url: reader.result, error: null });
      reader.onerror = () => resolve({ url: '', error: new Error('Could not read image file.') });
      reader.readAsDataURL(file);
    });
  }

  const hotelId = (await getCurrentHotelId()) || 'common';
  const fileName  = `${hotelId}/headers/header-${Date.now()}.${extension}`;

  const { error: headerErr } = await supabase.storage
    .from('header-images')
    .upload(fileName, file, { upsert: true, contentType: contentTypeForExtension(extension) });

  if (!headerErr) {
    const { data } = supabase.storage.from('header-images').getPublicUrl(fileName);
    if (data?.publicUrl) return { url: data.publicUrl, error: null };
  } else {
    console.warn('[supabaseClient] header-images upload failed, trying dish-images:', headerErr.message);
  }

  const { error: dishErr } = await supabase.storage
    .from('dish-images')
    .upload(fileName, file, { upsert: true, contentType: contentTypeForExtension(extension) });

  if (!dishErr) {
    const { data } = supabase.storage.from('dish-images').getPublicUrl(fileName);
    if (data?.publicUrl) return { url: data.publicUrl, error: null };
  }

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ url: reader.result, error: null });
    reader.onerror = () => resolve({ url: '', error: new Error('Could not process image file.') });
    reader.readAsDataURL(file);
  });
}

export async function uploadDishImage(file, dishId) {
  if (!file) return { url: '', error: null };

  const extension = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
  if (!STORAGE_LIMITS.dishImage.allowedExtensions.includes(extension)) {
    return { url: '', error: new Error('Invalid image format. Allowed formats: JPG, PNG.') };
  }
  if (file.size > STORAGE_LIMITS.dishImage.maxSizeBytes) {
    return { url: '', error: new Error('Dish image exceeds maximum size of 10 MB.') };
  }

  if (!supabase) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve({ url: reader.result, error: null });
      reader.onerror = () => resolve({ url: '', error: new Error('Could not read image file.') });
      reader.readAsDataURL(file);
    });
  }

  const hotelId = (await getCurrentHotelId()) || 'common';
  const safeBase = (file.name || 'dish').replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'dish';
  const filePath = `${hotelId}/dishes/${dishId || Date.now()}-${safeBase}.${extension}`;
  const { error } = await supabase.storage.from('dish-images').upload(filePath, file, { upsert: true, contentType: contentTypeForExtension(extension) });
  if (error) return { url: '', error };

  const { data } = supabase.storage.from('dish-images').getPublicUrl(filePath);
  return { url: data.publicUrl, error: null };
}

export async function uploadDishMedia(files, secondArg, thirdArg) {
  if (!files?.length) return { urls: [], error: null };

  // Flexible argument handling: supports (files, folder) or (files, dishId, folder)
  let folder = 'images';
  let dishId = null;

  if (secondArg === 'videos' || secondArg === 'images') {
    folder = secondArg;
    dishId = thirdArg || null;
  } else {
    dishId = secondArg || null;
    folder = thirdArg === 'videos' ? 'videos' : 'images';
  }

  const isVideo = folder === 'videos';
  const limitConfig = isVideo ? STORAGE_LIMITS.dishVideo : STORAGE_LIMITS.dishImage;
  const typeLabel = isVideo ? 'video (MP4 only)' : 'image (JPG or PNG only)';
  const sizeLabel = isVideo ? '15 MB' : '10 MB';

  for (const file of files) {
    const ext = file.name?.split('.').pop()?.toLowerCase() || '';
    if (!limitConfig.allowedExtensions.includes(ext)) {
      return { urls: [], error: new Error(`"${file.name}" is not an allowed ${typeLabel}.`) };
    }
    if (file.size > limitConfig.maxSizeBytes) {
      return { urls: [], error: new Error(`"${file.name}" exceeds the ${sizeLabel} limit.`) };
    }
  }

  if (!supabase) {
    const urls = await Promise.all([...files].map(file =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
        reader.readAsDataURL(file);
      }),
    ));
    return { urls, error: null };
  }

  const hotelId = (await getCurrentHotelId()) || 'common';
  try {
    const urls = [];
    for (const file of files) {
      const extension = file.name?.includes('.')
        ? file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '')
        : file.type?.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      const baseName = file.name
        ?.replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'dish-media';
      const uniqueId  = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const filePath  = `${hotelId}/${folder}/${dishId || 'new-dish'}/${uniqueId}-${baseName}.${extension}`;
      // Unique file name per upload → safe to let browsers/CDN cache for a year,
      // so returning guests don't re-download the same media.
      const { error } = await supabase.storage.from('dish-images').upload(filePath, file, { upsert: true, cacheControl: '31536000', contentType: contentTypeForExtension(extension) });
      if (error) return { urls: [], error };
      urls.push(supabase.storage.from('dish-images').getPublicUrl(filePath).data.publicUrl);
    }
    return { urls, error: null };
  } catch (err) {
    return { urls: [], error: err };
  }
}

export async function uploadDishModel(file, dishId) {
  if (!file) return { url: '', error: null };

  const extension = file.name?.split('.').pop()?.toLowerCase() || '';
  if (!STORAGE_LIMITS.dishModel.allowedExtensions.includes(extension)) {
    return { url: '', error: new Error('Invalid 3D model format. Allowed formats: .glb, .usdz, .gltf.') };
  }
  if (file.size > STORAGE_LIMITS.dishModel.maxSizeBytes) {
    return { url: '', error: new Error('3D model exceeds maximum size of 25 MB.') };
  }

  if (!supabase) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload  = () => resolve({ url: reader.result, error: null });
      reader.onerror = () => resolve({ url: '', error: new Error(`Could not read ${file.name}.`) });
      reader.readAsDataURL(file);
    });
  }

  const hotelId = (await getCurrentHotelId()) || 'common';
  const uniqueId  = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const filePath  = `${hotelId}/models/${dishId || 'new-dish'}/${uniqueId}.${extension}`;
  // 3D models live in the dedicated dish-models bucket (model MIME types, 25 MB).
  const { error } = await supabase.storage
    .from('dish-models')
    .upload(filePath, file, { upsert: true, contentType: contentTypeForExtension(extension), cacheControl: '31536000' });
  if (error) return { url: '', error };

  return {
    url: supabase.storage.from('dish-models').getPublicUrl(filePath).data.publicUrl,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Analytics helpers (menu_events)
// ---------------------------------------------------------------------------
//
// Visitor model (how "unique" and "regular" visitors are bifurcated):
//   • Every guest device gets a persistent anonymous visitor id (localStorage
//     in the guest app) stored in menu_events.session_id.
//   • A "visit" (site_visit) is logged at most once per visitor per day.
//   • Unique visitors   = distinct visitor ids with a visit in the range.
//   • Returning/regular = unique visitors who visited on 2+ different days in
//                         the range, OR who had visited before the range.
//   • New visitors      = unique visitors − returning visitors.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * normalizeRange(rangeOrDays)
 * Accepts a number of days (1 → today, 7 → last 7 days incl. today),
 * 'lifetime' (all data), or { start, end } (Date or 'YYYY-MM-DD').
 * Returns { start, end, days, lifetime } with start at 00:00 and end at
 * 23:59:59.999 local time.
 */
export const LIFETIME_START = new Date('2020-01-01T00:00:00');

export function normalizeRange(rangeOrDays = 7) {
  if (rangeOrDays === 'lifetime') {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(LIFETIME_START);
    const days = Math.max(1, Math.round((end - start) / DAY_MS));
    return { start, end, days, lifetime: true };
  }
  if (typeof rangeOrDays === 'number' || !rangeOrDays) {
    const days = Math.max(1, Number(rangeOrDays) || 7);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end.getTime() - (days - 1) * DAY_MS);
    start.setHours(0, 0, 0, 0);
    return { start, end, days, lifetime: false };
  }
  const parse = (v) => (v instanceof Date ? new Date(v) : new Date(`${v}T00:00:00`));
  let start = parse(rangeOrDays.start);
  let end = parse(rangeOrDays.end || rangeOrDays.start);
  if (start > end) [start, end] = [end, start];
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  const days = Math.max(1, Math.round((end - start) / DAY_MS));
  return { start, end, days, lifetime: false };
}

function emptyVisitorStats() {
  return {
    totalVisits: 0,
    uniqueVisitors: 0,
    newVisitors: 0,
    returningVisitors: 0,
    totalArViews: 0,
    totalDishViews: 0,
    conversionRate: '0%',
    trends: { uniqueVisitors: 0, totalVisits: 0, totalArViews: 0, totalDishViews: 0, conversionRate: 0, returningVisitors: 0 }
  };
}

/**
 * Fetch summary metrics for site visits and AR views for the current hotel,
 * with trend comparisons against the prior equivalent period.
 */
export async function getVisitorCount(rangeOrDays = 7) {
  const hotelId = await getCurrentHotelId();
  if (!supabase || !hotelId) return emptyVisitorStats();

  const { start, end, lifetime } = normalizeRange(rangeOrDays);
  const spanMs = end.getTime() - start.getTime() + 1;
  // Lifetime has no "previous period" to compare against.
  const priorStart = lifetime ? start : new Date(start.getTime() - spanMs);
  // Look back further (90 days before the range) only for site visits, to
  // recognise returning visitors whose earlier visit was outside the range.
  const historyStart = new Date(Math.min(priorStart.getTime(), start.getTime() - 90 * DAY_MS));

  const [{ data: events, error }, { data: history }] = await Promise.all([
    supabase
      .from('menu_events')
      .select('event_type, session_id, created_at')
      .eq('hotel_id', hotelId)
      .gte('created_at', priorStart.toISOString())
      .lte('created_at', end.toISOString())
      .limit(100000),
    lifetime
      ? Promise.resolve({ data: [] })
      : supabase
        .from('menu_events')
        .select('session_id, created_at')
        .eq('hotel_id', hotelId)
        .eq('event_type', 'site_visit')
        .gte('created_at', historyStart.toISOString())
        .lt('created_at', start.toISOString())
        .limit(50000),
  ]);

  if (error || !events) {
    console.error('[supabaseClient] getVisitorCount error:', error?.message);
    return emptyVisitorStats();
  }

  const startMs = start.getTime();
  const currentEvents = events.filter(e => new Date(e.created_at).getTime() >= startMs);
  const priorEvents = lifetime ? [] : events.filter(e => new Date(e.created_at).getTime() < startMs);
  const seenBefore = new Set((history || []).map(e => e.session_id));

  function calcPeriodStats(evList, previouslySeen) {
    const visits = evList.filter(e => e.event_type === 'site_visit');
    const ar = evList.filter(e => e.event_type === 'ar_view');
    const dishViews = evList.filter(e => e.event_type === 'dish_view');
    // Visits per visitor. Each site_visit is a separate visit (the server
    // ignores repeats within 30 minutes), so 2+ visits = a returning guest.
    const visitsByVisitor = new Map();
    visits.forEach(e => {
      visitsByVisitor.set(e.session_id, (visitsByVisitor.get(e.session_id) || 0) + 1);
    });
    // Visitors who only produced dish/AR events still count as unique.
    [...dishViews, ...ar].forEach(e => {
      if (!visitsByVisitor.has(e.session_id)) visitsByVisitor.set(e.session_id, 1);
    });
    const uniq = visitsByVisitor.size;
    let returning = 0;
    visitsByVisitor.forEach((count, visitor) => {
      if (count >= 2 || previouslySeen.has(visitor)) returning += 1;
    });
    // AR conversion = AR (camera) views ÷ dish detail views
    const rate = dishViews.length > 0 ? Math.round((ar.length / dishViews.length) * 1000) / 10 : 0;
    return {
      totalVisits: visits.length,
      uniqueVisitors: uniq,
      returningVisitors: returning,
      newVisitors: Math.max(0, uniq - returning),
      totalArViews: ar.length,
      totalDishViews: dishViews.length,
      rateNum: rate,
    };
  }

  const cur = calcPeriodStats(currentEvents, seenBefore);
  const prev = calcPeriodStats(priorEvents, new Set());

  function calcPctChange(currVal, prevVal) {
    if (lifetime) return null;
    if (prevVal === 0) return currVal > 0 ? 100 : 0;
    return Math.round(((currVal - prevVal) / prevVal) * 100);
  }

  return {
    totalVisits: cur.totalVisits,
    uniqueVisitors: cur.uniqueVisitors,
    newVisitors: cur.newVisitors,
    returningVisitors: cur.returningVisitors,
    totalArViews: cur.totalArViews,
    totalDishViews: cur.totalDishViews,
    conversionRate: `${cur.rateNum}%`,
    trends: {
      uniqueVisitors: calcPctChange(cur.uniqueVisitors, prev.uniqueVisitors),
      totalVisits: calcPctChange(cur.totalVisits, prev.totalVisits),
      totalArViews: calcPctChange(cur.totalArViews, prev.totalArViews),
      totalDishViews: calcPctChange(cur.totalDishViews, prev.totalDishViews),
      returningVisitors: calcPctChange(cur.returningVisitors, prev.returningVisitors),
      conversionRate: lifetime ? null : Math.round((cur.rateNum - prev.rateNum) * 10) / 10
    }
  };
}

/**
 * Rank dishes by engagement for the current hotel.
 *   arViews   — times the dish's 3D model was opened live on a camera
 *   dishViews — times guests opened the dish's detail page ("view rate")
 *   score     — arViews + dishViews (highest = rank #1)
 *   arConversion — arViews ÷ dishViews (%)
 * Optional range limits which events are counted (default: lifetime).
 */
export async function getDishArRanking(rangeOrDays = null, { force = false } = {}) {
  const hotelId = await getCurrentHotelId();
  if (!supabase || !hotelId) return [];

  const range = rangeOrDays && rangeOrDays !== 'lifetime' ? normalizeRange(rangeOrDays) : null;
  const key = `arRanking:${hotelId}:${range ? `${range.start.toISOString()}_${range.end.toISOString()}` : 'all'}`;

  return cachedFetch(key, async () => {
    let eventsQuery = supabase
      .from('menu_events')
      .select('dish_id, event_type')
      .eq('hotel_id', hotelId)
      .in('event_type', ['ar_view', 'dish_view'])
      .not('dish_id', 'is', null);
    if (range) {
      eventsQuery = eventsQuery.gte('created_at', range.start.toISOString()).lte('created_at', range.end.toISOString());
    }

    const [{ data: events, error: eventsErr }, { data: dishes, error: dishesErr }] = await Promise.all([
      eventsQuery.limit(100000),
      supabase
        .from('dishes')
        .select('*')
        .eq('hotel_id', hotelId)
        .is('deleted_at', null),
    ]);

    if (eventsErr) console.error('[supabaseClient] getDishArRanking events error:', eventsErr.message);
    if (dishesErr) console.error('[supabaseClient] getDishArRanking dishes error:', dishesErr.message);

    const arMap = {};
    const viewMap = {};
    (events || []).forEach(e => {
      if (!e.dish_id) return;
      if (e.event_type === 'ar_view') arMap[e.dish_id] = (arMap[e.dish_id] || 0) + 1;
      else if (e.event_type === 'dish_view') viewMap[e.dish_id] = (viewMap[e.dish_id] || 0) + 1;
    });

    const build = (dish, id) => {
      const arViews = arMap[id] || 0;
      const dishViews = viewMap[id] || 0;
      return {
        dishId: id,
        name: dish?.name || 'Archived Dish',
        category: dish?.category || (dish ? 'General' : 'Unknown'),
        price: dish?.price ?? 0,
        thumbnail_url: dish?.thumbnail_url || '',
        veg: dish?.veg ?? false,
        hasModel: dish ? dishHasModel(dish) : false,
        arViews,
        dishViews,
        score: arViews + dishViews,
        arConversion: dishViews > 0 ? Math.round((arViews / dishViews) * 100) : (arViews > 0 ? 100 : 0),
      };
    };

    const dishesMap = {};
    (dishes || []).forEach(d => { dishesMap[d.id] = d; });
    const ranking = (dishes || []).filter(d => d.category !== '__SYSTEM__').map(d => build(d, d.id));
    new Set([...Object.keys(arMap), ...Object.keys(viewMap)]).forEach(id => {
      if (!dishesMap[id]) ranking.push(build(null, id));
    });

    ranking.sort((a, b) =>
      (b.score - a.score) ||
      (b.arViews - a.arViews) ||
      (Number(b.hasModel) - Number(a.hasModel)) ||
      String(a.name).localeCompare(String(b.name))
    );
    return ranking;
  }, { maxAgeMs: 60_000, force });
}

/**
 * Timeline of visits, dish views and AR views for charts.
 * Buckets: hourly for a single day, monthly for ranges > 92 days (incl.
 * lifetime, which starts at the first recorded event), daily otherwise.
 */
export async function getEngagementTimeline(rangeOrDays = 7) {
  const hotelId = await getCurrentHotelId();
  if (!supabase || !hotelId) return [];

  let { start, end, lifetime } = normalizeRange(rangeOrDays);

  const { data: events, error } = await supabase
    .from('menu_events')
    .select('event_type, created_at')
    .eq('hotel_id', hotelId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true })
    .limit(100000);

  if (error) {
    console.error('[supabaseClient] getEngagementTimeline error:', error.message);
    return [];
  }

  if (lifetime) {
    const first = events?.[0]?.created_at ? new Date(events[0].created_at) : new Date(end.getTime() - 29 * DAY_MS);
    start = new Date(first);
    start.setHours(0, 0, 0, 0);
  }
  const spanDays = Math.max(1, Math.round((end - start) / DAY_MS));
  const mode = spanDays <= 1 ? 'hour' : spanDays > 92 ? 'month' : 'day';

  const spansYears = start.getFullYear() !== end.getFullYear();
  const fmt = (d) => {
    if (mode === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`;
    if (mode === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    return d.toLocaleDateString(undefined, spansYears
      ? { month: 'short', day: 'numeric', year: '2-digit' }
      : { month: 'short', day: 'numeric' });
  };
  const bucketsMap = new Map();
  const add = (d) => {
    const label = fmt(d);
    if (!bucketsMap.has(label)) bucketsMap.set(label, { date: label, visits: 0, dishViews: 0, arViews: 0 });
  };
  if (mode === 'hour') {
    for (let h = 0; h < 24; h++) { const d = new Date(start); d.setHours(h); add(d); }
  } else if (mode === 'month') {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) add(d);
  } else {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) add(d);
  }

  (events || []).forEach(e => {
    const slot = bucketsMap.get(fmt(new Date(e.created_at)));
    if (!slot) return;
    if (e.event_type === 'site_visit') slot.visits += 1;
    else if (e.event_type === 'dish_view') slot.dishViews += 1;
    else if (e.event_type === 'ar_view') slot.arViews += 1;
  });

  return [...bucketsMap.values()];
}

// ── Password Recovery ────────────────────────────────────────────────────────
export async function requestPasswordReset(email) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

export async function verifyResetOtp({ email, token }) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  return supabase.auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  });
}

export async function verifyResetTokenHash(tokenHash) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  return supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  });
}

export async function exchangeResetCode(code) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  return supabase.auth.exchangeCodeForSession(code);
}

export async function updatePassword(newPassword) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  return supabase.auth.updateUser({ password: newPassword });
}

export async function resetPasswordWithOtp({ email, token, newPassword }) {
  if (!supabase) return { error: new Error('Supabase is not configured.') };
  const { data, error: otpError } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'recovery',
  });
  if (otpError) return { error: otpError };
  return supabase.auth.updateUser({ password: newPassword });
}

/**
 * Fetch guest content reports for the current hotel (cached; pass
 * { force: true } after realtime events).
 */
export async function fetchHotelReports(hotelId = null, { force = false } = {}) {
  if (!supabase) {
    return { reports: [], error: null };
  }

  try {
    const targetHotelId = hotelId || await getCurrentHotelId();
    if (!targetHotelId) return { reports: [], error: null };

    const reports = await cachedFetch(`reports:${targetHotelId}`, async () => {
      // Primary attempt: select content_reports with joined dishes data
      const { data, error } = await supabase
        .from('content_reports')
        .select(`
          *,
          dishes ( id, name, category, price, thumbnail_url, veg, is_suspended )
        `)
        .eq('hotel_id', targetHotelId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!error && data) return data;

      // Fallback: fetch raw content_reports and manually enrich with dishes
      console.warn('[supabaseClient] fetchHotelReports joined query failed, using direct fallback:', error?.message);
      const { data: rawReports, error: rawError } = await supabase
        .from('content_reports')
        .select('*')
        .eq('hotel_id', targetHotelId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (rawError) throw rawError;

      const dishIds = [...new Set((rawReports || []).map(r => r.dish_id).filter(Boolean))];
      const dishMap = {};
      if (dishIds.length > 0) {
        const { data: dishList } = await supabase
          .from('dishes')
          .select('id, name, category, price, thumbnail_url, veg, is_suspended')
          .in('id', dishIds);
        (dishList || []).forEach(d => { dishMap[d.id] = d; });
      }

      return (rawReports || []).map(r => ({
        ...r,
        dishes: r.dish_id ? (dishMap[r.dish_id] || null) : null
      }));
    }, { maxAgeMs: 20_000, force });

    return { reports, error: null };
  } catch (err) {
    console.error('[supabaseClient] fetchHotelReports error:', err);
    return { reports: [], error: err };
  }
}

/** Synchronous read of the last loaded reports for the current hotel. */
export function peekHotelReports() {
  if (!_cachedHotel?.id) return undefined;
  return peekCache(`reports:${_cachedHotel.id}`);
}

/**
 * Update report status by hotel owner ('reviewing', 'resolved', 'dismissed')
 */
export async function updateReportStatus(reportId, status) {
  if (!supabase) {
    const local = localStorage.getItem('demo_content_reports');
    if (local) {
      const parsed = JSON.parse(local).map(r => r.id === reportId ? { ...r, status } : r);
      localStorage.setItem('demo_content_reports', JSON.stringify(parsed));
    }
    return { data: { id: reportId, status }, error: null };
  }

  try {
    const { data, error } = await supabase
      .from('content_reports')
      .update({ status })
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;
    invalidateCache('reports:');
    return { data, error: null };
  } catch (err) {
    console.error('[supabaseClient] updateReportStatus error:', err);
    return { data: null, error: err };
  }
}

/**
 * Permanently delete a RESOLVED / DISMISSED report (owner housekeeping).
 * Open reports can never be deleted from the hotel side.
 *
 * Uses the delete_resolved_report() RPC (fix_debug_v3_bugs.sql), which checks
 * ownership + status itself — the plain DELETE silently matched 0 rows on
 * databases where the owner delete policy / grant was missing. Falls back to
 * the direct DELETE on databases that don't have the RPC yet.
 */
const DELETE_REPORT_MESSAGES = {
  not_found: 'This ticket no longer exists — it may already have been deleted.',
  not_owner: 'You can only delete tickets that belong to your hotel.',
  not_resolved: 'Only resolved or dismissed tickets can be deleted. Resolve it first.',
  not_authenticated: 'Your session has expired. Please sign in again.',
};

export async function deleteResolvedReport(reportId) {
  if (!supabase) return { error: null };
  const hotelId = await getCurrentHotelId();
  if (!hotelId) return { error: new Error('No hotel linked to this account.') };

  const { data: rpcResult, error: rpcError } = await supabase.rpc('delete_resolved_report', { p_report_id: reportId });
  const rpcMissing = rpcError && (rpcError.code === 'PGRST202' || rpcError.code === '42883' || /could not find the function|does not exist/i.test(rpcError.message || ''));

  if (!rpcError) {
    if (rpcResult === 'deleted') {
      invalidateCache('reports:');
      return { error: null };
    }
    if (rpcResult === 'not_found') {
      // Already gone — treat as success so the row leaves the list
      invalidateCache('reports:');
      return { error: null };
    }
    return { error: new Error(DELETE_REPORT_MESSAGES[rpcResult] || 'Report could not be deleted.') };
  }
  if (!rpcMissing) return { error: rpcError };

  // Fallback for databases without the RPC
  const { data, error } = await supabase
    .from('content_reports')
    .delete()
    .eq('id', reportId)
    .eq('hotel_id', hotelId)
    .in('status', ['resolved', 'dismissed'])
    .select('id');

  if (error) return { error };
  if (!data?.length) {
    return { error: new Error('Report could not be deleted — the database is missing the delete permission. Run supabase/functions/fix_debug_v3_bugs.sql once in the Supabase SQL editor.') };
  }
  invalidateCache('reports:');
  return { error: null };
}

// ---------------------------------------------------------------------------
// Notifications
//
//  • Platform updates (notification bell) — generated by the system from the
//    hotel's own condition: verification pending, dishes missing photos,
//    open guest reports, dishes suspended by the platform, and a pointer to
//    unread Super Admin messages.
//  • Super Admin messages — rows in platform_notifications written by the
//    super admin. These are critical and are shown ONLY in the
//    "Super Admin Compliance" panel on the Guest Reports page, never mixed
//    in with platform updates.
// ---------------------------------------------------------------------------

function readIdSet(key) {
  try {
    const stored = localStorage.getItem(key);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch (_) {
    return new Set();
  }
}

function addToIdSet(key, ids) {
  try {
    const set = readIdSet(key);
    ids.forEach(id => set.add(id));
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (_) {}
}

async function getSessionUserId() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * True for platform_notifications rows generated automatically by the
 * platform (welcome on approval, etc.) rather than written by a super admin
 * in the Notification Composer. Uses the `source` column (fix_debug_v2_bugs.sql)
 * and falls back to known system titles on older databases.
 */
const SYSTEM_NOTIFICATION_TITLES = [/^welcome to qr menu/i];
export function isSystemGeneratedNotification(n) {
  if (!n) return false;
  if (n.source) return n.source !== 'super_admin';
  return SYSTEM_NOTIFICATION_TITLES.some(re => re.test(String(n.title || '')));
}

/**
 * Super-admin messages for this hotel (newest first), with read state.
 * Only messages a super admin actually wrote — system-generated ones
 * (welcome, etc.) are returned separately as `systemMessages` and shown in
 * the notification bell instead of the Compliance panel.
 */
export async function fetchSuperAdminMessages({ force = false } = {}) {
  if (!supabase) return { messages: [], unreadCount: 0, error: null };

  try {
    const hotel = await getCurrentHotel();
    const hotelId = hotel?.id || null;
    if (!hotelId) return { messages: [], unreadCount: 0, error: null };
    const hotelStatus = hotel?.status || 'pending';
    const userId = await getSessionUserId();

    const allMessages = await cachedFetch(`adminMessages:${hotelId}`, async () => {
      const [{ data: notifs, error }, readsRes, dismissRes] = await Promise.all([
        supabase
          .from('platform_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        userId
          ? supabase.from('notification_reads').select('notification_id').eq('user_id', userId)
          : Promise.resolve({ data: [] }),
        userId
          ? supabase.from('notification_dismissals').select('notification_id').eq('user_id', userId)
          : Promise.resolve({ data: [] }),
      ]);
      if (error) throw error;

      const reads = readIdSet(`read_notifications_${hotelId}`);
      (readsRes?.data || []).forEach(r => reads.add(r.notification_id));
      const dismissed = readIdSet(`dismissed_notifications_${hotelId}`);
      (dismissRes?.data || []).forEach(d => dismissed.add(d.notification_id));

      return (notifs || [])
        .filter(n => {
          if (n.target_type === 'all') return true;
          if (n.target_type === 'status' && n.target_value === hotelStatus) return true;
          if (n.target_type === 'hotel' && n.target_value === hotelId) return true;
          return false;
        })
        .filter(n => !dismissed.has(n.id))
        .map(n => ({ ...n, is_read: reads.has(n.id) }));
    }, { maxAgeMs: 30_000, force });

    const messages = allMessages.filter(m => !isSystemGeneratedNotification(m));
    const systemMessages = allMessages.filter(m => isSystemGeneratedNotification(m));
    return { messages, systemMessages, unreadCount: messages.filter(m => !m.is_read).length, error: null };
  } catch (err) {
    console.error('[supabaseClient] fetchSuperAdminMessages error:', err);
    return { messages: [], systemMessages: [], unreadCount: 0, error: err };
  }
}

/**
 * Platform updates for the notification bell: system advisories derived
 * from the hotel's own condition. Advisories that were read are hidden for
 * good (their ids are versioned by the underlying count, so a NEW condition
 * — e.g. another report filed — surfaces again).
 */
export async function fetchPlatformNotificationsForOwner({ force = false } = {}) {
  if (!supabase) {
    return { notifications: [], unreadCount: 0, error: null };
  }

  try {
    const hotel = await getCurrentHotel();
    const hotelId = hotel?.id || null;
    const hotelStatus = hotel?.status || 'pending';
    if (!hotelId) return { notifications: [], unreadCount: 0, error: null };

    const all = await cachedFetch(`platformUpdates:${hotelId}`, async () => {
      const [missingPhotosRes, openReportsRes, suspendedRes, adminMsgs] = await Promise.all([
        supabase
          .from('dishes')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotelId)
          .is('deleted_at', null)
          .or('thumbnail_url.is.null,thumbnail_url.eq.'),
        supabase
          .from('content_reports')
          .select('id', { count: 'exact', head: true })
          .eq('hotel_id', hotelId)
          .in('status', ['open', 'reviewing']),
        supabase
          .from('dishes')
          .select('id, name, suspended_reason')
          .eq('hotel_id', hotelId)
          .eq('is_suspended', true)
          .is('deleted_at', null)
          .limit(50),
        fetchSuperAdminMessages({ force }),
      ]);

      const advisories = [];
      const now = new Date().toISOString();

      if (hotelStatus === 'pending') {
        advisories.push({
          id: `system-advisory-pending-${hotelId}`,
          title: 'Verification Pending',
          message: 'Your hotel account is pending review by platform administrators. Live guest menus remain restricted until your profile is approved.',
          type: 'warning',
          created_at: now,
          is_system: true,
          link: '/dashboard',
        });
      }

      const missingPhotos = missingPhotosRes?.count || 0;
      if (missingPhotos > 0) {
        advisories.push({
          id: `system-advisory-images-${hotelId}-${missingPhotos}`,
          title: 'Dishes Missing Photos',
          message: `${missingPhotos} dish${missingPhotos > 1 ? 'es' : ''} on your menu ${missingPhotos > 1 ? 'lack' : 'lacks'} photos. Adding imagery enhances guest engagement and AR previews.`,
          type: 'info',
          created_at: now,
          is_system: true,
          link: '/notifications/alerts?type=missing_image',
        });
      }

      const openReports = openReportsRes?.count || 0;
      if (openReports > 0) {
        advisories.push({
          id: `system-advisory-reports-${hotelId}-${openReports}`,
          title: 'Guest Content Report Filed',
          message: `You have ${openReports} open content flag${openReports > 1 ? 's' : ''} submitted by guests. Check Guest Reports to review and resolve.`,
          type: 'critical',
          created_at: now,
          is_system: true,
          link: '/reports',
        });
      }

      (suspendedRes?.data || []).forEach(d => {
        advisories.push({
          id: `system-advisory-suspended-${d.id}`,
          title: 'Dish Suspended by Platform',
          message: `"${d.name}" was suspended by the Super Admin${d.suspended_reason ? `: ${d.suspended_reason}` : ''}. Open Guest Reports to request reactivation.`,
          type: 'critical',
          created_at: now,
          is_system: true,
          link: '/reports',
        });
      });

      // System-generated platform messages (welcome on approval, …) live in
      // the bell, not in the Super Admin Compliance panel.
      (adminMsgs?.systemMessages || []).filter(m => !m.is_read).forEach(m => {
        advisories.push({
          id: `system-msg-${m.id}`,
          title: m.title,
          message: m.message,
          type: m.type || 'update',
          created_at: m.created_at || now,
          is_system: true,
          link: '/dashboard',
        });
      });

      const unreadAdmin = adminMsgs?.unreadCount || 0;
      if (unreadAdmin > 0) {
        const newestId = adminMsgs.messages.find(m => !m.is_read)?.id || 'x';
        advisories.push({
          id: `system-advisory-admin-msg-${hotelId}-${newestId}`,
          title: 'New message from Super Admin',
          message: `You have ${unreadAdmin} unread Super Admin message${unreadAdmin > 1 ? 's' : ''}. Read them under Guest Reports → Super Admin Compliance.`,
          type: 'critical',
          created_at: now,
          is_system: true,
          link: '/reports',
        });
      }

      return advisories;
    }, { maxAgeMs: 30_000, force });

    const reads = readIdSet(`read_advisories_${hotelId}`);
    const dismissed = readIdSet(`dismissed_notifications_${hotelId}`);
    // Once read, an update never comes back — only unread items are listed.
    const notifications = all.filter(n => !reads.has(n.id) && !dismissed.has(n.id)).map(n => ({ ...n, is_read: false }));

    return { notifications, unreadCount: notifications.length, error: null };
  } catch (err) {
    console.error('[supabaseClient] fetchPlatformNotificationsForOwner error:', err);
    return { notifications: [], unreadCount: 0, error: err };
  }
}

/**
 * Mark a platform update or super-admin message as read (persisted locally
 * and, for super-admin messages, in notification_reads).
 */
export async function markNotificationAsRead(notificationId) {
  return markAllNotificationsAsRead([notificationId]);
}

/**
 * Mark all given notifications as read
 */
export async function markAllNotificationsAsRead(notificationIds = []) {
  const ids = (notificationIds || []).filter(id => typeof id === 'string' && id);
  if (!ids.length) return { error: null };

  try {
    const hotel = await getCurrentHotel();
    const hotelId = hotel?.id || 'default';

    const advisoryIds = ids.filter(id => id.startsWith('system-advisory-'));
    const dbNotifIds = ids.filter(id => !id.startsWith('system-advisory-'));

    if (advisoryIds.length) addToIdSet(`read_advisories_${hotelId}`, advisoryIds);
    if (dbNotifIds.length) addToIdSet(`read_notifications_${hotelId}`, dbNotifIds);
    invalidateCache('adminMessages:');
    invalidateCache('platformUpdates:');

    if (supabase && dbNotifIds.length) {
      const userId = await getSessionUserId();
      if (userId) {
        const rows = dbNotifIds.map(id => ({
          notification_id: id,
          user_id: userId,
          hotel_id: hotel?.id || null,
          read_at: new Date().toISOString()
        }));
        // ignoreDuplicates → INSERT … ON CONFLICT DO NOTHING (no UPDATE policy needed)
        const { error } = await supabase
          .from('notification_reads')
          .upsert(rows, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
        if (error) console.warn('[supabaseClient] notification_reads upsert:', error.message);
      }
    }

    return { error: null };
  } catch (err) {
    console.error('[supabaseClient] markAllNotificationsAsRead error:', err);
    return { error: err };
  }
}

/**
 * Permanently dismiss / delete a single notification for this hotel owner
 */
export async function dismissNotification(notificationId) {
  return dismissAllNotifications([notificationId]);
}

/**
 * Permanently dismiss / delete multiple notifications at once for this hotel owner
 */
export async function dismissAllNotifications(notificationIds = []) {
  const ids = (notificationIds || []).filter(Boolean);
  if (!ids.length) return { error: null };
  try {
    const hotel = await getCurrentHotel();
    const hotelId = hotel?.id || 'default';
    addToIdSet(`dismissed_notifications_${hotelId}`, ids);
    invalidateCache('adminMessages:');
    invalidateCache('platformUpdates:');

    const userId = await getSessionUserId();
    if (supabase && userId) {
      const rows = ids.map(id => ({
        notification_id: id,
        user_id: userId,
        hotel_id: hotel?.id || null,
        dismissed_at: new Date().toISOString()
      }));
      const { error } = await supabase
        .from('notification_dismissals')
        .upsert(rows, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });
      if (error) console.warn('[supabaseClient] notification_dismissals upsert:', error.message);
    }
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Fetch the global QR Merch URL configured by Super Admin
 */
export async function fetchQrMerchUrl() {
  if (!supabase) return { url: '', error: null };
  return cachedFetch('qrMerchUrl', fetchQrMerchUrlUncached, { maxAgeMs: 10 * 60_000 });
}

async function fetchQrMerchUrlUncached() {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_platform_setting', {
      p_key: 'qr_merch_url'
    });

    if (!rpcErr && rpcData) {
      return { url: rpcData.url || '', error: null };
    }

    const { data, error } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'qr_merch_url')
      .maybeSingle();

    if (error) throw error;
    return { url: data?.value?.url || '', error: null };
  } catch (err) {
    console.warn('[supabaseClient] fetchQrMerchUrl fallback error:', err);
    return { url: '', error: err };
  }
}

export async function fetchSuperAdminEmail() {
  if (!supabase) return { email: 'rakshakasur@gmail.com', error: null };
  return cachedFetch('superAdminEmail', fetchSuperAdminEmailUncached, { maxAgeMs: 10 * 60_000 });
}

async function fetchSuperAdminEmailUncached() {
  try {
    const { data: rpcEmail, error: rpcErr } = await supabase.rpc('get_super_admin_contact_email');
    if (!rpcErr && rpcEmail) {
      return { email: rpcEmail, error: null };
    }

    const { data, error } = await supabase
      .from('platform_admins')
      .select('email')
      .not('email', 'is', null)
      .limit(1)
      .maybeSingle();

    if (!error && data?.email) {
      return { email: data.email, error: null };
    }
  } catch (err) {
    console.warn('[supabaseClient] fetchSuperAdminEmail fallback:', err);
  }
  return { email: 'rakshakasur@gmail.com', error: null };
}




