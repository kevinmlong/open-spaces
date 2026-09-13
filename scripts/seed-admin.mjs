#!/usr/bin/env node
/**
 * Creates local organizer accounts and flips profiles.is_admin.
 *
 * Uses the service role key, which bypasses RLS entirely -- that is exactly why
 * it is read from a non-VITE_ variable and lives in a script rather than
 * anywhere near src/.
 *
 *   node scripts/seed-admin.mjs                          # local stack
 *   node scripts/seed-admin.mjs --env .env.production.local --allow-remote
 *
 * Pointing this at a hosted project needs --allow-remote, said out loud. It
 * creates real accounts with a known password, so it should never happen by
 * accident because someone had the wrong env file loaded.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const args = process.argv.slice(2)
const allowRemote = args.includes('--allow-remote')
const envIdx = args.indexOf('--env')
if (envIdx !== -1 && args[envIdx + 1]) loadEnv(args[envIdx + 1])
loadEnv()

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const emails = (process.env.SEED_ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean)
const password = process.env.SEED_ADMIN_PASSWORD || 'openspaces-local-dev'

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run `supabase start`, then copy them from `supabase status` into .env.local')
  process.exit(1)
}
if (!emails.length) {
  console.error('Set SEED_ADMIN_EMAILS in .env.local (comma separated).')
  process.exit(1)
}
const isLocal = /127\.0\.0\.1|localhost/.test(url)
if (!isLocal && !allowRemote) {
  console.error(`Refusing to run against a non-local URL without --allow-remote: ${url}`)
  process.exit(1)
}
if (!isLocal) console.log(`! creating REAL organizer accounts on ${url}\n`)

const admin = createClient(url, key, { auth: { persistSession: false } })

for (const email of emails) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  let id = data?.user?.id
  if (error) {
    if (!/already/i.test(error.message)) {
      console.error(`✗ ${email}: ${error.message}`)
      continue
    }
    const { data: list } = await admin.auth.admin.listUsers()
    id = list?.users?.find((u) => u.email === email)?.id
  }
  if (!id) {
    console.error(`✗ ${email}: could not resolve a user id`)
    continue
  }

  const { error: upErr } = await admin
    .from('profiles')
    .update({ is_admin: true, email })
    .eq('id', id)
  if (upErr) console.error(`✗ ${email}: ${upErr.message}`)
  else console.log(`✓ ${email} is an admin  (password: ${password})`)
}
