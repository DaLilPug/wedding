-- =========================================================
--  Reminder content: the invite and the nudges that follow it.
--  Run once in the Supabase SQL editor. Safe to re-run: each
--  insert is skipped if a reminder with that subject exists.
--
--  {{first}} becomes the guest's first name, plus the first names
--  of anyone in their party who has no number of their own, so a
--  couple sharing one phone gets "Linda & John".
--
--  The invite is parked on 2026-09-30 on purpose. Send it from the
--  dashboard with "Send now" once a test text has actually landed
--  on your own phone. The date is only a backstop so it cannot be
--  forgotten entirely.
-- =========================================================

insert into public.reminders (send_on, audience, channel, subject, body, sms_body)
select '2026-09-30'::date, 'all', 'both',
  'We are getting married - April 23, 2027',
  '{{first}},

Ana and I are getting married, and we would love for you to be there.

Friday, April 23, 2027
Promontory Point, Burnham Park, Chicago
Four in the afternoon

Everything you need is on the site: the schedule, the venue, where to stay, and your RSVP. Search your name and it will pull up your whole party.

We know a Friday is a big ask. We picked it because it is the day we could get the Point, and because we would rather have you there than anywhere else. You have plenty of notice to take the afternoon off.

More to come as the day gets closer. Thank you for being someone we want in the room.

Austin and Ana',
  '{{first}} - Ana and I are getting married! Friday, April 23, 2027 at Promontory Point in Chicago. Everything is here, including your RSVP: sabellawedding.com Hope you can be there.'
where not exists (select 1 from public.reminders where subject = 'We are getting married - April 23, 2027');

insert into public.reminders (send_on, audience, channel, subject, body, sms_body)
select '2027-01-15'::date, 'not_responded', 'both',
  'Still need your RSVP - April 23',
  '{{first}},

A gentle nudge: we still have you down as undecided for April 23, and we are starting to work out the head count.

It takes about a minute. Search your name at sabellawedding.com and it will find your whole party.

If the answer is no, that is completely fine, we would just rather know than guess.

Austin and Ana',
  '{{first}} - gentle nudge from Austin and Ana. We still need your RSVP for April 23. Takes about a minute: sabellawedding.com'
where not exists (select 1 from public.reminders where subject = 'Still need your RSVP - April 23');

insert into public.reminders (send_on, audience, channel, subject, body, sms_body)
select '2027-03-15'::date, 'not_responded', 'both',
  'Last call on the head count',
  '{{first}},

This is the last time we will ask, promise. We have to give the caterer a final number, so if we do not hear from you by the end of the month we will assume you cannot make it.

One minute at sabellawedding.com and you are done.

Either way, thank you.

Austin and Ana',
  '{{first}} - last call on the head count for April 23. If we do not hear from you by month end we will assume you cannot make it. One minute: sabellawedding.com'
where not exists (select 1 from public.reminders where subject = 'Last call on the head count');

insert into public.reminders (send_on, audience, channel, subject, body, sms_body)
select '2027-04-19'::date, 'attending', 'both',
  'Four days out - everything you need for Friday',
  '{{first}},

Friday is nearly here. Everything you need:

Promontory Point, Burnham Park, Chicago. Ceremony at four in the afternoon, so give yourself a little time to find us and park.

The full schedule, parking, where to stay, and what we do if the weather turns are all at sabellawedding.com.

It is Chicago in April, so bring a layer. The Point is right on the lake and it gets cool once the sun drops.

We cannot wait to see you.

Austin and Ana',
  '{{first}} - four days out! Friday April 23, Promontory Point. Ceremony at 4, come a little early. Parking, weather plan, full schedule: sabellawedding.com'
where not exists (select 1 from public.reminders where subject = 'Four days out - everything you need for Friday');

select send_on, audience, channel, subject,
       length(sms_body) as sms_chars,
       sent_at
from public.reminders
order by send_on;
