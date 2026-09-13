<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  open: Boolean,
  title: String,
  body: String,
  confirmLabel: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: false },
  // When set, the admin must type this exact text. Reserved for the genuinely
  // irreversible action (archiving).
  typeToConfirm: { type: String, default: null },
})
const emit = defineEmits(['confirm', 'cancel'])

const typed = ref('')
const inputEl = ref(null)

watch(
  () => props.open,
  async (v) => {
    if (v) {
      typed.value = ''
      await nextTick()
      inputEl.value?.focus()
    }
  },
)

const canConfirm = () => !props.typeToConfirm || typed.value.trim() === props.typeToConfirm
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
    role="dialog"
    aria-modal="true"
    @keydown.esc="emit('cancel')"
  >
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold text-navy">{{ title }}</h2>
      <!-- Consequence copy, not a generic "are you sure" -- the organizer is on
           stage and needs to know exactly what is about to change. -->
      <p class="mt-2 text-sm text-slate-600">{{ body }}</p>

      <label v-if="typeToConfirm" class="mt-4 block">
        <span class="text-xs font-semibold text-slate-500">
          Type <code class="font-mono text-navy">{{ typeToConfirm }}</code> to confirm
        </span>
        <input
          ref="inputEl"
          v-model="typed"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div class="mt-6 flex justify-end gap-2">
        <button
          class="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          :class="danger ? 'bg-pink' : 'bg-teal'"
          :disabled="!canConfirm()"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
