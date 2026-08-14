/* Meraki by Saima — site behaviour.

   Product data enters through exactly one door: mapProduct(). Everything below
   the mapping layer renders the normalised shape and neither knows nor cares
   whether a product came from the fixtures in this file, from the published
   API, or from a test. When the API lands, only the source changes. */

/* ============================================================================
   FIXTURES

   Temporary stand-ins shaped exactly like the app's published product payload,
   so the mapping is proven against the approved design before any network call
   exists. Ids are placeholder UUIDs and deliberately are NOT the slugs: the
   route uses `slug`, while the inquiry bag and every future database
   relationship use `id`. The app's published names and slugs become
   authoritative once the live integration lands.
   ========================================================================== */

var RAW_PRODUCTS = [
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10001',
    slug: 'noor', sku: 'MBS-NOOR-01', name: 'NOOR',
    description: 'A chartreuse silk-cotton kurta with hand-appliquéd blooms and cutwork scallops at the cuff and hem.',
    price: 325, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'made_to_order',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Silk-cotton, hand embroidered', pieces: 'Kurta, straight trouser',
      color: 'Chartreuse / rose', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p1.webp', role: 'model', sort_order: 0, alt: null,
               width: 1400, height: 2508, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10002',
    slug: 'sahar', sku: 'MBS-SAHAR-01', name: 'SAHAR',
    description: 'An ivory crepe front-open jacket, bordered in resham-embroidered bird and vine work.',
    price: 480, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'ready_now',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Crepe, resham thread work', pieces: 'Jacket, inner slip, trouser',
      color: 'Ivory / crimson', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p2.webp', role: 'model', sort_order: 0, alt: null,
               width: 938, height: 1677, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10003',
    slug: 'sabeen', sku: 'MBS-SABEEN-01', name: 'SABEEN',
    description: 'A fuchsia cape-sleeve top with scalloped pearl trim, cut wide and worn with a fluid palazzo.',
    price: 295, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'ready_now',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Silk twill, pearl detailing', pieces: 'Cape top, palazzo',
      color: 'Fuchsia', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p3.webp', role: 'model', sort_order: 0, alt: null,
               width: 938, height: 1677, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10004',
    slug: 'gulnaar', sku: 'MBS-GULNAAR-01', name: 'GULNAAR',
    description: 'A hand-painted floral silk in peach and coral, finished with a lace-edged organza dupatta.',
    price: 340, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'made_to_order',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Printed silk, organza', pieces: 'Kurta, trouser, dupatta',
      color: 'Peach / coral', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p4.webp', role: 'model', sort_order: 0, alt: null,
               width: 1400, height: 2508, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10005',
    slug: 'mehr', sku: 'MBS-MEHR-01', name: 'MEHR',
    description: 'Rose pink silk with gota and zardozi borders, worn with a saffron chiffon dupatta.',
    price: 520, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'ready_now',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Silk, zardozi and gota work', pieces: 'Kurta, trouser, dupatta',
      color: 'Rose / saffron', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p5.webp', role: 'model', sort_order: 0, alt: null,
               width: 1400, height: 2508, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10006',
    slug: 'ayla', sku: 'MBS-AYLA-01', name: 'AYLA',
    description: 'A magenta silk shirt with scattered pearl motifs and an ombré chiffon dupatta.',
    price: 310, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'ready_now',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Silk, pearl hand work', pieces: 'Shirt, trouser, ombré dupatta',
      color: 'Magenta / blush', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p6.webp', role: 'model', sort_order: 0, alt: null,
               width: 1400, height: 2508, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10007',
    slug: 'roselle', sku: 'MBS-ROSELLE-01', name: 'ROSELLE',
    description: 'Deep indigo raw silk with a single embroidered bird-and-blossom panel travelling the front hem.',
    price: 395, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'made_to_order',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Raw silk, thread embroidery', pieces: 'Kurta, trouser',
      color: 'Indigo / multi', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p7.webp', role: 'model', sort_order: 0, alt: null,
               width: 937, height: 1678, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  },
  {
    id: '0f7a1c94-3d21-4a6e-9b30-71c5e8a10008',
    slug: 'zarin', sku: 'MBS-ZARIN-01', name: 'ZARIN',
    description: 'Emerald silk-cotton with scalloped floral embroidery and a two-tone chiffon dupatta.',
    price: 360, currency: 'USD',
    collection_names: ['The Roselle Collection'],
    availability: 'ready_now',
    sizes: ['38', '40', '42', '44', '46', 'Other / Custom'],
    garment_details: {
      fabric: 'Silk-cotton, thread embroidery', pieces: 'Kurta, trouser, dupatta',
      color: 'Emerald / pink', made: 'Lahore, by hand',
      care: 'Dry clean only. Store folded in muslin.'
    },
    images: [{ src: 'img/p8.webp', role: 'model', sort_order: 0, alt: null,
               width: 941, height: 1672, is_primary: true }],
    published_at: '2026-08-01T00:00:00.000Z'
  }
];

/* IMG-SRCSET:START — generated by tools/optimize-images.py, do not edit by hand */
var IMG_SRCSET = {
  'img/p1.webp': 'img/sm/p1.webp 560w, img/md/p1.webp 960w, img/p1.webp 1400w',
  'img/p2.webp': 'img/sm/p2.webp 560w, img/p2.webp 938w',
  'img/p3.webp': 'img/sm/p3.webp 560w, img/p3.webp 938w',
  'img/p4.webp': 'img/sm/p4.webp 560w, img/md/p4.webp 960w, img/p4.webp 1400w',
  'img/p5.webp': 'img/sm/p5.webp 560w, img/md/p5.webp 960w, img/p5.webp 1400w',
  'img/p6.webp': 'img/sm/p6.webp 560w, img/md/p6.webp 960w, img/p6.webp 1400w',
  'img/p7.webp': 'img/sm/p7.webp 560w, img/p7.webp 937w',
  'img/p8.webp': 'img/sm/p8.webp 560w, img/p8.webp 941w'
};
/* IMG-SRCSET:END */

/* ============================================================================
   MAPPING LAYER — the only place that understands the published contract
   ========================================================================== */

/* How each availability value presents to a customer. The website says what it
   knows — that a piece is ready or made to order — and never a quantity: the
   contract carries no stock counts and the site must not imply any. Which
   sizes exist is the only stock-shaped fact on the page, and it comes from
   `sizes`. */
var AVAILABILITY = {
  ready_now: {
    label: 'Ready now',
    dot: '#7A8B5A',
    delivery: 'In stock. Ships within 48 hours.'
  },
  made_to_order: {
    label: 'Made to order · 4–6 weeks',
    dot: '#A6802E',
    delivery: 'Estimated delivery 4–6 weeks from confirmation.'
  },
  both: {
    label: 'Ready now · also made to order',
    dot: '#7A8B5A',
    delivery: 'In stock in some sizes. Other sizes are made to order in 4–6 weeks.'
  }
};

var GARMENT_ROWS = [
  ['fabric', 'Fabric'],
  ['pieces', 'Pieces'],
  ['color',  'Colour'],   /* contract key is `color`; customers read "Colour" */
  ['made',   'Made'],
  ['care',   'Care']
];

/* A size list is offered so the visitor can still start a conversation about a
   piece whose sizes the app has not published. */
var CUSTOM_SIZE = 'Other / Custom';

function blank(v) { return v === null || v === undefined || String(v).trim() === ''; }

function formatPrice(value, currency) {
  if (blank(value)) return '';
  if (typeof value !== 'number') return String(value);   /* already formatted */
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency || 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: value % 1 ? 2 : 0
    }).format(value);
  } catch (e) {
    return '$' + value;
  }
}

/* "img/sm/p1.webp 560w, img/p1.webp 1400w" from { 560: …, 1400: … }.

   Falls back to the generated IMG_SRCSET for the local fixture photography, so
   the renditions this repo already ships keep being used without duplicating
   the generator's output into the fixtures. A remote image carrying its own
   `variants` needs neither. An image with neither simply renders from `src`. */
function srcsetFrom(variants, src) {
  if (variants) {
    var widths = Object.keys(variants)
      .map(Number)
      .filter(function (w) { return w > 0 && !blank(variants[w]); })
      .sort(function (a, b) { return a - b; });
    if (widths.length) {
      return widths.map(function (w) { return variants[w] + ' ' + w + 'w'; }).join(', ');
    }
  }
  return IMG_SRCSET[src] || '';
}

/* Ordered by sort_order, with the primary photograph first. Every renderer
   treats images[0] as the hero, so hero selection is decided once, here. */
function mapImages(list, fallbackAlt) {
  var imgs = (list || [])
    .map(function (raw, i) {
      var img = (typeof raw === 'string') ? { src: raw } : (raw || {});
      return {
        src: img.src,
        alt: blank(img.alt) ? fallbackAlt : img.alt,
        role: img.role || null,
        width: img.width || null,
        height: img.height || null,
        isPrimary: img.is_primary === true,
        order: typeof img.sort_order === 'number' ? img.sort_order : i,
        srcset: srcsetFrom(img.variants, img.src)
      };
    })
    .filter(function (img) { return !blank(img.src); });

  imgs.sort(function (a, b) { return a.order - b.order; });

  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i].isPrimary) { imgs.unshift(imgs.splice(i, 1)[0]); break; }
  }
  return imgs;
}

/* [label, value] pairs worth showing. A blank value is dropped rather than
   rendered as a labelled row with nothing beside it. */
function mapGarmentDetails(details) {
  var g = details || {};
  return GARMENT_ROWS
    .map(function (row) { return [row[1], g[row[0]]]; })
    .filter(function (row) { return !blank(row[1]); });
}

/* The single door product data comes through. Everything downstream renders
   this shape and never touches the raw payload. */
function mapProduct(raw) {
  if (!raw || blank(raw.id)) return null;
  var avail = AVAILABILITY[raw.availability] || AVAILABILITY.made_to_order;
  var sizes = (raw.sizes || []).filter(function (s) { return !blank(s); });

  return {
    id: raw.id,
    slug: blank(raw.slug) ? raw.id : raw.slug,
    sku: raw.sku || null,
    name: raw.name || '',
    description: raw.description || '',
    price: formatPrice(raw.price, raw.currency),
    priceValue: raw.price,
    collections: raw.collection_names || [],
    availability: raw.availability || 'made_to_order',
    availabilityLabel: avail.label,
    dot: avail.dot,
    delivery: avail.delivery,
    sizes: sizes.length ? sizes : [CUSTOM_SIZE],
    details: mapGarmentDetails(raw.garment_details),
    images: mapImages(raw.images, raw.name || ''),
    publishedAt: raw.published_at || null
  };
}

function mapProducts(list) {
  return (list || []).map(mapProduct).filter(Boolean);
}

/* The normalised catalogue every renderer reads. Replaced wholesale when the
   API lands — nothing below this line changes. */
var PRODUCTS = mapProducts(RAW_PRODUCTS);

var state = { filter:'all', slug:null, size:null, shot:0, bag:[], sent:false };

/* Is the catalogue usable yet? 'loading' | 'ready' | 'error'.

   The fixtures above are available the moment this file parses, so we start at
   'ready' and nothing about today's rendering is delayed. When products later
   come from a fetch, drive it through setCatalogueState() instead — the views
   already read this flag and will do the right thing. */
var catalogue = { status: 'ready', error: null };

/* Deliberately holds no product data of its own: the catalogue lives in
   PRODUCTS and response caching belongs to the CDN, not to the page. */
function setCatalogueState(status, error) {
  catalogue.status = status;
  catalogue.error = error || null;
  renderGrids();
  renderBag();
  route();   /* re-resolve wherever the visitor already is, without a refresh */
}

var $ = function (s) { return document.querySelector(s); };
var byId = function (id) { return document.getElementById(id); };

/* Identity is the id — a UUID once live. Never used in a URL. */
function findProduct(id) {
  return PRODUCTS.filter(function (p) { return p.id === id; })[0] || null;
}

/* Routing is the slug — human, shareable, stable across renames. Both return
   null when unknown, including while the catalogue is still empty; callers
   must handle that rather than assume a product came back. */
function findProductBySlug(slug) {
  return PRODUCTS.filter(function (p) { return p.slug === slug; })[0] || null;
}

/* Bags saved before ids and slugs were separated stored the slug under `id`.
   Resolving by id first and slug second keeps those inquiries intact without
   rewriting anything in storage. */
function findBagProduct(id) {
  return findProduct(id) || findProductBySlug(id);
}

/* Escape anything that ends up inside an HTML string below, so an apostrophe or
   an ampersand in a product name can never break the markup. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* One image helper for every photograph on the site, local or remote. It takes
   a normalised image and emits srcset only when renditions actually exist, so
   a lone remote original still renders correctly from its src. */
function imgHTML(image, sizes, attrs) {
  if (!image || blank(image.src)) return '';
  return '<img src="' + esc(image.src) + '" alt="' + esc(image.alt) + '"' +
    (image.srcset ? ' srcset="' + esc(image.srcset) + '" sizes="' + esc(sizes) + '"' : '') +
    ' ' + (attrs || '') + '>';
}

/* ---------- cards ---------- */
var CARD_SIZES = '(max-width:640px) 92vw, (max-width:1100px) 44vw, 300px';

function cardHTML(p, small) {
  return '<a class="card" href="#/product/' + esc(p.slug) + '">' +
    '<div class="shot">' + imgHTML(p.images[0], CARD_SIZES, 'loading="lazy" decoding="async"') + '</div>' +
    '<div class="meta"><p class="name">' + esc(p.name) + '</p><p class="price">' + esc(p.price) + '</p>' +
    (small ? '' : '<p class="status"><span class="dot" style="background:' + esc(p.dot) + '"></span>' + esc(p.availabilityLabel) + '</p>') +
    '</div></a>';
}

/* 'both' belongs in both lists, so the filters test what a piece can be rather
   than sorting it into one bucket. */
function matchesFilter(p, filter) {
  if (filter === 'all') return true;
  if (filter === 'ready') return p.availability === 'ready_now' || p.availability === 'both';
  return p.availability === 'made_to_order' || p.availability === 'both';
}

function renderGrids() {
  byId('featured-grid').innerHTML = PRODUCTS.slice(0, 4).map(function (p) { return cardHTML(p); }).join('');
  var shown = PRODUCTS.filter(function (p) { return matchesFilter(p, state.filter); });
  byId('collection-grid').innerHTML = shown.map(function (p) { return cardHTML(p); }).join('');
  byId('collection-count').textContent =
    catalogue.status === 'loading' ? 'Loading the collection…'
    : catalogue.status === 'error' ? 'We couldn’t load the collection. Please try again.'
    : shown.length + ' pieces · sizes 38–46 and custom';
  Array.prototype.forEach.call(byId('filters').children, function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter));
  });
}

/* ---------- product ---------- */
function renderProduct() {
  var p = findProductBySlug(state.slug);

  /* The product may be unknown because the catalogue has not arrived yet, or
     because it genuinely is not there. Those read very differently to a
     visitor, so say which — and never fall through into the render below with
     nothing to render. */
  var stateEl = byId('pdp-state');
  var pdp = $('#view-product .pdp');
  var also = $('#view-product .also');
  if (!p) {
    stateEl.textContent =
      catalogue.status === 'ready' ? 'We couldn’t find that piece.'
      : catalogue.status === 'error' ? 'We couldn’t load this piece. Please try again.'
      : 'Loading…';
    stateEl.classList.remove('hidden');
    pdp.classList.add('hidden');
    also.classList.add('hidden');
    return;
  }
  stateEl.classList.add('hidden');
  pdp.classList.remove('hidden');
  also.classList.remove('hidden');

  var others = PRODUCTS.filter(function (x) { return x.id !== p.id; });
  var shots = p.images;
  if (state.shot >= shots.length) state.shot = 0;

  var hero = byId('pdp-hero');
  var shot = shots[state.shot];
  hero.src = shot.src;
  hero.alt = shot.alt;
  if (shot.srcset) { hero.srcset = shot.srcset; hero.sizes = '(max-width:900px) 100vw, 46vw'; }
  else { hero.removeAttribute('srcset'); hero.removeAttribute('sizes'); }

  /* One photograph needs no thumbnail strip. Hiding the container rather than
     just emptying it also removes the gallery's 14px flex gap, which an empty
     strip would otherwise leave under the main image. */
  var thumbs = byId('pdp-thumbs');
  thumbs.classList.toggle('hidden', shots.length < 2);
  thumbs.innerHTML = shots.length < 2 ? '' : shots.map(function (s, i) {
    return '<button data-shot="' + i + '" aria-pressed="' + (state.shot === i) + '" aria-label="View ' + (i + 1) + '">' +
      imgHTML(s, '(max-width:900px) 24vw, 130px',
        'loading="lazy" decoding="async" style="object-position:' + (i === 0 ? '50% 15%' : '50% 30%') + '"') +
      '</button>';
  }).join('');

  byId('pdp-name').textContent = p.name;
  byId('pdp-price').textContent = p.price;
  byId('pdp-status').textContent = p.availabilityLabel;
  byId('pdp-dot').style.background = p.dot;
  byId('pdp-desc').textContent = p.description;
  byId('pdp-delivery').textContent = p.delivery;

  byId('pdp-sizes').innerHTML = p.sizes.map(function (s) {
    return '<button data-size="' + esc(s) + '" aria-pressed="' + (state.size === s) + '">' + esc(s) + '</button>';
  }).join('');

  /* Hiding the block when nothing survives also removes its top rule, which
     would otherwise sit under the delivery note as an unexplained hairline. */
  var specsEl = byId('pdp-specs');
  specsEl.classList.toggle('hidden', p.details.length === 0);
  specsEl.innerHTML = p.details.map(function (r) {
    return '<div><p class="k">' + esc(r[0]) + '</p><p class="v">' + esc(r[1]) + '</p></div>';
  }).join('');

  var inBag = state.bag.some(function (b) { return b.id === p.id; });
  var add = byId('pdp-add');
  add.dataset.state = inBag ? 'added' : (state.size ? 'ready' : 'idle');
  add.textContent = inBag ? 'In your inquiry ✓' : (state.size ? 'Add to inquiry' : 'Select a size');
  add.disabled = inBag;

  byId('pdp-related').innerHTML = others.slice(0, 4).map(function (x) { return cardHTML(x, true); }).join('');
}

/* ---------- inquiry ---------- */
var BAG_KEY = 'meraki.inquiry.v1';

function saveBag() {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(state.bag)); } catch (e) { /* private mode */ }
}

/* Only the product id and the chosen size are persisted — never a copy of the
   product. Everything a row displays is read from the catalogue at render
   time, so a saved inquiry can never show a stale name, price or photograph.

   Loading deliberately does NOT check ids against PRODUCTS. It used to, which
   meant that if the catalogue were ever momentarily empty — precisely what
   happens while an async fetch is in flight — every entry looked unknown, the
   bag was emptied, and the next save wrote that empty bag over the customer's
   inquiry. Persistence and validation are separate concerns: an entry is kept
   until the visitor removes it. */
function loadBag() {
  try {
    var raw = localStorage.getItem(BAG_KEY);
    var saved = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(saved)) return;
    state.bag = saved
      .filter(function (b) { return b && b.id; })
      .map(function (b) { return { id: b.id, size: b.size }; });
  } catch (e) { state.bag = []; }
}

/* A saved entry whose product is not in the catalogue is still shown and still
   removable — it is never dropped on the visitor's behalf. Which message it
   carries depends on whether the catalogue has finished loading. */
function bagRowHTML(b, i) {
  var p = findBagProduct(b.id);
  var name = p ? p.name : (catalogue.status === 'ready' ? 'No longer available' : 'Loading…');
  var line = (p ? esc(p.price) + ' · ' : '') + 'Size ' + esc(b.size);
  return '<div class="bagrow"><div class="thumb">' +
    (p ? imgHTML(p.images[0], '92px', 'loading="lazy" decoding="async"') : '') + '</div>' +
    '<div class="info"><p class="name">' + esc(name) + '</p>' +
    '<p class="price">' + line + '</p>' +
    '<p class="status" style="margin-top:2px">' + esc(p ? p.availabilityLabel : '') + '</p></div>' +
    '<button class="remove" data-remove="' + i + '" aria-label="Remove ' + esc(name) + ' from your inquiry">Remove</button></div>';
}

function renderBag() {
  byId('bag-count').textContent = String(state.bag.length);
  var n = state.bag.length;
  byId('bag-label').textContent = n === 0 ? 'Nothing selected yet'
    : n + (n === 1 ? ' look selected' : ' looks selected');

  byId('bag-list').innerHTML = n === 0
    ? '<div class="empty"><p class="body">You haven\'t selected any looks yet.</p>' +
      '<button class="pill pill-ghost" style="padding:14px 28px" data-nav="#/collection">Browse the collection</button></div>'
    : state.bag.map(function (b, i) { return bagRowHTML(b, i); }).join('');

  var submit = byId('inq-submit');
  submit.dataset.ready = String(n > 0);
  submit.disabled = n === 0;
}

/* Everything the atelier needs to answer an inquiry. Kept in one place so that
   whatever we point it at later — Supabase, WhatsApp, email — reads the same
   shape. The id identifies the piece; the slug is included only so a human
   reading the record can find the page. See the README. */
function inquiryPayload(form) {
  return {
    submittedAt: new Date().toISOString(),
    name: form.name.value.trim(),
    phone: form.phone.value.trim(),
    email: form.email.value.trim(),
    note: form.note.value.trim(),
    items: state.bag.map(function (b) {
      var p = findBagProduct(b.id);
      return {
        id: p ? p.id : b.id,
        slug: p ? p.slug : null,
        sku: p ? p.sku : null,
        name: p ? p.name : null,
        size: b.size,
        price: p ? p.price : null
      };
    })
  };
}

/* ---------- routing ---------- */
var VIEWS = ['home', 'collection', 'product', 'inquiry'];

function show(view) {
  VIEWS.forEach(function (v) { byId('view-' + v).classList.toggle('hidden', v !== view); });
}

function route() {
  var hash = location.hash.replace(/^#\/?/, '');

  /* Leaving the inquiry page retires the thank-you screen, so the next visit
     starts a fresh inquiry rather than showing the old confirmation forever. */
  if (hash !== 'inquiry') state.sent = false;

  if (hash.indexOf('product/') === 0) {
    state.slug = decodeURIComponent(hash.slice(8));
    state.size = null; state.shot = 0;
    renderProduct(); show('product'); window.scrollTo(0, 0); return;
  }
  if (hash === 'collection' || hash === 'ready' || hash === 'made-to-order') {
    state.filter = hash === 'ready' ? 'ready' : (hash === 'made-to-order' ? 'mto' : 'all');
    renderGrids(); show('collection'); window.scrollTo(0, 0); return;
  }
  if (hash === 'inquiry') {
    byId('inq-form-wrap').classList.toggle('hidden', state.sent);
    byId('inq-thanks').classList.toggle('hidden', !state.sent);
    renderBag(); show('inquiry'); window.scrollTo(0, 0); return;
  }

  show('home');
  if (hash === 'story') {
    var el = byId('story');
    if (el) window.scrollTo({ top: el.offsetTop - 90, behavior: 'smooth' });
  } else {
    window.scrollTo(0, 0);
  }
}

/* ---------- events (delegated) ---------- */
document.addEventListener('click', function (e) {
  if (!e.target || !e.target.closest) return;

  var nav = e.target.closest('[data-nav]');
  if (nav) { location.hash = nav.dataset.nav; return; }

  var shot = e.target.closest('[data-shot]');
  if (shot) { state.shot = Number(shot.dataset.shot); renderProduct(); return; }

  var size = e.target.closest('[data-size]');
  if (size) { state.size = size.dataset.size; renderProduct(); return; }

  var filt = e.target.closest('[data-filter]');
  if (filt) { state.filter = filt.dataset.filter; renderGrids(); return; }

  var rm = e.target.closest('[data-remove]');
  if (rm) { state.bag.splice(Number(rm.dataset.remove), 1); saveBag(); renderBag(); return; }

  if (e.target.closest('#pdp-add')) {
    var p = findProductBySlug(state.slug);
    if (!p || !state.size || state.bag.some(function (b) { return b.id === p.id; })) return;
    state.bag.push({ id: p.id, size: state.size });   /* identity is the id, never the slug */
    saveBag(); renderProduct(); renderBag();
  }
});

byId('inquiry-form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (!state.bag.length) return;

  var payload = inquiryPayload(e.target);

  /* Nothing is sent anywhere yet. This is the single seam to wire up later —
     the thank-you screen below is already the success state. */
  if (window.console && console.info) console.info('Inquiry (not yet sent anywhere):', payload);

  state.sent = true;
  state.bag = [];
  saveBag();
  e.target.reset();
  renderBag();
  route();
});

window.addEventListener('hashchange', route);
loadBag();
renderGrids();
renderBag();
route();
