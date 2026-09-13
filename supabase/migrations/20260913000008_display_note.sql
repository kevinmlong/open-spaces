-- =============================================================================
-- A short message the organizer can put on the projector.
--
-- For the things that come up on the day and have nothing to do with the app:
-- "Snacks in the lobby", "Social at 5:30 at the pub across the street",
-- "Round 2 starts 10 minutes late".
--
-- It lives on the session so it rides the existing realtime subscription and
-- lands on the screen the same way a phase change does, and so it is cleared
-- automatically when the session is archived or reset.
-- =============================================================================

alter table public.sessions
  add column display_note text
    check (display_note is null or char_length(display_note) <= 120);

create or replace function public.set_display_note(
  p_session uuid,
  p_note    text default null
) returns public.sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s     public.sessions;
  clean text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Treat whitespace as clearing it, so an admin emptying the box does what
  -- they expect rather than leaving a blank line on the big screen.
  clean := nullif(btrim(coalesce(p_note, '')), '');

  if clean is not null and char_length(clean) > 120 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;

  update public.sessions set display_note = clean
   where id = p_session
   returning * into s;

  if s.id is null then
    raise exception 'no_such_session' using errcode = 'P0001';
  end if;

  return s;
end $$;

revoke all on function public.set_display_note(uuid, text) from public;
grant execute on function public.set_display_note(uuid, text) to authenticated;

-- reset_session must clear the note along with everything else: a message about
-- yesterday's social has no business surviving into a fresh session.
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
    update public.topic_vote_counts set votes = 0, updated_at = now()
     where session_id = p_session and votes <> 0;
  end if;

  if p_scope in ('topics', 'all') then
    delete from public.topics where session_id = p_session;
  end if;

  update public.sessions
     set phase = (case p_scope
           when 'schedule' then 'voting_closed'
           when 'votes'    then 'proposals_closed'
           when 'topics'   then 'proposals_open'
           when 'all'      then 'draft'
         end)::public.session_phase,
         proposals_deadline = case when p_scope in ('topics', 'all') then null
                                   else proposals_deadline end,
         voting_deadline    = null,
         rounds        = case when p_scope = 'all' then null else rounds end,
         rooms         = case when p_scope = 'all' then null else rooms  end,
         display_round = null,
         display_note  = case when p_scope = 'all' then null else display_note end
   where id = p_session
   returning * into s;

  insert into public.session_events (session_id, actor_id, from_phase, to_phase, detail)
  values (p_session, auth.uid(), (removed ->> 'from_phase')::public.session_phase, s.phase,
          removed || jsonb_build_object('action', 'reset'));

  return s;
end $$;
