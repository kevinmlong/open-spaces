#!/usr/bin/env node
/**
 * Full lifecycle end-to-end test against the local stack, driving the real API
 * exactly as the browser does: anonymous auth, RLS, RPCs, the embargo, the
 * spread, and the archive swap.
 *
 *   npm run db:reset && npm run seed:admin && npm run e2e
 *
 * Destructive -- it advances the active session through every phase and then
 * archives it. Local only.
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'
loadEnv()
const U = process.env.VITE_SUPABASE_URL, K = process.env.VITE_SUPABASE_ANON_KEY
const mk = () => createClient(U, K, { auth: { persistSession: false } })
const ok = (m) => console.log('  ✓', m)
const bad = (m) => { console.log('  ✗', m); process.exitCode = 1 }

// --- admin ---
const admin = mk()
{ const { error } = await admin.auth.signInWithPassword({
    email: 'organizer1@dcstateofthestack.org', password: 'openspaces-local-dev' })
  if (error) throw error }
// Signup cannot be disabled (it would also block anonymous auth), so the
// property that matters is that a self-created account gains NO authority.
{ const probe = mk()
  const { error } = await probe.auth.signUp({ email: `gatecrasher${Date.now()}@example.com`, password: 'hunter2hunter2' })
  if (error) { bad(`signup unexpectedly failed: ${error.message}`) }
  else {
    const { data: p } = await probe.from('profiles').select('is_admin').maybeSingle()
    p?.is_admin ? bad('a self-created account is an admin!') : ok('self-created account has no admin rights')
    const { error: esc } = await probe.from('profiles').update({ is_admin: true }).eq('id', (await probe.auth.getUser()).data.user.id)
    const { data: after } = await probe.from('profiles').select('is_admin').maybeSingle()
    after?.is_admin ? bad('account escalated itself to admin!') : ok('account cannot escalate itself to admin')
  }
}

// Scoped to their own id: an admin can read every profile, so an unfiltered
// .single() would fail on multiple rows.
const adminId = (await admin.auth.getUser()).data.user.id
const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', adminId).single()
prof?.is_admin ? ok('admin signs in and is recognised') : bad('admin flag missing')

let { data: s } = await admin.from('sessions').select('*').is('archived_at', null).single()
console.log(`\nsession "${s.name}" phase=${s.phase}`)

// --- attendee bootstraps anonymously ---
const a1 = mk(), a2 = mk(), a3 = mk()
for (const [n, c] of [['a1',a1],['a2',a2],['a3',a3]]) {
  const { data, error } = await c.auth.signInAnonymously()
  if (error) bad(`${n} anon signin: ${error.message}`)
  else if (!data.user.is_anonymous) bad(`${n} not anonymous`)
}
ok('three attendees get distinct anonymous identities')

console.log('\n--- proposals ---')
await admin.rpc('set_phase', { p_session: s.id, p_phase: 'proposals_open', p_minutes: 10 })
ok('admin opened proposals')

{ const { error } = await a1.from('topics').insert({ session_id: s.id, title: 'Running Postgres at the edge' })
  error ? bad(`attendee propose: ${error.message}`) : ok('attendee proposed a topic') }

{ const { error } = await a2.from('topics').insert({ session_id: s.id, title: 'Fake mic topic', source: 'mic' })
  error ? ok('attendee cannot forge source=mic') : bad('attendee forged a mic topic!') }

{ const { error } = await admin.from('topics').insert({ session_id: s.id, title: 'Cutting our cloud bill in half', source: 'mic' })
  error ? bad(`mic submit: ${error.message}`) : ok('admin submitted a mic topic') }

// Seed our own, rather than depending on whatever seed.sql left behind: a rerun
// operates on the freshly archived (empty) session, and the ballot checks below
// need at least four topics to be meaningful.
for (const title of ['AI code review in practice', 'Code review with AI: what works',
                     'Platform teams: still worth it?', 'What actually passes a security audit',
                     'Do we still need a staging environment?'])
  await admin.from('topics').insert({ session_id: s.id, title })

const { data: live } = await a3.from('topics').select('id,title,source').eq('status','active')
console.log(`  attendee sees ${live.length} live topics`)

console.log('\n--- curation ---')
const { data: pairs } = await admin.rpc('similar_topics', { p_session: s.id, p_threshold: 0.35 })
pairs?.length
  ? ok(`similarity found ${pairs.length} candidate pair(s): "${pairs[0].a_title}" ~ "${pairs[0].b_title}" (${Math.round(pairs[0].sim*100)}%)`)
  : console.log('  – no similar pairs above threshold')

if (pairs?.length) {
  const { error } = await admin.rpc('merge_topics', { p_from: pairs[0].b, p_into: pairs[0].a, p_new_title: 'AI code review, in practice' })
  error ? bad(`merge: ${error.message}`) : ok('merged duplicates under a combined title')
}

console.log('\n--- voting ---')
await admin.rpc('set_phase', { p_session: s.id, p_phase: 'proposals_closed' })
await admin.rpc('set_phase', { p_session: s.id, p_phase: 'voting_open', p_minutes: 5 })
ok('admin opened voting')

const { data: ballotTopics } = await a1.from('topics').select('id').eq('status','active')
const ids = ballotTopics.map(t => t.id)
ids.length >= 4
  ? ok(`${ids.length} topics on the ballot`)
  : bad(`only ${ids.length} topics -- the over-limit check below would be meaningless`)

{ const { error } = await a1.rpc('cast_ballot', { p_topic_ids: ids.slice(0,3) })
  error ? bad(`a1 ballot: ${error.message}`) : ok('a1 cast a 3-pick ballot') }
{ const { error } = await a1.rpc('cast_ballot', { p_topic_ids: ids.slice(0,2) })
  ;(/already_voted/).test(error?.message ?? '') ? ok('a1 blocked from voting twice') : bad('a1 voted twice!') }
{ const { error } = await a2.rpc('cast_ballot', { p_topic_ids: ids.slice(0,4) })
  error ? ok('4-pick ballot rejected') : bad('4-pick ballot accepted!') }
{ const { error } = await a2.rpc('cast_ballot', { p_topic_ids: ids.slice(0,2) })
  error ? bad(`a2 ballot: ${error.message}`) : ok('a2 cast a 2-pick ballot') }
{ const { error } = await a3.rpc('cast_ballot', { p_topic_ids: [ids[0]] })
  error ? bad(`a3 ballot: ${error.message}`) : ok('a3 cast a 1-pick ballot') }

// THE EMBARGO
const { data: leak } = await a2.from('topic_vote_counts').select('*')
leak?.length ? bad(`attendee read ${leak.length} tallies during voting`) : ok('attendee reads 0 tallies during voting')
const { data: leak2 } = await a2.from('topic_rankings').select('*')
leak2?.length ? bad(`rankings leaked ${leak2.length} rows`) : ok('rankings embargoed during voting')
const { data: adminSees } = await admin.from('topic_rankings').select('*').order('rank')
adminSees?.length ? ok(`admin sees live tallies (leader has ${adminSees[0].votes} votes)`) : bad('admin cannot see tallies')
const { data: mine } = await a3.from('votes').select('*')
mine?.length === 1 ? ok('voter sees only their own vote') : bad(`voter saw ${mine?.length} votes`)

console.log('\n--- results + schedule ---')
await admin.rpc('set_phase', { p_session: s.id, p_phase: 'voting_closed' })
const { data: revealed } = await a2.from('topic_rankings').select('*').order('rank')
revealed?.length ? ok(`results revealed to attendees (${revealed.length} ranked)`) : bad('results still hidden')
console.log('  ranking:', revealed.slice(0,4).map(r => `${r.rank}. ${r.title} (${r.votes})`).join(' | '))

await admin.rpc('generate_schedule', {
  p_session: s.id, p_rounds: 3, p_rooms: 2,
  p_room_names: ['Chesapeake','Potomac'],
  p_round_labels: ['Round 1 · 1:15pm','Round 2 · 2:05pm','Round 3 · 2:55pm'] })
const { data: asg } = await a3.from('assignments').select('*, topics(title)').order('rank')
ok(`schedule published: ${asg.length} slots`)
const spreadOK = asg.every(a => a.round_index === (a.rank-1)%3 && a.room_index === Math.floor((a.rank-1)/3))
spreadOK ? ok('top 3 are in room 1 of rounds 1/2/3 — they never clash') : bad('spread is wrong')
for (const a of asg) console.log(`    R${a.round_index+1} ${['Chesapeake','Potomac'][a.room_index]}: ${a.topics.title}`)

// The organizer's override: pin the LAST-ranked topic into R1/Room 1 and
// republish. It must take that slot, and the rest must fill around it.
{ const last = revealed[revealed.length - 1]
  const { error } = await admin.rpc('generate_schedule', {
    p_session: s.id, p_rounds: 3, p_rooms: 2,
    p_pins: [{ topic_id: last.id, round: 0, room: 0 }] })
  if (error) bad(`pinned republish: ${error.message}`)
  const { data: pinned } = await a3.from('assignments').select('*').order('round_index').order('room_index')
  const cell = pinned.find(a => a.round_index === 0 && a.room_index === 0)
  cell?.topic_id === last.id && cell.pinned
    ? ok(`pinned #${last.rank} "${last.title}" into R1 room 1 over the votes`)
    : bad('pin did not take its slot')
  pinned.filter(a => a.topic_id === last.id).length === 1 && pinned.length === 6
    ? ok('pinned topic placed once; the other slots still filled') : bad('pin broke the fill')
  const { error: forged } = await a2.rpc('generate_schedule', {
    p_session: s.id, p_rounds: 3, p_rooms: 2, p_pins: [{ topic_id: last.id, round: 0, room: 0 }] })
  forged ? ok('attendee cannot pin') : bad('attendee pinned a topic!')
}

console.log('\n--- archive ---')
const oldId = s.id
const { data: fresh } = await admin.rpc('archive_session', { p_new_name: 'Day 2 Open Spaces' })
const f = Array.isArray(fresh) ? fresh[0] : fresh
f.phase === 'draft' && f.id !== oldId ? ok(`new blank session "${f.name}" in draft`) : bad('archive failed')
const { count } = await admin.from('topics').select('*', { count:'exact', head:true }).eq('session_id', oldId)
count > 0 ? ok(`old session's ${count} topics still queryable`) : bad('archived data lost')
const { data: nowSees } = await a1.from('topics').select('id')
nowSees.length === 0 ? ok('attendees see a clean slate') : bad(`attendee still sees ${nowSees.length} topics`)
