# Buyer's Packet — The NEXUS Team

Web app for The NEXUS Team agent (Nikki, Keller Williams DTC) to generate
property buyer's packets and share them with clients via a private login.

## Stack

- **Next.js 16** (App Router) + React 19, TypeScript, Tailwind CSS v4
- **Supabase** — Postgres + Auth (magic-link email), RLS-protected tables
- **Vercel** — hosting
- **RentCast** — public property records API (beds/baths/sqft/tax history)
- **Census ACS 2022** — ZIP-level demographics (free, no key)
- **Resend** — Supabase SMTP provider for magic-link emails

## Local development

```bash
npm install
cp .env.example .env.local      # fill in real values
node scripts/run-migrations.mjs # one-time, applies SQL to your Supabase
npm run dev
```

Then open http://localhost:3000.

## Routes

| Route | Who | What |
|---|---|---|
| `/` | Anyone | Auth-aware redirect → `/login`, `/agent`, or `/buyer` |
| `/login` | Public | Magic-link sign-in form |
| `/auth/callback` | — | Magic-link return target; routes by email |
| `/agent` | Agent | Buyers list + `+ New buyer` |
| `/agent/buyers/[id]` | Agent | One buyer's detail + properties list |
| `/agent/buyers/[id]/properties/[propId]` | Agent | Property packet editor (form + preview) |
| `/buyer` | Buyer | List of properties prepared for them |
| `/buyer/properties/[id]` | Buyer | Read-only packet with auto-saving checklist |

## Auth model

Single-agent v1: `nikki@kw.com` is hardcoded as the agent in
[`src/lib/auth.ts`](src/lib/auth.ts) and mirrored in the `is_agent()`
SQL function ([`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)).
Anyone else logging in is treated as a buyer. RLS scopes buyers to their
own properties (matched by email on `buyers.email`).

## Database schema

Two tables, both RLS-protected:

- `buyers` — id, full_name, email, phone, notes, timestamps
- `properties` — id, buyer_id (cascade), address fields, packet_data jsonb

The packet UI state (every form field including the buyer's checklist
state) is serialized to `packet_data` jsonb on save.

## Deployment

The app is deployed on Vercel and auto-deploys from `main`. Required
env vars are listed in `.env.example`.

After deploying, configure Supabase **Authentication → URL Configuration**:

- Site URL: the Vercel production URL
- Redirect URLs: include `https://your-vercel-url/auth/callback`

## Notes for future development

- The `/api/dev-login` route + the "DEV MODE" block on `/login` are
  guarded by `NODE_ENV !== "production"` and are tree-shaken in
  production builds. Safe to keep during development.
- `/.cache/property-lookup.json` caches RentCast responses locally to
  avoid burning quota during development.
- All listing photos are agent-pasted URLs or uploaded data URLs;
  Zillow image URLs typically work but may CSP-block on some setups.
