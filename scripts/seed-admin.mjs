#!/usr/bin/env node
/**
 * Creates local organizer accounts and flips profiles.is_admin.
 *
 * LOCAL DEVELOPMENT ONLY. This uses the service role key, which bypasses RLS
 * entirely -- that is exactly why it is read from a non-VITE_ variable and lives
 * in a script rather than anywhere near src/.
 *
 * In production you create the two organizer accounts in the Supabase dashboard
 * and flip is_admin in the SQL editor.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  } catch {
    /* file is optional */
  }
}
loadEnv('.env.local')
loadEnv('.env')

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
if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error(`Refusing to run against a non-local URL: ${url}`)
  process.exit(1)
}

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
