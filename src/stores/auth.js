import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const isAdmin = ref(false)
  const bootstrapError = ref(null)

  let booting = null

  /**
   * Idempotent. Every route guard awaits this, so it must only ever run once --
   * two concurrent signInAnonymously() calls would create two identities and
   * therefore two ballots.
   */
  async function bootstrap() {
    if (booting) return booting

    booting = (async () => {
      let {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          // Almost always the per-IP anonymous sign-in rate limit -- the whole
          // venue is behind one NAT address. Surfacing it beats a spinner.
          bootstrapError.value = error
          throw error
        }
        session = data.session
      }

      user.value = session.user
      supabase.realtime.setAuth(session.access_token)
      await refreshAdmin()
      return session
    })()

    return booting
  }

  async function refreshAdmin() {
    if (!user.value || user.value.is_anonymous) {
      isAdmin.value = false
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.value.id)
      .maybeSingle()
    isAdmin.value = !!data?.is_admin
  }

  async function signInAdmin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    user.value = data.user
    supabase.realtime.setAuth(data.session.access_token)
    await refreshAdmin()
    return data.user
  }

  async function signOut() {
    await supabase.auth.signOut()
    isAdmin.value = false
    user.value = null
    booting = null
    // Drop straight back to an anonymous identity so the app keeps working.
    await bootstrap()
  }

  return {
    user,
    isAdmin,
    bootstrapError,
    userId: computed(() => user.value?.id ?? null),
    isAnonymous: computed(() => !!user.value?.is_anonymous),
    bootstrap,
    refreshAdmin,
    signInAdmin,
    signOut,
  }
})
