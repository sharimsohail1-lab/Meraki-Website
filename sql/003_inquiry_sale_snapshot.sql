-- What a piece was offered at, kept so it stays true.
--
-- Run once in the Supabase SQL editor, against the schema 001 and 002 created.
-- Safe to re-run: every statement is guarded.
--
-- WHY. inquiry_items.price_snapshot already records the price a customer was
-- quoted. On its own that is enough to answer "what did we say", and nothing
-- else. It cannot say whether $400 was the ordinary price or a reduction from
-- $500, and it cannot say which campaign made it so. Both of those change: a
-- sale ends, a regular price moves, another campaign starts. Reconstructing
-- them later from products.price and the live sales tables would be reading
-- today's answer to a question that was asked months ago.
--
-- So the four facts that were true at submission are written down at
-- submission, and never derived afterwards.
--
-- ROLLOUT. Additive only, and safe in either order against either deployment:
--
--   * old site + new function — the payload carries none of the new keys, the
--     new columns take NULL, and a row is indistinguishable from one written
--     before this file existed.
--   * new site + old function — the new keys are present in the JSON and the
--     old function simply does not read them. Nothing fails.
--
-- The eight-argument signature is unchanged, so this replaces the function in
-- place rather than adding a third overload. There is no window in which the
-- storefront is broken, and no deployment order that has to be got right for
-- inquiries to keep working.

-- ------------------------------------------------------------------ columns
-- All four nullable, with no default. NULL is not "zero" here, it is "this was
-- never recorded" — which is exactly true of every row written before today,
-- and must stay distinguishable from a piece that was genuinely not on sale.
--
-- A default of 0 on discount_percent_snapshot would be the one mistake worth
-- naming: it would silently claim that every historical inquiry was recorded
-- at full price, which is not something this file knows.
alter table public.inquiry_items
  add column if not exists regular_price_snapshot numeric;
alter table public.inquiry_items
  add column if not exists discount_percent_snapshot integer;
alter table public.inquiry_items
  add column if not exists sale_id_snapshot uuid;
alter table public.inquiry_items
  add column if not exists sale_name_snapshot text;

-- numeric, to match price_snapshot. The two are read together and compared to
-- each other, and a pair where one is integer and the other numeric invites
-- exactly the kind of quiet coercion that produces a wrong-looking saving.

-- sale_id_snapshot deliberately carries NO foreign key.
--
-- Sales are hard-deleted; there is no tombstone. A reference would either
-- cascade — destroying the inquiry item along with a campaign that has been
-- cleaned up — or block the delete. Both are wrong. What this column holds is
-- the identity a campaign had at the time, which stays true whether or not the
-- row it named still exists. sale_name_snapshot is here for the same reason: it
-- is the only thing that can still name a deleted campaign.

comment on column public.inquiry_items.price_snapshot is
  'The price the customer was actually offered: the sale price when a campaign covered this piece, the regular price otherwise. Resolved server-side at submission.';
comment on column public.inquiry_items.regular_price_snapshot is
  'products.price at submission. Equal to price_snapshot when the piece was not reduced. NULL on rows written before this was recorded.';
comment on column public.inquiry_items.discount_percent_snapshot is
  'The whole-number discount actually shown to the customer, as the resolver computed it. 0 when not reduced. NULL on rows written before this was recorded. Not re-derivable from the two prices: floor rounding in both directions makes that arithmetic lossy.';
comment on column public.inquiry_items.sale_id_snapshot is
  'The winning campaign''s id at submission. Historical metadata with no foreign key — sales are hard-deleted and this must survive that. NULL when the piece was not reduced.';
comment on column public.inquiry_items.sale_name_snapshot is
  'The campaign''s internal name at submission. Internal only: never served by /api/products, never in the browser, never in an ad event. NULL when the piece was not reduced.';

-- A sanity floor rather than a business rule. The endpoint and the resolver
-- both decide what is valid long before anything reaches here; this only stops
-- a value that could not be true under any reading.
do $$ begin
  alter table public.inquiry_items add constraint inquiry_items_discount_percent_range
    check (discount_percent_snapshot is null
           or (discount_percent_snapshot >= 0 and discount_percent_snapshot < 100));
exception when duplicate_object then null; end $$;

-- Finding every inquiry a campaign touched, without scanning the table. Partial
-- because the overwhelming majority of rows are not reduced.
create index if not exists inquiry_items_sale_id_snapshot_idx
  on public.inquiry_items (sale_id_snapshot)
  where sale_id_snapshot is not null;

-- ------------------------------------------------- atomic creation (RPC)
-- The same eight-argument function as 002, replaced in place, with four more
-- fields read out of the item JSON. Everything else about it is unchanged:
-- the idempotency arbiter, the state and size checks, and the literal NULL for
-- requested_size all behave exactly as before.
--
-- As in 002, every value here comes from canonical rows the endpoint re-read
-- for itself. Nothing a browser sent reaches these columns.
create or replace function public.create_website_inquiry(
  p_client_submission_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_state text,
  p_preferred_size text,
  p_note text,
  p_items jsonb
)
returns table (inquiry_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_state text;
  v_size text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'inquiry must have at least one item' using errcode = '22023';
  end if;

  v_state := public.normalize_us_state(p_state);
  if v_state is null then
    raise exception 'invalid or missing state' using errcode = '22023';
  end if;

  v_size := public.normalize_preferred_size(p_preferred_size);
  if v_size is null then
    raise exception 'invalid or missing preferred size' using errcode = '22023';
  end if;

  insert into public.inquiries (
    client_submission_id, source, customer_name, phone, email, state, preferred_size, note)
  values (
    p_client_submission_id, 'website', p_customer_name, p_phone, p_email, v_state, v_size, p_note)
  on conflict (client_submission_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Already submitted. Return the original, and insert nothing.
    select i.id into v_id
      from public.inquiries i
     where i.client_submission_id = p_client_submission_id;

    inquiry_id := v_id;
    duplicate := true;
    return next;
    return;
  end if;

  -- requested_size stays a literal NULL, as in 002: size is an inquiry-level
  -- answer, and hard-coding it here means a stale client cannot put one back.
  --
  -- The four snapshot fields use nullif on the text form first, so a key that
  -- is absent, an empty string, or a JSON null all land as NULL rather than
  -- as a zero or a cast error. That is what lets an older deployment keep
  -- calling this function unchanged.
  insert into public.inquiry_items (
    inquiry_id, product_id, product_slug, product_sku, product_name,
    requested_size, price_snapshot,
    regular_price_snapshot, discount_percent_snapshot,
    sale_id_snapshot, sale_name_snapshot,
    sort_order)
  select
    v_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'product_slug',
    item->>'product_sku',
    item->>'product_name',
    null,
    nullif(item->>'price_snapshot', '')::numeric,
    nullif(item->>'regular_price_snapshot', '')::numeric,
    nullif(item->>'discount_percent_snapshot', '')::integer,
    nullif(item->>'sale_id_snapshot', '')::uuid,
    nullif(item->>'sale_name_snapshot', ''),
    coalesce((item->>'sort_order')::int, 0)
  from jsonb_array_elements(p_items) as item;

  inquiry_id := v_id;
  duplicate := false;
  return next;
end $$;

-- Unchanged from 002, restated because create or replace does not carry grants
-- forward on its own in every project's default-privilege configuration.
revoke all on function public.create_website_inquiry(uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_website_inquiry(uuid, text, text, text, text, text, text, jsonb)
  to service_role;
