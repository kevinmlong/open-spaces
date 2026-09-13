-- =============================================================================
-- Row Level Security -- every authorization decision in the product lives here.
--
-- IMPORTANT ROLE NOTE: with anonymous auth, EVERY attendee is the `authenticated`
-- Postgres role, carrying is_anonymous:true in the JWT. Nobody is ever `anon`.
-- All policies therefore target `to authenticated`, and `anon` gets no grants.
--
-- Every is_admin()/helper call is wrapped as `(select ...)` so Postgres hoists it
-- to an InitPlan evaluated once per statement instead of once per row.
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.sessions          enable row level security;
alter table public.topics            enable row level security;
alter table public.ballots           enable row level security;
alter table public.votes             enable row level security;
alter table public.topic_vote_counts enable row level security;
alter table public.assignments       enable row level security;
alter table public.session_events    enable row level security;

-- The anon role is never used by this app; make that explicit.
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_admin_write on public.profiles
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Deliberately NO self-UPDATE policy: is_admin must not be self-settable.

-- -----------------------------------------------------------------------------
-- sessions -- everyone reads the active one (they need the phase); admins write
-- -----------------------------------------------------------------------------
create policy sessions_select_active on public.sessions
  for select to authenticated
  using (archived_at is null or (select public.is_admin()));

create policy sessions_admin_all on public.sessions
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- topics -- the heart of it
-- -----------------------------------------------------------------------------

-- Attendees see the active session's non-removed topics, and nothing at all while
-- the session is still in draft.
create policy topics_select_attendee on public.topics
  for select to authenticated
  using (
    session_id = (select public.active_session_id())
    and status <> 'removed'
    and public.current_phase(session_id) <> 'draft'
  );

create policy topics_select_admin on public.topics
  for select to authenticated
  using ((select public.is_admin()));

-- INSERT is gated on phase AND deadline, both checked server-side. There is no
-- identity column to spoof -- topics are anonymous by design.
create policy topics_insert_attendee on public.topics
  for insert to authenticated
  with check (
    source = 'attendee'                          -- only admins may mark 'mic'
    and status = 'active'
    and merged_into_topic_id is null
    and session_id = (select public.active_session_id())
    and public.proposals_accepting(session_id)
  );

-- No attendee UPDATE or DELETE policy: denied by default. Admins remove topics by
-- setting status='removed', which keeps the row (and makes it reversible).
create policy topics_admin_all on public.topics
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- ballots + votes -- read your own, write only through cast_ballot()
--
-- Revoking the write grants is what makes the RPC the single door. voter_id is
-- never accepted as input: cast_ballot() reads auth.uid() inside the function
-- body, so a client cannot cast a ballot as anyone else.
-- -----------------------------------------------------------------------------
revoke insert, update, delete on public.votes   from authenticated;
revoke insert, update, delete on public.ballots from authenticated;

create policy votes_select_own on public.votes
  for select to authenticated
  using (voter_id = (select auth.uid()));

create policy votes_admin_all on public.votes
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy ballots_select_own on public.ballots
  for select to authenticated
  using (voter_id = (select auth.uid()));

create policy ballots_admin_all on public.ballots
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- FALLBACK ONLY -- not enabled. This is the exact policy you would turn on if you
-- ever dropped cast_ballot() in favour of direct inserts. The unique indexes would
-- still cap it at 3 rows and forbid duplicate topics, but you would lose ballot
-- atomicity and the one-ballot-forever guarantee. Kept here because writing it
-- later under pressure is worse than reading it now.
--
--   grant insert on public.votes to authenticated;
--   create policy votes_insert_attendee on public.votes
--     for insert to authenticated
--     with check (
--       voter_id = (select auth.uid())
--       and session_id = (select public.active_session_id())
--       and public.current_phase(session_id) = 'voting_open'
--       and exists (select 1 from public.topics t
--                    where t.id = topic_id
--                      and t.session_id = votes.session_id
--                      and t.status = 'active')
--     );

-- -----------------------------------------------------------------------------
-- topic_vote_counts -- the tally embargo
--
-- Attendees cannot read counts while voting is open. This is why counts are a
-- separate table rather than a column on topics: RLS is row-level, so a count
-- column would be readable by anyone who can read the topic.
-- -----------------------------------------------------------------------------
create policy tvc_select_after_close on public.topic_vote_counts
  for select to authenticated
  using (
    (select public.is_admin())
    or public.current_phase(session_id) in ('voting_closed', 'scheduled')
  );

-- No write policies at all: only the SECURITY DEFINER trigger touches this table.

-- -----------------------------------------------------------------------------
-- assignments
-- -----------------------------------------------------------------------------
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    (select public.is_admin())
    or (session_id = (select public.active_session_id())
        and public.current_phase(session_id) = 'scheduled')
  );

create policy assignments_admin_all on public.assignments
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- session_events -- admin audit only
-- -----------------------------------------------------------------------------
create policy events_admin_only on public.session_events
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- -----------------------------------------------------------------------------
-- Function execution grants
-- -----------------------------------------------------------------------------
revoke all on function
  public.is_admin(),
  public.active_session_id(),
  public.current_phase(uuid),
  public.proposals_accepting(uuid),
  public.server_now()
from public;

grant execute on function
  public.is_admin(),
  public.active_session_id(),
  public.current_phase(uuid),
  public.proposals_accepting(uuid),
  public.server_now()
to authenticated;
