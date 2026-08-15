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
].join(',');

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

function readSettingsRow() {
  return supabaseSelect(
    'website_settings?select=' + encodeURIComponent(SETTINGS_COLUMNS) +
    '&id=eq.' + SETTINGS_ID + '&limit=1'
  ).then(function (rows) { return (rows && rows[0]) || null; });
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

  return readSettingsRow()
    .then(function (row) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      /* Same policy as the catalogue: the browser revalidates, the edge absorbs
         the traffic for five minutes, and a stale copy covers a cold refresh. */
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
      /* No row yet is a legitimate state — Saima has not opened the settings
         screen. Every field null, and the storefront hides what it cannot fill. */
      res.status(200).json({ settings: publicSettings(row) });
    })
    .catch(function (err) {
      if (console && console.error) console.error('[api/site-settings]', err && err.stack ? err.stack : err);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(500).json({ error: 'settings_unavailable' });
    });
};

module.exports.publicSettings = publicSettings;
