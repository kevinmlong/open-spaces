<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useTopicsStore } from '@/stores/topics'
import { useSessionChannel } from '@/composables/useSessionChannel'
import BrandHeader from '@/components/shared/BrandHeader.vue'
import AdminNav from '@/components/admin/AdminNav.vue'
import ErrorNote from '@/components/shared/ErrorNote.vue'
import EmptyState from '@/components/shared/EmptyState.vue'

const session = useSessionStore()
const topics = useTopicsStore()
useSessionChannel()

const picked = ref([])
const mergeTitle = ref('')
const pairs = ref([])
const error = ref(null)
const showArchive = ref(false)

const survivor = computed(() => topics.byId.get(picked.value[0]) ?? null)

function toggle(id) {
  const i = picked.value.indexOf(id)
  if (i >= 0) picked.value = picked.value.filter((x) => x !== id)
  else picked.value = [...picked.value, id]
  mergeTitle.value = survivor.value?.title ?? ''
}

async function loadPairs() {
  try {
    pairs.value = await topics.similarPairs()
  } catch {
    pairs.value = []
  }
}

/**
 * Merge everything after the first into the first. Soft and reversible: nothing
 * is deleted, so a wrong merge on stage is one click to undo.
 */
async function doMerge() {
  if (picked.value.length < 2) return
  error.value = null
  const [into, ...rest] = picked.value
  try {
    for (const from of rest) {
      await topics.merge(from, into, mergeTitle.value.trim() || null)
    }
    picked.value = []
    mergeTitle.value = ''
    await topics.fetch()
    await loadPairs()
  } catch (e) {
    error.value = e
  }
}

async function act(fn, ...args) {
  error.value = null
  try {
    await fn(...args)
    await topics.fetch()
    await loadPairs()
  } catch (e) {
    error.value = e
  }
}

onMounted(loadPairs)
watch(() => topics.activeList.length, loadPairs)
</script>

<template>
  <div>
    <BrandHeader subtitle="Curate" />
    <AdminNav />

    <main class="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <ErrorNote :error="error" />

      <div
        v-if="session.phase === 'proposals_open'"
        class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        Proposals are still open — topics may keep arriving while you work.
      </div>

      <!-- Similarity suggestions: trigram-based, purely advisory. -->
      <section v-if="pairs.length" class="rounded-xl bg-white p-5 shadow-sm">
        <h3 class="font-bold text-navy">Possible duplicates</h3>
        <p class="mt-1 text-sm text-slate-500">
          Suggestions only — nothing changes until you merge.
        </p>
        <ul class="mt-3 space-y-2">
          <li
            v-for="p in pairs"
            :key="p.a + p.b"
            class="flex items-center gap-3 rounded-lg bg-slate-50 p-3"
          >
            <div class="min-w-0 flex-1 text-sm">
              <p class="truncate font-medium text-navy">{{ p.a_title }}</p>
              <p class="truncate text-slate-500">{{ p.b_title }}</p>
            </div>
            <span class="shrink-0 text-xs font-bold tabular-nums text-slate-400">
              {{ Math.round(p.sim * 100) }}%
            </span>
            <button
              class="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy"
              @click="picked = [p.a, p.b]; mergeTitle = p.a_title"
            >
              Select both
            </button>
          </li>
        </ul>
      </section>

      <!-- Merge tray -->
      <section v-if="picked.length" class="sticky top-2 z-10 rounded-xl bg-navy p-4 text-white shadow-lg">
        <p class="text-sm font-semibold">
          {{ picked.length }} selected —
          {{ picked.length < 2 ? 'pick at least one more to merge' : 'first pick is the survivor' }}
        </p>
        <div v-if="picked.length >= 2" class="mt-3 flex flex-wrap gap-2">
          <input
            v-model="mergeTitle"
            maxlength="120"
            placeholder="Combined title"
            class="min-w-0 flex-1 rounded-lg px-3 py-2 text-navy"
          />
          <button class="rounded-lg bg-teal px-4 py-2 font-semibold" @click="doMerge">
            Merge {{ picked.length }}
          </button>
        </div>
        <button class="mt-2 text-xs text-white/60 hover:underline" @click="picked = []">
          Clear selection
        </button>
      </section>

      <!-- Active topics -->
      <section class="space-y-2">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {{ topics.activeList.length }} active topics
        </h3>
        <EmptyState v-if="!topics.activeList.length" title="No topics yet" />
        <div
          v-for="t in topics.activeList"
          :key="t.id"
          class="flex items-center gap-3 rounded-xl border-2 bg-white p-3"
          :class="picked.includes(t.id) ? 'border-teal' : 'border-transparent'"
        >
          <input
            type="checkbox"
            class="size-5 shrink-0 accent-teal"
            :checked="picked.includes(t.id)"
            @change="toggle(t.id)"
          />
          <span class="min-w-0 flex-1 font-medium text-navy">
            {{ t.title }}
            <span v-if="t.source === 'mic'" class="ml-1 text-xs text-pink">🎤</span>
          </span>
          <button
            class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-pink hover:bg-pink/10"
            @click="act(topics.remove, t.id)"
          >
            Remove
          </button>
        </div>
      </section>

      <!-- Everything removed or merged stays here, one click from coming back. -->
      <section v-if="topics.removedList.length || topics.mergedList.length">
        <button
          class="text-sm font-semibold text-slate-500 hover:underline"
          @click="showArchive = !showArchive"
        >
          {{ showArchive ? 'Hide' : 'Show' }}
          {{ topics.removedList.length + topics.mergedList.length }} removed / merged
        </button>

        <div v-if="showArchive" class="mt-3 space-y-2">
          <div
            v-for="t in topics.removedList"
            :key="t.id"
            class="flex items-center gap-3 rounded-lg bg-slate-100 p-3 text-sm"
          >
            <span class="flex-1 text-slate-500 line-through">{{ t.title }}</span>
            <button class="font-semibold text-teal hover:underline" @click="act(topics.restore, t.id)">
              Restore
            </button>
          </div>
          <div
            v-for="t in topics.mergedList"
            :key="t.id"
            class="flex items-center gap-3 rounded-lg bg-slate-100 p-3 text-sm"
          >
            <span class="flex-1 text-slate-500">
              {{ t.title }}
              <span class="text-xs">
                → {{ topics.byId.get(t.merged_into_topic_id)?.title ?? 'merged' }}
              </span>
            </span>
            <button class="font-semibold text-teal hover:underline" @click="act(topics.unmerge, t.id)">
              Un-merge
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
