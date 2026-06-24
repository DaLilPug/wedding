-- =========================================================
--  Wedding RSVP schema  (run once in the Supabase SQL Editor)
--
--  Design notes:
--   * One flat "guests" table. Guests in the same party share a
--     "party_key" (any text you choose, e.g. "sabella-oliinyk").
--     A couple = two rows with the same party_key, so searching
--     EITHER name returns the whole party.
--   * Guests are NOT directly readable by the public. All access
--     goes through two SECURITY DEFINER functions, so nobody can
--     scrape the full guest list or anyone's phone/email.
-- =========================================================

create extension if not exists pg_trgm;

create table if not exists public.guests (
  id            uuid primary key default gen_random_uuid(),
  party_key     text not null,
  full_name     text not null,
  is_plus_one   boolean not null default false,
  phone         text,                 -- you pre-load this so you can text everyone the link
  email         text,                 -- captured at RSVP time
  attending     boolean,              -- null = has not responded yet
  meal          text,
  note          text,
  responded_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists guests_party_key_idx on public.guests (party_key);
create index if not exists guests_name_trgm_idx on public.guests using gin (lower(full_name) gin_trgm_ops);

-- Lock the table down. No policies => no direct anon/auth access.
alter table public.guests enable row level security;

-- ---------------------------------------------------------
-- search_party(q): find every party where ANY member's name
-- matches, and return that party's members (names only).
-- ---------------------------------------------------------
create or replace function public.search_party(q text)
returns table (party_key text, members jsonb)
language sql
security definer
set search_path = public
as $$
  with term as (
    select btrim(q) as raw,
           -- escape LIKE wildcards so % and _ are treated literally
           replace(replace(replace(lower(btrim(q)), '\', '\\'), '%', '\%'), '_', '\_') as t
  )
  select g.party_key,
         jsonb_agg(
           jsonb_build_object('id', g.id, 'name', g.full_name, 'attending', g.attending)
           order by g.is_plus_one, g.full_name
         ) as members
  from public.guests g
  where (select length(raw) from term) >= 2          -- ignore empty / 1-char probes
    and g.party_key in (
      select g2.party_key from public.guests g2
      where lower(g2.full_name) like '%' || (select t from term) || '%' escape '\'
    )
  group by g.party_key
  limit 10;
$$;

-- ---------------------------------------------------------
-- submit_rsvp: write each guest's attendance + meal, and stamp
-- the shared email/phone/note onto everyone in the party.
-- p_responses = [{ "id": "<uuid>", "attending": true, "meal": "" }, ...]
-- ---------------------------------------------------------
create or replace function public.submit_rsvp(
  p_party_key text,
  p_responses jsonb,
  p_email text,
  p_phone text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  -- per-guest attendance + meal
  for r in select * from jsonb_array_elements(p_responses)
  loop
    update public.guests
       set attending    = (r->>'attending')::boolean,
           meal         = nullif(r->>'meal', ''),
           responded_at = now()
     where id = (r->>'id')::uuid
       and party_key = p_party_key;
  end loop;

  -- shared contact info + note for the whole party
  update public.guests
     set email = coalesce(nullif(btrim(p_email), ''), email),
         phone = coalesce(nullif(btrim(p_phone), ''), phone),
         note  = coalesce(nullif(btrim(p_note),  ''), note)
   where party_key = p_party_key;
end;
$$;

-- Let the public site call these two functions (and nothing else).
grant execute on function public.search_party(text) to anon, authenticated;
grant execute on function public.submit_rsvp(text, jsonb, text, text, text) to anon, authenticated;

-- =========================================================
--  ADMIN ACCESS  (for the RSVP dashboard at /admin.html)
--
--  Setup, both steps done in Supabase (not in any committed file):
--   1. Authentication -> Users -> Add user. Create a login (email +
--      password) for you and for Anastasiia. Tick "Auto Confirm User".
--   2. Allowlist those SAME emails by running, here in the SQL editor,
--      with your real addresses:
--         insert into public.admins (email) values
--           ('austin@uptown.com'), ('anastasiia@example.com');
--
--  Only an allow-listed, signed-in user can read the guest list. The
--  public anon key cannot reach it.
-- =========================================================
create table if not exists public.admins ( email text primary key );
alter table public.admins enable row level security;   -- locked; manage via SQL editor

create or replace function public.admin_list_guests()
returns setof public.guests
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception 'Not authorized';
  end if;

  return query
    select * from public.guests
    order by party_key, is_plus_one, full_name;
end;
$$;

-- Only signed-in users may call it; the function itself enforces the allowlist.
grant execute on function public.admin_list_guests() to authenticated;

-- ---------------------------------------------------------
-- Sample party so you can test search immediately. Delete it,
-- then import your real list (see supabase/guests_template.csv).
-- ---------------------------------------------------------
insert into public.guests (party_key, full_name, is_plus_one, phone) values
  ('sabella-oliinyk', 'Austin Sabella',      false, null),
  ('sabella-oliinyk', 'Anastasiia Oliinyk',  false, null);
