-- Inquiries carry a U.S. state and one preferred size.
--
-- Run once in the Supabase SQL editor, against the schema 001 already created.
-- Safe to re-run: every statement is guarded.
--
-- Two facts move to the inquiry itself rather than to each item. A customer has
-- one size and lives in one place; asking per garment would ask the same
-- question repeatedly and invite contradictory answers.
--
-- ROLLOUT. This file is additive only. It adds two columns, two helpers and a
-- new eight-argument overload of create_website_inquiry, and it does not touch
-- the six-argument function that the currently-deployed website calls. Running
-- this changes nothing about how the live site behaves: it keeps calling the
-- six-argument form, which keeps working, and the new overload sits unused
-- until the new website is deployed. Dropping the old signature is a later,
-- optional cleanup and is deliberately not part of getting this live.

-- ------------------------------------------------------------- columns
-- Nullable on purpose. Rows already in the table predate both questions, and
-- there is no honest value to backfill them with — a guessed state or size
-- would be worse than an admitted absence. New submissions are required to
-- supply both, and that requirement lives in the endpoint and in the new
-- function, where it can be enforced without rewriting history.
alter table public.inquiries add column if not exists state text;
alter table public.inquiries add column if not exists preferred_size text;

-- ----------------------------------------------------------- constraints
-- Both allow NULL so historical rows stay valid, and constrain anything that
-- is not NULL. The database is the last line rather than the only one: the
-- endpoint and the function both check first, and these catch anything that
-- ever reaches the table another way.
do $$ begin
  alter table public.inquiries add constraint inquiries_state_check check (
    state is null or state in (
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
      'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
      'VA','WA','WV','WI','WY','DC'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inquiries add constraint inquiries_preferred_size_check check (
    preferred_size is null or preferred_size in (
      '38','40','42','44','46','48','50','52','Free Size','Unsure'));
exception when duplicate_object then null; end $$;

-- A preferred size is a customer's own answer, not a claim about stock. It is
-- not joined to size_inventory and is not filtered by product.
comment on column public.inquiries.preferred_size is
  'The customer''s stated size preference for the whole inquiry. Not an availability claim; unrelated to products.size_inventory. "Unsure" means they have asked for guidance.';
comment on column public.inquiries.state is
  'Two-letter U.S. postal code, uppercase. Null on inquiries taken before this was asked.';

-- --------------------------------------------------- normalisation helpers
-- Written as functions so the endpoint, the constraint and the RPC cannot
-- drift apart on what counts as valid. Both return NULL for anything they do
-- not recognise, and the caller decides what to do about that — nothing is
-- silently mapped onto a value the customer did not choose.
create or replace function public.normalize_us_state(p_state text)
returns text language sql immutable as $$
  select case
    when upper(btrim(coalesce(p_state, ''))) in (
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
      'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
      'VA','WA','WV','WI','WY','DC')
    then upper(btrim(p_state))
    else null
  end
$$;

-- Case-insensitive on the way in, canonical on the way out: "unsure" and
-- "UNSURE" both become "Unsure", and "free size" becomes "Free Size". A value
-- that is not one of the ten is not guessed at.
create or replace function public.normalize_preferred_size(p_size text)
returns text language sql immutable as $$
  select case lower(btrim(coalesce(p_size, '')))
    when '38' then '38'
    when '40' then '40'
    when '42' then '42'
    when '44' then '44'
    when '46' then '46'
    when '48' then '48'
    when '50' then '50'
    when '52' then '52'
    when 'free size' then 'Free Size'
    when 'unsure'    then 'Unsure'
    else null
  end
$$;

-- --------------------------------------------- the new eight-argument RPC
-- A new overload, not a replacement. Postgres keys a function by its parameter
-- list, so creating this leaves the six-argument version from 001 untouched and
-- still callable — which is what lets the live site keep taking inquiries while
-- this sits here unused, waiting for the new website.
--
-- Everything that made the original worth having is unchanged: one transaction
-- for the inquiry and all of its items, the unique constraint on
-- client_submission_id as the arbiter of duplicates, security definer with a
-- pinned search_path, and items built entirely from product rows the endpoint
-- has already re-read.
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

  -- Checked here as well as in the endpoint. This function is the only way in
  -- for a new inquiry, so it is the right place for the invariant to be
  -- unconditional.
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

  -- requested_size is written as a literal NULL rather than read from the
  -- payload. Size is an inquiry-level answer now, and the column exists only
  -- for the records written before that was true. Hard-coding it here means a
  -- malformed or stale client that still sends a per-item size cannot put one
  -- back into the table — the architecture is enforced by the database rather
  -- than only agreed with the caller.
  insert into public.inquiry_items (
    inquiry_id, product_id, product_slug, product_sku, product_name,
    requested_size, price_snapshot, sort_order)
  select
    v_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'product_slug',
    item->>'product_sku',
    item->>'product_name',
    null,
    nullif(item->>'price_snapshot', '')::numeric,
    coalesce((item->>'sort_order')::int, 0)
  from jsonb_array_elements(p_items) as item;

  inquiry_id := v_id;
  duplicate := false;
  return next;
end $$;

-- ------------------------------------------------------------- grants
-- Only for the function this file creates. A newly created function starts
-- with EXECUTE granted to PUBLIC, so it is taken away and given back to the one
-- role the endpoint runs as. The six-argument function keeps the grants 001
-- gave it and is not mentioned here — nothing in this file may change how the
-- live site's call behaves.
revoke all on function public.create_website_inquiry(uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_website_inquiry(uuid, text, text, text, text, text, text, jsonb)
  to service_role;

revoke all on function public.normalize_us_state(text) from public, anon, authenticated;
revoke all on function public.normalize_preferred_size(text) from public, anon, authenticated;
grant execute on function public.normalize_us_state(text) to service_role;
grant execute on function public.normalize_preferred_size(text) to service_role;

-- The tables keep the posture 001 set: RLS on, no policies, anon and
-- authenticated revoked. Restated so running this file leaves nothing to
-- assume.
alter table public.inquiries enable row level security;
alter table public.inquiry_items enable row level security;
revoke all on public.inquiries from anon, authenticated;
revoke all on public.inquiry_items from anon, authenticated;

-- PostgREST caches the schema. Adding a function signature it has not seen
-- makes that cache stale, and calls to the new overload would answer 404 until
-- it refreshes on its own. This asks for the reload immediately.
notify pgrst, 'reload schema';

-- ----------------------------------------------------------- afterwards
-- Not part of getting this live, and not to be run now. Once the new website
-- is deployed and a real inquiry has been submitted and checked, the old
-- signature has no callers left and can go in a later migration:
--
--   drop function if exists public.create_website_inquiry(uuid, text, text, text, text, jsonb);
--
-- Until then it is what keeps the site up.
