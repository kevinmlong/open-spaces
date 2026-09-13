#!/usr/bin/env node
/**
 * N independent anonymous attendees, each with its own identity, hitting the
 * real API exactly as a browser would.
 *
 * This is the only honest way to test the counter triggers, the per-subscriber
 * RLS cost, and -- most importantly -- the anonymous sign-in rate limit, which
 * will not show up in hand-testing because the whole venue shares one IP.
 *
 *   node scripts/simulate-voters.mjs [count] [rampSeconds]
 *
 * persistSession:false gives every client its own in-memory identity rather than
 * sharing one localStorage slot.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* optional */
  }
}

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.local)')
  process.exit(1)
}

const COUNT = Number(process.argv[2] || 25)
const RAMP_MS = Number(process.argv[3] || 30) * 1000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n)

const client = () => createClient(URL, KEY, { auth: { persistSession: false } })

// One shared reader to discover the session and its topics.
const reader = client()
await reader.auth.signInAnonymously()

const { data: session } = await reader.from('sessions').select('*').is('archived_at', null).single()
if (!session) {
  console.error('No active session.')
  process.exit(1)
}
console.log(`session "${session.name}" — phase: ${session.phase}`)
if (session.phase !== 'voting_open') {
  console.error(`Voting is not open (phase: ${session.phase}). Open voting first.`)
  process.exit(1)
}

const { data: topics } = await reader
  .from('topics')
  .select('id')
  .eq('session_id', session.id)
  .eq('status', 'active')
console.log(`${topics.length} topics · simulating ${COUNT} voters over ${RAMP_MS / 1000}s\n`)

const tally = { ok: 0, signinFailed: 0, voteFailed: 0 }
const errors = new Map()
const note = (e) => errors.set(e, (errors.get(e) ?? 0) + 1)

const started = Date.now()
await Promise.all(
  Array.from({ length: COUNT }, async (_, i) => {
    await sleep((RAMP_MS / COUNT) * i)
    const c = client()

    const { error: authErr } = await c.auth.signInAnonymously()
    if (authErr) {
      tally.signinFailed++
      note(`signin: ${authErr.message}`)
      return
    }

    const ids = pick(
      topics.map((t) => t.id),
      Math.min(3, topics.length),
    )
    const { error } = await c.rpc('cast_ballot', { p_topic_ids: ids })
    if (error) {
      tally.voteFailed++
      note(`vote: ${error.message}`)
      return
    }
    tally.ok++
  }),
)

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(`ballots cast : ${tally.ok}/${COUNT}  (${elapsed}s)`)
if (tally.signinFailed) console.log(`signin failed: ${tally.signinFailed}`)
if (tally.voteFailed) console.log(`vote failed  : ${tally.voteFailed}`)
for (const [msg, n] of errors) console.log(`  ${n}x ${msg}`)

const { data: stats } = await reader.rpc('session_stats', { p_session: session.id })
const s = Array.isArray(stats) ? stats[0] : stats
console.log(`\nserver reports ${s.ballot_count} ballots across ${s.topic_count} topics`)

// The embargo must hold even under load.
const { data: leak } = await reader.from('topic_vote_counts').select('*')
console.log(
  leak?.length
    ? `!! EMBARGO LEAK: an attendee read ${leak.length} tally rows during voting`
    : 'embargo holding: attendee reads 0 tally rows during voting',
)
