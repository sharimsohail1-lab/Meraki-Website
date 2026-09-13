/* GET /api/site-settings — the storefront's operational settings.
 *
 * The singleton row the admin app writes: contact details, the global service
 * notes, and which product is featured. Read server-side over the same Supabase
 * infrastructure as /api/products, with the same rules — explicit allowlist,
 * no credentials in the browser, no cookies.
 *
 * Everything here is business content Saima maintains in the app. None of it is
 * a secret, but the projection is still written out field by field so a column
 * added to website_settings later cannot reach the storefront by accident.
 */

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

var REQUEST_TIMEOUT_MS = 8000;

/* The app pins the row to this id and constrains the table to it. */
var SETTINGS_ID = '00000000-0000-4000-8000-000000000001';

var SETTINGS_COLUMNS = [
  'featured_product_id', 'whatsapp', 'contact_email', 'instagram_url',
  'location_label', 'made_to_order_lead_time', 'size_service_note',
  'inquiry_response_note'
];

/* Added by app migration 029. Requested optimistically and dropped on one
   retry if the database has never heard of it, exactly as fulfillment_note is
   handled in /api/products — a website deploy must not require a migration to
   have run first. */
var OPTIONAL_SETTINGS_COLUMNS = ['homepage_config'];

var THEMES = ['default', 'festive', 'bridal'];
var CTA_TYPES = ['none', 'collection', 'curated_edit', 'view_all'];
var SOURCE_TYPES = ['collection', 'products', 'new_arrivals'];
/* The homepage's movable sections. Anything outside this list is a key the
   website does not know how to render, and is dropped rather than guessed at. */
var SECTION_KEYS = ['campaign', 'featured_edit', 'new_arrivals'];
var COUNT_MIN = 3;
var COUNT_MAX = 8;

/* The website's own slug rule, imported rather than re-typed: a CTA aimed at a
   collection is resolved here, and the menu the visitor clicks is built in the
   browser. Two derivations that disagree would send people to a dead page. */
var collectionSlug = require('./products.js').collectionSlug;

function blank(v) { return v === null || v === undefined || String(v).trim() === ''; }
function text(v) { return blank(v) ? null : String(v).trim(); }

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
          throw new Error('Supabase ' + res.status + ': ' + body.slice(0, 300));
        });
      }
      return res.json();
    })
    .finally(function () { clearTimeout(timer); });
}

function settingsQuery(columns) {
  return 'website_settings?select=' + encodeURIComponent(columns.join(',')) +
    '&id=eq.' + SETTINGS_ID + '&limit=1';
}

function readSettingsRow() {
  var withOptional = SETTINGS_COLUMNS.concat(OPTIONAL_SETTINGS_COLUMNS);
  return supabaseSelect(settingsQuery(withOptional))
    .catch(function (err) {
      var message = String((err && err.message) || '');
      /* Either the column is named in the error, or Postgres says the thing
         does not exist. Depending on one wording alone is depending on a
         message we do not own. */
      var missing = OPTIONAL_SETTINGS_COLUMNS.some(function (c) { return message.indexOf(c) !== -1; })
        || message.indexOf('42703') !== -1
        || message.indexOf('42P01') !== -1
        || message.indexOf('does not exist') !== -1;
      if (!missing) throw err;
      return supabaseSelect(settingsQuery(SETTINGS_COLUMNS));
    })
    .then(function (rows) { return (rows && rows[0]) || null; });
}

/* ---------------------------------------------------------------------------
 * Homepage merchandising (app migration 029).
 * ------------------------------------------------------------------------- */
function parseJson(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (e) { return null; }
}

function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) === -1 ? fallback : value;
}

/* Outside the range is a mistake, not an instruction. Clamped rather than
   rejected so a stray 40 shows eight pieces instead of nothing. */
function clampCount(value, fallback) {
  /* Number(null) is 0, which would clamp to the minimum and silently override
     an unset field with a decision nobody made. Absence is absence. */
  if (value === null || value === undefined || value === '') return fallback;
  var n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.max(COUNT_MIN, Math.min(COUNT_MAX, Math.round(n)));
}

/* A CTA is resolved to a label and a real address here, never handed to the
   browser as a raw href the app could have written. A destination that no
   longer resolves — deleted, hidden, mistyped — yields nothing at all, because
   guessing a different page is worse than showing no button. */
function resolveCta(block, ctx) {
  if (!isObject(block)) return null;
  var type = oneOf(text(block.cta_destination_type), CTA_TYPES, 'none');
  if (type === 'none') return null;

  var label = text(block.cta_label);
  if (!label) return null;

  var ref = text(block.cta_destination_ref);
  var href = null;

  if (type === 'view_all') {
    href = '#/collection';
  } else if (type === 'collection' && ref) {
    var collection = ctx.collectionsById[ref];
    var slug = collection ? collectionSlug(collection.name) : '';
    if (collection && slug) href = '#/collection/' + slug;
  } else if (type === 'curated_edit' && ref) {
    var edit = ctx.editsById[ref];
    if (edit && !blank(edit.slug)) href = '#/edit/' + String(edit.slug).trim();
  }

  return href ? { label: label, href: href } : null;
}

function publicCampaign(raw, ctx) {
  if (!isObject(raw)) return null;

  var mediaUrl = text(raw.media_url);
  var mediaType = oneOf(text(raw.media_type), ['image', 'video'], null);
  /* One implies the other. A type with no file, or a file with no type, is not
     media the page can render. */
  if (!mediaUrl || !mediaType) { mediaUrl = null; mediaType = null; }

  var campaign = {
    heading: text(raw.heading),
    subheading: text(raw.subheading),
    media_type: mediaType,
    media_url: mediaUrl,
    /* A poster is a still for a film. It means nothing over an image. */
    media_poster_url: mediaType === 'video' ? text(raw.media_poster_url) : null,
    theme: oneOf(text(raw.theme), THEMES, 'default'),
    cta: resolveCta(raw, ctx)
  };

  /* The explicit switch outranks everything. Turned off, the campaign is not a
     campaign the storefront should show, whatever content it still holds — the
     default hero takes the hero back. Absent, this is a configuration written
     before the flag existed, and the old rule stands: content makes it live.
     Once the flag exists, presence of fields is no longer evidence either way. */
  if (raw.show === false) return null;

  /* A block carrying only its own defaults is not a campaign — it is an
     untouched form. The hero that is already there stays. */
  var says = campaign.heading || campaign.subheading || campaign.media_url || campaign.cta;
  return says ? campaign : null;
}

function publicFeaturedEdit(raw, ctx) {
  if (!isObject(raw)) return null;
  var sourceType = oneOf(text(raw.source_type), SOURCE_TYPES, 'new_arrivals');
  return {
    show: raw.show === true,
    heading: text(raw.heading),
    subtitle: text(raw.subtitle),
    source_type: sourceType,
    /* Only meaningful for a collection source, and resolved to a slug so the
       browser never sees an id it would have to look up. */
    source_collection_slug: sourceType === 'collection' && text(raw.source_ref)
      && ctx.collectionsById[text(raw.source_ref)]
      ? collectionSlug(ctx.collectionsById[text(raw.source_ref)].name) || null
      : null,
    product_ids: Array.isArray(raw.product_ids)
      ? raw.product_ids.map(text).filter(Boolean) : [],
    count: clampCount(raw.count, 4),
    cta: resolveCta(raw, ctx)
  };
}

/* The order the app wants the homepage's sections in.
 *
 * Unknown keys are dropped, repeats are ignored, and anything the app did not
 * mention is appended in the website's own order — so a configuration that
 * names one section still gets a complete, sane page rather than a page with
 * two sections missing. A configuration with no order at all yields null, and
 * the storefront keeps the order it has always had. */
function publicSectionOrder(raw) {
  if (!Array.isArray(raw)) return null;
  var seen = {};
  var order = [];
  raw.forEach(function (k) {
    var key = text(k);
    if (!key || SECTION_KEYS.indexOf(key) === -1 || seen[key]) return;
    seen[key] = true;
    order.push(key);
  });
  if (!order.length) return null;
  SECTION_KEYS.forEach(function (k) { if (!seen[k]) order.push(k); });
  return order;
}

/* The ordered campaigns the app now keeps. Each one goes through exactly the
   same public transformation as the single campaign did — same allowlist, same
   media rules, same CTA resolution, same "an untouched form is not a campaign"
   test — so a slide can never carry a field the single hero would have refused.

   Order is the app's array order. A campaign the app switched off, or one that
   says nothing, drops out here rather than reaching the browser as a slide it
   has to know to skip. */
function publicCampaigns(raw, ctx) {
  if (!Array.isArray(raw)) return null;
  var out = raw
    .map(function (c) { return publicCampaign(c, ctx); })
    .filter(Boolean);
  return out.length ? out : null;
}

/* The pieces the app chose for New Arrivals, already resolved.

   The app owns the rule — seeded from the newest eligible pieces, new ones
   added as they publish, manual additions and sticky removals on top. All the
   storefront needs is the answer, so the answer is what it gets: an ordered
   list of ids with the removals already taken out. Rebuilding that rule in
   browser JavaScript would mean two implementations of one policy, drifting.

   Absent means the app has never expressed a selection, and null is how that
   is said — the storefront then keeps the count-based behaviour it had. */
function publicNewArrivalsSelection(raw) {
  if (!isObject(raw)) return null;
  var included = Array.isArray(raw.included_ids) ? raw.included_ids : null;
  if (!included) return null;

  var excluded = {};
  (Array.isArray(raw.excluded_ids) ? raw.excluded_ids : []).forEach(function (id) {
    var v = text(id);
    if (v) excluded[v] = true;
  });

  var seen = {};
  var ids = included
    .map(text)
    .filter(function (id) {
      if (!id || excluded[id] || seen[id]) return false;
      seen[id] = true;
      return true;
    });
  return ids.length ? ids : [];
}

function publicNewArrivals(raw, selection) {
  var ids = publicNewArrivalsSelection(selection);
  if (!isObject(raw)) {
    /* A selection with no settings block is still a decision: the app has
       chosen these pieces, so the section shows them under its default name. */
    return ids ? { show: true, heading: 'New Arrivals', count: null,
      exclude_featured: false, product_ids: ids } : null;
  }
  return {
    show: raw.show !== false,
    heading: text(raw.heading) || 'New Arrivals',
    count: clampCount(raw.count, 4),
    exclude_featured: raw.exclude_featured !== false,
    /* Null rather than [] when the app has not chosen: the two mean different
       things, and only one of them should silence the section. */
    product_ids: ids
  };
}

/* The whole point of the fallback rule: an absent, unparseable or empty
   configuration means the homepage has never been merchandised, and the
   storefront must look exactly as it did before migration 029 existed. Null,
   not an object of defaults — a block that is absent stays absent, so a
   half-configured homepage changes only the half that was configured. */
function publicHomepage(rawConfig, ctx) {
  var cfg = parseJson(rawConfig);
  if (!isObject(cfg) || Object.keys(cfg).length === 0) return null;
  return {
    section_order: publicSectionOrder(cfg.section_order),
    /* The ordered set the storefront now prefers. */
    campaigns: publicCampaigns(cfg.campaigns, ctx),
    /* Kept for the transition only: a browser holding a script from before
       carousels existed still finds the hero it knows how to render. It goes
       when the app retires its own singular mirror. */
    campaign: publicCampaign(cfg.campaign, ctx),
    featured_edit: publicFeaturedEdit(cfg.featured_edit, ctx),
    new_arrivals: publicNewArrivals(cfg.new_arrivals, cfg.new_arrivals_selection)
    /* customer_looks is reserved and deliberately not surfaced. */
  };
}

/* Public curated edits and their ordered pieces. Ordering is the app's:
   sort_order first, then created_at as the tiebreak, both asked of the
   database rather than sorted here. The slug is used exactly as stored —
   operators may edit it by hand, and it survives a title rename. */
function readCuratedEdits() {
  return supabaseSelect(
    'curated_edits?select=' + encodeURIComponent('id,slug,title,subtitle,show_on_website') +
    '&show_on_website=not.is.false'
  ).then(function (edits) {
    if (!edits || !edits.length) return [];
    var ids = edits.map(function (e) { return e.id; }).join(',');
    return supabaseSelect(
      'curated_edit_products?select=' + encodeURIComponent('curated_edit_id,product_id,sort_order,created_at') +
      '&curated_edit_id=in.(' + ids + ')' +
      '&order=' + encodeURIComponent('sort_order.asc,created_at.asc')
    ).then(function (rows) {
      var byEdit = {};
      (rows || []).forEach(function (r) {
        (byEdit[r.curated_edit_id] = byEdit[r.curated_edit_id] || []).push(text(r.product_id));
      });
      return edits.map(function (e) {
        return {
          id: text(e.id),
          slug: text(e.slug),
          title: text(e.title),
          subtitle: text(e.subtitle),
          product_ids: (byEdit[e.id] || []).filter(Boolean)
        };
      }).filter(function (e) { return e.slug; });
    });
  }).catch(function (err) {
    /* Migration 029 not run here. Not an outage: no edits exist, so none are
       offered, and everything else on the page carries on. */
    var message = String((err && err.message) || '');
    var absent = message.indexOf('42P01') !== -1
      || message.indexOf('does not exist') !== -1
      || message.indexOf('schema cache') !== -1;
    if (!absent) throw err;
    return [];
  });
}

/* Collections, by id, for resolving typed CTAs and a collection source. Same
   optional-table treatment: without 028 there is nothing to resolve against
   and a CTA aimed at a collection simply renders no button. */
function readCollectionsById() {
  return supabaseSelect('collections?select=' + encodeURIComponent('id,name,show_on_website'))
    .then(function (rows) {
      var byId = {};
      (rows || []).forEach(function (c) {
        /* A hidden collection is not a destination. */
        if (c && c.show_on_website !== false && !blank(c.name)) byId[text(c.id)] = { name: text(c.name) };
      });
      return byId;
    })
    .catch(function (err) {
      var message = String((err && err.message) || '');
      var absent = message.indexOf('42P01') !== -1
        || message.indexOf('does not exist') !== -1
        || message.indexOf('schema cache') !== -1;
      if (!absent) throw err;
      return {};
    });
}

/* Every field, always present, null when unset. A storefront that has to
   distinguish "absent key" from "null value" is a storefront with two code
   paths for the same thing.

   featured_product_id is passed through as stored. The storefront resolves it
   against the published catalogue it already has, which is filtered to
   published and unarchived — so an archived or unpublished featured piece
   disappears without this endpoint needing a second query to notice. */
function publicSettings(row) {
  var s = row || {};
  return {
    featured_product_id: text(s.featured_product_id),
    whatsapp: text(s.whatsapp),
    contact_email: text(s.contact_email),
    instagram_url: text(s.instagram_url),
    location: text(s.location_label),
    made_to_order_lead_time: text(s.made_to_order_lead_time),
    size_service_note: text(s.size_service_note),
    inquiry_response_note: text(s.inquiry_response_note)
  };
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  return Promise.all([readSettingsRow(), readCollectionsById(), readCuratedEdits()])
    .then(function (results) {
      var row = results[0];
      var edits = results[2] || [];
      var editsById = {};
      edits.forEach(function (e) { editsById[e.id] = e; });
      var ctx = { collectionsById: results[1] || {}, editsById: editsById };
      var homepage = publicHomepage(row && row.homepage_config, ctx);
      /* Ids were needed to resolve CTAs; the browser addresses edits by slug. */
      var publicEdits = edits.map(function (e) {
        return { slug: e.slug, title: e.title, subtitle: e.subtitle, product_ids: e.product_ids };
      });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      /* Same policy as the catalogue: the browser revalidates, the edge absorbs
         the traffic for five minutes, and a stale copy covers a cold refresh. */
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
      /* No row yet is a legitimate state — Saima has not opened the settings
         screen. Every field null, and the storefront hides what it cannot fill. */
      res.status(200).json({
        settings: publicSettings(row),
        /* null means never merchandised: the storefront changes nothing. */
        homepage: homepage,
        curated_edits: publicEdits
      });
    })
    .catch(function (err) {
      if (console && console.error) console.error('[api/site-settings]', err && err.stack ? err.stack : err);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(500).json({ error: 'settings_unavailable' });
    });
};

module.exports.publicSettings = publicSettings;
module.exports.publicHomepage = publicHomepage;
module.exports.resolveCta = resolveCta;
module.exports.clampCount = clampCount;
module.exports.publicSectionOrder = publicSectionOrder;
