# Open Spaces Manager

Runs the Open Spaces / unconference flow live at **DC State of the Stack**
(Sep 16–17 2026, American Red Cross, Washington DC):

**propose → curate → vote → schedule → archive**

Attendees use it from their phones with **no login**. The main stage projector
updates in real time. An organizer drives the whole thing from an admin console.

- **Vite + Vue 3** SPA (Composition API, Pinia, vue-router)
- **TailwindCSS v4** — brand tokens shared with the conference site
- **Supabase** for everything: Postgres, Realtime, Auth, RLS. No custom server.

---

## Day-of runbook

**Everything the organizer does is on `/admin/run`.** In order:

| Step | What you click | What the room sees |
|---|---|---|
| 1 | **Open proposals** (set minutes) | Every phone shows a topic box and a countdown |
| 2 | 🎤 **Add from the mic** as people call topics out | Their topic appears with a 🎤 chip |
| 3 | **+2 min** if the queue is still going | The countdown extends everywhere |
| 4 | **Close proposals** | List locks |
| 5 | `/admin/curate` — merge duplicates | Merged topics disappear from the list |
| 6 | **Open voting** (set minutes) | Phones switch to the top-3 ballot |
| 7 | **Close voting** | Results reveal on every screen at once |
| 8 | `/admin/schedule` — set rounds × rooms, name the rooms, **Publish** | The grid appears on the screen and every phone |
| 9 | `/admin/sessions` — **Archive** before day 2 | Clean slate; day 1 data stays in the database |

Put `/display` on the projector and leave it. It shows the QR code at every
phase, so latecomers can always join.

### If something goes wrong

- **The screen looks frozen.** Check the connection badge. Amber "Reconnecting"
  means realtime dropped but the app has fallen back to polling every 5s — it
  still works, just a few seconds behind.
- **You get logged out.** There are two organizer accounts on purpose. Use the
  other one, on the other laptop.
- **Nothing works at all.** The Supabase SQL editor is the manual override:
  ```sql
  select id, name, phase from sessions where archived_at is null;
  select set_phase('<session-id>', 'voting_open', 10);
  select set_phase('<session-id>', 'voting_closed');
  select generate_schedule('<session-id>', 3, 5);
  ```
- **Worst case** is paper and a Sharpie. Say so out loud; the room will be fine.

### Pre-flight checklist

1. **Anonymous sign-in rate limit raised on the hosted project.** ← *the one that
   bites.* The whole venue shares one NAT IP and Supabase's default is ~30/hour,
   which locks the room out minutes after you open proposals. Dashboard → Auth →
   Rate Limits. Verify with `npm run simulate 150 20` **against the hosted
   project**, not just locally.
2. Both organizer accounts sign in, on the devices they'll actually use.
3. `supabase db push` applied to prod; active session is in `draft`.
4. Display laptop: wired or on a hotspot, screen sleep **off**, zoom set, tested
   on the real projector.
5. QR code on the holding slide.
6. Day 2's session is created by **archiving** day 1 — not before.

---

## Local development

Requires Docker and Node 22+.

```bash
npm install
npx supabase start          # Postgres + Realtime + Auth + PostgREST (5 containers)
npm run db:reset            # migrations + seed data
npm run seed:admin          # creates two local organizer accounts
npm run dev                 # localhost:5173, and http://<LAN-ip>:5173 for phones
```

> **The stack is deliberately trimmed.** Studio, Mailpit, analytics and the edge
> runtime are all disabled in `supabase/config.toml` — this project is developed
> against `psql` and the scripts in `scripts/`, there is no email, and there are
> no Edge Functions. That takes it from 12 containers to 5, which matters on a
> laptop already running a browser. Flip `[studio] enabled = true` and restart if
> you want the web UI.

`npx supabase status` prints the local URL and anon key. They belong in
`.env.local` (see `.env.example`).

> **Ports.** This project runs on **544xx**, not the Supabase defaults, so it can
> run alongside another local Supabase project. See `supabase/config.toml`.

Local organizer login: `organizer1@dcstateofthestack.org` / `openspaces-local-dev`.

**Test on real phones.** `vite.config.js` sets `server.host = true` for exactly
this reason — the mobile layout and iOS's habit of suspending websockets are
where the real bugs are, and neither shows up in a desktop browser.

### Verifying

```bash
npm test                    # scheduling math, incl. a property test
npm run test:policies       # RLS assertions -- the regression net that matters
npm run e2e                 # full lifecycle through the real API
npm run check:realtime      # proves live updates actually push
npm run check:presence      # proves the headcount counts people, not tabs
npm run check:archive       # proves screens follow the room into a new session
npm run check:display       # screenshots /display and asserts nothing is clipped
                            #   or stuck; writes display.png
npm run simulate 150 20     # 150 independent anonymous voters
```

`test:policies` resets the database first, so it always runs against a clean
slate. `e2e` and `check:realtime` are destructive too — they advance the session
through phases and archive it. All three are local-only.

To simulate several attendees by hand, use **separate browser profiles** —
anonymous identity lives in `localStorage`, so incognito windows and different
browsers each get their own, but two tabs in one profile share a ballot.

---

## How it works

### The phase is the only source of truth

`sessions.phase` moves through:

```
draft → proposals_open ⇄ proposals_closed → voting_open → voting_closed ⇄ scheduled
                                                 ▲              │
                                                 └── force only ┘
any → archived
```

Every view is a switch on that value, pushed over Realtime. The organizer clicks
once and every device in the room changes within ~200ms. Nothing keeps its own
idea of which screen it should be on.

Reopening proposals is deliberately allowed — the mic queue is always longer than
you planned.

### Attendees are anonymous, for real

`signInAnonymously()` gives each browser a genuine `auth.uid()` that RLS can
enforce against. There is **no identity column on `topics` at all** — no name, no
`created_by` — so a proposal genuinely cannot be traced back to a person.

Votes do record `voter_id`, because "one ballot each" needs it.

### One ballot, three picks — enforced by the schema

- `ballots` has primary key `(session_id, voter_id)`. That **is** the "vote once"
  rule.
- `votes` has `unique (session_id, voter_id, slot)` with `slot between 1 and 3`.
  Three slots, each usable once, so a fourth vote is *physically impossible*.
  A counting trigger would have a TOCTOU race here; a unique index cannot.
- `INSERT` on `votes`/`ballots` is **revoked**. `cast_ballot()` is the only door,
  and it reads `auth.uid()` internally, so a caller cannot vote as someone else.

Verified under load: 150 concurrent voters produced exactly 450 votes, 150
ballots, and zero voters over the limit.

### Tallies are embargoed, not just hidden

Counts live in `topic_vote_counts`, a **separate table**, for two reasons:

1. RLS is row-level. A count *column* on `topics` would be readable by anyone who
   can read the topic, so the embargo would be unenforceable.
2. That table is **not** in the Realtime publication. 300 voters × 3 votes is 900
   counter updates; as a published column that would be ~270,000 messages with an
   RLS check each, precisely when the venue wifi is worst. Unpublished, it's zero.

Attendees read **0 rows** from it while voting is open — by policy, not because
the UI politely declines to render them. `topic_rankings` is
`security_invoker = true` so the view can't be used to route around it.

### Curation is soft and reversible

Merge and remove set `status`, never delete. `merge_topics()` moves votes to the
survivor without double-counting anyone who picked both. Every action on stage is
one click from being undone.

Duplicate detection is a `pg_trgm` similarity query. It only ever *suggests*
pairs — the organizer decides. No API key, no network call, nothing to fail while
you're standing in front of a room.

### The schedule spreads the winners

Rank *i* (0-based) → `round = i % rounds`, `room = floor(i / rounds)`.

With 3 rounds, the top three topics land in Room 1 of Rounds 1, 2 and 3 — so the
most popular sessions **never compete with each other**. #4–6 fill Room 2, and so
on. The admin previews the exact grid before publishing.

### Built for bad wifi

- Full **resync on every reconnect** — realtime never replays what you missed.
- **5s polling fallback** the moment the channel errors, so a dead socket
  degrades to a slower app rather than a frozen one.
- **Jittered backoff** — when the venue AP reboots, 300 devices reconnect at once.
- Optimistic topic submission; ballots are idempotent (a retry that hits
  `already_voted` is treated as success).
- `/display` says so on screen if it has gone stale.

### The projector: newest idea first, then the wall

`/display` puts the **newest topic front and centre** in large pink type. That is
the moment that matters -- someone has just typed a thought and wants to see it
land in front of the room. Everything proposed before it sits below in a masonry
grid that scrolls gently when it outgrows the screen, and resets to the top
whenever a topic arrives so nothing new is hidden below the fold.

Masonry is CSS multi-column rather than a grid library: titles are variable
length and columns pack them by height for free. `break-inside-avoid` is what
stops a card being sliced across a column boundary.

Column count and type size both scale with how full the wall is -- three topics
read large and sparse, forty pack into four tighter columns. That maths lives in
`src/lib/wall.js` and is unit-tested, including the invariant that the hero
always outsizes a wall item of the same length so the two never compete.

### Archiving hands the whole room over

When the organizer archives day 1 and starts day 2, every screen has to follow.
That is harder than it sounds: each client's realtime channel is filtered to one
session id, and **attendees cannot see archived sessions at all** under RLS — so
the UPDATE that archives the session may never reach them. A client relying on
that event sits on stale content forever.

The reliable signal is the *new* session's INSERT, which is visible to everyone
the moment it exists. Clients listen for it unfiltered, re-fetch the active
session, and re-subscribe to the new channel; ballots reset so a day-1 voter
isn't marked as having voted on day 2. A 30s poll backs it up, because a
projector quietly showing yesterday's topics is the kind of failure nobody
notices until someone points at it.

`npm run check:archive` drives this end to end in a real browser.

### "In the room" counts people, not tabs

Attendee pages **track** presence; the projector only **observes** it, so the big
screen never counts itself. The presence key is the attendee's anonymous auth id,
and that id lives in `localStorage` — so two tabs in the same browser are one
identity and count as **one person**, which is the honest number for a headcount.

Two separate devices, or two different browser profiles, count as two. Organizer
consoles are not counted; they are running the room, not in the audience.

---

## Layout

```
src/
  lib/supabase.js          singleton client; throws at import if env is missing
  lib/schedule.js          the spread math, shared by preview and tests
  stores/                  auth · session (source of truth) · topics · ballot · results
  composables/
    useSessionChannel.js   subscribe, resync, reconnect, polling fallback
    useCountdown.js        server-corrected countdown (phones have wrong clocks)
  views/                   AttendeeView · DisplayView · ScheduleView · admin/*
supabase/migrations/       schema · functions · RLS · RPCs · realtime
tests/policies.sql         RLS assertions
scripts/                   seed-admin · e2e-lifecycle · check-realtime · simulate-voters
```

## Deployment

Fly.io, built and deployed by GitHub Actions on every push to `main`.

### One-time setup

```bash
fly launch --no-deploy          # or: fly apps create dcsots-open-spaces
fly tokens create deploy -a dcsots-open-spaces
```

Then in the GitHub repo (Settings → Secrets and variables → Actions):

| Name | Kind | Value |
|---|---|---|
| `FLY_API_TOKEN` | **secret** | the deploy token from above |
| `VITE_SUPABASE_URL` | **variable** | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **variable** | the project's anon key |

The two Supabase values are **variables, not secrets**, deliberately. Both are
public — the anon key only carries `role: anon` and RLS is the real boundary —
and GitHub masks secrets in logs, which turns a bad deploy into a guessing game.
The `service_role` key must never appear in either list.

### Why the values are build args

This is a static SPA: there is no server at runtime to read `process.env`. Vite
**inlines** `import.meta.env.VITE_*` into the bundle during `npm run build`, so
the values have to exist inside the image while it builds — hence `--build-arg`,
not Fly secrets. `src/lib/supabase.js` throws on import when they are missing,
so a misconfigured build fails in CI instead of serving a white screen.

(`docker build` warns `SecretsUsedInArgOrEnv` for the anon key. It is a generic
warning about build args, and is expected here: the value is public by design.)

### What the image does

Multi-stage: `node:22-alpine` builds, `nginx-unprivileged:1.27-alpine` serves —
non-root on port 8080, ~52MB. `index.html` is served `no-store` so a hotfix
reaches every device on the next refresh, while `/assets/*` (content-hashed) is
`immutable` for a year. `/healthz` backs the Fly health check.

`fly.toml` runs **two always-on machines** in `iad` with `auto_stop_machines`
off. A cold start in front of a live audience is not acceptable, and two
shared-cpu machines cost a couple of dollars for the week.

### Migrations are not in CI

Run `supabase db push` **by hand**, deliberately, before the event. An automatic
migration on every push to `main` is how you drop a table during a keynote.
