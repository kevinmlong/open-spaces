<script setup>
defineProps({ status: { type: String, required: true } })

const LABEL = { live: 'Live', degraded: 'Reconnecting…', connecting: 'Connecting…' }
const STYLE = {
  live: 'bg-teal/10 text-teal',
  degraded: 'bg-amber-100 text-amber-800',
  connecting: 'bg-slate-100 text-slate-600',
}
</script>

<template>
  <!-- Making the connection state visible beats leaving people wondering why
       nothing is happening. -->
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
    :class="STYLE[status]"
  >
    <span
      class="size-1.5 rounded-full"
      :class="status === 'live' ? 'bg-teal' : status === 'degraded' ? 'bg-amber-500' : 'bg-slate-400'"
    />
    {{ LABEL[status] }}
  </span>
</template>
