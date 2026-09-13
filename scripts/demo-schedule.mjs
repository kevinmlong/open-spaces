#!/usr/bin/env node
/**
 * Drives a session all the way to a published schedule, for looking at the
 * projector and phone views without running a whole rehearsal by hand.
 *
 *   node scripts/demo-schedule.mjs [rounds] [rooms] [voters]
 *
 * Destructive and local-only: it resets whatever session is live.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'
loadEnv()

const U = process.env.VITE_SUPABASE_URL
const K = process.env.VITE_SUPABASE_ANON_KEY
if (!/127\.0\.0\.1|localhost/.test(U ?? '')) {
  console.error(`Refusing to run against a non-local URL: ${U}`)
  process.exit(1)
}

const ROUNDS = Number(process.argv[2] || 3)
const ROOMS = Number(process.argv[3] || 4)
const VOTERS = Number(process.argv[4] || 10)

const mk = () => createClient(U, K, { auth: { persistSession: false } })
const admin = mk()
{
  const { error } = await admin.auth.signInWithPassword({
    email: 'organizer1@dcstateofthestack.org',
    password: 'openspaces-local-dev',
  })
  if (error) {
    console.error(`admin sign-in failed: ${error.message}\nRun \`npm run seed:admin\`.`)
    process.exit(1)
  }
}

const { data: s } = await admin.from('sessions').select('*').is('archived_at', null).maybeSingle()
if (!s) {
  console.error('No active session. Run `npm run db:reset`.')
  process.exit(1)
}

await admin.rpc('reset_session', { p_session: s.id, p_scope: 'all' })
await admin.rpc('set_phase', { p_session: s.id, p_phase: 'proposals_open', p_minutes: 30 })

const TITLES = [
  'Do we still need staging?', 'Testing AI-generated code', 'Who owns the platform?',
  'Kubernetes: regrets?', 'Postgres as the whole backend', 'SLOs people actually read',
  'Incident reviews without blame', 'Feature flags at scale', 'Is pair programming dead?',
  'The cost of a bad abstraction', 'Hiring juniors in the age of AI',
  'Observability beyond dashboards', 'Paying down tech debt without a rewrite',
  'Designing for on-call sanity', 'Monorepo or many repos?', 'Shipping on Fridays',
  'What actually passes a security audit', 'Local dev environments that just work',
  'Zero-downtime schema migrations', 'Docs that survive contact with reality',
]
// Enough to fill the grid, plus a few that will not make the cut.
for (const title of TITLES.slice(0, ROUNDS * ROOMS + 4)) {
  await admin.from('topics').insert({ session_id: s.id, title })
}

await admin.rpc('set_phase', { p_session: s.id, p_phase: 'proposals_closed' })
await admin.rpc('set_phase', { p_session: s.id, p_phase: 'voting_open', p_minutes: 10 })

const { data: tops } = await admin.from('topics').select('id').eq('status', 'active')
for (let i = 0; i < VOTERS; i++) {
  const v = mk()
  await v.auth.signInAnonymously()
  const pick = [...tops].sort(() => Math.random() - 0.5).slice(0, 3).map((t) => t.id)
  await v.rpc('cast_ballot', { p_topic_ids: pick })
}

await admin.rpc('set_phase', { p_session: s.id, p_phase: 'voting_closed' })
await admin.rpc('generate_schedule', {
  p_session: s.id,
  p_rounds: ROUNDS,
  p_rooms: ROOMS,
  // Empty: let the "Open Space N" default render, which is what an
  // unconfigured session looks like on the day.
  p_room_names: [],
  p_round_labels: ['Round 1 · 1:15pm', 'Round 2 · 2:05pm', 'Round 3 · 2:55pm',
                   'Round 4 · 3:45pm'].slice(0, ROUNDS),
})

const { count } = await admin
  .from('assignments').select('*', { count: 'exact', head: true }).eq('session_id', s.id)
console.log(`scheduled: ${ROUNDS} rounds x ${ROOMS} rooms · ${count} assignments · ${VOTERS} voters`)
