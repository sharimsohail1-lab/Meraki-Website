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

/* Named so a new column cannot join the query by accident. */
var PRODUCT_COLUMNS = [
  'id', 'sku', 'name', 'description_en', 'price',
  'collection_name', 'collection_names',
  'fabric', 'pieces', 'color', 'made', 'care',
  'slug', 'website_status', 'website_availability', 'website_published_at',
  'size_inventory'
].join(',');

/* storage_key is deliberately absent: the storefront has no use for it and it
   cannot leak a field it never fetched. An image with no public_url is dropped
   rather than rendered as a broken URL. */
var IMAGE_COLUMNS = [
  'id', 'product_id', 'public_url', 'image_role', 'sort_order',
  'is_primary', 'show_on_website', 'alt_text', 'width', 'height', 'variants'
].join(',');

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
function readPublishedProducts() {
  var productPath = 'products'
    + '?select=' + encodeURIComponent(PRODUCT_COLUMNS)
    + '&website_status=eq.published'
    + '&order=created_at.desc';

  return supabaseSelect(productPath).then(function (products) {
    if (!products.length) return [];

    /* One batched follow-up for every product's images, filtered and ordered by
       the database. Grouping happens in memory below. */
    var ids = products.map(function (p) { return p.id; }).join(',');
    var imagePath = 'product_images'
      + '?select=' + encodeURIComponent(IMAGE_COLUMNS)
      + '&product_id=in.(' + ids + ')'
      + '&show_on_website=is.true'
      + '&order=sort_order.asc';

    return supabaseSelect(imagePath).then(function (images) {
      var byProduct = {};
      images.forEach(function (img) {
        (byProduct[img.product_id] = byProduct[img.product_id] || []).push(img);
      });
      return products.map(function (p) {
        p.images = byProduct[p.id] || [];
        return p;
      });
    });
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
    collection_names: collectionNames(row),

    availability: AVAILABILITY_VALUES.indexOf(row.website_availability) === -1
      ? null : row.website_availability,
    sizes: availableSizeLabels(row.size_inventory),

    /* The app has no fulfilment-note column today, so there is nothing to
       publish and the storefront hides its delivery line. Timing is never
       inferred from availability. When the app adds the field, map it here. */
    fulfillment_note: null,

    garment_details: {
      fabric: row.fabric || null,
      pieces: row.pieces || null,
      color: row.color || null,
      made: row.made || null,
      care: row.care || null
    },

    /* Gallery order is sort_order, exactly as stored. Hero is a separate
       concept the storefront resolves itself. */
    images: (row.images || [])
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
module.exports.publicImage = publicImage;
module.exports.availableSizeLabels = availableSizeLabels;
module.exports.collectionNames = collectionNames;
module.exports.variantUrls = variantUrls;
