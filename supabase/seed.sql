-- Re-run on every `supabase db reset`. Gives the UI something to render
-- immediately so you are never staring at an empty screen while building.

insert into public.sessions (id, name, event_day, phase, room_names, round_labels)
values (
  '00000000-0000-0000-0000-000000000001',
  'Day 1 Open Spaces',
  '2026-09-16',
  'draft',
  -- Left empty on purpose: the app falls back to "Open Space 1", "Open Space 2"
  -- and so on, which is what an unconfigured session really looks like. The
  -- organizer names the rooms in /admin/schedule when they know the venue.
  array[]::text[],
  array['Round 1 · 1:15pm', 'Round 2 · 2:05pm', 'Round 3 · 2:55pm']
);

insert into public.topics (session_id, title, source) values
  ('00000000-0000-0000-0000-000000000001', 'Agentic coding in regulated environments', 'attendee'),
  ('00000000-0000-0000-0000-000000000001', 'Do we still need a staging environment?',  'mic'),
  ('00000000-0000-0000-0000-000000000001', 'Postgres as the whole backend',            'attendee'),
  ('00000000-0000-0000-0000-000000000001', 'What actually passes a security audit',    'attendee'),
  ('00000000-0000-0000-0000-000000000001', 'Platform teams: still worth it?',          'attendee'),
  ('00000000-0000-0000-0000-000000000001', 'AI code review in practice',               'attendee'),
  ('00000000-0000-0000-0000-000000000001', 'Code review with AI: what works',          'attendee');
