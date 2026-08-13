# Content to verify before going public

Everything below came out of the Claude Design draft. **None of it has been checked
against the real business.** It reads as though it were factual, so it should all be
confirmed or replaced before the site is shared publicly — some of it makes concrete
promises to customers.

Nothing in this list has been altered. This is a checklist, not a record of changes.

## Prices, availability and delivery promises

Every product carries a price, a stock claim and a delivery time. These are commitments
to a customer, so they matter most.

| Piece | Price | Stated availability | Stated delivery |
|---|---|---|---|
| NOOR | $325 | Made to order · 4–6 weeks | 4–6 weeks from confirmation |
| SAHAR | $480 | Limited availability | **"Two pieces remain."** Ships within 5 working days |
| SABEEN | $295 | Ready now | In stock. Ships within 48 hours |
| GULNAAR | $340 | Made to order · 4–6 weeks | 4–6 weeks from confirmation |
| MEHR | $520 | **"1 available · size 42"** | One piece only, size 42. Ships within 48 hours |
| AYLA | $310 | Ready now | In stock. Ships within 48 hours |
| ROSELLE | $395 | Made to order · 4–6 weeks | 4–6 weeks from confirmation |
| ZARIN | $360 | Ready now | In stock. Ships within 48 hours |

Specific claims worth singling out:

- **Exact stock counts.** "Two pieces remain" (SAHAR) and "1 available · size 42" (MEHR)
  are hard numbers. MEHR's also appears on the home page hero tag.
- **Currency is US dollars** throughout. Confirm that is the intended selling currency.
- **48-hour and 5-working-day shipping** are firm promises.
- **4–6 weeks** appears on the product pages, the "Made for you" steps and the footer.

Edit these in the `PRODUCTS` array in `script.js`. The hero tag is in `index.html`.

## Product names and descriptions

The eight names — NOOR, SAHAR, SABEEN, GULNAAR, MEHR, AYLA, ROSELLE, ZARIN — and every
description, fabric, pieces and colour field are drafted copy. Confirm each one actually
describes the garment in its photograph. Examples of the specificity involved:

- NOOR — "chartreuse silk-cotton kurta with hand-appliquéd blooms and cutwork scallops"
- SAHAR — "ivory crepe front-open jacket, bordered in resham-embroidered bird and vine work"
- MEHR — "Rose pink silk with gota and zardozi borders … saffron chiffon dupatta"

Two spec rows are hardcoded in `script.js` (in `renderProduct`) and apply to **every**
product regardless of what it is:

- Made — "Lahore, by hand"
- Care — "Dry clean only. Store folded in muslin."

## Collection name

The home page section is titled **"The Roselle Collection"**, which is also the name of
one of the products (ROSELLE). Confirm the collection is really called this.

## Business and location claims

In `index.html`:

- "Pakistani womenswear · Lahore & worldwide" (hero eyebrow)
- "Saima works with a small atelier in **Lahore**" (our story)
- "Silks and raw cottons are sourced by the bolt, embroideries are drawn to order, and
  nothing is produced in volume — which is why some pieces exist only once."
- "**Lahore, Pakistan**" and "Shipping worldwide" (footer)
- "We confirm sizing, fabric and price over **WhatsApp**" (made-to-order step 2)
- "Saima will write to you personally **within one working day**" (thank-you screen)
- "Sizes 38 – 46 & custom" (footer, collection count, product pages)

The "Meraki — to leave a piece of yourself in what you make" story paragraph is drafted
brand copy.

## Contact details — these are placeholders and currently go nowhere

In the footer of `index.html`:

| Link | Current value | Problem |
|---|---|---|
| WhatsApp | `https://wa.me/` | **No phone number.** Opens WhatsApp with no recipient. |
| Email | `hello@merakibysaima.com` | Confirm this mailbox exists and is monitored. |
| Instagram | `https://instagram.com` | **Generic Instagram homepage**, not an account. |

These were left exactly as delivered rather than guessed at. They are the most likely
things to embarrass you on launch day.

## Domain

`merakibysaima.com` appears in the Design package's README and is now also used in the
canonical URL, the Open Graph tags, `robots.txt` and `sitemap.xml`. If the real domain
differs, update those four places plus `index.html`.

## Copyright year

The footer reads "© 2026 Meraki by Saima". It is hardcoded, so it will need editing each
January unless it is made dynamic.

## Imagery

The eight photographs are the ones supplied in the Design package. Confirm Meraki has
the right to use them commercially and that each one shows the garment its product entry
describes. Several appear to be shot in a European city street setting, which may or may
not match how the brand wants to present itself.

Alt text was written to describe each photograph for screen readers and search engines;
it repeats the drafted product descriptions, so it inherits any inaccuracy in them.
