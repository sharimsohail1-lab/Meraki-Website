-- Inquiries carry a U.S. state and one preferred size.
--
-- Run once in the Supabase SQL editor, against the schema 001 already created.
-- Safe to re-run: every statement is guarded.
--
-- Two facts move to the inquiry itself rather than to each item. A customer has
-- one size and lives in one place; asking per garment would ask the same
-- question repeatedly and invite contradictory answers.
--
-- inquiry_items.requested_size is deliberately left alone. Inquiries taken
-- before this migration carry sizes there, and those records have to keep
-- meaning what they meant. Nothing new writes to it.

-- ------------------------------------------------------------- columns
-- Nullable on purpose. Rows already in the table predate both questions, and
-- there is no honest value to backfill them with — a guessed state or size
-- would be worse than an admitted absence. New submissions are required to
-- supply both, and that requirement lives in the endpoint and in this
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

-- ------------------------------------------------------------- the RPC
-- Same function as 001 with two more parameters. Everything that made it worth
-- having is unchanged: one transaction for the inquiry and all its items, the
-- unique constraint on client_submission_id as the arbiter of duplicates,
-- security definer with a pinned search_path, and items built entirely from
-- product rows the endpoint has already re-read.
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

  -- Checked here as well as in the endpoint. This function is the only way in,
  -- so it is the right place for the invariant to be unconditional.
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

  -- requested_size is still read from the item payload so the column keeps
  -- working for anything that ever needs it again, but the website stops
  -- sending it and every new row lands NULL.
  insert into public.inquiry_items (
    inquiry_id, product_id, product_slug, product_sku, product_name,
    requested_size, price_snapshot, sort_order)
  select
    v_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'product_slug',
    item->>'product_sku',
    item->>'product_name',
    nullif(item->>'requested_size', ''),
    nullif(item->>'price_snapshot', '')::numeric,
    coalesce((item->>'sort_order')::int, 0)
  from jsonb_array_elements(p_items) as item;

  inquiry_id := v_id;
  duplicate := false;
  return next;
end $$;

-- ------------------------------------------- the six-argument original
-- Postgres treats a different parameter list as a different function, so the
-- version from 001 still exists after the one above is created. It is left in
-- place deliberately: between running this migration and deploying the new
-- website code, the live site is still calling the six-argument form, and
-- removing it would take inquiries down for that window.
--
-- Redefined as a thin delegate so there is only one implementation. It passes
-- NULL for the two new answers, which the new function refuses — so the old
-- path now fails loudly rather than writing a half-answered inquiry.
--
-- Once the new website is deployed and submitting successfully, this can go:
--
--   drop function if exists public.create_website_inquiry(uuid, text, text, text, text, jsonb);
--
create or replace function public.create_website_inquiry(
  p_client_submission_id uuid,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_note text,
  p_items jsonb
)
returns table (inquiry_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select * from public.create_website_inquiry(
    p_client_submission_id, p_customer_name, p_phone, p_email,
    null::text, null::text, p_note, p_items);
end $$;

-- ------------------------------------------------------------- grants
-- create or replace preserves existing privileges, but the eight-argument
-- function is new and starts with the default of EXECUTE granted to PUBLIC.
-- Stated explicitly so the posture does not depend on defaults: everything is
-- taken away, then given back to the one role the endpoint runs as.
revoke all on function public.create_website_inquiry(uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_website_inquiry(uuid, text, text, text, text, text, text, jsonb)
  to service_role;

revoke all on function public.create_website_inquiry(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_website_inquiry(uuid, text, text, text, text, jsonb)
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
-- makes that cache stale, and the endpoint would answer 503 until it refreshes
-- on its own. This asks for the reload immediately.
notify pgrst, 'reload schema';
