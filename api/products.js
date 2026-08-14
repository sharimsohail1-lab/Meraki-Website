/* GET /api/products — the published storefront catalogue.
 *
 * Phase 3 serves fixtures from data/products.json. Phase 4 replaces exactly one
 * function, readPublishedProducts(), with a Supabase query; nothing else in this
 * file — the public projection, the cache policy, the error handling — should
 * need to change.
 *
 * Two rules this file exists to enforce:
 *
 *   1. The response is built field by field, never spread from the source row.
 *      A column added to the products table later cannot leak to the storefront
 *      by accident, whatever it is called.
 *
 *   2. Image bytes never pass through here. The payload carries URLs; the
 *      browser fetches the images straight from wherever they live.
 */

var FIXTURES = require('../data/products.json');

/* ---------------------------------------------------------------------------
 * Data source. The only part Phase 4 replaces.
 * ------------------------------------------------------------------------- */
function readPublishedProducts() {
  /* Phase 4: SELECT an explicit column list from published products, ordered by
     published_at. Never `select=*` — the allowlist below is the second line of
     defence, not the first. */
  return Promise.resolve(FIXTURES.products || []);
}

/* ---------------------------------------------------------------------------
 * Public projection — the contract, written out in full.
 * ------------------------------------------------------------------------- */
var AVAILABILITY_VALUES = ['ready_now', 'made_to_order', 'both'];

function publicImage(img) {
  if (!img || !img.src) return null;

  /* Only the width keys that actually exist. A missing rendition is omitted
     rather than pointed at the original, so the browser never picks a
     candidate that misdescribes its own width. */
  var variants = {};
  var source = img.variants || {};
  Object.keys(source).forEach(function (width) {
    var w = Number(width);
    if (w > 0 && source[width]) variants[w] = source[width];
  });

  return {
    src: img.src,
    role: img.role || null,
    sort_order: typeof img.sort_order === 'number' ? img.sort_order : 0,
    alt: img.alt || null,
    width: img.width || null,
    height: img.height || null,
    is_primary: img.is_primary === true,
    variants: variants
  };
}

function publicProduct(row) {
  if (!row || !row.id) return null;

  var details = row.garment_details || {};

  return {
    id: row.id,
    slug: row.slug || null,
    sku: row.sku || null,
    name: row.name || '',
    description: row.description || '',
    price: typeof row.price === 'number' ? row.price : null,
    currency: row.currency || 'USD',
    collection_names: Array.isArray(row.collection_names) ? row.collection_names : [],

    availability: AVAILABILITY_VALUES.indexOf(row.availability) === -1
      ? 'made_to_order' : row.availability,
    sizes: Array.isArray(row.sizes) ? row.sizes : [],

    /* Timing is whatever the app published and nothing else. The storefront
       must never infer one from availability. */
    fulfillment_note: row.fulfillment_note || null,

    garment_details: {
      fabric: details.fabric || null,
      pieces: details.pieces || null,
      color: details.color || null,
      made: details.made || null,
      care: details.care || null
    },

    images: (row.images || []).map(publicImage).filter(Boolean),
    published_at: row.published_at || null
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
       * s-maxage=300  the CDN answers for five minutes, so Postgres is queried
       *               at most once per five minutes however much traffic
       *               arrives. A publish is live within five minutes with no
       *               invalidation machinery.
       * swr=86400     for a day past that, a stale copy is served instantly
       *               while the refresh happens behind the visitor, so nobody
       *               ever waits on a cold revalidate — and a brief upstream
       *               outage is invisible to the storefront.
       */
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');

      res.status(200).json({ products: products });
    })
    .catch(function (err) {
      /* The reason goes to the server log; the visitor gets a code. */
      if (console && console.error) console.error('[api/products]', err && err.stack ? err.stack : err);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(500).json({ error: 'catalogue_unavailable' });
    });
};

/* Exported for tests; the handler above is the entry point Vercel calls. */
module.exports.publicProduct = publicProduct;
module.exports.publicImage = publicImage;
