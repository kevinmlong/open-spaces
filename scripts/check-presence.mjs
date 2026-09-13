#!/usr/bin/env node
/**
 * Proves the "in the room" headcount counts PEOPLE, not tabs or screens.
 *
 * Asserts three things that were all wrong before:
 *   1. attendees are counted at all (they used to never announce themselves)
 *   2. two tabs sharing one identity count as ONE person
 *   3. the projector does not count itself
 *
 * Runs on its own channel name so open browser tabs on the dev server cannot
 * pollute the counts -- presence semantics are identical either way.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]
}
const U = process.env.VITE_SUPABASE_URL, K = process.env.VITE_SUPABASE_ANON_KEY
const mk = () => createClient(U, K, { auth: { persistSession: false } })
const ok = (m) => console.log('  ✓', m)
const bad = (m) => { console.log('  ✗', m); process.exitCode = 1 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const admin = mk()
{
  const { error } = await admin.auth.signInWithPassword({
    email: 'organizer1@dcstateofthestack.org', password: 'openspaces-local-dev',
  })
  if (error) {
    console.error(`admin sign-in failed: ${error.message}`)
    console.error('Run `npm run seed:admin` (a db reset wipes the organizer accounts).')
    process.exit(1)
  }
}
const { data: s } = await admin.from('sessions').select('*').is('archived_at', null).maybeSingle()
if (!s) {
  console.error('No active session found. Run `npm run db:reset`.')
  process.exit(1)
}
if (s.phase === 'draft') {
  await admin.rpc('set_phase', { p_session: s.id, p_phase: 'proposals_open', p_minutes: 30 })
}

const CHANNEL = `os:presence-check-${crypto.randomUUID()}`

async function join(client, { track, key }) {
  const ch = client.channel(CHANNEL,
    track ? { config: { presence: { key, enabled: true } } } : {})
  const state = { count: 0 }
  ch.on('presence', { event: 'sync' }, () => {
    state.count = Object.keys(ch.presenceState()).length
  })
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('subscribe timeout')), 15000)
    ch.subscribe(async (st) => {
      if (st === 'SUBSCRIBED') {
        if (track) await ch.track({ at: Date.now() })
        clearTimeout(t); res()
      }
      if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(st)) { clearTimeout(t); rej(new Error(st)) }
    })
  })
  return { ch, state, client }
}

// The projector: observes only.
const displayClient = mk(); await displayClient.auth.signInAnonymously()
const display = await join(displayClient, { track: false })
await sleep(1500)
display.state.count === 0
  ? ok('projector alone reports 0 in the room (it does not count itself)')
  : bad(`projector counted itself: ${display.state.count}`)

// Attendee A, two tabs sharing one anonymous identity.
const aClient = mk(); const { data: aAuth } = await aClient.auth.signInAnonymously()
const aId = aAuth.user.id
const tab1 = await join(mk(), { track: true, key: aId })
await sleep(1500)
display.state.count === 1
  ? ok('one attendee joins → projector shows 1')
  : bad(`expected 1, got ${display.state.count}`)

const tab2 = await join(mk(), { track: true, key: aId })
await sleep(1500)
display.state.count === 1
  ? ok('SAME person opens a second tab → still 1 (counts people, not tabs)')
  : bad(`second tab inflated the count to ${display.state.count}`)

// A genuinely different attendee.
const bClient = mk(); const { data: bAuth } = await bClient.auth.signInAnonymously()
const other = await join(mk(), { track: true, key: bAuth.user.id })
await sleep(1500)
display.state.count === 2
  ? ok('a different person joins → 2')
  : bad(`expected 2, got ${display.state.count}`)

// Leaving decrements.
await tab1.ch.unsubscribe(); await tab2.ch.unsubscribe()
await sleep(2000)
display.state.count === 1
  ? ok('that person closes both tabs → back to 1')
  : bad(`expected 1 after leaving, got ${display.state.count}`)

await other.ch.unsubscribe()
await display.ch.unsubscribe()
process.exit(process.exitCode ?? 0)
