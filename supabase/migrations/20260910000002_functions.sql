-- =============================================================================
-- Helper functions, triggers and the ranking view.
--
-- The SECURITY DEFINER helpers exist to cut RLS recursion: policies on `topics`
-- and `votes` need to read `sessions`, and doing that with a bare
-- `exists (select 1 from sessions ...)` inside a policy makes the planner
-- evaluate sessions' own RLS on every check -- extra work, and a real recursion
-- hazard the moment someone adds a sessions policy referencing topics.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- New auth users (including anonymous ones) get a profile row
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Admin identity: a table flag, not a JWT claim.
--
-- A custom claim is baked into a JWT for its full TTL, so revoking an admin
-- mid-conference would mean waiting for a refresh. A table read is revoked the
-- instant you flip the boolean. The per-row cost is neutralised by calling this
-- as `(select public.is_admin())` in policies, which Postgres hoists to an
-- InitPlan evaluated once per statement.
--
-- The is_anonymous check means an anonymous user can never be an admin, even if
-- a profiles row were somehow corrupted.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select p.is_admin
       from public.profiles p
      where p.id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false),
    false);
$$;

-- -----------------------------------------------------------------------------
-- Session/phase helpers
-- -----------------------------------------------------------------------------
create or replace function public.active_session_id()
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id from public.sessions s where s.archived_at is null limit 1;
$$;

create or replace function public.current_phase(p_session uuid)
returns public.session_phase
language sql stable security definer set search_path = public, pg_temp as $$
  select s.phase from public.sessions s where s.id = p_session;
$$;

-- Phase AND deadline, with 5s grace for network latency and clock skew.
create or replace function public.proposals_accepting(p_session uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.sessions s
     where s.id = p_session
       and s.phase = 'proposals_open'
       and (s.proposals_deadline is null
            or now() < s.proposals_deadline + interval '5 seconds')
  );
$$;

-- Clock-skew correction for the countdown: phones can be minutes off, and every
-- device in the room must show the same number.
create or replace function public.server_now()
returns timestamptz
language sql stable as $$ select now() $$;

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger topics_touch
  before update on public.topics
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Vote counters
-- -----------------------------------------------------------------------------

-- Every topic gets a counter row at birth, so downstream joins never need a
-- LEFT JOIN and the ranking view can use a plain join.
create or replace function public.tvc_init()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.topic_vote_counts (topic_id, session_id)
  values (new.id, new.session_id)
  on conflict (topic_id) do nothing;
  return new;
end $$;

create trigger topics_tvc_init
  after insert on public.topics
  for each row execute function public.tvc_init();

-- The `update of topic_id` branch is what makes merge_topics() correct: moving a
-- vote to the surviving topic moves its count along with it.
create or replace function public.tvc_apply()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (tg_op = 'INSERT') then
    update public.topic_vote_counts
       set votes = votes + 1, updated_at = now()
     where topic_id = new.topic_id;

  elsif (tg_op = 'DELETE') then
    update public.topic_vote_counts
       set votes = greatest(votes - 1, 0), updated_at = now()
     where topic_id = old.topic_id;

  elsif (tg_op = 'UPDATE' and new.topic_id is distinct from old.topic_id) then
    update public.topic_vote_counts
       set votes = greatest(votes - 1, 0), updated_at = now()
     where topic_id = old.topic_id;
    update public.topic_vote_counts
       set votes = votes + 1, updated_at = now()
     where topic_id = new.topic_id;
  end if;
  return null;
end $$;

create trigger votes_tvc
  after insert or delete or update of topic_id on public.votes
  for each row execute function public.tvc_apply();

-- -----------------------------------------------------------------------------
-- Ranking view
--
-- security_invoker = true is LOAD-BEARING. Without it the view runs as its owner
-- and silently bypasses the RLS that embargoes tallies while voting is open.
--
-- Ties break by earliest proposal -- first to think of it gets the better room --
-- with id as a stable final tiebreak so ordering is deterministic across queries.
-- Not materialised: ~60 rows, and refresh timing would become a bug you debug on
-- stage.
-- -----------------------------------------------------------------------------
create or replace view public.topic_rankings
with (security_invoker = true) as
select
  t.id,
  t.session_id,
  t.title,
  t.source,
  t.created_at,
  c.votes,
  row_number() over (
    partition by t.session_id
    order by c.votes desc, t.created_at asc, t.id asc
  ) as rank
from public.topics t
join public.topic_vote_counts c on c.topic_id = t.id
where t.status = 'active';
