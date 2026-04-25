import { createRouter, createWebHashHistory } from 'vue-router'
import SettingsView from '../views/SettingsView.vue'
import AccountsView from '../views/AccountsView.vue'
import MonitorView from '../views/MonitorView.vue'
import ScheduleView from '../views/ScheduleView.vue'

const routes = [
  { path: '/', redirect: '/schedule' },
  { path: '/settings', component: SettingsView },
  { path: '/accounts', component: AccountsView },
  { path: '/monitor', component: MonitorView },
  { path: '/schedule', component: ScheduleView },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})
