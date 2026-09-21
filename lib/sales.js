/* Sale pricing — the one place it is decided.
 *
 * Both serverless functions that need an effective price import this module:
 * api/products.js, which publishes resolved pricing to the storefront, and
 * api/inquiries.js, which records what a customer was actually offered. The
 * browser receives finished numbers and resolves nothing.
 *
 * It lives outside api/ deliberately. Vercel turns every file in that folder
 * into a serverless function, and this repo is held at exactly three; a module
 * here is bundled into whichever function requires it and is never routed to.
 *
 * Nothing in here reaches the network by itself. readSaleData takes the
 * caller's own authenticated select function, so the Supabase credentials and
 * timeout policy stay where they already are and are not restated.
 */

/* Specificity: a sale naming this piece outranks one naming its collection,
   which outranks one covering the shop. */
var SCOPE_RANK = { products: 3, collections: 2, sitewide: 1 };

/* `name` is the operator's own label. It is selected because an inquiry has to
   be able to name the campaign that reduced a piece even after that campaign
   has been deleted — and a bare uuid cannot. It travels no further than
   resolveInternalPricing below: resolvePricing, which is what /api/products
   publishes, does not carry it. */
var SALE_COLUMNS = ['id', 'name', 'public_heading', 'public_subheading', 'enabled',
  'scope_type', 'default_discount_percent', 'priority', 'starts_on', 'ends_on'].join(',');
var SALE_COLLECTION_COLUMNS = 'sale_id,collection_id';
var SALE_PRODUCT_COLUMNS = 'sale_id,product_id,pricing_mode,discount_percent,sale_price';

/* ---------------------------------------------------------------------------
 * When a sale is live
 * ------------------------------------------------------------------------- */

/* The shop keeps New York hours, so a sale starts and ends on the calendar day
   Saima means, not the server's. en-CA is YYYY-MM-DD, which is what the dates
   come back as and which compares correctly as a plain string. */
function todayInNewYork(now) {
  return (now || new Date()).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function isDateString(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/* Both bounds inclusive: a sale ending the 30th runs through all of the 30th.
   The sentinels are real Postgres infinite dates and arrive as those words, so
   they are answered by name rather than by how they happen to sort.

   A bound that is neither a sentinel nor a date fails closed — the sale does
   not run. Showing a discount nobody authorised is the worse of the two
   mistakes, so an unreadable date withholds the offer rather than granting it. */
function isSaleActive(sale, today) {
  if (!sale || sale.enabled !== true) return false;
  var starts = sale.starts_on, ends = sale.ends_on;
  if (starts !== '-infinity' && !(isDateString(starts) && starts <= today)) return false;
  if (ends !== 'infinity' && !(isDateString(ends) && ends >= today)) return false;
  return true;
}

/* Derived, never stored. The storefront only ever cares about 'active'; the
   rest exist so a caller asking "why is this not showing" gets an answer. */
function saleStatus(sale, today) {
  if (!sale || sale.enabled !== true) return 'draft';
  var starts = sale.starts_on, ends = sale.ends_on;
  if (ends !== 'infinity' && isDateString(ends) && ends < today) return 'ended';
  if (starts !== '-infinity' && isDateString(starts) && starts > today) return 'scheduled';
  return isSaleActive(sale, today) ? 'active' : 'draft';
}

/* ---------------------------------------------------------------------------
 * The money
 * ------------------------------------------------------------------------- */

function whole(v) {
  return (typeof v === 'number' && isFinite(v)) ? Math.trunc(v) : 0;
}

/* Floor, always, in both directions. The pair is deliberately lossy: $497 at
   20% is $397, and $497 down to $399 reads as 19%, not 20%. Neither number can
   be recovered from the other, which is why both are published and why nothing
   downstream may re-derive one from the other.

   The percent is computed with the multiplication first. ((r - s) / r) * 100
   is the same arithmetic but rounds twice, and a quotient that should land
   exactly on an integer can come back a hair under it and floor to one less. */
function priceFromPercent(regular, percent) {
  return Math.floor(regular * (100 - percent) / 100);
}

function percentFromPrice(regular, salePrice) {
  return Math.floor((regular - salePrice) * 100 / regular);
}

/* What one campaign offers for one piece, or null for no offer at all.

   `row` is the piece's sale_products row, which may be absent: for a sitewide
   or collection campaign that means "follow the campaign default", and for a
   products campaign the caller has already established there is a row, because
   there the row is the membership. */
function offerFrom(sale, row, regular) {
  if (!(regular > 0)) return null;

  var mode = row ? String(row.pricing_mode || '') : 'default';
  if (mode === 'exclude') return null;

  var percent, salePrice;
  if (mode === 'percent') {
    percent = whole(row.discount_percent);
    salePrice = priceFromPercent(regular, percent);
  } else if (mode === 'sale_price') {
    salePrice = whole(row.sale_price);
    percent = percentFromPrice(regular, salePrice);
  } else {
    /* 'default', and anything unrecognised. An unknown mode is a data error,
       and the campaign's own default is the safest reading of it — it is still
       a number the operator chose, rather than one invented here. */
    percent = whole(sale.default_discount_percent);
    salePrice = priceFromPercent(regular, percent);
  }

  /* A campaign whose default is 0 offers nothing. That is deliberate, not a
     missing case: it may still discount pieces carrying explicit overrides. */
  if (!(percent > 0 && percent < 100)) return null;
  if (!(salePrice >= 1 && salePrice < regular)) return null;

  return {
    saleId: String(sale.id),
    rank: SCOPE_RANK[String(sale.scope_type)] || 0,
    priority: whole(sale.priority),
    percent: percent,
    salePrice: salePrice,
    heading: typeof sale.public_heading === 'string' ? sale.public_heading : '',
    subheading: typeof sale.public_subheading === 'string' ? sale.public_subheading : '',
    /* Internal. Read only by resolveInternalPricing. */
    internalName: typeof sale.name === 'string' ? sale.name : ''
  };
}

/* Exactly one offer wins; discounts never stack. Two 20% campaigns on one piece
   is 20% off, not 36%.

   The fourth test is not a business rule — it is what stops a piece changing
   price between two identical requests when every business rule has tied and
   the answer would otherwise depend on row order. */
function beats(a, b) {
  if (!b) return true;
  if (a.rank !== b.rank) return a.rank > b.rank;
  if (a.priority !== b.priority) return a.priority > b.priority;
  if (a.salePrice !== b.salePrice) return a.salePrice < b.salePrice;
  return a.saleId < b.saleId;
}

/* ---------------------------------------------------------------------------
 * Resolution
 * ------------------------------------------------------------------------- */

function notOnSale(regular) {
  return {
    regularPrice: (typeof regular === 'number' && isFinite(regular)) ? regular : null,
    salePrice: null,
    discountPercent: 0,
    isOnSale: false,
    saleId: null,
    salePublicHeading: '',
    salePublicSubheading: ''
  };
}

/* The context every product in one response is resolved against, built once
   from the rows read below. Passing it in keeps this function pure and makes
   the whole table of cases testable without a database. */
function saleContext(data, now) {
  var today = todayInNewYork(now);
  if (!data || !data.sales) return { today: today, sales: [] };

  var active = (data.sales || []).filter(function (s) { return isSaleActive(s, today); });

  var collectionsBySale = {};
  (data.saleCollections || []).forEach(function (r) {
    if (!r || !r.sale_id) return;
    (collectionsBySale[String(r.sale_id)] = collectionsBySale[String(r.sale_id)] || {})
      [String(r.collection_id)] = true;
  });

  var overrides = {};
  (data.saleProducts || []).forEach(function (r) {
    if (!r || !r.sale_id || !r.product_id) return;
    overrides[String(r.sale_id) + '|' + String(r.product_id).toLowerCase()] = r;
  });

  return { today: today, sales: active, collectionsBySale: collectionsBySale, overrides: overrides };
}

/* Whether a campaign covers this piece at all.

   Scope is checked before any override is read, because an override row alone
   never means the piece participates. The app deliberately keeps a row when a
   piece leaves a scoped collection, so the operator's decision is not lost —
   those dormant rows must price nothing until the piece is back in scope.

   Collection scope is answered from product_collections, the relational truth,
   and never from the denormalised names. Visibility is not consulted: whether a
   collection appears in the navigation is a merchandising decision, and whether
   a piece is discounted is a pricing one. A piece that is publicly eligible in
   its own right keeps its sale price even if the collection that put it on sale
   is hidden. */
function inScope(sale, ctx, productId, collectionIds) {
  var scope = String(sale.scope_type);
  if (scope === 'sitewide') return true;
  if (scope === 'products') {
    return !!ctx.overrides[String(sale.id) + '|' + productId];
  }
  if (scope === 'collections') {
    var wanted = ctx.collectionsBySale[String(sale.id)];
    if (!wanted) return false;
    for (var i = 0; i < (collectionIds || []).length; i++) {
      if (wanted[String(collectionIds[i])]) return true;
    }
  }
  return false;
}

/* The resolved price for one piece. `collectionIds` is every collection it
   belongs to relationally, visible or not; an empty list simply means no
   collection campaign can reach it. */
/* The one campaign that wins for this piece, or null. Both shapes below are
   built from it, so the public answer and the recorded one can never disagree
   about which campaign applied or at what rate. */
function winningOffer(product, ctx) {
  var regular = (product && typeof product.price === 'number') ? product.price : null;
  if (!ctx || !ctx.sales.length || !(regular > 0)) return null;

  var productId = String(product.id || '').toLowerCase();
  if (!productId) return null;
  var collectionIds = product.saleCollectionIds || [];

  var best = null;
  for (var i = 0; i < ctx.sales.length; i++) {
    var sale = ctx.sales[i];
    if (!inScope(sale, ctx, productId, collectionIds)) continue;
    var offer = offerFrom(sale, ctx.overrides[String(sale.id) + '|' + productId], regular);
    if (offer && beats(offer, best)) best = offer;
  }
  return best;
}

/* The public answer. This is what /api/products publishes and what the browser
   reads, so the campaign's internal name is deliberately not among its keys —
   there is no field here for it to travel in. */
function resolvePricing(product, ctx) {
  var regular = (product && typeof product.price === 'number') ? product.price : null;
  var best = winningOffer(product, ctx);
  if (!best) return notOnSale(regular);

  return {
    regularPrice: regular,
    salePrice: best.salePrice,
    discountPercent: best.percent,
    isOnSale: true,
    saleId: best.saleId,
    salePublicHeading: best.heading,
    salePublicSubheading: best.subheading
  };
}

/* The same answer, plus the operator's own label for the campaign.
 *
 * SERVER ONLY. api/inquiries.js is the sole caller: it writes the name into the
 * inquiry record so a campaign can still be named after it has been deleted.
 * Nothing this returns may be handed to a browser — the public projection in
 * api/products.js calls resolvePricing above, which has no field for it. */
function resolveInternalPricing(product, ctx) {
  var out = resolvePricing(product, ctx);
  var best = winningOffer(product, ctx);
  out.saleInternalName = best ? best.internalName : '';
  return out;
}

/* ---------------------------------------------------------------------------
 * Reading the tables
 * ------------------------------------------------------------------------- */

/* Migration 034 may not have run. A database without these tables is not an
   outage: every piece simply resolves as not on sale and the storefront is
   exactly what it was before any of this existed. The same wording the rest of
   the repo watches for, because it is PostgREST's, not ours. */
function isAbsent(err) {
  var message = String((err && err.message) || '');
  return message.indexOf('42P01') !== -1
    || message.indexOf('42703') !== -1
    || message.indexOf('does not exist') !== -1
    || message.indexOf('schema cache') !== -1;
}

/* `select` is the caller's authenticated GET: a path in, parsed rows out.

   Only enabled campaigns are asked for — a draft prices nothing, and the date
   window is settled in code where the infinite sentinels can be read properly.
   Overrides are narrowed to the pieces in hand so a shop-wide campaign with an
   override on every piece still costs one bounded query.

   Any of the three missing is treated as all three missing. A half-applied
   migration is not a state to price against, and the honest answer to it is the
   one the storefront had yesterday. */
function readSaleData(select, productIds) {
  var ids = (productIds || []).map(function (id) { return '"' + id + '"'; }).join(',');
  if (!ids) return Promise.resolve(null);

  return Promise.all([
    select('sales?select=' + encodeURIComponent(SALE_COLUMNS) + '&enabled=is.true'),
    select('sale_collections?select=' + encodeURIComponent(SALE_COLLECTION_COLUMNS)),
    select('sale_products?select=' + encodeURIComponent(SALE_PRODUCT_COLUMNS)
      + '&product_id=in.(' + encodeURIComponent(ids) + ')')
  ]).then(function (r) {
    return { sales: r[0] || [], saleCollections: r[1] || [], saleProducts: r[2] || [] };
  }).catch(function (err) {
    if (!isAbsent(err)) throw err;
    if (console && console.warn) {
      console.warn('[lib/sales] sale tables not present; nothing is on sale');
    }
    return null;
  });
}

module.exports = {
  SCOPE_RANK: SCOPE_RANK,
  todayInNewYork: todayInNewYork,
  isSaleActive: isSaleActive,
  saleStatus: saleStatus,
  priceFromPercent: priceFromPercent,
  percentFromPrice: percentFromPrice,
  offerFrom: offerFrom,
  beats: beats,
  notOnSale: notOnSale,
  saleContext: saleContext,
  inScope: inScope,
  winningOffer: winningOffer,
  resolvePricing: resolvePricing,
  resolveInternalPricing: resolveInternalPricing,
  readSaleData: readSaleData,
  isAbsent: isAbsent
};
