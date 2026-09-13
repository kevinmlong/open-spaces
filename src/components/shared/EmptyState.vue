<script setup>
defineProps({ title: String, body: { type: String, default: null } })
</script>

<template>
  <div class="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
    <p class="font-semibold text-navy">{{ title }}</p>
    <p v-if="body" class="mt-1 text-sm text-slate-500">{{ body }}</p>
  </div>
</template>
