#!/usr/bin/env node
/**
 * Proves the live-updating path actually works: one anonymous client subscribes,
 * another inserts, and the first must receive the change.
 *
 * Also checks that a phase change reaches a subscriber, which is what makes every
 * phone in the room switch screens at once.
 *
 * Destructive and local-only: it archives whatever session is live so it always
 * starts from a known phase, then works in the fresh one.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'
loadEnv()
const U = process.env.VITE_SUPABASE_URL
const K = process.env.VITE_SUPABASE_ANON_KEY
const mk = () => createClient(U, K, { auth: { persistSession: false } })
const ok = (m) => console.log('  ✓', m)
const bad = (m) => { console.log('  ✗', m); process.exitCode = 1 }

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
// Always start from a known state -- otherwise a rerun inherits whatever phase
// the last run left behind and the assertions become order-dependent.
let session = s
if (session.phase !== 'draft') {
  const { data: fresh } = await admin.rpc('archive_session', { p_new_name: 'Realtime check session' })
  session = Array.isArray(fresh) ? fresh[0] : fresh
}
await admin.rpc('set_phase', { p_session: session.id, p_phase: 'proposals_open', p_minutes: 10 })

// The listener: an ordinary anonymous attendee.
const listener = mk()
const { data: auth } = await listener.auth.signInAnonymously()
listener.realtime.setAuth(auth.session.access_token)

const got = { topic: null, phase: null }
const channel = listener
  .channel(`os:${session.id}`)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'topics', filter: `session_id=eq.${session.id}` },
      (p) => (got.topic = p.new))
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
      (p) => (got.phase = p.new.phase))

// Retry on CHANNEL_ERROR: straight after `supabase db reset` the realtime
// container is still coming up. The app itself does the same thing with
// jittered backoff (see useSessionChannel).
async function subscribeWithRetry(ch, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 8000)
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') { clearTimeout(t); resolve() }
          if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(t); reject(new Error(status)) }
        })
      })
      return
    } catch (e) {
      if (i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, 2000))
      ch.unsubscribe()
    }
  }
}
await subscribeWithRetry(channel)
ok('anonymous client subscribed to the session channel')

// SUBSCRIBED fires when the channel joins, but the server-side subscription row
// lands a moment later -- a write in that window is genuinely missed. That race
// is exactly why useSessionChannel does a FULL RESYNC on every SUBSCRIBED rather
// than trusting the stream from the moment it connects.
await new Promise((r) => setTimeout(r, 1500))

const marker = `Realtime check ${Date.now()}`
const writer = mk()
await writer.auth.signInAnonymously()
await writer.from('topics').insert({ session_id: session.id, title: marker })

const waitFor = async (get, label, ms = 8000) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (get()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  bad(`${label} did not arrive within ${ms}ms`)
  return false
}

if (await waitFor(() => got.topic, 'topic INSERT')) {
  got.topic.title === marker
    ? ok(`topic insert pushed to the listener in real time ("${got.topic.title}")`)
    : bad(`wrong payload: ${got.topic.title}`)
}

got.phase = null
await admin.rpc('set_phase', { p_session: session.id, p_phase: 'proposals_closed' })
if (await waitFor(() => got.phase === 'proposals_closed', 'session phase UPDATE')) {
  ok('phase change pushed to the listener ("proposals_closed") — this is what flips every screen')
}

await listener.removeChannel(channel)
process.exit(process.exitCode ?? 0)
