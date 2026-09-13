<script setup>
import { useCountdown } from '@/composables/useCountdown'

defineProps({ size: { type: String, default: 'md' }, label: { type: String, default: 'left' } })
const { text: countdown, urgent, expired } = useCountdown()

const SIZES = {
  md: 'text-3xl',
  lg: 'text-6xl',
  xl: 'text-[7rem] leading-none',
}
</script>

<template>
  <div v-if="countdown" class="text-center">
    <p
      data-test="countdown"
      class="font-extrabold transition-colors"
      :class="[
        SIZES[size],
        expired ? 'text-teal' : 'tabular-nums',
        urgent ? 'text-pink' : expired ? '' : 'text-navy',
      ]"
    >
      {{ countdown }}
    </p>
    <p v-if="!expired" class="text-xs font-semibold tracking-widest text-slate-500 uppercase">
      {{ label }}
    </p>
  </div>
</template>
