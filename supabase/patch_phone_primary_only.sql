-- Phone updates from the RSVP form apply to the PRIMARY guest only,
-- so a typed number never overwrites a plus-one's own saved number.
-- (Email, address, and note remain shared across the party.)
create or replace function public.submit_rsvp(
  p_party_key text,
  p_responses jsonb,
  p_email text,
  p_phone text,
  p_note text,
  p_address text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(p_responses)
  loop
    update public.guests
       set attending    = (r->>'attending')::boolean,
           meal         = nullif(r->>'meal', ''),
           responded_at = now()
     where id = (r->>'id')::uuid
       and party_key = p_party_key;
  end loop;

  update public.guests
     set email   = coalesce(nullif(btrim(p_email), ''), email),
         note    = coalesce(nullif(btrim(p_note),  ''), note),
         address = coalesce(nullif(btrim(p_address), ''), address)
   where party_key = p_party_key;

  update public.guests
     set phone = coalesce(nullif(btrim(p_phone), ''), phone)
   where party_key = p_party_key
     and is_plus_one = false;
end;
$$;
