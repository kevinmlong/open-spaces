import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/', name: 'attendee', component: () => import('@/views/AttendeeView.vue') },
  {
    path: '/display',
    name: 'display',
    component: () => import('@/views/DisplayView.vue'),
    meta: { bare: true },
  },
  {
    path: '/schedule',
    name: 'schedule',
    component: () => import('@/views/ScheduleView.vue'),
  },
  { path: '/admin', name: 'admin-login', component: () => import('@/views/admin/AdminLogin.vue') },
  {
    path: '/admin/run',
    name: 'admin-run',
    component: () => import('@/views/admin/AdminRunView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/curate',
    name: 'admin-curate',
    component: () => import('@/views/admin/AdminCurateView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/schedule',
    name: 'admin-schedule',
    component: () => import('@/views/admin/AdminScheduleView.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/sessions',
    name: 'admin-sessions',
    component: () => import('@/views/admin/AdminSessionsView.vue'),
    meta: { requiresAdmin: true },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  try {
    await auth.bootstrap()
  } catch {
    // Anonymous sign-in failed (almost always the per-IP rate limit). Let the
    // view render and show the real reason rather than bouncing the user.
    return true
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'admin-login', query: { r: to.fullPath } }
  }
  return true
})
