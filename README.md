# Meraki by Saima — website

Static site. No build step, no npm, no framework. Plain HTML, CSS and JavaScript.

## Files

| File | What it does |
|---|---|
| `index.html` | The whole site. All four views (home, collection, product, inquiry) live here; JavaScript shows one at a time. |
| `styles.css` | All styling — colours, type, layout, responsive rules. Palette variables are at the top under `:root`. |
| `script.js` | Product data, hash routing, product grids, size selection, the inquiry bag and form. |
| `img/` | Logo and all photography. |

## Preview locally

Open a terminal in this folder and run any static server:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. (Opening `index.html` directly by double-clicking also works, but serving it is closer to production.)

## Deploy to Vercel

No configuration needed — Vercel serves this as a static site automatically.

1. Push this folder to a GitHub repository.
2. In Vercel, **Add New → Project** and import that repository.
3. Framework preset: **Other**. Leave build command empty. Output directory: leave as the root.
4. Deploy.
5. Under **Settings → Domains**, add `merakibysaima.com`.

The site works from the root URL. All asset paths are relative (`img/…`, `styles.css`, `script.js`), so it also works if you serve it from a subfolder.

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
  fabric:'…', pieces:'…', colour:'…'
}
```

Add a piece by appending an object to that array. Nothing else needs changing — the home grid shows the first four, and the collection page shows all of them.

Sizes are the `SIZES` array directly below.

## Images

Put every image in `img/`.

- **Logo** — `img/logo.png`. Referenced in the header, the footer and the favicon.
- **Product photography** — `img/p1.webp` … `img/p8.webp`. To swap a photo, either overwrite the file with the same name, or drop in a new file and update that product's `image` path in `script.js`.
- **Fixed editorial images** used outside the product data (change these in `index.html`):
  - hero — `img/p5.webp`
  - our story — `img/p2.webp`
  - made to order — `img/p7.webp`

Portrait crops around 3:4 work best. Roughly 1400px wide is plenty.

## Note on the inquiry form

Submitting currently shows a thank-you screen only — nothing is sent anywhere. To receive inquiries, point the form at a service such as Formspree, or wire it to WhatsApp, in the `submit` handler near the bottom of `script.js`.
