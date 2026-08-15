/* POST /api/inquiries — the one thing the storefront writes.
 *
 * The browser sends who the customer is and which product ids they picked.
 * Everything else on the record — name, sku, slug, price — is re-read here from
 * the canonical product rows, because a payload that arrives over the public
 * internet is a request, not a source of truth. A page left open for a week, a
 * replayed request, or someone editing the JSON by hand must not be able to
 * write a price into the database.
 *
 * Supabase credentials stay on this side. The browser has no key, no direct
 * PostgREST access, and the tables deny anon outright (see sql/README.md).
 */

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

var REQUEST_TIMEOUT_MS = 10000;

/* Every limit a hostile payload could push against, in one place. */
var LIMITS = {
  body: 16 * 1024,        /* bytes of JSON we will even parse */
  name: 120,
  state: 2,
  preferredSize: 16,
  phoneRaw: 40,           /* before normalising: room for "+1 (201) 555-1234" */
  email: 254,             /* RFC maximum */
  note: 2000,
  items: 25,
  size: 40
};

/* Best-effort, per-instance. Serverless gives every cold start its own memory,
   so this is a speed bump against a single client hammering one warm instance —
   not a real rate limiter. Documented as such rather than dressed up. */
var RATE_WINDOW_MS = 60 * 1000;
var RATE_MAX = 8;
var hits = new Map();

function rateLimited(key) {
  var now = Date.now();
  var seen = (hits.get(key) || []).filter(function (t) { return now - t < RATE_WINDOW_MS; });
  seen.push(now);
  hits.set(key, seen);
  if (hits.size > 5000) hits.clear();   /* bounded: never a memory leak */
  return seen.length > RATE_MAX;
}

function blank(v) { return v === null || v === undefined || String(v).trim() === ''; }

var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v.trim()); }

/* ------------------------------------------------------------------ phone */

/* US only for now. The customer may type whatever shape feels natural —
   (201) 555-1234, 201.555.1234, +1 201 555 1234 — and it is reduced here to one
   canonical form. Letters are rejected outright rather than stripped, because
   "555-CAKE" and "201-555-1234 ext 9" are not numbers this can guess at.
   Returns '+1XXXXXXXXXX' or null. */
function normalizeUsPhone(raw) {
  if (blank(raw)) return null;
  var s = String(raw).trim();
  if (s.length > LIMITS.phoneRaw) return null;
  if (/[a-z]/i.test(s)) return null;                   /* letters, extensions */
  if (/[^0-9+()\-.\s]/.test(s)) return null;           /* nothing exotic */

  var digits = s.replace(/\D/g, '');
  /* A leading 1 is the US country code; anything else with 11+ digits is not a
     US number and is not ours to guess at. */
  if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
  if (digits.length !== 10) return null;
  /* A US area code and exchange never start with 0 or 1. */
  if (/^[01]/.test(digits) || /^[01]/.test(digits.slice(3))) return null;
  return '+1' + digits;
}

/* ------------------------------------------------------------- state + size */

/* Two answers that belong to the inquiry rather than to any garment in it: a
   customer has one size and lives in one place. Both lists are closed, and both
   are duplicated in sql/002 — the database refuses anything else, so a value
   that got past here would still not be stored. */
var US_STATES = ('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD ' +
  'MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT ' +
  'VA WA WV WI WY DC').split(' ');

/* Canonical spelling on the way out, case-insensitive on the way in. A value
   that is not one of these is refused rather than guessed at — quietly mapping
   an unrecognised size onto a real one would put words in a customer's mouth. */
var PREFERRED_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', 'Free Size', 'Unsure'];

function normalizeState(raw) {
  if (blank(raw)) return null;
  var s = String(raw).trim().toUpperCase();
  return US_STATES.indexOf(s) === -1 ? null : s;
}

function normalizePreferredSize(raw) {
  if (blank(raw)) return null;
  var s = String(raw).trim().toLowerCase();
  for (var i = 0; i < PREFERRED_SIZES.length; i++) {
    if (PREFERRED_SIZES[i].toLowerCase() === s) return PREFERRED_SIZES[i];
  }
  return null;
}

/* ------------------------------------------------------------------ email */

/* Deliberately permissive: the only email that matters is one that can receive
   a reply, and no regex settles that. This rejects the obviously malformed and
   leaves the rest to the reply bouncing. */
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function normalizeEmail(raw) {
  if (blank(raw)) return { ok: true, value: null };
  var s = String(raw).trim().toLowerCase();
  if (s.length > LIMITS.email || !EMAIL_RE.test(s)) return { ok: false };
  return { ok: true, value: s };
}

/* ------------------------------------------------------------------ input */

function text(v, max) {
  if (blank(v)) return null;
  var s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

/* Reads only the keys we expect and ignores everything else, so an extra field
   in the payload can never reach a column. */
function parseSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_payload' };

  if (!isUuid(body.client_submission_id)) return { error: 'invalid_submission_id' };

  var c = (body.customer && typeof body.customer === 'object') ? body.customer : {};

  var name = text(c.name, LIMITS.name);
  if (!name) return { error: 'name_required' };

  var phone = normalizeUsPhone(c.phone);
  if (!phone) return { error: 'invalid_phone' };

  var email = normalizeEmail(c.email);
  if (!email.ok) return { error: 'invalid_email' };

  /* Required for every new inquiry. Historical rows have neither, which is why
     the columns stay nullable — but nothing arriving now is allowed to be as
     thin as they were. */
  if (blank(c.state) || String(c.state).length > LIMITS.state + 8) return { error: 'state_required' };
  var state = normalizeState(c.state);
  if (!state) return { error: 'invalid_state' };

  if (blank(c.preferred_size) || String(c.preferred_size).length > LIMITS.preferredSize) {
    return { error: 'preferred_size_required' };
  }
  var preferredSize = normalizePreferredSize(c.preferred_size);
  if (!preferredSize) return { error: 'invalid_preferred_size' };

  var items = Array.isArray(body.items) ? body.items : null;
  if (!items || items.length === 0) return { error: 'no_items' };
  if (items.length > LIMITS.items) return { error: 'too_many_items' };

  var parsed = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || typeof it !== 'object') return { error: 'invalid_item' };
    if (!isUuid(it.product_id)) return { error: 'invalid_product_id' };
    parsed.push({ product_id: String(it.product_id).trim().toLowerCase() });
  }

  /* The same piece twice is a double-tap, not two requests. */
  var seen = {};
  var unique = parsed.filter(function (it) {
    if (seen[it.product_id]) return false;
    seen[it.product_id] = true;
    return true;
  });

  return {
    value: {
      client_submission_id: String(body.client_submission_id).trim().toLowerCase(),
      customer_name: name,
      phone: phone,
      email: email.value,
      state: state,
      preferred_size: preferredSize,
      note: text(c.note, LIMITS.note),
      items: unique
    }
  };
}

/* --------------------------------------------------------------- supabase */

function supabase(path, init) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return Promise.reject(new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set'));
  }
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

  var opts = init || {};
  return fetch(SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    signal: controller.signal,
    body: opts.body,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  })
    .then(function (res) {
      return res.text().then(function (raw) {
        var parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
        if (!res.ok) {
          var err = new Error('Supabase ' + res.status + ': ' + String(raw).slice(0, 300));
          err.status = res.status;
          err.body = parsed;
          throw err;
        }
        return parsed;
      });
    })
    .finally(function () { clearTimeout(timer); });
}

/* The columns an inquiry snapshots. Nothing else is read, so cost, inventory
   and internal notes cannot reach the record even by accident. */
var SNAPSHOT_COLUMNS = ['id', 'slug', 'sku', 'name', 'price', 'is_archived'].join(',');

function readProducts(ids) {
  var list = ids.map(function (id) { return '"' + id + '"'; }).join(',');
  return supabase('products?select=' + encodeURIComponent(SNAPSHOT_COLUMNS) +
    '&id=in.(' + encodeURIComponent(list) + ')');
}

/* --------------------------------------------------------------- handler */

function fail(res, status, code) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ ok: false, error: code });
}

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'method_not_allowed');
  }

  var ip = (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'unknown';
  if (rateLimited(String(ip).split(',')[0].trim())) return fail(res, 429, 'too_many_requests');

  /* Vercel parses JSON bodies; the string branch covers a raw body and any
     local harness. Either way the size ceiling is checked before parsing. */
  var body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > LIMITS.body) return fail(res, 413, 'payload_too_large');
    try { body = JSON.parse(body); } catch (e) { return fail(res, 400, 'invalid_payload'); }
  } else if (body && typeof body === 'object') {
    try {
      if (Buffer.byteLength(JSON.stringify(body), 'utf8') > LIMITS.body) return fail(res, 413, 'payload_too_large');
    } catch (e) { return fail(res, 400, 'invalid_payload'); }
  }

  var parsed = parseSubmission(body);
  if (parsed.error) return fail(res, 400, parsed.error);
  var sub = parsed.value;

  var ids = sub.items.map(function (i) { return i.product_id; });

  return readProducts(ids)
    .then(function (rows) {
      var byId = {};
      (rows || []).forEach(function (r) { if (r && r.id) byId[String(r.id).toLowerCase()] = r; });

      /* Policy for a piece that has been hidden since it went in the bag:
         accept it if it still exists and has not been archived, even if it is
         no longer published. A bag can be days old, and losing a real customer
         over a piece Saima happened to unpublish this morning is worse than
         recording an inquiry she can answer with "that one has gone". Archived
         is a deliberate retirement, and an id that matches nothing at all is
         not a product — both are refused. */
      var items = [];
      for (var i = 0; i < sub.items.length; i++) {
        var row = byId[sub.items[i].product_id];
        if (!row || row.is_archived === true) return fail(res, 409, 'product_unavailable');
        items.push({
          product_id: row.id,
          product_slug: row.slug || null,
          product_sku: row.sku || null,
          product_name: row.name || null,
          /* Size is an inquiry-level answer now. The column stays for the
             records written before that was true; nothing new fills it. */
          requested_size: null,
          price_snapshot: (row.price === null || row.price === undefined) ? null : row.price,
          sort_order: i
        });
      }

      /* One call, one transaction: the inquiry and every item, or neither. */
      return supabase('rpc/create_website_inquiry', {
        method: 'POST',
        body: JSON.stringify({
          p_client_submission_id: sub.client_submission_id,
          p_customer_name: sub.customer_name,
          p_phone: sub.phone,
          p_email: sub.email,
          p_state: sub.state,
          p_preferred_size: sub.preferred_size,
          p_note: sub.note,
          p_items: items
        })
      });
    })
    .then(function (out) {
      if (!out || out.headersSent) return out;   /* a fail() above already answered */
      var row = Array.isArray(out) ? out[0] : out;
      if (!row || !row.inquiry_id) throw new Error('rpc returned no inquiry id');

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(row.duplicate ? 200 : 201).json({
        ok: true,
        inquiry_id: row.inquiry_id,
        duplicate: row.duplicate === true
      });
    })
    .catch(function (err) {
      if (res.headersSent) return;
      if (console && console.error) console.error('[api/inquiries]', err && err.stack ? err.stack : err);

      /* The tables not being there yet is the one failure worth naming, because
         the fix is "run the migration" rather than "try again later". */
      var msg = String(err && err.message || '');
      var missing = err && (err.status === 404 ||
        /PGRST202|does not exist|schema cache/i.test(msg + JSON.stringify(err && err.body || '')));
      if (missing) return fail(res, 503, 'inquiries_not_configured');

      fail(res, 500, 'inquiry_failed');
    });
};

/* Exported for tests. Not routes. */
module.exports.normalizeUsPhone = normalizeUsPhone;
module.exports.normalizeState = normalizeState;
module.exports.normalizePreferredSize = normalizePreferredSize;
module.exports.US_STATES = US_STATES;
module.exports.PREFERRED_SIZES = PREFERRED_SIZES;
module.exports.normalizeEmail = normalizeEmail;
module.exports.parseSubmission = parseSubmission;
module.exports.LIMITS = LIMITS;
