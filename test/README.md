# Test data

`fixtures/products.json` is the Phase 3 fixture catalogue, kept for local
frontend testing only.

**Nothing in the shipped site reads it.** `api/products.js` queries Supabase and
has no fixture path: if the database is unreachable the endpoint returns a 500
and the storefront shows its error state. That is deliberate — a silent fallback
to this file would hide a broken API from us and show customers products and
prices that no longer exist.

To run the storefront locally against these fixtures, serve them at
`/api/products` from your own test server. Do not import this file from `api/`.
