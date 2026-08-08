-- =========================================================
--  HOUSE FUND REGISTRY  (run once in the Supabase SQL editor)
--  Guests contribute toward a down payment and, in doing so,
--  vote on where we should buy. Rankings are PUBLIC but only
--  ever expose percentages - never dollar amounts or names.
-- =========================================================

create table if not exists public.registry_pledges (
  id           uuid primary key default gen_random_uuid(),
  state        text not null check (state in ('Illinois','Texas','Colorado','Iowa')),
  amount       numeric(10,2) not null check (amount > 0 and amount <= 100000),
  guest_name   text,
  note         text,
  is_baseline  boolean not null default false,
  confirmed    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists registry_pledges_state_idx on public.registry_pledges (state);
alter table public.registry_pledges enable row level security;  -- no policies: RPC-only

-- ---- seed the race so it starts competitive (fake $1,000) ----
insert into public.registry_pledges (state, amount, is_baseline, confirmed, guest_name)
select * from (values
  ('Illinois', 380.00, true, true, 'Opening line'),
  ('Texas',    350.00, true, true, 'Opening line'),
  ('Colorado', 160.00, true, true, 'Opening line'),
  ('Iowa',     110.00, true, true, 'Opening line')
) as v(state, amount, is_baseline, confirmed, guest_name)
where not exists (select 1 from public.registry_pledges where is_baseline);

-- ---- public standings: percentages only ----
create or replace function public.registry_standings()
returns table (state text, pct numeric, rank int)
language sql
security definer
set search_path = public
as $$
  with totals as (
    select s.state,
           coalesce(sum(p.amount), 0) as total
    from (values ('Illinois'),('Texas'),('Colorado'),('Iowa')) as s(state)
    left join public.registry_pledges p on p.state = s.state
    group by s.state
  ), g as (
    select nullif(sum(total), 0) as grand from totals
  )
  select t.state,
         round(100.0 * t.total / coalesce((select grand from g), 1), 1) as pct,
         rank() over (order by t.total desc)::int as rank
  from totals t
  order by t.total desc, t.state;
$$;
revoke execute on function public.registry_standings() from public;
grant execute on function public.registry_standings() to anon, authenticated;

-- ---- record a pledge, return the fresh standings ----
create or replace function public.registry_pledge(
  p_state text,
  p_amount numeric,
  p_name text default null,
  p_note text default null
) returns table (state text, pct numeric, rank int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state not in ('Illinois','Texas','Colorado','Iowa') then
    raise exception 'Unknown state';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception 'Amount must be between 1 and 100000';
  end if;

  insert into public.registry_pledges (state, amount, guest_name, note)
  values (p_state, round(p_amount, 2), nullif(btrim(p_name), ''), nullif(btrim(p_note), ''));

  return query select * from public.registry_standings();
end;
$$;
revoke execute on function public.registry_pledge(text, numeric, text, text) from public;
grant execute on function public.registry_pledge(text, numeric, text, text) to anon, authenticated;

-- ---- admin view: real amounts, names, confirmation state ----
create or replace function public.admin_list_pledges()
returns setof public.registry_pledges
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))) then
    raise exception 'Not authorized';
  end if;
  return query select * from public.registry_pledges order by created_at desc;
end;
$$;
revoke execute on function public.admin_list_pledges() from public, anon;
grant execute on function public.admin_list_pledges() to authenticated;

select * from public.registry_standings();
