<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BrandHeader from '@/components/shared/BrandHeader.vue'
import ErrorNote from '@/components/shared/ErrorNote.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  try {
    await auth.signInAdmin(email.value.trim(), password.value)
    if (!auth.isAdmin) throw new Error('forbidden')
    router.push(route.query.r || { name: 'admin-run' })
  } catch (e) {
    error.value = e
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <BrandHeader subtitle="Organizers" />
    <main class="mx-auto max-w-sm px-4 py-10">
      <h2 class="text-xl font-bold text-navy">Organizer sign in</h2>
      <form class="mt-6 space-y-3" @submit.prevent="submit">
        <input
          v-model="email"
          type="email"
          autocomplete="username"
          placeholder="Email"
          class="w-full rounded-xl border border-slate-300 px-4 py-3"
        />
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="Password"
          class="w-full rounded-xl border border-slate-300 px-4 py-3"
        />
        <ErrorNote :error="error" />
        <button
          type="submit"
          :disabled="busy"
          class="w-full rounded-xl bg-teal py-3 font-semibold text-white disabled:opacity-40"
        >
          {{ busy ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </main>
  </div>
</template>
