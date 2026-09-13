-- =============================================================================
-- RPCs. All SECURITY DEFINER, so each one does its own authorization -- they
-- bypass RLS by definition.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cast_ballot -- the only way to vote.
--
-- One transaction: ballot row + up to 3 vote rows + the counter updates commit
-- together or not at all. voter_id comes from auth.uid() inside this function, so
-- it cannot be spoofed by the caller.
-- -----------------------------------------------------------------------------
create or replace function public.cast_ballot(p_topic_ids uuid[])
returns table (topic_id uuid, slot smallint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_session uuid;
  v_max     smallint;
  v_ids     uuid[];
  v_n       int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- FOR SHARE pins the phase for the life of this transaction. Share locks are
  -- mutually compatible, so hundreds of concurrent ballots do not queue behind
  -- each other -- but an admin's "close voting" UPDATE waits for in-flight
  -- ballots to land rather than racing them.
  select s.id, s.max_votes_per_voter
    into v_session, v_max
    from public.sessions s
   where s.archived_at is null
     and s.phase = 'voting_open'
     and (s.voting_deadline is null
          or now() < s.voting_deadline + interval '5 seconds')
   for share;

  if v_session is null then
    raise exception 'voting_not_open' using errcode = 'P0001';
  end if;

  -- Dedupe while preserving the voter's ordering (first occurrence wins).
  select array_agg(id order by ord) into v_ids
    from (
      select distinct on (id) id, ord
        from unnest(p_topic_ids) with ordinality as u(id, ord)
       order by id, ord
    ) d;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 1 or v_n > v_max then
    raise exception 'pick_between_1_and_%_topics', v_max using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from unnest(v_ids) x
      left join public.topics t on t.id = x
     where t.id is null
        or t.session_id <> v_session
        or t.status <> 'active'
  ) then
    raise exception 'invalid_topic' using errcode = 'P0001';
  end if;

  -- The primary key on (session_id, voter_id) is the "one ballot, ever" rule.
  insert into public.ballots (session_id, voter_id) values (v_session, v_uid);

  return query
  insert into public.votes (session_id, topic_id, voter_id, slot)
  select v_session, x.id, v_uid, x.ord::smallint
    from unnest(v_ids) with ordinality as x(id, ord)
  returning votes.topic_id, votes.slot;

exception
  when unique_violation then
    raise exception 'already_voted' using errcode = 'P0001';
end $$;

-- -----------------------------------------------------------------------------
-- set_phase -- the transition matrix lives here, in one place.
-- -----------------------------------------------------------------------------
create or replace function public.set_phase(
  p_session uuid,
  p_phase   public.session_phase,
  p_minutes int     default null,
  p_force   boolean default false
) returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s   public.sessions;
  old public.session_phase;
  ok  boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into s from public.sessions where id = p_session for update;
  if s.id is null then
    raise exception 'no_such_session' using errcode = 'P0001';
  end if;
  if s.phase = 'archived' then
    raise exception 'session_archived' using errcode = 'P0001';
  end if;

  old := s.phase;

  ok := case
    when old = 'draft'            and p_phase = 'proposals_open'   then true
    when old = 'proposals_open'   and p_phase = 'proposals_closed' then true
    -- Reopening proposals is deliberately allowed: the mic queue is always
    -- longer than planned.
    when old = 'proposals_closed' and p_phase = 'proposals_open'   then true
    when old = 'proposals_closed' and p_phase = 'voting_open'      then true
    when old = 'voting_open'      and p_phase = 'voting_closed'    then true
    when old = 'voting_closed'    and p_phase = 'scheduled'        then true
    when old = 'scheduled'        and p_phase = 'voting_closed'    then true
    when old = 'voting_closed'    and p_phase = 'voting_open'      then p_force
    else false
  end;

  if not ok then
    raise exception 'illegal_transition_%_to_%', old, p_phase using errcode = 'P0001';
  end if;

  update public.sessions
     set phase = p_phase,
         proposals_deadline = case
           when p_phase = 'proposals_open' and p_minutes is not null
             then now() + make_interval(mins => p_minutes)
           else proposals_deadline
         end,
         voting_deadline = case
           when p_phase = 'voting_open' and p_minutes is not null
             then now() + make_interval(mins => p_minutes)
           else voting_deadline
         end
   where id = p_session
   returning * into s;

  insert into public.session_events (session_id, actor_id, from_phase, to_phase, detail)
  values (p_session, auth.uid(), old, p_phase,
          jsonb_build_object('minutes', p_minutes, 'forced', p_force));

  return s;
end $$;

-- -----------------------------------------------------------------------------
-- extend_deadline -- the most-used button at a real unconference.
-- -----------------------------------------------------------------------------
create or replace function public.extend_deadline(p_session uuid, p_minutes int)
returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.sessions;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.sessions
     set proposals_deadline = case
           when phase = 'proposals_open'
             then coalesce(proposals_deadline, now()) + make_interval(mins => p_minutes)
           else proposals_deadline end,
         voting_deadline = case
           when phase = 'voting_open'
             then coalesce(voting_deadline, now()) + make_interval(mins => p_minutes)
           else voting_deadline end
   where id = p_session
   returning * into s;

  if s.id is null then
    raise exception 'no_such_session' using errcode = 'P0001';
  end if;

  insert into public.session_events (session_id, actor_id, from_phase, to_phase, detail)
  values (p_session, auth.uid(), s.phase, s.phase,
          jsonb_build_object('extended_minutes', p_minutes));

  return s;
end $$;

-- -----------------------------------------------------------------------------
-- merge_topics -- soft, reversible, and it never loses a vote.
--
-- In practice merging happens in proposals_closed with zero votes cast. The
-- vote-moving branch exists so an emergency mid-voting merge cannot corrupt
-- totals.
-- -----------------------------------------------------------------------------
create or replace function public.merge_topics(
  p_from      uuid,
  p_into      uuid,
  p_new_title text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'cannot_merge_into_self' using errcode = 'P0001';
  end if;

  select session_id into v_session
    from public.topics where id = p_from and status = 'active' for update;
  if v_session is null then
    raise exception 'source_must_be_active' using errcode = 'P0001';
  end if;

  perform 1 from public.topics
   where id = p_into and session_id = v_session and status = 'active'
   for update;
  if not found then
    raise exception 'target_must_be_active_same_session' using errcode = 'P0001';
  end if;

  -- Move votes whose voter has not already voted for the survivor...
  update public.votes v
     set topic_id = p_into
   where v.topic_id = p_from
     and not exists (
       select 1 from public.votes w
        where w.voter_id = v.voter_id and w.topic_id = p_into);

  -- ...and drop the now-duplicate remainder.
  delete from public.votes where topic_id = p_from;

  update public.topics
     set status = 'merged', merged_into_topic_id = p_into
   where id = p_from;

  if p_new_title is not null then
    update public.topics set title = p_new_title where id = p_into;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- unmerge_topic / remove_topic / restore_topic -- everything is reversible.
-- -----------------------------------------------------------------------------
create or replace function public.unmerge_topic(p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.topics
     set status = 'active', merged_into_topic_id = null
   where id = p_id and status = 'merged';
end $$;

create or replace function public.remove_topic(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.topics
     set status = 'removed', moderation_note = p_reason
   where id = p_id;
end $$;

create or replace function public.restore_topic(p_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.topics
     set status = 'active', moderation_note = null
   where id = p_id and status = 'removed';
end $$;

-- -----------------------------------------------------------------------------
-- similar_topics -- the manual-dedupe assist.
--
-- Trigram similarity over titles. This only ever SUGGESTS pairs for the admin to
-- look at, so it cannot surprise anyone on stage. Zero cost, zero latency, no
-- API key.
-- -----------------------------------------------------------------------------
create or replace function public.similar_topics(
  p_session   uuid,
  p_threshold real default 0.35
) returns table (a uuid, b uuid, a_title text, b_title text, sim real)
language sql stable security definer set search_path = public, pg_temp as $$
  select t1.id, t2.id, t1.title, t2.title, similarity(t1.title, t2.title)
    from public.topics t1
    join public.topics t2
      on t1.session_id = t2.session_id and t1.id < t2.id
   where t1.session_id = p_session
     and t1.status = 'active'
     and t2.status = 'active'
     and similarity(t1.title, t2.title) > p_threshold
   order by 5 desc
   limit 50;
$$;

-- -----------------------------------------------------------------------------
-- generate_schedule -- the spread.
--
--   round = i % rounds      room = floor(i / rounds)      (i = rank - 1, 0-based)
--
-- With 3 rounds: #1 -> R1/Room1, #2 -> R2/Room1, #3 -> R3/Room1, #4 -> R1/Room2.
-- The top topics never compete with each other.
--
-- Re-runnable: it clears prior assignments first, so an admin can adjust the
-- dimensions and regenerate without leaving stale rows behind.
-- -----------------------------------------------------------------------------
create or replace function public.generate_schedule(
  p_session     uuid,
  p_rounds      int,
  p_rooms       int,
  p_room_names  text[] default null,
  p_round_labels text[] default null
) returns setof public.assignments
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rounds < 1 or p_rooms < 1 then
    raise exception 'bad_dimensions' using errcode = 'P0001';
  end if;
  if (select phase from public.sessions where id = p_session)
       not in ('voting_closed', 'scheduled') then
    raise exception 'close_voting_first' using errcode = 'P0001';
  end if;

  delete from public.assignments where session_id = p_session;

  insert into public.assignments (session_id, topic_id, round_index, room_index, rank)
  select p_session,
         r.id,
         ((r.rank - 1) % p_rounds)::smallint,
         ((r.rank - 1) / p_rounds)::smallint,
         r.rank::int
    from public.topic_rankings r
   where r.session_id = p_session
     and r.rank <= p_rounds * p_rooms;

  update public.sessions
     set rounds = p_rounds,
         rooms  = p_rooms,
         room_names   = coalesce(p_room_names,   room_names),
         round_labels = coalesce(p_round_labels, round_labels),
         phase = 'scheduled'
   where id = p_session;

  insert into public.session_events (session_id, actor_id, to_phase, detail)
  values (p_session, auth.uid(), 'scheduled',
          jsonb_build_object('rounds', p_rounds, 'rooms', p_rooms));

  return query
    select * from public.assignments
     where session_id = p_session
     order by round_index, room_index;
end $$;

-- -----------------------------------------------------------------------------
-- archive_session -- atomic swap.
--
-- Both statements run in one transaction, so between them there are zero
-- non-archived rows and the partial unique index is satisfied at every statement
-- boundary. Nothing is deleted: prior topics, votes and assignments stay
-- queryable by session_id forever.
-- -----------------------------------------------------------------------------
create or replace function public.archive_session(p_new_name text)
returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_id uuid;
  s      public.sessions;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into old_id from public.sessions where archived_at is null for update;

  if old_id is not null then
    update public.sessions
       set phase = 'archived', archived_at = now()
     where id = old_id;

    insert into public.session_events (session_id, actor_id, to_phase)
    values (old_id, auth.uid(), 'archived');
  end if;

  insert into public.sessions (name, created_by, phase)
  values (p_new_name, auth.uid(), 'draft')
  returning * into s;

  return s;
end $$;

-- -----------------------------------------------------------------------------
-- session_stats -- the display's progress ticker during voting. Deliberately
-- returns counts only, never a per-topic breakdown, so it cannot leak the
-- leaderboard while voting is open.
-- -----------------------------------------------------------------------------
create or replace function public.session_stats(p_session uuid)
returns table (topic_count int, ballot_count int)
language sql stable security definer set search_path = public, pg_temp as $$
  select (select count(*)::int from public.topics
           where session_id = p_session and status = 'active'),
         (select count(*)::int from public.ballots where session_id = p_session);
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function
  public.cast_ballot(uuid[]),
  public.set_phase(uuid, public.session_phase, int, boolean),
  public.extend_deadline(uuid, int),
  public.merge_topics(uuid, uuid, text),
  public.unmerge_topic(uuid),
  public.remove_topic(uuid, text),
  public.restore_topic(uuid),
  public.similar_topics(uuid, real),
  public.generate_schedule(uuid, int, int, text[], text[]),
  public.archive_session(text),
  public.session_stats(uuid)
from public;

grant execute on function
  public.cast_ballot(uuid[]),
  public.set_phase(uuid, public.session_phase, int, boolean),
  public.extend_deadline(uuid, int),
  public.merge_topics(uuid, uuid, text),
  public.unmerge_topic(uuid),
  public.remove_topic(uuid, text),
  public.restore_topic(uuid),
  public.similar_topics(uuid, real),
  public.generate_schedule(uuid, int, int, text[], text[]),
  public.archive_session(text),
  public.session_stats(uuid)
to authenticated;
