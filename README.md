# Austin & Anastasiia  -  Wedding Website

A fast, static wedding site (no build step) with a guest search + RSVP that
saves to a free Supabase database. Everything you'd touch lives in plain HTML,
CSS, and one config file.

```
index.html            the whole page (edit text + photo spots here)
css/styles.css         all styling
js/config.js           <-- the only file you must edit to go live
js/main.js             countdown, nav, scroll effects
js/rsvp.js             guest search + RSVP logic
assets/photos/         drop your photos here (see that folder's README)
supabase/schema.sql    run once to create the database
supabase/guests_template.csv   your guest list, ready to import
```

The site works **right now in demo mode** (RSVP runs locally, logs to the
console) until you add your Supabase keys. So you can preview and edit content
first, then wire the database whenever you're ready.

---

## 1. Preview it locally

From this folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. (Opening `index.html` by double-click also
works, but a local server behaves more like the real thing.)

---

## 2. Set up the database (Supabase, free)

You're on the Supabase **Pro** plan on your main account, where extra projects
bill compute. To keep this wedding project at **$0**, do not create it under
your Pro organization. Instead:

> **In Supabase, create a new Organization on the *Free* plan** (top-left org
> switcher → New organization → Free), then create the project inside it.
> Projects under a Free org don't incur the per-project charge. No second email
> or login required. (A separate free account works too, if you prefer.)

Then:

1. New project → pick a region near your guests → set a database password (save it).
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon public**
   key into `js/config.js`:
   ```js
   supabaseUrl: "https://xxxxxxxx.supabase.co",
   supabaseAnonKey: "eyJhbGci...",
   ```
4. Reload the site. RSVP now reads and writes to your database.

### Load your guest list

1. Edit `supabase/guests_template.csv` with everyone's names + phone numbers.
   - Put two (or more) people in the **same `party_key`** to link them. Searching
     either name finds the whole party. Use any text for the key (e.g.
     `sabella-oliinyk`, `smith-household`).
   - Mark an open/unnamed plus-one with `is_plus_one` = `true` (e.g.
     `Guest of Morgan Lee`).
   - Leave `phone` blank if you don't have it yet.
2. In Supabase: **Table Editor → guests → Insert → Import data from CSV**, and
   upload your file.
3. Delete the sample `sabella-oliinyk` rows the schema created for testing if you
   don't want them in the list.

### See who's coming

Open **Table Editor → guests** anytime. `attending`, `email`, `phone`, `meal`,
and `note` fill in as people respond. To pull phone numbers for reminders, sort
or export the table to CSV from there.

---

## 3. Domain

Domain purchased: **sabellawedding.com**. Point it at GitHub Pages in step 4.

---

## 4. Put it online (GitHub Pages, free)

```bash
cd "C:\Users\austi\wedding-website"
git init
git add .
git commit -m "Wedding site"
git branch -M main
# create an empty repo named e.g. wedding on github.com first, then:
git remote add origin https://github.com/DaLilPug/wedding.git
git push -u origin main
```

In the repo on GitHub: **Settings → Pages → Build from a branch → `main` / root**.

### Connect your custom domain

1. **Settings → Pages → Custom domain**: enter your domain, Save. This creates a
   `CNAME` file in the repo.
2. At your registrar's DNS, for the apex domain `sabellawedding.com` add:
   ```
   A     @   185.199.108.153
   A     @   185.199.109.153
   A     @   185.199.110.153
   A     @   185.199.111.153
   CNAME www DaLilPug.github.io
   ```
3. Back in Pages, tick **Enforce HTTPS** once it's available (can take a bit).

DNS can take from a few minutes up to a day to propagate.

---

## 5. Make it yours

- **Text**: edit `index.html`. Placeholders are in `[brackets]` (venue, times,
  dress code, hotel, registry links, FAQ answers).
- **Photos**: see `assets/photos/README.md`.
- **Date/time**: `weddingDateISO` in `js/config.js` drives the countdown and the
  displayed date.
- **Meal choices**: add options to `mealOptions` in `js/config.js` to ask each
  attending guest for a meal preference. Leave it empty to skip.
- **RSVP note box**: toggle `askNote` in `js/config.js`.

Re-deploy any change with:
```bash
git add . && git commit -m "Update" && git push
```

---

## 6. Your RSVP dashboard (admin)

A private dashboard lives at `sabellawedding.com/admin.html`. It shows every
guest, who's attending, their email and phone, and lets you copy all phone
numbers or download a CSV for reminders. The page is public, but the guest data
is only returned to a signed-in, allow-listed account, so a stray visitor sees
only a login box.

One-time setup in Supabase:
1. **Authentication → Users → Add user**: create a login (email + password) for
   you and one for Anastasiia. Tick **Auto Confirm User**.
2. **SQL Editor**, run with your real addresses (this keeps emails out of the
   public repo):
   ```sql
   insert into public.admins (email) values
     ('austin@uptown.com'),
     ('anastasiia@example.com');
   ```

Then visit `/admin.html`, sign in, and you're looking at live RSVPs. Use the
filter box to narrow by name or party; "Copy phone numbers" and "Download CSV"
act on whatever is currently shown.
