/* GET /api/products — the published storefront catalogue.
 *
 * Reads the Meraki admin app's Supabase database server-side. The browser never
 * talks to Supabase: it calls this endpoint and nothing else, so the database
 * credentials stay on the server and the public shape is decided in one place.
 *
 * Three rules this file exists to enforce:
 *
 *   1. Only products the app has published. `website_status = 'published'`
 *      is the app's own definition; draft and hidden never leave the database.
 *
 *   2. The response is built field by field, never spread from a row. The
 *      SELECT lists its columns explicitly and the projection below names every
 *      public field, so a column added to `products` later cannot reach the
 *      storefront by either route.
 *
 *   3. Image bytes never pass through here. The payload carries public Storage
 *      URLs; the browser fetches them directly.
 *
 * Field mapping follows the admin app's own buildPublicProductPayload() so the
 * storefront sees exactly what the app's publish preview shows.
 */

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

var REQUEST_TIMEOUT_MS = 8000;

/* Canonical size ordering, mirroring MERAKI_SIZES in the admin app. An ordering,
   not a whitelist: a product still carrying legacy keys keeps them, appended
   after the canonical ones, rather than silently losing sizes. */
var SIZE_ORDER = ['38', '40', '42', '44', '46', '48', '50', '52', 'Free Size'];

/* Named so a new column cannot join the query by accident. website_status and
   is_archived are read for the visibility check below and are never projected. */
var PRODUCT_COLUMNS = [
  'id', 'sku', 'name', 'description_en', 'price',
  'collection_name', 'collection_names',
  'fabric', 'pieces', 'color', 'made', 'care',
  'slug', 'website_status', 'website_availability', 'website_published_at',
  'size_inventory', 'is_archived'
];

/* Columns the app is still adding. Selecting a column Postgres does not have
   yet is a hard 400, so these are requested optimistically and dropped on the
   one retry if the database says it has never heard of them. When the migration
   lands the field starts flowing with no change here. */
var OPTIONAL_PRODUCT_COLUMNS = ['fulfillment_note', 'garment_details'];

/* The garment specification, in the order it reads on the page, with the words
   the customer actually sees. The key is the app's; the label is ours.
   `color` carries a British label over an American key on purpose — the key is
   the contract and renaming it would break the app, but nobody shopping a
   Pakistani womenswear label should be shown "Color". */
var SPEC_ROWS = [
  ['fabric',   'Fabric'],
  ['pieces',   'Pieces'],
  ['color',    'Colour'],
  ['made',     'Made'],
  ['care',     'Care'],
  ['occasion', 'Recommended Occasion'],
  ['style',    'Style / Silhouette']
];

/* The five that existed before the app had a canonical descriptor object, and
   the only five a legacy row can speak to. Occasion and style have never had a
   scalar column, so a product that predates the migration simply has nothing to
   say about them — inferring either from the old fields would be inventing
   merchandising copy. */
var LEGACY_SPEC_KEYS = ['fabric', 'pieces', 'color', 'made', 'care'];

/* storage_key is deliberately absent: the storefront has no use for it and it
   cannot leak a field it never fetched. An image with no public_url is dropped
   rather than rendered as a broken URL. */
var IMAGE_COLUMNS = [
  'id', 'product_id', 'public_url', 'image_role', 'sort_order',
  'is_primary', 'show_on_website', 'alt_text', 'width', 'height', 'variants',
  /* Read only to break ties in sort_order, never projected. */
  'created_at'
].join(',');

/* Photographs customers sent in, kept apart from the studio work. The app will
   not let one be a product's hero, and the storefront never mixes them into the
   gallery — they are evidence of a piece being worn, not another view of it. */
var CUSTOMER_ROLE = 'customer_photo';

/* Collection membership, normalised app-side in migration 028. Two switches
   decide whether a membership is public: the collection's own, and this
   product's within it — a piece can sit in three collections internally and be
   shown in only one. `collections!inner` because a membership pointing at a
   collection that no longer exists is not a membership. */
var COLLECTION_COLUMNS = 'product_id,show_on_website,collections!inner(name,show_on_website)';

/* ---------------------------------------------------------------------------
 * Supabase REST. No SDK — one authenticated GET is all this needs, and the repo
 * stays dependency-free and buildless.
 * ------------------------------------------------------------------------- */
function supabaseSelect(path) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Promise.reject(new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set'));
  }

  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

  return fetch(SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path, {
    method: 'GET',
    signal: controller.signal,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
      Accept: 'application/json'
    }
  })
    .then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          /* Kept server-side; the visitor gets a code, never this. */
          throw new Error('Supabase ' + res.status + ': ' + body.slice(0, 300));
        });
      }
      return res.json();
    })
    .finally(function () { clearTimeout(timer); });
}

/* ---------------------------------------------------------------------------
 * Data source. Two queries, whatever the catalogue size — never one per product.
 * ------------------------------------------------------------------------- */
/* A product reaches the storefront only if the app published it AND it is not
   archived. Archiving is how Saima retires a piece; a stale 'published' left on
   an archived row must not put it back in the collection. Enforced in the query
   so the rows never travel, and again in code below so neither guard alone is
   load-bearing.

   not.is.true rather than is.false: the column is nullable, and a NULL means
   "never archived", which must stay visible. */
function isStorefrontVisible(row) {
  return !!row && row.website_status === 'published' && row.is_archived !== true;
}

function productQuery(columns) {
  return 'products'
    + '?select=' + encodeURIComponent(columns.join(','))
    + '&website_status=eq.published'
    + '&is_archived=not.is.true'
    + '&order=created_at.desc';
}

function readProductRows() {
  var withOptional = PRODUCT_COLUMNS.concat(OPTIONAL_PRODUCT_COLUMNS);
  return supabaseSelect(productQuery(withOptional)).catch(function (err) {
    var message = String((err && err.message) || '');
    /* Either the column is named in the error, or Postgres says the thing does
       not exist. Depending on the column name alone is depending on a message
       we do not own, and the cost of getting it wrong is now the whole
       catalogue rather than one missing line: an environment where the garment
       migration has not run must still serve every product it has. */
    var missing = OPTIONAL_PRODUCT_COLUMNS.some(function (c) { return message.indexOf(c) !== -1; })
      || message.indexOf('42703') !== -1
      || message.indexOf('42P01') !== -1
      || message.indexOf('does not exist') !== -1
      /* PostgREST's usual wording for a column it cannot see yet is "Could not
         find the 'x' column of 'products' in the schema cache" — the phrasing
         a stale environment is most likely to produce. */
      || message.indexOf('schema cache') !== -1;
    if (!missing) throw err;
    /* The app has not shipped the column yet. Fall back once, quietly. */
    return supabaseSelect(productQuery(PRODUCT_COLUMNS));
  });
}

function readPublishedProducts() {
  return readProductRows().then(function (rows) {
    var products = (rows || []).filter(isStorefrontVisible);
    if (!products.length) return [];

    /* One batched follow-up for every product's images, filtered and ordered by
       the database. Grouping happens in memory below. */
    var ids = products.map(function (p) { return p.id; }).join(',');
    var imagePath = 'product_images'
      + '?select=' + encodeURIComponent(IMAGE_COLUMNS)
      + '&product_id=in.(' + ids + ')'
      + '&show_on_website=is.true'
      /* created_at settles a tie so the order is the same on every request
         rather than whatever the database happened to return. */
      + '&order=' + encodeURIComponent('sort_order.asc,created_at.asc');

    /* Both follow-ups go out together: neither depends on the other, so the
       endpoint still costs one round trip's worth of waiting. */
    return Promise.all([
      supabaseSelect(imagePath),
      readCollectionMemberships(ids)
    ]).then(function (results) {
      var images = results[0] || [];
      var memberships = results[1];

      var imagesByProduct = {};
      images.forEach(function (img) {
        (imagesByProduct[img.product_id] = imagesByProduct[img.product_id] || []).push(img);
      });

      /* null means the tables are not there to read — every product then falls
         back to its legacy array, which is what the site did before this. */
      var membershipsByProduct = null;
      if (memberships) {
        membershipsByProduct = {};
        memberships.forEach(function (m) {
          (membershipsByProduct[m.product_id] = membershipsByProduct[m.product_id] || []).push(m);
        });
      }

      return products.map(function (p) {
        p.images = imagesByProduct[p.id] || [];
        p.collection_memberships = membershipsByProduct
          ? (membershipsByProduct[p.id] || [])
          : null;
        return p;
      });
    });
  });
}

/* Every membership row for these products, visible or not — the filtering is
   done in code so that "this product has no normalised rows at all" stays
   distinguishable from "all of its rows are hidden". The first is a legacy
   product that must keep working; the second is a deliberate choice by Saima.

   A database that has not run migration 028 has neither table. That is not an
   outage and must not blank the storefront, so a missing relation resolves to
   null and every product falls back to its legacy array. Any other failure —
   a real outage, a bad key — is rethrown and the endpoint fails honestly. */
function readCollectionMemberships(ids) {
  var path = 'product_collections'
    + '?select=' + encodeURIComponent(COLLECTION_COLUMNS)
    + '&product_id=in.(' + ids + ')';

  return supabaseSelect(path).catch(function (err) {
    var message = String((err && err.message) || '');
    var absent = message.indexOf('42P01') !== -1
      || message.indexOf('does not exist') !== -1
      || message.indexOf('schema cache') !== -1;
    if (!absent) throw err;
    if (console && console.warn) {
      console.warn('[api/products] product_collections not present; using legacy collection_names');
    }
    return null;
  });
}

/* ---------------------------------------------------------------------------
 * Public projection — the contract, written out in full.
 * ------------------------------------------------------------------------- */
var AVAILABILITY_VALUES = ['ready_now', 'made_to_order', 'both'];

function parseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return null; }
}

function blank(v) { return v === null || v === undefined || String(v).trim() === ''; }

/* Size LABELS for sizes that actually have stock. The quantities themselves are
   internal and never cross this boundary — the storefront is told which sizes
   exist, never how many. Mirrors getAvailableSizeLabels() in the admin app. */
function availableSizeLabels(sizeInventory) {
  var inv = parseJson(sizeInventory);
  if (!inv || typeof inv !== 'object' || Array.isArray(inv)) return [];

  var canonical = SIZE_ORDER.filter(function (s) { return s in inv; });
  var extras = Object.keys(inv).filter(function (s) { return SIZE_ORDER.indexOf(s) === -1; });

  return canonical.concat(extras).filter(function (s) {
    return Math.max(0, parseInt(inv[s], 10) || 0) > 0;
  });
}

/* The JSONB array plus the legacy single-name column, deduped. Mirrors
   getProductCollections() in the admin app. No join: membership is stored on
   the product row, so there is no second query and no N+1. */
function collectionNames(row) {
  var names = [];
  var parsed = parseJson(row.collection_names);
  if (Array.isArray(parsed)) names = parsed.filter(Boolean);
  if (row.collection_name && names.indexOf(row.collection_name) === -1) {
    names = [row.collection_name].concat(names);
  }
  return names;
}

/* The collections this product may be shown in publicly — the only collection
   information that crosses this boundary.
 *
 * Two switches must both allow it: the collection is live, and this product's
 * membership in it is live. Either one off and the name simply is not here, so
 * the storefront cannot navigate to it, list it, or count it. Hidden
 * memberships are not sent and then filtered in the browser; they never leave
 * the server.
 *
 * Absence is read as permission throughout, matching how the app backfilled
 * migration 028 and how is_archived already behaves here: only an explicit
 * false hides anything. A product with no normalised rows at all is a legacy
 * product the app has not touched yet, and falls back to its array — the point
 * being that nobody's collection disappears because a join row was never
 * written. */
function publicCollectionNames(row) {
  var rows = row.collection_memberships;
  if (!Array.isArray(rows) || !rows.length) return collectionNames(row);

  var names = [];
  rows.forEach(function (m) {
    if (!m || m.show_on_website === false) return;
    var collection = m.collections;
    if (!collection || collection.show_on_website === false) return;
    var name = String(collection.name == null ? '' : collection.name).trim();
    if (!name || names.indexOf(name) !== -1) return;
    names.push(name);
  });
  return names;
}

/* A collection's address. Collections have no slug column, so the website
   derives one from the name — and the same derivation has to run here, because
   a CTA aimed at a collection is resolved server-side. Kept beside the rest of
   the collection handling and exported so /api/site-settings uses this one
   rather than a second copy that could drift from it. The browser's copy in
   script.js is held to byte-identical output by test. */
function collectionSlug(name) {
  var s = String(name == null ? '' : name).trim().toLowerCase();
  if (s.normalize) s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/['\u2018\u2019\u02bc]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
}

/* Public rendition URLs by width. The stored value is
   { "560": { public_url, storage_key }, … } — only the URL is public, and a
   width whose entry has no URL is omitted rather than faked. */
function variantUrls(raw) {
  var stored = parseJson(raw);
  var out = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;
  Object.keys(stored).forEach(function (width) {
    var w = Number(width);
    var entry = stored[width];
    var url = entry && typeof entry === 'object' ? entry.public_url : entry;
    if (w > 0 && !blank(url)) out[w] = url;
  });
  return out;
}

function publicImage(img, fallbackAlt) {
  /* No public URL means nothing renderable. */
  if (!img || blank(img.public_url)) return null;

  var variants = variantUrls(img.variants);

  var out = {
    src: img.public_url,
    role: img.image_role || 'gallery',
    sort_order: typeof img.sort_order === 'number' ? img.sort_order : 0,
    alt: img.alt_text || fallbackAlt || null,
    width: img.width == null ? null : img.width,
    height: img.height == null ? null : img.height,
    /* The stored hero flag exactly as it is. When the internal hero is hidden
       from the website every returned image is false, which is correct — it
       means no visible image was chosen, and the storefront then leads with the
       first by sort_order. A hero is never manufactured here. */
    is_primary: img.is_primary === true
  };

  /* Absent rather than empty for an image uploaded before renditions existed;
     the storefront falls back to src either way. */
  if (Object.keys(variants).length) out.variants = variants;

  return out;
}

/* ---------------------------------------------------------------------------
 * Garment specification.
 *
 * The app owns what is public. A descriptor it marked hidden, or left blank,
 * never reaches the browser at all — not as an empty row, not as a `show:false`
 * flag for the storefront to honour. What arrives is already the list to print,
 * in the order to print it, under the words to print it under.
 * ------------------------------------------------------------------------- */

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/* The printable values of one descriptor, or [] if it has none to give.
   Case-insensitive dedupe keeps the first spelling: the app's own casing is the
   reviewed one, and "Ivory"/"ivory" on the same garment is a data slip, not two
   colours. */
function specValues(descriptor) {
  if (!isPlainObject(descriptor)) return [];
  /* Absent means visible. Only an explicit false hides a descriptor, so a row
     the app has not expressed an opinion about still reaches the page. */
  if (descriptor.show === false) return [];
  if (!Array.isArray(descriptor.values)) return [];

  var seen = {};
  return descriptor.values
    .map(function (v) { return v == null ? '' : String(v).trim(); })
    .filter(function (v) {
      if (!v) return false;
      var k = v.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
}

/* True when the stored object is something we can actually read descriptors
   out of. An absent, null, empty or wrongly-shaped value is not a garment with
   nothing to say — it is a row the migration has not reached, and the scalar
   mirrors are still the better source for it. */
function hasCanonicalSpecs(details) {
  if (!isPlainObject(details)) return false;
  return SPEC_ROWS.some(function (r) { return isPlainObject(details[r[0]]); });
}

/* The five scalar mirrors the app still writes for the transition. Deliberately
   not split on ", ": the mirror joins multiple values that way, but "Lahore, by
   hand" is one value containing the same separator, and splitting it would turn
   one true statement into two false ones. A legacy row prints as it is stored. */
function legacySpecs(row) {
  return LEGACY_SPEC_KEYS.map(function (key) {
    var label = SPEC_ROWS.filter(function (r) { return r[0] === key; })[0][1];
    var value = row[key] == null ? '' : String(row[key]).trim();
    return value ? { key: key, label: label, values: [value] } : null;
  }).filter(Boolean);
}

function publicGarmentSpecs(row) {
  var details = row.garment_details;
  if (!hasCanonicalSpecs(details)) return legacySpecs(row);

  return SPEC_ROWS.map(function (r) {
    var values = specValues(details[r[0]]);
    return values.length ? { key: r[0], label: r[1], values: values } : null;
  }).filter(Boolean);
}

function publicProduct(row) {
  if (!row || !row.id) return null;

  var name = row.name || '';

  return {
    id: row.id,
    slug: blank(row.slug) ? null : String(row.slug).trim(),
    sku: row.sku || null,
    name: name,
    description: row.description_en || '',
    price: typeof row.price === 'number' ? row.price : null,
    currency: 'USD',
    collection_names: publicCollectionNames(row),

    availability: AVAILABILITY_VALUES.indexOf(row.website_availability) === -1
      ? null : row.website_availability,
    sizes: availableSizeLabels(row.size_inventory),

    /* Whatever the app published about this piece's timing, and nothing else.
       Absent means the storefront hides its delivery line — never a fabricated
       sentence, never the global lead time, and never anything inferred from
       availability. */
    fulfillment_note: blank(row.fulfillment_note) ? null : String(row.fulfillment_note).trim(),

    /* The garment specification the page prints, already filtered, ordered and
       labelled. See publicGarmentSpecs above. */
    garment_specs: publicGarmentSpecs(row),

    /* The shape the storefront read before garment_specs existed, from the
       scalar mirrors the app still writes. Kept only so a browser holding a
       cached script during a deploy is not left with a blank specification;
       nothing new should be built on it, and it goes when the app retires the
       mirrors. */
    garment_details: {
      fabric: row.fabric || null,
      pieces: row.pieces || null,
      color: row.color || null,
      made: row.made || null,
      care: row.care || null
    },

    /* Gallery order is sort_order, exactly as stored. Hero is a separate
       concept the storefront resolves itself.

       Customer photographs are deliberately absent from this array. Kept in it
       they would be eligible to become the hero, to appear as a thumbnail, and
       to turn up mid-way through the studio lightbox — three different ways for
       a snapshot to be mistaken for the shot Saima commissioned. */
    images: (row.images || [])
      .filter(function (img) { return img && img.image_role !== CUSTOMER_ROLE; })
      .map(function (img) { return publicImage(img, name); })
      .filter(Boolean),

    /* The same shape as `images`, so every existing image helper works on them
       unchanged. Already filtered to show_on_website by the query, and already
       in sort_order — the parent product's own publication rules got them this
       far. */
    customer_photos: (row.images || [])
      .filter(function (img) { return img && img.image_role === CUSTOMER_ROLE; })
      .map(function (img) { return publicImage(img, name); })
      .filter(Boolean),

    published_at: row.website_published_at || null
  };
}

/* ---------------------------------------------------------------------------
 * Handler
 * ------------------------------------------------------------------------- */
module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  return readPublishedProducts()
    .then(function (rows) {
      var products = (rows || []).map(publicProduct).filter(Boolean);

      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      /* max-age=0     the browser revalidates every time, so a customer never
       *               sits on a stale catalogue after a publish.
       * s-maxage=300  the CDN answers for five minutes, so Supabase is queried
       *               at most once per five minutes however much traffic
       *               arrives. A publish is live within five minutes with no
       *               invalidation machinery.
       * swr=86400     for a day past that, a stale copy is served instantly
       *               while the refresh happens behind the visitor, so nobody
       *               ever waits on a cold revalidate — and a brief database
       *               outage is invisible to the storefront.
       */
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');

      /* An empty catalogue is a valid answer, not a failure. */
      res.status(200).json({ products: products });
    })
    .catch(function (err) {
      /* The reason goes to the server log; the visitor gets a code. Never the
         Supabase message, the URL or the key. */
      if (console && console.error) console.error('[api/products]', err && err.stack ? err.stack : err);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(500).json({ error: 'catalogue_unavailable' });
    });
};

/* Exported for tests; the handler above is the entry point Vercel calls. */
module.exports.publicProduct = publicProduct;
module.exports.isStorefrontVisible = isStorefrontVisible;
module.exports.publicImage = publicImage;
module.exports.availableSizeLabels = availableSizeLabels;
module.exports.collectionNames = collectionNames;
module.exports.collectionSlug = collectionSlug;
module.exports.publicCollectionNames = publicCollectionNames;
module.exports.variantUrls = variantUrls;
