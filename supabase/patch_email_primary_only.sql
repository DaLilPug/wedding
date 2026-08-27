-- =========================================================
--  submit_rsvp: write the email to the primary guest only
--  Run once in the Supabase SQL editor.
--
--  Why: the RSVP form asks for one phone and one email per party,
--  and they belong to whoever filled the form in, which is the
--  primary guest. Phone was already primary-only (see
--  patch_phone_primary_only.sql); email was still being stamped
--  onto every member, so a plus one ended up holding an address
--  that is not theirs.
--
--  note and address stay party-wide on purpose: a note is from the
--  party, and an address is the household's.
--
--  No backslashes anywhere: they get mangled pasting into the
--  dashboard editor.
-- =========================================================

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
as $fn$
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

  -- party-wide: the note is from the party, the address is the household's
  update public.guests
     set note    = coalesce(nullif(btrim(p_note),  ''), note),
         address = coalesce(nullif(btrim(p_address), ''), address)
   where party_key = p_party_key;

  -- primary guest only: these are the contact details of whoever filled
  -- in the form, and must never overwrite a plus one's own phone or email
  update public.guests
     set phone = coalesce(nullif(btrim(p_phone), ''), phone),
         email = coalesce(nullif(btrim(p_email), ''), email)
   where party_key = p_party_key
     and is_plus_one = false;
end;
$fn$;

grant execute on function public.submit_rsvp(text, jsonb, text, text, text, text) to anon, authenticated;

-- Show what a party looks like after the change, names withheld.
select is_plus_one,
       count(*)                                   as people,
       count(*) filter (where email is not null)  as with_email,
       count(*) filter (where phone is not null)  as with_phone
from public.guests
group by is_plus_one
order by is_plus_one;
