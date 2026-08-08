-- =========================================================
--  HOUSE FUND v2: any state is fair game
-- =========================================================
alter table public.registry_pledges drop constraint if exists registry_pledges_state_check;

create or replace function public.us_states() returns text[]
language sql immutable as $$
  select array[
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
    'District of Columbia','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas',
    'Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi',
    'Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York',
    'North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
    'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington',
    'West Virginia','Wisconsin','Wyoming']
$$;
grant execute on function public.us_states() to anon, authenticated;

alter table public.registry_pledges
  add constraint registry_pledges_state_check check (state = any (public.us_states()));

-- standings across every state that has received anything
create or replace function public.registry_standings()
returns table (state text, pct numeric, rank int)
language sql
security definer
set search_path = public
as $$
  with totals as (
    select p.state, sum(p.amount) as total
    from public.registry_pledges p
    group by p.state
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
  if p_state is null or not (btrim(p_state) = any (public.us_states())) then
    raise exception 'Unknown state';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception 'Amount must be between 1 and 100000';
  end if;

  insert into public.registry_pledges (state, amount, guest_name, note)
  values (btrim(p_state), round(p_amount, 2), nullif(btrim(p_name), ''), nullif(btrim(p_note), ''));

  return query select * from public.registry_standings();
end;
$$;
revoke execute on function public.registry_pledge(text, numeric, text, text) from public;
grant execute on function public.registry_pledge(text, numeric, text, text) to anon, authenticated;

select * from public.registry_standings();
