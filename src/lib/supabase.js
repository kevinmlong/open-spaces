import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at import time. A build that silently ships `undefined` as the URL
// is a white screen and a twenty-minute debugging session you cannot afford on
// the day.
if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.\n' +
      'Run `supabase start`, then copy the values from `supabase status` into .env.local',
  )
}

// A singleton. A second client means a second websocket and duplicate realtime
// events, which look exactly like a race condition and are miserable to debug.
export const supabase = createClient(url, key, {
  auth: {
    // Keeps the same anonymous auth.uid() across reloads -- which is what makes
    // "one ballot per device" actually stick.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 20 } },
})

// The realtime socket carries a JWT snapshot. Without this, changes silently stop
// arriving after a token refresh -- the worst failure mode in this app, because
// nothing errors, the room just quietly stops updating.
supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
    supabase.realtime.setAuth(session.access_token)
  }
})
