# SQL for the storefront

The storefront normally only *reads* from Supabase. Inquiries are the exception:
they are the one thing the website writes, so the tables behind them are defined
here rather than in the admin app.

## What to run, and where

`001_website_inquiries.sql` — creates `inquiries`, `inquiry_items` and the
`create_website_inquiry()` function.

`002_inquiry_state_preferred_size.sql` — adds the inquiry-level state and
preferred size, and an eight-argument overload of the function.

`003_inquiry_sale_snapshot.sql` — records what a piece was offered at:
`regular_price_snapshot`, `discount_percent_snapshot`, `sale_id_snapshot` and
`sale_name_snapshot` on `inquiry_items`, and replaces the eight-argument
function so it writes them.

Run them in order:

1. Open the Supabase dashboard for the Meraki project
2. **SQL Editor → New query**
3. Paste the whole of one file
4. **Run**, then repeat for the next

Each is safe to re-run, and 003 is safe to run against a live site: it adds
nothing the current endpoint has to know about, and the function keeps the same
signature, so there is no window in which inquiries fail. An older deployment
calling the new function simply leaves the new columns null.

It is safe to run more than once: every statement is guarded (`create table if
not exists`, `create or replace function`, constraint adds wrapped so a repeat
is a no-op).

**`POST /api/inquiries` returns a 503 until this has been run.** Nothing else on
the storefront is affected — the catalogue, settings and the rest of the site
work exactly as before, and the inquiry form tells the customer to try again
rather than failing silently.

## Why the tables live here for now

The admin app owns migration history. This task deliberately creates the data
first so the website can start collecting inquiries at launch; the app will be
wired to read and manage them next, and its migration history will be reconciled
with this file at that point. Nothing here alters an existing table, so folding
it into that history later is a copy, not a merge.

## Security

Both tables have RLS enabled with no policies, and `anon`/`authenticated` are
revoked explicitly. That denies every browser-side client outright. The
storefront never talks to PostgREST for inquiries — it posts to
`/api/inquiries`, which holds `SUPABASE_SERVICE_KEY` server-side and bypasses
RLS as the service role.
