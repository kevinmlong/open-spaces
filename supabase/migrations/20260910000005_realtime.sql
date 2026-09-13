-- =============================================================================
-- Realtime publication.
--
-- Published: sessions, topics, assignments.
-- NOT published, deliberately:
--   * votes / ballots       -- a per-vote firehose, and private
--   * topic_vote_counts     -- THE EMBARGO. 300 voters x 3 votes = 900 counter
--                              updates; as a published column that would be
--                              ~270,000 messages with an RLS check each, right
--                              when the venue wifi is most loaded. Unpublished,
--                              it is zero -- and attendees cannot see tallies.
--   * session_events        -- admin audit only
--
-- REPLICA IDENTITY FULL because Supabase needs the full old row to evaluate RLS
-- on UPDATE/DELETE payloads, and curation propagates as topics UPDATEs. These
-- tables hold tens of rows, so the WAL cost is irrelevant.
-- =============================================================================

alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.topics;
alter publication supabase_realtime add table public.assignments;

alter table public.sessions    replica identity full;
alter table public.topics      replica identity full;
alter table public.assignments replica identity full;
