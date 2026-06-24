-- ============================================================
--  Admin guest management + one-time bulk import
--  Run once in the Supabase SQL editor.
-- ============================================================

-- Add or edit a guest (allow-listed admins only)
create or replace function public.admin_save_guest(
  p_id uuid, p_party_key text, p_full_name text, p_is_plus_one boolean, p_phone text
) returns public.guests
language plpgsql security definer set search_path = public as $$
declare result public.guests;
begin
  if not exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))) then
    raise exception 'Not authorized';
  end if;
  if p_id is null then
    insert into public.guests (party_key, full_name, is_plus_one, phone)
    values (
      coalesce(nullif(btrim(p_party_key),''), 'party-' || substr(replace(gen_random_uuid()::text,'-',''),1,8)),
      btrim(p_full_name), coalesce(p_is_plus_one,false), nullif(btrim(p_phone),'')
    ) returning * into result;
  else
    update public.guests set
      party_key   = coalesce(nullif(btrim(p_party_key),''), party_key),
      full_name   = btrim(p_full_name),
      is_plus_one = coalesce(p_is_plus_one,false),
      phone       = nullif(btrim(p_phone),'')
    where id = p_id returning * into result;
  end if;
  return result;
end $$;
grant execute on function public.admin_save_guest(uuid, text, text, boolean, text) to authenticated;

-- Delete a guest (allow-listed admins only)
create or replace function public.admin_delete_guest(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))) then
    raise exception 'Not authorized';
  end if;
  delete from public.guests where id = p_id;
end $$;
grant execute on function public.admin_delete_guest(uuid) to authenticated;

-- TEMPORARY one-time bulk import. Dropped immediately after the import runs.
create or replace function public.import_guests_bulk(p jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare g jsonb; n int := 0;
begin
  for g in select * from jsonb_array_elements(p) loop
    insert into public.guests (party_key, full_name, is_plus_one)
    values (g->>'party_key', g->>'full_name', coalesce((g->>'is_plus_one')::boolean, false));
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.import_guests_bulk(jsonb) to anon, authenticated;
