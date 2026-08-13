# Meraki by Saima — website

Static site. No build step, no npm, no framework. Plain HTML, CSS and JavaScript,
deployed straight to Vercel.

## Files

| File | What it does |
|---|---|
| `index.html` | The whole site. All four views (home, collection, product, inquiry) live here; JavaScript shows one at a time. |
| `styles.css` | All styling — colours, type, layout, responsive rules. Palette variables are at the top under `:root`. |
| `script.js` | Product data, hash routing, product grids, size selection, the inquiry bag and form. |
| `img/` | Web-ready photography and the logo. |
| `img/source/` | The files exactly as delivered by Claude Design — the highest-resolution copies we have. Never served to visitors. If higher-resolution masters exist elsewhere, put those here instead and re-run the optimiser. |
| `tools/optimize-images.py` | Regenerates everything in `img/` from `img/source/`. |
| `vercel.json` | Cache and security headers. No build configuration — there is nothing to build. |
| `robots.txt`, `sitemap.xml` | Search engine basics. Both reference `www.merakibysaima.com`. |

## Preview locally

Open a terminal in this folder and run any static server:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. (Opening `index.html` directly by double-clicking
also works, but serving it is closer to production.)

## Deploy to Vercel

No configuration needed — Vercel serves this as a static site automatically.

1. Push this folder to a GitHub repository.
2. In Vercel, **Add New → Project** and import that repository.
3. Framework preset: **Other**. Leave build command empty. Output directory: leave as the root.
4. Deploy.
5. Under **Settings → Domains**, add `www.merakibysaima.com` and set it as the primary
   domain. `merakibysaima.com` redirects to it, so the canonical URL, the Open Graph
   tags, `robots.txt` and `sitemap.xml` all use the `www` form. If the primary domain
   ever changes, those four must change with it or search engines will be told the
   page's canonical address is a URL that only redirects.

The site works from the root URL. All asset paths are relative (`img/…`, `styles.css`,
`script.js`), so it also works if you serve it from a subfolder.

## Product data

All products live in the `PRODUCTS` array at the top of `script.js`. Each entry:

```js
{
  id:'noor',                 // used in the URL: #/product/noor
  name:'NOOR',
  price:'$325',
  image:'img/p1.webp',
  type:'mto',                // 'ready' | 'mto' | 'limited' — drives the status dot colour
  status:'Made to order · 4–6 weeks',
  delivery:'Estimated delivery 4–6 weeks from confirmation.',
  description:'…',
  fabric:'…', pieces:'…', colour:'…',
  images:['img/p1.webp','img/p1b.webp']   // optional — see "Product photography" below
}
```

Add a piece by appending an object to that array. Nothing else needs changing — the
home grid shows the first four, and the collection page shows all of them.

Sizes are the `SIZES` array directly below.

> **`type` also decides filtering.** "Ready now" shows only `type:'ready'`. "Made to
> order" shows *everything else*, which means `limited` pieces appear under Made to
> order even when they are in stock and ship in 48 hours. If a limited piece should
> read as available, give it `type:'ready'`.

## Images

### Adding or replacing a photograph

1. Put the original in `img/source/` (any size — bigger is fine).
2. Run `python3 tools/optimize-images.py` (needs `pip install Pillow`).
3. Reference it as `img/<name>.webp` in `script.js`.

The script writes three renditions of each photograph and rewrites the generated
`IMG_SRCSET` block in `script.js` so browsers download the smallest one that still
looks sharp:

| Rendition | Width | Used by |
|---|---|---|
| `img/<name>.webp` | up to 1400px | hero, product page |
| `img/md/<name>.webp` | up to 960px | product cards on phones |
| `img/sm/<name>.webp` | up to 560px | product cards on desktop, gallery thumbnails, inquiry rows |

It never crops, recolours or otherwise alters a photograph — it only scales it down
proportionally and re-encodes it.

**If you skip step 2**, the photograph still works. It simply won't appear in
`IMG_SRCSET`, so it renders full-size everywhere instead of using a smaller rendition.
Nothing breaks.

### Product photography

Each product currently has **one** photograph. The product page shows a four-thumbnail
gallery, so the remaining three thumbnails are filled with *other products'*
photographs — clicking them swaps the main image to a different garment. That is a
placeholder arrangement, not a deliberate design.

When real alternate shots exist, add an `images` array to that product and the gallery
uses them instead:

```js
{ id:'noor', …, image:'img/p1.webp', images:['img/p1.webp','img/p1b.webp','img/p1c.webp'] }
```

### Fixed editorial images

Used outside the product data — change these in `index.html`:

- hero — `img/p5.webp`
- our story — `img/p2.webp`
- made to order — `img/p7.webp`

Portrait crops around 3:4 work best. Roughly 1400px wide is plenty.

### Logo and icons

- **Logo** — `img/logo.png`, referenced in the header and the footer.
- **Icon** — `img/icon.png` (180×180), used for the browser tab and iOS home screen.
  It is the full wide logo letterboxed into a square, so it reads small. A purpose-made
  square mark would be better whenever one exists.
- **Link preview** — `img/og.jpg`, an uncropped copy of the hero photograph. It is
  portrait, so social platforms will crop it to fit their own aspect ratio. A
  purpose-made 1200×630 share card would preview better.

## Making the inquiry form live

**Nothing is sent anywhere today.** Submitting validates that at least one look is
selected, logs the inquiry to the browser console, clears the bag and shows the
thank-you screen.

Everything funnels through one function in `script.js`:

```js
function inquiryPayload(form) { … }   // builds the object
byId('inquiry-form').addEventListener('submit', …)   // the single place to wire up
```

The payload is already the shape a backend would want:

```js
{
  submittedAt: '2026-08-13T09:41:00.000Z',
  name: 'Ayesha', phone: '+92 300 0000000', email: 'a@example.com', note: '…',
  items: [ { id:'mehr', name:'MEHR', size:'42', price:'$520' } ]
}
```

There is also an unused `INQUIRY_ENDPOINT` constant at the top of `script.js` as the
place to put a URL.

### The three options

**WhatsApp** — cheapest and fastest. Build a `https://wa.me/<number>?text=…` URL from
the payload and open it. Requires no backend and no accounts, and inquiries land where
the atelier already replies. Downside: nothing is recorded anywhere, delivery depends
on the customer actually pressing send in WhatsApp, and it is awkward on desktop.

**Email via a form service** (Formspree, Web3Forms and similar) — one `fetch()` POST to
a URL, no backend to run, inquiries arrive in an inbox. Downside: a third-party
dependency and, on free tiers, monthly submission caps.

**Supabase** — the right long-term home, since the Meraki admin system already uses it.
Insert the payload into an `inquiries` table via `supabase-js` or a plain `fetch()` to
the REST endpoint, and inquiries become queryable, exportable and visible in the admin
system alongside everything else. Requires an anon key in the page and a row-level
security policy allowing inserts but not reads.

**Recommendation:** Supabase as the record, plus a WhatsApp hand-off on the thank-you
screen. Write the inquiry to Supabase so nothing is lost and the admin system sees it,
then show a "Continue on WhatsApp" button so the customer can start the conversation
immediately. Do the Supabase insert first and treat WhatsApp as optional, so a customer
who never presses the button is still recorded.

Whichever is chosen, keep the thank-you screen as the success state and add a visible
error state for a failed send — right now a failure would be silent.

## Known limitations

- **Search engines see one page.** Every view is a `#/hash` route, so Google indexes
  `/` only; individual products cannot rank on their own. Fixing this means real URLs
  (`/product/noor`) and per-page `<title>`/`<meta>` tags, which needs either separate
  HTML files or a build step. Worth doing if search traffic matters; not worth it if
  the site is reached mostly through Instagram and WhatsApp.
- **The inquiry bag is stored in the browser** (`localStorage`, key `meraki.inquiry.v1`).
  It survives a refresh but is per-device, and it is not a substitute for a real record.
- **Fonts load from Google Fonts.** If that request fails the site falls back to Georgia
  and Helvetica and still reads correctly. Self-hosting the two font files would remove
  the third-party request.
