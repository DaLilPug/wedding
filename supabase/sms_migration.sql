-- =========================================================
--  SMS channel for the reminder pipeline
--  Run once in the Supabase SQL editor.
--
--  Design notes:
--   * The reminders table already drives email. This adds a
--     channel ('email' | 'sms' | 'both') and a separate short
--     sms_body, so ONE reminder row can do both, and the same
--     sender handles the invite blast and every later nudge.
--   * sms_audience() does all the recipient math in one place:
--     it dedupes by phone number, skips opt-outs, and builds the
--     greeting (a guest's first name, plus the first names of
--     anyone in their party who has no number of their own).
--   * sms_log is the delivery record. A carrier can accept a
--     message and silently drop it, so we keep the provider's id
--     and status for every single send.
--   * Nothing here is readable by anon. Everything goes through
--     SECURITY DEFINER functions, same as the rest of the schema.
--   * No backslashes anywhere on purpose: they get mangled on the
--     way into the dashboard's editor.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------
alter table public.reminders
  add column if not exists channel        text not null default 'email',
  add column if not exists sms_body       text,
  add column if not exists sms_sent_count integer;

do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'reminders_channel_chk') then
    alter table public.reminders
      add constraint reminders_channel_chk check (channel in ('email','sms','both'));
  end if;
end $mig$;

-- An email reminder needs a subject and body; an SMS-only one does not.
alter table public.reminders alter column subject drop not null;
alter table public.reminders alter column body    drop not null;

alter table public.guests
  add column if not exists sms_opt_out boolean not null default false;

-- ---------------------------------------------------------
-- 2. Delivery log and inbound replies
-- ---------------------------------------------------------
create table if not exists public.sms_log (
  id           uuid primary key default gen_random_uuid(),
  reminder_id  uuid,
  phone        text not null,
  greeting     text,
  body         text,
  provider_sid text,
  status       text,             -- queued / sent / delivered / undelivered / failed / error
  error        text,
  sent_at      timestamptz not null default now()
);
create index if not exists sms_log_reminder_idx on public.sms_log (reminder_id);
create index if not exists sms_log_sid_idx      on public.sms_log (provider_sid);
alter table public.sms_log enable row level security;

create table if not exists public.sms_inbound (
  id          uuid primary key default gen_random_uuid(),
  from_phone  text not null,
  body        text,
  is_opt_out  boolean not null default false,
  guest_name  text,
  forwarded   boolean not null default false,
  received_at timestamptz not null default now()
);
alter table public.sms_inbound enable row level security;

-- ---------------------------------------------------------
-- 3. sms_audience(): one row per phone number to text
-- ---------------------------------------------------------
create or replace function public.sms_audience(p_audience text default 'all')
returns table (phone text, greeting text, guest_ids uuid[])
language sql
security definer
set search_path = public
as $fn$
  with elig as (
    select g.id, g.party_key, g.full_name, g.is_plus_one, g.phone,
           regexp_replace(g.phone, '[^0-9]', '', 'g') as digits
    from public.guests g
    where g.phone is not null
      and btrim(g.phone) <> ''
      and g.sms_opt_out = false
      and ( p_audience = 'all'
         or (p_audience = 'attending'     and g.attending is true)
         or (p_audience = 'declined'      and g.attending is false)
         or (p_audience = 'not_responded' and g.attending is null) )
  ),
  silent as (
    select g.party_key,
           string_agg(split_part(btrim(g.full_name), ' ', 1), ' & ' order by g.full_name) as names
    from public.guests g
    where g.phone is null or btrim(g.phone) = ''
    group by g.party_key
  ),
  grouped as (
    select e.digits,
           min(e.phone)     as phone,
           min(e.party_key) as party_key,
           array_agg(e.id order by e.is_plus_one, e.full_name) as guest_ids,
           string_agg(split_part(btrim(e.full_name), ' ', 1), ' & '
                      order by e.is_plus_one, e.full_name)     as own
    from elig e
    group by e.digits
  )
  select gr.phone,
         gr.own || coalesce(' & ' || s.names, '') as greeting,
         gr.guest_ids
  from grouped gr
  left join silent s on s.party_key = gr.party_key
  order by gr.phone;
$fn$;

-- ---------------------------------------------------------
-- 4. Admin reads
-- ---------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$fn$;
grant execute on function public.is_admin() to authenticated;

drop function if exists public.admin_list_reminders();
create or replace function public.admin_list_reminders()
returns setof public.reminders
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query select * from public.reminders order by send_on desc;
end $fn$;
grant execute on function public.admin_list_reminders() to authenticated;

-- How many people each channel would actually reach, per audience.
create or replace function public.admin_audience_counts()
returns table (audience text, email_count integer, sms_count integer, no_phone integer)
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select a.aud::text,
           (select count(distinct lower(btrim(g.email)))::int from public.guests g
             where g.email is not null and btrim(g.email) <> ''
               and ( a.aud = 'all'
                  or (a.aud = 'attending'     and g.attending is true)
                  or (a.aud = 'declined'      and g.attending is false)
                  or (a.aud = 'not_responded' and g.attending is null) )),
           (select count(*)::int from public.sms_audience(a.aud)),
           (select count(*)::int from public.guests g
             where (g.phone is null or btrim(g.phone) = '')
               and ( a.aud = 'all'
                  or (a.aud = 'attending'     and g.attending is true)
                  or (a.aud = 'declined'      and g.attending is false)
                  or (a.aud = 'not_responded' and g.attending is null) ))
    from (values ('all'),('attending'),('declined'),('not_responded')) as a(aud);
end $fn$;
grant execute on function public.admin_audience_counts() to authenticated;

create or replace function public.admin_sms_log(p_reminder_id uuid default null)
returns setof public.sms_log
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select * from public.sms_log
    where p_reminder_id is null or reminder_id = p_reminder_id
    order by sent_at desc
    limit 500;
end $fn$;
grant execute on function public.admin_sms_log(uuid) to authenticated;

create or replace function public.admin_sms_inbound()
returns setof public.sms_inbound
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query select * from public.sms_inbound order by received_at desc limit 200;
end $fn$;
grant execute on function public.admin_sms_inbound() to authenticated;

-- ---------------------------------------------------------
-- 5. Admin writes
-- ---------------------------------------------------------
drop function if exists public.admin_save_reminder(uuid, date, text, text, text);
drop function if exists public.admin_save_reminder(uuid, text, text, text, text);
create or replace function public.admin_save_reminder(
  p_id uuid,
  p_send_on date,
  p_audience text,
  p_subject text,
  p_body text,
  p_channel text default 'email',
  p_sms_body text default null
) returns public.reminders
language plpgsql security definer set search_path = public as $fn$
declare result public.reminders;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if coalesce(p_channel,'email') not in ('email','sms','both') then
    raise exception 'Channel must be email, sms, or both';
  end if;
  if coalesce(p_channel,'email') in ('email','both')
     and (nullif(btrim(p_subject),'') is null or nullif(btrim(p_body),'') is null) then
    raise exception 'An email reminder needs a subject and a message';
  end if;
  if coalesce(p_channel,'email') in ('sms','both') and nullif(btrim(p_sms_body),'') is null then
    raise exception 'A text reminder needs a text message';
  end if;

  if p_id is null then
    insert into public.reminders (send_on, audience, subject, body, channel, sms_body)
    values (p_send_on, p_audience, nullif(btrim(p_subject),''), nullif(btrim(p_body),''),
            coalesce(p_channel,'email'), nullif(btrim(p_sms_body),''))
    returning * into result;
  else
    update public.reminders set
      send_on  = p_send_on,
      audience = p_audience,
      subject  = nullif(btrim(p_subject),''),
      body     = nullif(btrim(p_body),''),
      channel  = coalesce(p_channel,'email'),
      sms_body = nullif(btrim(p_sms_body),'')
    where id = p_id and sent_at is null
    returning * into result;
    if result.id is null then raise exception 'That reminder has already been sent'; end if;
  end if;
  return result;
end $fn$;
grant execute on function public.admin_save_reminder(uuid, date, text, text, text, text, text) to authenticated;

create or replace function public.admin_set_sms_opt_out(p_id uuid, p_opt_out boolean)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  update public.guests set sms_opt_out = coalesce(p_opt_out, false) where id = p_id;
end $fn$;
grant execute on function public.admin_set_sms_opt_out(uuid, boolean) to authenticated;
