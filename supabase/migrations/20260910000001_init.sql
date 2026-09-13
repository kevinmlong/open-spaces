-- =============================================================================
-- Open Spaces Manager -- core schema
--
-- Design notes that are load-bearing and easy to undo by accident:
--   * topics carries NO identity column. Proposals are anonymous by product
--     decision, and are unlimited, so there is nothing to store and nothing to
--     correlate.
--   * Vote counts live in their own table (see 20260910000002) because RLS is
--     row-level: a count column on `topics` could not be embargoed during voting.
--   * The "max 3 votes" rule is a unique index, not a counting trigger. A trigger
--     that reads count(*) then inserts has a TOCTOU race; the index has none.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;   -- powers similarity suggestions during curation

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.session_phase as enum (
  'draft',            -- created; attendees see a holding screen
  'proposals_open',   -- attendees may insert topics; countdown running
  'proposals_closed', -- read-only for attendees; admin curates
  'voting_open',      -- attendees cast exactly one ballot of up to 3 topics
  'voting_closed',    -- tallies revealed
  'scheduled',        -- assignments generated
  'archived'          -- frozen; a new active session may now exist
);

create type public.topic_status as enum ('active', 'merged', 'removed');
create type public.topic_source as enum ('attendee', 'mic');

-- -----------------------------------------------------------------------------
-- profiles -- one row per auth user, including anonymous ones
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create index profiles_admin_idx on public.profiles(id) where is_admin;

-- -----------------------------------------------------------------------------
-- sessions -- one Open Spaces block. At most one is non-archived at a time.
-- -----------------------------------------------------------------------------
create table public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  event_day          date,
  phase              public.session_phase not null default 'draft',

  -- Deadlines are server-authoritative. Clients render
  -- (proposals_deadline - serverNow()) and the server re-checks on insert, so a
  -- phone with a wrong clock or a stale tab cannot sneak a topic in.
  proposals_deadline timestamptz,
  voting_deadline    timestamptz,

  max_votes_per_voter smallint not null default 3
                        check (max_votes_per_voter between 1 and 3),

  rounds       smallint check (rounds between 1 and 12),
  rooms        smallint check (rooms  between 1 and 12),
  round_labels text[] not null default '{}',   -- ['Round 1 · 1:15pm', ...]
  room_names   text[] not null default '{}',   -- ['Chesapeake', 'Potomac', ...]

  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,

  constraint sessions_archive_consistent
    check ((phase = 'archived') = (archived_at is not null))
);

-- At most one non-archived session. Every live row indexes the same value (true),
-- so a second one collides. archive_session() swaps old->new inside one
-- transaction, so this holds at every statement boundary.
create unique index sessions_single_active_idx
  on public.sessions ((archived_at is null))
  where archived_at is null;

create index sessions_archived_idx on public.sessions(archived_at desc nulls first);

-- -----------------------------------------------------------------------------
-- topics -- title only, deliberately anonymous
-- -----------------------------------------------------------------------------
create table public.topics (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,

  title  text not null check (char_length(btrim(title)) between 3 and 120),
  source public.topic_source not null default 'attendee',

  -- Curation is soft state: nothing is ever deleted, so every action an organizer
  -- takes on stage is reversible.
  status               public.topic_status not null default 'active',
  merged_into_topic_id uuid references public.topics(id) on delete set null,
  moderation_note      text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint topics_merge_consistent
    check ((status = 'merged') = (merged_into_topic_id is not null)),
  constraint topics_no_self_merge
    check (merged_into_topic_id is distinct from id),

  -- Lets votes/assignments carry a composite FK proving they share a session.
  unique (id, session_id)
);

create index topics_feed_idx on public.topics(session_id, status, created_at desc);

-- No unique index on title: two people proposing "AI code review" is normal and
-- must not throw a database error at a nervous attendee. The trigram index powers
-- the admin's "these two look alike" suggestions instead.
create index topics_trgm_idx on public.topics using gin (title gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- ballots + votes
-- -----------------------------------------------------------------------------

-- One row per voter per session. This primary key IS the "vote only once" rule.
create table public.ballots (
  session_id   uuid not null references public.sessions(id) on delete cascade,
  voter_id     uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key (session_id, voter_id)
);

create table public.votes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  topic_id   uuid not null,
  voter_id   uuid not null references auth.users(id) on delete cascade,

  -- An ordinal, not a weight: every vote counts 1. Recording it costs nothing and
  -- leaves Borda scoring available later as a view change, not a migration.
  slot       smallint not null check (slot between 1 and 3),
  created_at timestamptz not null default now(),

  constraint votes_topic_fk foreign key (topic_id, session_id)
    references public.topics(id, session_id) on delete cascade,

  constraint votes_one_per_topic unique (session_id, voter_id, topic_id),
  -- 3 slots, each usable once => a 4th vote is physically impossible, with no race.
  constraint votes_one_per_slot  unique (session_id, voter_id, slot)
);

create index votes_topic_idx on public.votes(topic_id);
create index votes_voter_idx on public.votes(session_id, voter_id);

-- -----------------------------------------------------------------------------
-- topic_vote_counts -- separate table on purpose (see header note)
-- -----------------------------------------------------------------------------
create table public.topic_vote_counts (
  topic_id   uuid primary key references public.topics(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  votes      integer not null default 0 check (votes >= 0),
  updated_at timestamptz not null default now()
);

create index tvc_rank_idx on public.topic_vote_counts(session_id, votes desc);

-- -----------------------------------------------------------------------------
-- assignments -- the generated round x room grid
-- -----------------------------------------------------------------------------
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  topic_id    uuid not null,
  round_index smallint not null check (round_index >= 0),
  room_index  smallint not null check (room_index  >= 0),
  rank        integer  not null,     -- rank at the time of scheduling
  created_at  timestamptz not null default now(),

  constraint assignments_topic_fk foreign key (topic_id, session_id)
    references public.topics(id, session_id) on delete cascade,
  constraint assignments_one_slot  unique (session_id, round_index, room_index),
  constraint assignments_one_topic unique (session_id, topic_id)
);

-- -----------------------------------------------------------------------------
-- session_events -- audit trail; makes "who closed proposals?" answerable
-- -----------------------------------------------------------------------------
create table public.session_events (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  from_phase public.session_phase,
  to_phase   public.session_phase,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index session_events_idx on public.session_events(session_id, created_at desc);
