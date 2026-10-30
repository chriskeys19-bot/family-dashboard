# Home Board

Family schedule for Ben, Sangeetha, Yuvan, and Varun. The static site can run in **demo mode** on GitHub Pages before Supabase is connected. After setup, the same pages read Postgres through a shared-password session.

Expected Pages URL, once the workflow below has succeeded:

**https://chriskeys19-bot.github.io/family-dashboard/**

## Demo mode

`site/js/config.js` ships with empty `SUPABASE_URL` and `SUPABASE_ANON_KEY`. That is demo mode:

- Schedule, categories, and the daily boost come from bundled JSON.
- Writes (requests, meals, training, check-offs, category edits) stay in this browser’s `localStorage`.
- The password gate still appears. The demo password is `family` (public, in `config.js`). It is not the real password.
- The family photo is a gradient with the four names. No image is fetched.
- Snap meal uses a stubbed estimate so the review screen works without Gemini.

## What you see

Time ranges are rolling windows in **America/Los_Angeles**, starting today: 3 days, 7 days, and one calendar month.

Parents get the whole family plus Yuvan and Varun tabs. A kid profile shows only that kid’s events, meals, training, recap, and boost. Category sections come from the editable categories list. Multi-day tournaments render once. Overlapping items for the same kid are flagged.

Yesterday’s recap (top of a kid view, and both kids for a parent) counts what was checked off, meals logged, and training, then offers at most two short suggestions.

Daily boost changes with the Pacific date. Each list is at least 120 entries. A person walks the list in order and does not repeat an entry until the list is exhausted. Yuvan and Varun are offset by one, so they never get the same line on the same day. Parents get a quote, a calm line, and a coaching tip.

## Photo banner

The Mount Rushmore portrait is **not in this repo** and is **not in the Pages build**. The deploy workflow fails if a JPEG, PNG, or WebP shows up under `site/`.

After a real sign-in, the home view asks Supabase Storage for a one-hour signed URL for the private object `family-banner.jpg` in the bucket `family-media`. The banner is a vertical 3:4 frame (max 420px wide, max 70vh tall) so the upright portrait is shown whole.

Upload steps are in [Supabase setup](#supabase-setup) below. Until that file exists, the live site falls back to the same gradient placeholder.

## Meals

Typed meals call the `fdc-lookup` function (USDA FoodData Central). The kid picks among about three matches, chooses a portion, and saves an **estimate**.

**Snap meal** is the photo path, next to the typed one:

1. The button is a camera input: `accept="image/*"` and `capture="environment"`.
2. The browser resizes the picture to about 1024px JPEG.
3. The JPEG uploads to the private bucket `meal-photos` (path `{person}/{uuid}.jpg`).
4. The `photo-meal` function checks the monthly cap, reads the object with the service role, and calls Gemini (`gemini-3.5-flash-lite` unless `GEMINI_MODEL` is set) with a JSON schema: items `{name, portion, calories, protein_g, carbs_g, fat_g}`, totals, and confidence.
5. The kid can edit the rows, then Save. The row lands in `nutrition_entries` with `source = 'photo'` and `photo_path` set. Everything is labeled an estimate.
6. Parents see a thumbnail via a signed URL (only after the password gate) plus the breakdown, on the family view and on that kid’s tab.

The cap defaults to **600 photos per Pacific month** (`PHOTO_MONTHLY_CAP`). It is enforced in the function with `reserve_photo_credit`, and released if Gemini fails. Demo mode never uploads and never calls Gemini.

## Adding a module

Core layout only loops the registry. It does not name schedule, nutrition, or training.

1. Add `site/js/modules/your-module.js` that calls `registerModule` with `id`, `label`, `dataTable`, `sortOrder`, `renderEntryForm(ctx)`, and `render(ctx, host)`.
2. Import that file from `site/js/modules/index.js`.

`renderEntryForm` returns a button or `null`. `render` draws that module’s rows into the host. Daily boost and yesterday recap are registered the same way. The photo banner is shell chrome, not a module, because it is one signed image rather than a table of day items.

## Project layout

```
site/                 static app (this is what Pages publishes)
  js/config.js        SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_PASSWORD
  js/modules/         registry modules
  data/seed.json      demo schedule
  data/boost.json     demo daily-boost bank
supabase/migrations   schema, RLS, private buckets
supabase/seed.sql     people, categories, events
supabase/functions    auth-gate, fdc-lookup, event-requests, photo-meal
```

## Run locally

```bash
npm install
npm start
```

Open http://127.0.0.1:4173 and use the password `family`.

```bash
npm test
```

Playwright covers iPhone 14 (WebKit) and Pixel 7 (Chromium): password gate, profile filtering, all three ranges, category grouping, social requests, USDA disambiguation, photo meals, training, check-offs, recap, boost, and the placeholder banner. Screenshots land in `artifacts/screenshots/` and are uploaded by the Tests workflow.

Regenerate data after editing the generators:

```bash
node scripts/generate-seed.mjs
node scripts/build-boost.mjs
```

## Supabase setup

Create a project, then:

### 1. Schema

In the SQL editor, run, in order:

- `supabase/migrations/20261030120000_init.sql`
- `supabase/migrations/20261030150000_completions_content_media.sql`
- `supabase/migrations/20261030160000_meal_photos.sql`
- `supabase/seed.sql`

Or, with the CLI: `supabase link --project-ref <ref>` and `supabase db push` (this needs the database password).

### 2. Secrets

```bash
supabase secrets set \
  DASHBOARD_PASSWORD='a long passphrase Ben can change later' \
  JWT_SECRET='the legacy JWT secret from Project Settings → API' \
  FDC_API_KEY='your FoodData Central key' \
  GEMINI_API_KEY='a paid-tier Gemini API key' \
  GEMINI_MODEL='gemini-3.5-flash-lite' \
  PHOTO_MONTHLY_CAP='600' \
  ASSISTANT_TOKEN='optional token for the calendar assistant'
```

`DASHBOARD_PASSWORD` is the real gate. Change it with another `secrets set`. Existing sessions last 7 days; locking the phone clears the token on that device.

`JWT_SECRET` must be the project’s **legacy JWT secret** (Settings → API). The auth-gate function signs an HS256 session with it (`role: authenticated`, `dashboard_access: true`). PostgREST and Storage accept that token. If the project has legacy JWT signing turned off, turn the legacy secret back on. Asymmetric signing keys cannot be used as this HMAC secret.

`GEMINI_API_KEY` is a Google AI / Gemini key on a **paid** project. The function calls `generativelanguage.googleapis.com` and never puts the key in the browser. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`.

`FDC_API_KEY` is a USDA FoodData Central key.

`ASSISTANT_TOKEN` is optional. Without it, the assistant can still call `auth-gate` with the family password and use that session.

`JOURNAL_EXPORT_TOKEN` protects `journal-export`. A nightly job sends it as `x-journal-token`. The function returns one kid’s Pacific day: check-offs, cricket reflections, runs, meals and totals, notes, needs added or updated that day, and the recap of that day.

The service role key is injected into Edge Functions by Supabase. Do not copy it into `config.js` or git.

### 3. Deploy functions

You need a [personal access token](https://supabase.com/dashboard/account/tokens) as `SUPABASE_ACCESS_TOKEN`, plus the project ref. The service role key is **not** required to deploy.

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
supabase link --project-ref <ref>
supabase functions deploy auth-gate --no-verify-jwt
supabase functions deploy fdc-lookup --no-verify-jwt
supabase functions deploy event-requests --no-verify-jwt
supabase functions deploy photo-meal --no-verify-jwt
supabase functions deploy journal-export --no-verify-jwt
```

`--no-verify-jwt` is required. `auth-gate` is public so the password exchange can happen. The other functions check the dashboard JWT (or, for event requests, `ASSISTANT_TOKEN`) themselves.

### 4. Point the site at the project

In `site/js/config.js` set:

- `SUPABASE_URL` — Project URL
- `SUPABASE_ANON_KEY` — the anon public key

Those two are public by design. Commit them when you are ready for Pages to leave demo mode. Do not put `DASHBOARD_PASSWORD`, `JWT_SECRET`, `GEMINI_API_KEY`, `FDC_API_KEY`, or the service role key in that file.

### 5. Upload the family banner

After the migrations have created the bucket:

1. Open the Supabase dashboard → **Storage**.
2. Open **family-media**. It should say **Private**. Do not toggle it to public.
3. Upload the portrait and name the object exactly `family-banner.jpg`.
4. Do not commit that file, and do not put it under `site/`.

Meal photos are uploaded by the app into **meal-photos**, also private. You do not upload those by hand.

### 6. Optional: copy the boost bank into Postgres

```bash
node scripts/export-boost-sql.mjs > /tmp/boost.sql
```

Run that SQL in the editor. When `daily_content` has rows, the app uses them instead of `site/data/boost.json`.

## Calendar assistant

The site does not send email or create invites. Poll pending kid requests:

```bash
curl -s \
  -H "x-assistant-token: $ASSISTANT_TOKEN" \
  "https://<ref>.supabase.co/functions/v1/event-requests?status=pending"
```

Mark one handled after you have drafted the invite for a parent:

```bash
curl -s -X POST \
  -H "content-type: application/json" \
  -H "x-assistant-token: $ASSISTANT_TOKEN" \
  -d '{"action":"mark_handled","id":"<request id>"}' \
  "https://<ref>.supabase.co/functions/v1/event-requests"
```

A dashboard session token from `auth-gate` works in `Authorization: Bearer` as well.

Nightly journal for one kid (the token is not the family password):

```bash
curl -s \
  -H "x-journal-token: $JOURNAL_EXPORT_TOKEN" \
  "https://<ref>.supabase.co/functions/v1/journal-export?person_id=yuvan&date=2026-10-30"
```

## GitHub Pages

`.github/workflows/pages.yml` deploys the `site/` directory on every push to `main`, using the official Pages actions.

GitHub still requires the repo source to be **GitHub Actions** before the first deploy can succeed. If the workflow fails with a Pages source error:

1. Open this repo on GitHub.
2. **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Re-run **Deploy GitHub Pages**.

The workflow cannot flip that setting by itself. After it is set, pushes to `main` publish to:

https://chriskeys19-bot.github.io/family-dashboard/

## Access model

One shared password protects the data. The anon key alone cannot read tables or the private buckets; RLS and Storage policies require `dashboard_access` on the JWT. Profile choice (Ben, Sangeetha, Yuvan, Varun) filters the view. It is not a separate account: anyone who knows the password can request every row. Kid check-offs are enforced in the UI (a kid can only tick their own person id). Parents see completion state and cannot tick from a parent profile.

## Credentials, short version

| Credential | Needed to deploy? | Where it lives |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Yes, for the CLI (`link`, `db push`, `secrets set`, `functions deploy`) | Your shell, never git |
| Project ref | Yes | Dashboard → Project settings |
| Database password | Yes for `supabase db push` / `link`. Not needed if you paste SQL in the editor | Dashboard |
| `DASHBOARD_PASSWORD` | Set as a function secret, not a CLI login | Supabase secrets |
| `JWT_SECRET` | Function secret; copy of the legacy JWT secret | Supabase secrets |
| `FDC_API_KEY` | Function secret | Supabase secrets |
| `GEMINI_API_KEY` | Function secret, paid tier | Supabase secrets |
| `GEMINI_MODEL`, `PHOTO_MONTHLY_CAP` | Optional function secrets | Supabase secrets |
| `ASSISTANT_TOKEN` | Optional function secret | Supabase secrets |
| `JOURNAL_EXPORT_TOKEN` | Function secret for the nightly journal pull | Supabase secrets |
| URL + anon key | Not for deploy; required for the live site | `site/js/config.js` |
| Service role key | **No.** Injected into functions at runtime. Do not put it in the app | Supabase only |
