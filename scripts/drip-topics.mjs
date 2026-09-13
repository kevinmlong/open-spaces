#!/usr/bin/env node
/**
 * Feeds topics in one at a time, like a real room filling up.
 *
 *   node scripts/drip-topics.mjs [seconds] [--fresh]
 *
 * --fresh archives whatever session is live and starts a blank one with
 * proposals open, so you get a clean run every time.
 *
 * Useful for watching /display behave: the hero swapping, the displaced topic
 * flashing into the wall, the masonry re-packing as columns grow, and the
 * scroll resetting on each arrival. Ctrl-C to stop.
 *
 * Local only, and destructive with --fresh.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const f of ['.env.local', '.env']) {
  try {
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
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

const args = process.argv.slice(2)
const fresh = args.includes('--fresh')
const seconds = Number(args.find((a) => !a.startsWith('--')) || 3)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A deliberate spread of lengths so the hero and wall size rules get exercised.
const POOL = [
  'Do we still need staging?',
  'Testing AI-generated code',
  'Who actually owns the platform?',
  'Kubernetes: regrets?',
  'Postgres as the whole backend',
  'SLOs that people actually read',
  'Incident reviews without blame',
  'Feature flags at scale',
  'Is pair programming dead?',
  'The cost of a bad abstraction',
  'Hiring juniors in the age of AI',
  'Observability beyond dashboards',
  'Terraform vs Pulumi vs neither',
  'Designing for on-call sanity',
  'The README nobody reads',
  'When to say no to a customer',
  'Local dev environments that just work',
  'Migrating off a monolith without stopping feature work',
  'Async-first teams across time zones',
  'Trunk-based development in a regulated shop',
  'What actually passes a security audit',
  'Postgres full-text search vs Elastic',
  'Platform teams: still worth it?',
  'Agentic coding in regulated environments',
  'How much test coverage is enough, really?',
  'Paying down tech debt without a rewrite',
  'Docs that survive contact with reality',
  'Monorepo or many repos?',
  'Shipping on Fridays',
  'The interview question you would ban',
  'Event sourcing: worth the pain?',
  'gRPC or just JSON over HTTP?',
  'Who reviews the AI reviewer?',
  'Killing a product nobody uses',
  'Blue-green deploys on a shoestring',
  'Why is our CI so slow?',
  'Secrets management without a vault team',
  'Designing APIs you will not regret',
  'Contract testing between teams',
  'What we got wrong about microservices',
  'Running ML models without a GPU budget',
  'Accessibility as a default, not a ticket',
  'Data retention: what we actually have to keep',
  'On-call compensation, honestly',
  'Scaling a team past fifteen people',
  'Choosing boring technology on purpose',
  'Rewriting the frontend, again',
  'How do you onboard in week one?',
  'Multi-region without going bankrupt',
  'Postmortems people actually read',
  'Caching: the two hardest problems',
  'Do design systems survive first contact?',
  'Estimating work without lying',
  'Open source in a compliance-heavy shop',
  'The build vs buy conversation',
  'Load testing that reflects reality',
  'Zero-downtime schema migrations',
  'When the vendor sunsets your dependency',
  'Developer experience as a real metric',
  'Retiring a service nobody remembers owning',
  'What does senior actually mean here?',
  'Queues, streams, or just a database table?',
  'Fighting flaky tests and winning',
  'Documentation for future you',
  'Right-sizing cloud spend after the growth phase',
  'Pager fatigue and what fixed it',
  'Feature branches considered harmful?',
  'Making the on-ramp shorter for contributors',
  'Security reviews that do not block shipping',
  'The metrics we stopped collecting',
]

const admin = createClient(URL, KEY, { auth: { persistSession: false } })
{
  const { error } = await admin.auth.signInWithPassword({
    email: 'organizer1@dcstateofthestack.org',
    password: 'openspaces-local-dev',
  })
  if (error) {
    console.error(`admin sign-in failed: ${error.message}`)
    console.error('Run `npm run seed:admin` (a db reset wipes the organizer accounts).')
    process.exit(1)
  }
}

let { data: session } = await admin.from('sessions').select('*').is('archived_at', null).maybeSingle()

if (fresh) {
  const { data, error } = await admin.rpc('archive_session', { p_new_name: 'Open Spaces demo' })
  if (error) {
    console.error(`archive failed: ${error.message}`)
    process.exit(1)
  }
  session = Array.isArray(data) ? data[0] : data
  console.log(`archived the old session; started "${session.name}"`)
}

if (!session) {
  console.error('No active session. Run `npm run db:reset && npm run seed:admin`.')
  process.exit(1)
}

if (session.phase !== 'proposals_open') {
  const { error } = await admin.rpc('set_phase', {
    p_session: session.id,
    p_phase: 'proposals_open',
    p_minutes: 10,
  })
  if (error) {
    console.error(`could not open proposals from "${session.phase}": ${error.message}`)
    console.error('Try again with --fresh.')
    process.exit(1)
  }
}

console.log(`proposals open · adding a topic every ${seconds}s · Ctrl-C to stop\n`)

let stopped = false
process.on('SIGINT', () => {
  stopped = true
  console.log('\nstopped.')
  process.exit(0)
})

for (let i = 0; i < POOL.length && !stopped; i++) {
  const title = POOL[i]
  // Every 6th one comes "from the mic", so the 🎤 chip shows up too.
  const source = i > 0 && i % 6 === 0 ? 'mic' : 'attendee'
  const { error } = await admin.from('topics').insert({
    session_id: session.id,
    title,
    source,
  })
  console.log(
    error ? `  ! ${title} — ${error.message}` : `  ${String(i + 1).padStart(2)} ${source === 'mic' ? '🎤' : '  '} ${title}`,
  )
  await sleep(seconds * 1000)
}

if (!stopped) console.log(`\ndone — ${POOL.length} topics added.`)
