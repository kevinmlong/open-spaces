<script setup>
import { computed } from 'vue'
import { humanError } from '@/lib/errors'

const props = defineProps({ error: { type: [Object, String], default: null } })
const text = computed(() => humanError(props.error))
</script>

<template>
  <p v-if="text" class="rounded-lg bg-pink/10 px-3 py-2 text-sm font-medium text-pink" role="alert">
    {{ text }}
  </p>
</template>
