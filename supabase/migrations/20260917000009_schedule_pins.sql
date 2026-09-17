-- =============================================================================
-- Schedule pins: the organizer's override.
--
-- Sometimes a topic has to run in a particular slot whatever the votes said -- a
-- sponsor's session, something that needs the big room, a topic someone shouted
-- from the mic after voting closed. A pin puts a topic in one round/room; every
-- other slot still fills by rank with the spread, skipping pinned topics.
--
-- Pins live on the assignment rows (`pinned = true`) rather than in their own
-- table. The admin screen reads them back from there, so a republish -- even
-- with different dimensions -- starts from the pins that are already on screen.
--
-- The fill below must stay in step with buildGrid() in src/lib/schedule.js:
-- walk the spread order i = 0.. and hand each FREE slot the next unpinned topic.
-- =============================================================================

alter table public.assignments
  add column pinned boolean not null default false;

-- A new trailing parameter with a default would make the old 5-arg call
-- ambiguous against the new one, so replace rather than overload.
drop function public.generate_schedule(uuid, int, int, text[], text[]);

create or replace function public.generate_schedule(
  p_session      uuid,
  p_rounds       int,
  p_rooms        int,
  p_room_names   text[] default null,
  p_round_labels text[] default null,
  p_pins         jsonb  default '[]'::jsonb   -- [{topic_id, round, room}, ...]
) returns setof public.assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pins jsonb := coalesce(p_pins, '[]'::jsonb);
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
  if jsonb_typeof(v_pins) <> 'array' then
    raise exception 'bad_pins' using errcode = 'P0001';
  end if;

  -- Dropped first so two calls in one transaction do not collide.
  drop table if exists pg_temp._schedule_pins;
  create temp table pg_temp._schedule_pins on commit drop as
    select (p ->> 'topic_id')::uuid   as topic_id,
           (p ->> 'round')::int       as round_index,
           (p ->> 'room')::int        as room_index
      from jsonb_array_elements(v_pins) p;

  -- Validate before touching anything, so a bad pin leaves the published
  -- schedule exactly as it was.
  if exists (select 1 from pg_temp._schedule_pins
              where topic_id is null or round_index is null or room_index is null
                 or round_index < 0 or round_index >= p_rounds
                 or room_index  < 0 or room_index  >= p_rooms) then
    raise exception 'pin_out_of_range' using errcode = 'P0001';
  end if;
  if (select count(*) <> count(distinct (round_index, room_index))
          or count(*) <> count(distinct topic_id)
        from pg_temp._schedule_pins) then
    raise exception 'duplicate_pin' using errcode = 'P0001';
  end if;
  if exists (select 1 from pg_temp._schedule_pins p
              where not exists (select 1 from public.topic_rankings r
                                 where r.id = p.topic_id and r.session_id = p_session)) then
    raise exception 'pin_topic_not_active' using errcode = 'P0001';
  end if;

  delete from public.assignments where session_id = p_session;

  insert into public.assignments
    (session_id, topic_id, round_index, room_index, rank, pinned)
  select p_session, p.topic_id, p.round_index::smallint, p.room_index::smallint,
         r.rank::int, true
    from pg_temp._schedule_pins p
    join public.topic_rankings r on r.id = p.topic_id and r.session_id = p_session;

  with free_slots as (
    select (i % p_rounds)::smallint as round_index,
           (i / p_rounds)::smallint as room_index,
           row_number() over (order by i) as k
      from generate_series(0, p_rounds * p_rooms - 1) as i
     where not exists (select 1 from pg_temp._schedule_pins p
                        where p.round_index = i % p_rounds
                          and p.room_index  = i / p_rounds)
  ),
  fill as (
    select r.id, r.rank, row_number() over (order by r.rank) as k
      from public.topic_rankings r
     where r.session_id = p_session
       and r.id not in (select topic_id from pg_temp._schedule_pins)
  )
  insert into public.assignments
    (session_id, topic_id, round_index, room_index, rank, pinned)
  select p_session, f.id, s.round_index, s.room_index, f.rank::int, false
    from free_slots s
    join fill f using (k);

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
          jsonb_build_object('rounds', p_rounds, 'rooms', p_rooms, 'pins', v_pins));

  return query
    select * from public.assignments
     where session_id = p_session
     order by round_index, room_index;
end $$;

revoke all on function
  public.generate_schedule(uuid, int, int, text[], text[], jsonb)
from public;

grant execute on function
  public.generate_schedule(uuid, int, int, text[], text[], jsonb)
to authenticated;
