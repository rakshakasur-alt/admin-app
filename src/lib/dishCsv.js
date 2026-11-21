// ---------------------------------------------------------------------------
// Dish CSV import helpers
//
// How the import works:
//  1. parseCsv()        – RFC 4180 parser (quoted fields, "" escapes, commas
//                         and new lines inside quotes, BOM, , ; or tab).
//  2. autoMapColumns()  – every CSV header is normalised (lower-case, spaces /
//                         symbols → _) and matched against the aliases below,
//                         e.g. "Dish Name", "dish_name", "Item" → name.
//                         Unknown columns (hotel_id, hotel_name…) are ignored.
//  3. rowsToDishes()    – each row becomes one dish using that mapping, with
//                         per-row validation (name required, numeric price…).
//  4. The page saves all valid rows at once with saveDishesBulk() (batched
//                         multi-row inserts).
// ---------------------------------------------------------------------------

export const DISH_CSV_FIELDS = [
  { key: 'name', label: 'Dish name', required: true, aliases: ['name', 'dish_name', 'dish', 'title', 'item', 'item_name', 'dishname'] },
  { key: 'category', label: 'Category', aliases: ['category', 'cat', 'section', 'course', 'menu_section', 'category_name'] },
  { key: 'price', label: 'Price', required: true, aliases: ['price', 'rate', 'cost', 'mrp', 'amount', 'base_price', 'price_inr'] },
  { key: 'description', label: 'Description', aliases: ['description', 'desc', 'details', 'notes', 'about'] },
  { key: 'veg', label: 'Veg / Non-veg', aliases: ['veg', 'veg_non_veg', 'veg_nonveg', 'is_veg', 'type', 'diet', 'food_type', 'veg_or_non_veg', 'vegetarian'] },
  { key: 'allergens', label: 'Allergens', aliases: ['allergens', 'allergen', 'allergy', 'allergies'] },
  { key: 'spice_level', label: 'Spice level (1-3)', aliases: ['spice_level', 'spice', 'spiciness', 'heat', 'spicy'] },
  // One column holds every tag of the dish, e.g. "Bestseller, Chef Signature, Jain Available".
  { key: 'tags', label: 'Tags (Bestseller, Chef Signature, Jain Available)', aliases: ['tags', 'tag', 'labels', 'badges', 'dish_tags', 'highlights'] },
  // Legacy one-column-per-tag templates are still understood.
  { key: 'is_bestseller', label: 'Bestseller (legacy column)', legacy: true, aliases: ['is_bestseller', 'bestseller', 'best_seller', 'popular'] },
  { key: 'is_special', label: "Chef's special (legacy column)", legacy: true, aliases: ['is_special', 'special', 'chefs_special', 'chef_special', 'chef_s_special', 'chef_signature', 'chefs_signature'] },
  { key: 'is_jain', label: 'Jain (legacy column)', legacy: true, aliases: ['is_jain', 'jain', 'jain_friendly', 'jain_available'] },
  { key: 'portions', label: 'Portions (Half:250|Full:450)', aliases: ['portions', 'portion_variants', 'variants', 'portion', 'sizes'] },
];

export const CSV_TEMPLATE_HEADER = 'name,category,price,description,veg,allergens,spice_level,tags,portions';
export const CSV_TEMPLATE_EXAMPLE = '"Paneer Tikka",Starters,320,"Char-grilled cottage cheese",Veg,Dairy,2,"Bestseller, Chef Signature, Jain Available","Half:180|Full:320"';
export const CSV_TEMPLATE_EXAMPLE_2 = '"Butter Chicken",Mains,450,"Creamy tomato gravy",Non-Veg,Dairy,1,Bestseller,';

/** Tag keywords recognised in the single "tags" column (case/spacing-insensitive). */
export const DISH_TAGS = [
  { key: 'is_bestseller', label: 'Bestseller', patterns: [/best\s*-?\s*sell/, /popular/, /top\s*pick/, /most\s*ordered/] },
  { key: 'is_special', label: 'Chef Signature', patterns: [/chef/, /signature/, /special/, /house\s*fav/] },
  { key: 'is_jain', label: 'Jain Available', patterns: [/jain/] },
];

/** "Bestseller, Chef Signature | Jain" → { is_bestseller, is_special, is_jain } */
export function parseTags(value) {
  const out = { is_bestseller: false, is_special: false, is_jain: false };
  String(value || '')
    .toLowerCase()
    .split(/[,;|/+\n]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .forEach((token) => {
      DISH_TAGS.forEach((tag) => {
        if (tag.patterns.some(re => re.test(token))) out[tag.key] = true;
      });
    });
  return out;
}

export function normalizeHeader(h) {
  return String(h || '')
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const c of firstLine) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c in counts) counts[c] += 1;
  }
  const [best, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return bestCount > 0 ? best : ',';
}

/** RFC 4180-ish CSV parser. Returns { headers, rows } (rows = string[][]). */
export function parseCsv(input) {
  const text = String(input || '').replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter(r => r.some(cell => String(cell).trim() !== ''));
  const [headerRow = [], ...dataRows] = nonEmpty;
  return {
    headers: headerRow.map(h => String(h).trim()),
    rows: dataRows.map(r => r.map(cell => String(cell).trim())),
  };
}

/** Maps each CSV column index to a dish field key (or '' to ignore). */
export function autoMapColumns(headers) {
  const used = new Set();
  return headers.map((header) => {
    const norm = normalizeHeader(header);
    const field = DISH_CSV_FIELDS.find(f => !used.has(f.key) && f.aliases.includes(norm));
    if (field) {
      used.add(field.key);
      return field.key;
    }
    return '';
  });
}

function parseBool(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'x', '✓'].includes(v);
}

function parseVeg(value) {
  const v = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!v) return true;
  if (['nonveg', 'nv', 'nonvegetarian', 'false', '0', 'no', 'n', 'egg', 'meat', 'chicken', 'fish'].includes(v)) return false;
  return ['veg', 'v', 'vegetarian', 'true', '1', 'yes', 'y', 'jain', 'vegan'].includes(v) ? true : !v.includes('non');
}

function parseSpice(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 1;
  const n = parseInt(v, 10);
  if (!Number.isNaN(n)) return Math.min(3, Math.max(1, n));
  if (/hot|high|extra|3/.test(v)) return 3;
  if (/med/.test(v)) return 2;
  return 1;
}

function parsePrice(value) {
  const cleaned = String(value || '').replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (cleaned === '') return NaN;
  return Number(cleaned);
}

/** "Half:250|Full:450" or "Half=250; Full=450" → [{ name, price }] */
function parsePortions(value) {
  const v = String(value || '').trim();
  if (!v) return [];
  return v.split(/[|;/]/).map((part, i) => {
    const [rawName, rawPrice] = part.split(/[:=]/);
    const name = String(rawName || '').trim();
    const price = parsePrice(rawPrice);
    if (!name) return null;
    return {
      id: `variant-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      price: Number.isNaN(price) ? 0 : price,
      model_glb_url: '',
      model_usdz_url: '',
    };
  }).filter(Boolean);
}

/**
 * Converts parsed rows into dish objects using the column mapping.
 * Returns [{ rowNumber, dish, errors: string[] }].
 */
export function rowsToDishes(rows, mapping) {
  return rows.map((cells, idx) => {
    const raw = {};
    mapping.forEach((fieldKey, col) => {
      if (fieldKey) raw[fieldKey] = cells[col] ?? '';
    });

    const errors = [];
    const name = String(raw.name || '').replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
    if (name.length < 2) errors.push('Missing dish name');
    if (name.length > 100) errors.push('Name over 100 characters');

    const portions = parsePortions(raw.portions);
    let price = parsePrice(raw.price);
    if (Number.isNaN(price) && portions.length) price = Math.min(...portions.map(p => p.price));
    if (Number.isNaN(price)) errors.push('Missing / invalid price');
    else if (price < 0) errors.push('Negative price');

    const description = String(raw.description || '').trim();
    if (description.length > 1000) errors.push('Description over 1000 characters');

    const tags = parseTags(raw.tags);

    const dish = {
      name,
      category: String(raw.category || '').trim() || 'Main',
      price: Number.isNaN(price) ? 0 : price,
      description,
      veg: raw.veg === undefined ? true : parseVeg(raw.veg),
      allergens: String(raw.allergens || '').trim(),
      spice_level: parseSpice(raw.spice_level),
      // Tags column decides; legacy yes/no columns can also switch a tag on.
      is_bestseller: tags.is_bestseller || parseBool(raw.is_bestseller),
      is_special: tags.is_special || parseBool(raw.is_special),
      is_jain: tags.is_jain || parseBool(raw.is_jain),
      portion_variants: portions,
    };

    return { rowNumber: idx + 2, dish, errors };
  });
}
