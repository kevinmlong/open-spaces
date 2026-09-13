-- =============================================================================
-- RLS / RPC assertion suite.
--
--   npm run test:policies
--
-- Requires a FRESH database -- it creates fixtures and advances the session
-- through every phase, so it is not re-runnable against a dirty one. The npm
-- script resets first for exactly that reason.
--
-- Every real security bug in this app will be an RLS bug, so this is the
-- regression net that actually matters. Each block raises on failure, so psql
-- with -v ON_ERROR_STOP=1 exits non-zero the moment an assertion breaks.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

-- -----------------------------------------------------------------------------
-- Fixtures: three attendees (anonymous) and one admin.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', null),
  ('aaaaaaaa-0000-0000-0000-000000000003', null),
  ('dddddddd-0000-0000-0000-00000000000a', 'admin@dcstateofthestack.org');

update public.profiles set is_admin = true
 where id = 'dddddddd-0000-0000-0000-00000000000a';

-- Helpers -------------------------------------------------------------------
create or replace function pg_temp.be_attendee(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.be_admin() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'dddddddd-0000-0000-0000-00000000000a',
                      'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
end $$;

\echo '=== 1. topics INSERT is gated on phase ==='

-- draft -> denied
do $$
declare denied boolean := false;
begin
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    insert into public.topics (session_id, title)
    values (public.active_session_id(), 'should not appear in draft');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: insert allowed during draft'; end if;
  raise notice 'PASS: insert denied during draft';
end $$;

-- non-admin cannot move the phase
do $$
declare denied boolean := false;
begin
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    perform public.set_phase(public.active_session_id(), 'proposals_open', 10);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: attendee changed the phase'; end if;
  raise notice 'PASS: attendee cannot change phase';
end $$;

-- admin opens proposals
do $$
begin
  perform pg_temp.be_admin();
  perform public.set_phase(public.active_session_id(), 'proposals_open', 10);
  raise notice 'PASS: admin opened proposals';
end $$;

-- proposals_open -> allowed
do $$
begin
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  insert into public.topics (session_id, title)
  values (public.active_session_id(), 'Observability on a budget');
  raise notice 'PASS: insert allowed during proposals_open';
end $$;

-- attendees may NOT self-mark a topic as mic-submitted
do $$
declare denied boolean := false;
begin
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    insert into public.topics (session_id, title, source)
    values (public.active_session_id(), 'fake mic topic', 'mic');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: attendee inserted a mic topic'; end if;
  raise notice 'PASS: attendee cannot forge source=mic';
end $$;

-- past the deadline -> denied, even though the phase still says open
do $$
declare denied boolean := false;
begin
  update public.sessions set proposals_deadline = now() - interval '1 minute'
   where archived_at is null;

  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    insert into public.topics (session_id, title)
    values (public.active_session_id(), 'too late');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: insert allowed after the deadline'; end if;
  raise notice 'PASS: insert denied after the deadline';
end $$;

-- restore a live deadline for the rest of the suite
update public.sessions set proposals_deadline = now() + interval '10 minutes'
 where archived_at is null;

\echo '=== 2. attendees cannot write votes directly ==='

do $$
declare denied boolean := false; v_topic uuid;
begin
  select id into v_topic from public.topics where status = 'active' limit 1;
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    insert into public.votes (session_id, topic_id, voter_id, slot)
    values (public.active_session_id(), v_topic,
            'aaaaaaaa-0000-0000-0000-000000000001', 1);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: direct vote insert succeeded'; end if;
  raise notice 'PASS: direct vote insert denied (RPC is the only path)';
end $$;

\echo '=== 3. ballots: one each, max 3 picks ==='

do $$
begin
  perform pg_temp.be_admin();
  perform public.set_phase(public.active_session_id(), 'proposals_closed');
  perform public.set_phase(public.active_session_id(), 'voting_open', 5);
  raise notice 'PASS: voting opened';
end $$;

-- 4 picks -> rejected
do $$
declare denied boolean := false; ids uuid[];
begin
  select array_agg(id) into ids from (
    select id from public.topics where status='active' order by created_at limit 4) x;

  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    perform public.cast_ballot(ids);
  exception when raise_exception then denied := true;
  end;
  if not denied then raise exception 'FAIL: a 4-topic ballot was accepted'; end if;
  raise notice 'PASS: 4-topic ballot rejected';
end $$;

-- a valid 3-pick ballot
do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from (
    select id from public.topics where status='active' order by created_at limit 3) x;
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  perform public.cast_ballot(ids);
  raise notice 'PASS: 3-topic ballot accepted';
end $$;

-- voting twice -> already_voted
do $$
declare denied boolean := false; ids uuid[]; msg text;
begin
  select array_agg(id) into ids from (
    select id from public.topics where status='active' order by created_at limit 2) x;
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    perform public.cast_ballot(ids);
  exception when raise_exception then
    get stacked diagnostics msg = message_text;
    if msg <> 'already_voted' then
      raise exception 'FAIL: expected already_voted, got %', msg;
    end if;
    denied := true;
  end;
  if not denied then raise exception 'FAIL: a second ballot was accepted'; end if;
  raise notice 'PASS: second ballot rejected as already_voted';
end $$;

-- two more voters, so the ranking has something to order
do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from (
    select id from public.topics where status='active' order by created_at limit 3) x;
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000002');
  perform public.cast_ballot(ids[1:2]);
end $$;

do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from (
    select id from public.topics where status='active' order by created_at limit 3) x;
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000003');
  perform public.cast_ballot(array[ids[1]]);
end $$;

-- the counter trigger kept up
do $$
declare top_votes int;
begin
  select max(votes) into top_votes from public.topic_vote_counts;
  if top_votes <> 3 then
    raise exception 'FAIL: expected a 3-vote leader, got %', top_votes;
  end if;
  raise notice 'PASS: vote counters maintained by trigger';
end $$;

\echo '=== 4. THE EMBARGO: attendees cannot see tallies while voting is open ==='

do $$
declare n int;
begin
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000002');
  select count(*) into n from public.topic_vote_counts;
  if n <> 0 then
    raise exception 'FAIL: attendee read % tally rows during voting', n;
  end if;
  raise notice 'PASS: attendee sees 0 tally rows during voting';
end $$;

-- ...and the ranking view must not leak them either (security_invoker)
do $$
declare n int;
begin
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000002');
  select count(*) into n from public.topic_rankings;
  if n <> 0 then
    raise exception 'FAIL: topic_rankings leaked % rows during voting', n;
  end if;
  raise notice 'PASS: topic_rankings is embargoed too (security_invoker works)';
end $$;

-- an admin CAN see them live
do $$
declare n int;
begin
  perform pg_temp.be_admin();
  select count(*) into n from public.topic_vote_counts;
  if n = 0 then raise exception 'FAIL: admin cannot see live tallies'; end if;
  raise notice 'PASS: admin sees live tallies (% rows)', n;
end $$;

-- a voter sees only their own votes
do $$
declare n int;
begin
  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000003');
  select count(*) into n from public.votes;
  if n <> 1 then raise exception 'FAIL: voter saw % vote rows, expected 1', n; end if;
  raise notice 'PASS: voter sees only their own vote rows';
end $$;

\echo '=== 5. closing voting lifts the embargo ==='

do $$
declare n int;
begin
  perform pg_temp.be_admin();
  perform public.set_phase(public.active_session_id(), 'voting_closed');

  perform pg_temp.be_attendee('aaaaaaaa-0000-0000-0000-000000000002');
  select count(*) into n from public.topic_rankings;
  if n = 0 then raise exception 'FAIL: results still hidden after voting closed'; end if;
  raise notice 'PASS: results visible to attendees after close (% rows)', n;
end $$;

\echo '=== 6. schedule spread ==='

do $$
declare r record; n int;
begin
  perform pg_temp.be_admin();
  perform public.generate_schedule(public.active_session_id(), 3, 2);

  select count(*) into n from public.assignments;
  if n <> 6 then raise exception 'FAIL: expected 6 assignments, got %', n; end if;

  -- The load-bearing property: ranks 1,2,3 go to Room 1 of rounds 1,2,3 so the
  -- top three never compete. Rank 4 starts Room 2.
  for r in select rank, round_index, room_index from public.assignments order by rank loop
    if r.round_index <> (r.rank - 1) % 3 or r.room_index <> (r.rank - 1) / 3 then
      raise exception 'FAIL: rank % at round %/room %', r.rank, r.round_index, r.room_index;
    end if;
  end loop;
  raise notice 'PASS: spread places rank i at round i%%rounds, room i/rounds';
end $$;

\echo '=== 7. merge moves votes and is reversible ==='

do $$
declare a uuid; b uuid; before_a int; before_b int; after_b int;
begin
  perform pg_temp.be_admin();
  select topic_id into a from public.topic_vote_counts order by votes desc limit 1;
  select topic_id into b from public.topic_vote_counts where topic_id <> a
   order by votes desc limit 1;
  select votes into before_a from public.topic_vote_counts where topic_id = a;
  select votes into before_b from public.topic_vote_counts where topic_id = b;

  perform public.merge_topics(a, b, 'Merged survivor title');

  select votes into after_b from public.topic_vote_counts where topic_id = b;
  -- Voters who picked both are not double-counted, so the survivor's total is at
  -- most the sum -- and must never exceed it.
  if after_b > before_a + before_b then
    raise exception 'FAIL: merge inflated votes (% > % + %)', after_b, before_a, before_b;
  end if;
  if (select status from public.topics where id = a) <> 'merged' then
    raise exception 'FAIL: source topic not marked merged';
  end if;
  if (select title from public.topics where id = b) <> 'Merged survivor title' then
    raise exception 'FAIL: survivor was not retitled';
  end if;

  perform public.unmerge_topic(a);
  if (select status from public.topics where id = a) <> 'active' then
    raise exception 'FAIL: unmerge did not restore the topic';
  end if;
  raise notice 'PASS: merge moves votes without inflating, and unmerges cleanly';
end $$;

\echo '=== 8. only one active session ==='

do $$
declare denied boolean := false;
begin
  begin
    insert into public.sessions (name) values ('a second live session');
  exception when unique_violation then denied := true;
  end;
  if not denied then raise exception 'FAIL: two non-archived sessions coexist'; end if;
  raise notice 'PASS: a second active session is rejected';
end $$;

-- archiving frees the slot, and the old data stays queryable
do $$
declare old_id uuid; new_id uuid; kept int;
begin
  select id into old_id from public.sessions where archived_at is null;
  perform pg_temp.be_admin();
  select id into new_id from public.archive_session('Day 2 Open Spaces');

  if new_id = old_id then raise exception 'FAIL: archive did not create a new session'; end if;
  if (select phase from public.sessions where id = new_id) <> 'draft' then
    raise exception 'FAIL: new session is not in draft';
  end if;

  select count(*) into kept from public.topics where session_id = old_id;
  if kept = 0 then raise exception 'FAIL: archived session lost its topics'; end if;
  raise notice 'PASS: archive swaps sessions; % old topics still queryable', kept;
end $$;

\echo ''
\echo '*** all policy assertions passed ***'
