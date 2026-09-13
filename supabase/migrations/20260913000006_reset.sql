-- =============================================================================
-- Session reset.
--
-- This DELETES. It is not archive_session(), which preserves everything and
-- hands the room a fresh session -- that remains the right tool for Day 1 ->
-- Day 2. Reset exists for two other situations:
--
--   * rehearsal, where archiving after every run piles up junk sessions
--   * recovery, when something went wrong live (voting opened early and real
--     ballots landed, a schedule was published from the wrong numbers) and the
--     organizer needs to put this session back a step and redo it
--
-- Because it is recovery, it deliberately bypasses the set_phase() transition
-- matrix: rewinding from voting_open back to proposals_open is exactly the move
-- the matrix forbids in normal operation.
-- =============================================================================

create type public.reset_scope as enum (
  'schedule',  -- drop the generated grid, keep votes
  'votes',     -- drop ballots and votes, keep the topics
  'topics',    -- drop every topic (and with them the votes and grid)
  'all'        -- back to an empty draft session
);

create or replace function public.reset_session(
  p_session uuid,
  p_scope   public.reset_scope
) returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s       public.sessions;
  removed jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into s from public.sessions where id = p_session for update;
  if s.id is null then
    raise exception 'no_such_session' using errcode = 'P0001';
  end if;
  if s.archived_at is not null then
    raise exception 'session_archived' using errcode = 'P0001';
  end if;

  -- Record what is about to be destroyed. This is the only trace that will be
  -- left of it, so it is worth having.
  removed := jsonb_build_object(
    'scope',       p_scope,
    'from_phase',  s.phase,
    'topics',      (select count(*) from public.topics      where session_id = p_session),
    'ballots',     (select count(*) from public.ballots     where session_id = p_session),
    'votes',       (select count(*) from public.votes       where session_id = p_session),
    'assignments', (select count(*) from public.assignments where session_id = p_session)
  );

  if p_scope in ('schedule', 'votes', 'topics', 'all') then
    delete from public.assignments where session_id = p_session;
  end if;

  if p_scope in ('votes', 'topics', 'all') then
    delete from public.votes   where session_id = p_session;
    delete from public.ballots where session_id = p_session;
    -- The per-row trigger has already walked these down, but a session that was
    -- reset must never show a stale tally, so make it explicit.
    update public.topic_vote_counts set votes = 0, updated_at = now()
     where session_id = p_session and votes <> 0;
  end if;

  if p_scope in ('topics', 'all') then
    -- topic_vote_counts and assignments cascade from here.
    delete from public.topics where session_id = p_session;
  end if;

  update public.sessions
     -- Explicit casts: a bare string literal in a CASE is text, and Postgres
     -- will not infer the enum from the assignment target.
     set phase = (case p_scope
           when 'schedule' then 'voting_closed'
           when 'votes'    then 'proposals_closed'
           when 'topics'   then 'proposals_open'
           when 'all'      then 'draft'
         end)::public.session_phase,
         -- A rewound phase must not inherit a deadline that has already lapsed,
         -- or the room lands straight back on "Time's Up!".
         proposals_deadline = case when p_scope in ('topics', 'all') then null
                                   else proposals_deadline end,
         voting_deadline    = null,
         rounds       = case when p_scope = 'all' then null else rounds end,
         rooms        = case when p_scope = 'all' then null else rooms  end
   where id = p_session
   returning * into s;

  insert into public.session_events (session_id, actor_id, from_phase, to_phase, detail)
  values (p_session, auth.uid(), (removed ->> 'from_phase')::public.session_phase, s.phase,
          removed || jsonb_build_object('action', 'reset'));

  return s;
end $$;

revoke all on function public.reset_session(uuid, public.reset_scope) from public;
grant execute on function public.reset_session(uuid, public.reset_scope) to authenticated;
