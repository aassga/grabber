<template>
  <div id="app">
    <nav class="navbar">
      <div class="nav-brand">
        <span class="brand-icon">🎫</span>
        <span class="brand-name">KKTIX 搶票工具</span>
      </div>
      <!-- 漢堡按鈕（手機版） -->
      <button class="hamburger" @click="menuOpen = !menuOpen" :class="{ open: menuOpen }">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" :class="{ 'menu-open': menuOpen }" @click="menuOpen = false">
        <router-link to="/events" class="nav-item">
          <span class="nav-icon">🎪</span>活動瀏覽
        </router-link>
        <router-link to="/schedule" class="nav-item">
          <span class="nav-icon">📅</span>排程搶票
          <span v-if="waitingCount > 0" class="nav-badge">{{ waitingCount }}</span>
        </router-link>
        <router-link to="/settings" class="nav-item">
          <span class="nav-icon">⚙️</span>設定
        </router-link>
        <router-link to="/accounts" class="nav-item">
          <span class="nav-icon">👤</span>帳號管理
        </router-link>
        <router-link to="/monitor" class="nav-item">
          <span class="nav-icon">📊</span>監控紀錄
        </router-link>
      </div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script>
import { grabberStore } from './store/grabberStore'
import socketService from './services/socket'

export default {
  name: 'App',
  data() {
    return { scheduleTimer: null, menuOpen: false }
  },
  computed: {
    waitingCount() {
      return grabberStore.schedules.filter(s => s.status === 'waiting').length
    },
    monitorRunning() {
      return grabberStore.monitor.running
    },
  },
  watch: {
    monitorRunning(newVal, oldVal) {
      if (oldVal && !newVal) {
        const runningItem = grabberStore.schedules.find(s => s.status === 'running')
        if (runningItem) {
          const status = grabberStore.monitor.currentStatus
          runningItem.status = status.includes('成功') ? 'done' : 'failed'
          runningItem.result = status
        }
      }
    },
  },
  mounted() {
    socketService.connect()
    this.scheduleTimer = setInterval(() => {
      const now = Date.now()
      const item = grabberStore.schedules.find(s => {
        if (s.status !== 'waiting') return false
        return new Date(s.scheduledTime).getTime() <= now
      })
      if (item) grabberStore.triggerSchedule(item, socketService)
    }, 1000)
  },
  beforeUnmount() {
    clearInterval(this.scheduleTimer)
  },
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', '微軟正黑體', sans-serif;
  background: #0f1117;
  color: #e2e8f0;
  min-height: 100vh;
}

#app { display: flex; flex-direction: column; min-height: 100vh; }

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 60px;
  background: #1a1d2e;
  border-bottom: 1px solid #2d3561;
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  color: #7c6aff;
}

.brand-icon { font-size: 22px; }

.nav-links { display: flex; gap: 8px; }

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  text-decoration: none;
  color: #94a3b8;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.nav-item:hover { background: #2d3561; color: #e2e8f0; }
.nav-item.router-link-active { background: #2d3561; color: #7c6aff; }
.nav-icon { font-size: 16px; }
.nav-badge {
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 2px;
}

.main-content { flex: 1; padding: 24px; max-width: 1100px; margin: 0 auto; width: 100%; }

/* ── 漢堡按鈕 ── */
.hamburger {
  display: none;
  flex-direction: column;
  justify-content: space-between;
  width: 28px;
  height: 20px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
}
.hamburger span {
  display: block;
  height: 2px;
  background: #94a3b8;
  border-radius: 2px;
  transition: all 0.3s;
}
.hamburger.open span:nth-child(1) { transform: translateY(9px) rotate(45deg); }
.hamburger.open span:nth-child(2) { opacity: 0; }
.hamburger.open span:nth-child(3) { transform: translateY(-9px) rotate(-45deg); }

/* ── RWD 斷點 ── */
@media (max-width: 768px) {
  .navbar { padding: 0 16px; height: 56px; position: relative; }
  .hamburger { display: flex; }
  .nav-brand { flex: 1; }
  .brand-name { font-size: 15px; }

  .nav-links {
    display: none;
    position: absolute;
    top: 56px;
    left: 0;
    right: 0;
    background: #1a1d2e;
    border-bottom: 1px solid #2d3561;
    flex-direction: column;
    padding: 8px 12px 16px;
    gap: 4px;
    z-index: 99;
  }
  .nav-links.menu-open { display: flex; }
  .nav-item { padding: 12px 16px; font-size: 15px; border-radius: 8px; }

  .main-content { padding: 16px 12px; }
}

@media (max-width: 480px) {
  .brand-name { display: none; }
  .main-content { padding: 12px 8px; }
}

.card {
  background: #1a1d2e;
  border: 1px solid #2d3561;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #7c6aff;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.form-full { grid-column: 1 / -1; }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 13px; color: #94a3b8; font-weight: 500; }

.form-input, .form-select {
  background: #0f1117;
  border: 1px solid #2d3561;
  border-radius: 8px;
  padding: 10px 14px;
  color: #e2e8f0;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus, .form-select:focus { border-color: #7c6aff; }
.form-select option { background: #1a1d2e; }

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #2d3561;
}
.toggle-row:last-child { border-bottom: none; }
.toggle-label { font-size: 14px; color: #cbd5e1; }
.toggle-desc { font-size: 12px; color: #64748b; margin-top: 2px; }

.toggle {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  inset: 0;
  background: #2d3561;
  border-radius: 24px;
  cursor: pointer;
  transition: 0.3s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}
.toggle input:checked + .toggle-slider { background: #7c6aff; }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); }

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.btn-primary { background: #7c6aff; color: white; }
.btn-primary:hover { background: #6855e8; }
.btn-success { background: #22c55e; color: white; }
.btn-success:hover { background: #16a34a; }
.btn-danger { background: #ef4444; color: white; }
.btn-danger:hover { background: #dc2626; }
.btn-outline {
  background: transparent;
  border: 1px solid #2d3561;
  color: #94a3b8;
}
.btn-outline:hover { border-color: #7c6aff; color: #7c6aff; }
.btn-sm { padding: 6px 12px; font-size: 12px; }

@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr; }
  .card { padding: 16px; }
  .card-title { font-size: 14px; }
  .btn { font-size: 13px; }
}
</style>
