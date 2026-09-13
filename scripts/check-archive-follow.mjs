#!/usr/bin/env node
/**
 * Proves a live screen follows the room into a new session when the old one is
 * archived.
 *
 * This is the Day 1 -> Day 2 transition, and it used to strand every device on
 * "Thanks for joining us": the realtime channel is filtered to a single session
 * id, so the archive UPDATE is the last thing it ever hears.
 *
 * Destructive and local-only.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2]
}
const ok = (m) => console.log('  ✓', m)
const bad = (m) => { console.log('  ✗', m); process.exitCode = 1 }

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
{
  const { error } = await admin.auth.signInWithPassword({
    email: 'organizer1@dcstateofthestack.org', password: 'openspaces-local-dev',
  })
  if (error) { console.error(`admin sign-in failed: ${error.message}`); process.exit(1) }
}

// Start from a session with proposals open and something on screen.
let { data: s } = await admin.from('sessions').select('*').is('archived_at', null).maybeSingle()
if (!s) { console.error('No active session. Run npm run db:reset && npm run seed:admin'); process.exit(1) }
if (s.phase !== 'proposals_open') {
  const { data } = await admin.rpc('archive_session', { p_new_name: 'Archive-follow check' })
  s = Array.isArray(data) ? data[0] : data
  await admin.rpc('set_phase', { p_session: s.id, p_phase: 'proposals_open', p_minutes: 30 })
}
await admin.from('topics').insert({ session_id: s.id, title: 'Topic before the archive' })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto('http://localhost:5173/display', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

const before = await page.textContent('main')
before.includes('Topic before the archive')
  ? ok('display is showing the current session')
  : bad(`display did not show the seeded topic (saw: ${before.slice(0, 80)}…)`)

// The organizer archives and starts the next session.
const { data: fresh, error } = await admin.rpc('archive_session', { p_new_name: 'Day 2 Open Spaces' })
if (error) { console.error(error.message); process.exit(1) }
const next = Array.isArray(fresh) ? fresh[0] : fresh
console.log(`  … archived; new session is "${next.name}" (${next.phase})`)

// Give it time to notice, re-fetch and re-subscribe.
await page.waitForTimeout(6000)
const after = await page.textContent('main')

after.includes('Thanks for joining us')
  ? bad('display is STRANDED on the archived session')
  : ok('display left the archived session behind')
after.includes('Starting soon')
  ? ok('display followed the room into the new draft session')
  : bad(`expected the new session's holding screen (saw: ${after.slice(0, 80)}…)`)

// And it must be live on the NEW session, not merely showing the right words.
await admin.rpc('set_phase', { p_session: next.id, p_phase: 'proposals_open', p_minutes: 30 })
await admin.from('topics').insert({ session_id: next.id, title: 'Topic after the archive' })
await page.waitForTimeout(4000)
const live = await page.textContent('main')
live.includes('Topic after the archive')
  ? ok('realtime is live on the new session (a new topic arrived without a refresh)')
  : bad('display did not receive topics from the new session')

await browser.close()
process.exit(process.exitCode ?? 0)
