-- =============================================================================
-- What the projector shows during the `scheduled` phase.
--
-- NULL       -> the overview: every round at once
-- 0, 1, 2... -> that one round, large
--
-- This lives on the session rather than in the display's own state because the
-- organizer drives it from the admin console. Nobody should have to walk to the
-- laptop running the projector to change what the room is looking at -- and
-- during Open Spaces that laptop is usually plugged in behind the stage.
--
-- It rides the existing sessions realtime subscription, so it lands on the
-- screen the same way a phase change does.
-- =============================================================================

alter table public.sessions
  add column display_round smallint
    check (display_round is null or display_round >= 0);

create or replace function public.set_display_round(
  p_session uuid,
  p_round   smallint default null
) returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.sessions;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into s from public.sessions where id = p_session for update;
  if s.id is null then
    raise exception 'no_such_session' using errcode = 'P0001';
  end if;

  -- Pointing the room at a round that was never scheduled would leave the
  -- projector blank with no clue why.
  if p_round is not null and (s.rounds is null or p_round >= s.rounds) then
    raise exception 'round_out_of_range' using errcode = 'P0001';
  end if;

  update public.sessions set display_round = p_round
   where id = p_session
   returning * into s;

  return s;
end $$;

revoke all on function public.set_display_round(uuid, smallint) from public;
grant execute on function public.set_display_round(uuid, smallint) to authenticated;

-- Regenerating the schedule must not leave the projector pointed at a round that
-- no longer exists, so reset the pointer back to the overview.
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
         display_round = null,
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
