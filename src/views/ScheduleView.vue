<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">📅 排程搶票</h1>
      <p class="page-desc">預先登記多筆活動，倒數到開賣時間後自動啟動搶票</p>
    </div>

    <!-- 後端未連線警告 -->
    <div v-if="!backendConnected" class="warn-bar">
      ⚠️ 後端伺服器未連線，排程到時間後無法自動觸發。請先執行
      <code>cd server &amp;&amp; npm start</code>
    </div>

    <!-- 新增排程表單 -->
    <div class="card">
      <div class="card-title" style="justify-content: space-between; margin-bottom: 0;">
        <span>➕ 新增排程</span>
        <button class="btn btn-sm btn-outline" @click="showForm = !showForm">
          {{ showForm ? '收起' : '展開' }}
        </button>
      </div>

      <transition name="slide">
        <div v-if="showForm" class="add-form">
          <div class="form-grid" style="margin-top: 20px;">

            <!-- 活動下拉選單 -->
            <div class="form-group form-full">
              <label class="form-label">
                從活動列表選擇
                <span v-if="eventsLoading" class="loading-tag">載入中...</span>
                <button v-else class="refresh-btn" @click="loadEvents" title="重新載入">↻</button>
              </label>
              <div class="ev-dropdown" ref="evDropdown">
                <div class="ev-trigger"
                  :class="{ open: dropdownOpen, loading: eventsLoading }"
                  @click="!eventsLoading && toggleDropdown()"
                >
                  <template v-if="eventsLoading">
                    <span class="ev-placeholder">⏳ 活動列表讀取中，請稍候...</span>
                  </template>
                  <template v-else-if="selectedEvent">
                    <span class="ev-date-tag">{{ selectedEvent.date }}</span>
                    <span class="ev-name">{{ selectedEvent.title }}</span>
                    <button class="ev-clear" @click.stop="clearEvent" title="清除">✕</button>
                  </template>
                  <template v-else>
                    <span class="ev-placeholder">-- 選擇活動，自動帶入名稱、網址、日期 --</span>
                  </template>
                  <span class="ev-arrow" :class="{ rotated: dropdownOpen }">▾</span>
                </div>
                <div v-if="dropdownOpen" class="ev-list">
                  <div v-if="events.length === 0" class="ev-empty">找不到活動，請點 ↻ 重新載入</div>
                  <div v-for="e in events" :key="e.url" class="ev-item"
                    :class="{ active: draft.eventUrl === e.url }"
                    @click="pickEvent(e)"
                  >
                    <span class="ev-date-tag">{{ e.date || '日期未知' }}</span>
                    <span class="ev-name">{{ e.title }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">活動名稱 <span class="req">*</span></label>
              <input v-model="draft.name" class="form-input" placeholder="例：2024 五月天演唱會" />
            </div>
            <div class="form-group">
              <label class="form-label">開賣時間 <span class="req">*</span></label>
              <input v-model="draft.scheduledTime" class="form-input" type="datetime-local" />
            </div>
            <div class="form-group form-full">
              <label class="form-label">活動網址 <span class="req">*</span></label>
              <input v-model="draft.eventUrl" class="form-input" placeholder="https://kktix.com/events/..." />
            </div>
            <div class="form-group">
              <label class="form-label">票種名稱</label>
              <input v-model="draft.ticketType" class="form-input" placeholder="留白則自動選第一種票" />
            </div>
            <div class="form-group">
              <label class="form-label">購買數量</label>
              <input v-model.number="draft.quantity" class="form-input" type="number" min="1" max="4" />
            </div>
          </div>
          <div v-if="formError" class="form-error">{{ formError }}</div>
          <div class="form-footer">
            <p class="form-hint">帳號、付款資訊、刷新間隔等設定沿用「設定」頁的內容</p>
            <button class="btn btn-primary" @click="addSchedule">加入排程清單</button>
          </div>
        </div>
      </transition>
    </div>

    <!-- 清單為空 -->
    <div v-if="schedules.length === 0" class="empty-card">
      <div class="empty-icon">📭</div>
      <div class="empty-title">尚無排程</div>
      <div class="empty-desc">點上方「展開」填入活動資訊，開始設定排程</div>
    </div>

    <!-- 排程清單 -->
    <div v-for="item in schedules" :key="item.id" class="schedule-card" :class="item.status">
      <div class="sc-main">
        <div class="sc-info">
          <div class="sc-name">{{ item.name }}</div>
          <div class="sc-url">{{ item.eventUrl }}</div>
          <div class="sc-meta">
            <span v-if="item.ticketType" class="meta-tag">🎫 {{ item.ticketType }}</span>
            <span class="meta-tag">x{{ item.quantity }} 張</span>
            <span class="meta-tag">🕐 {{ formatTime(item.scheduledTime) }}</span>
          </div>
          <div v-if="item.result" class="sc-result" :class="item.status">
            {{ item.result }}
          </div>
        </div>

        <div class="sc-right">
          <!-- 倒數 / 狀態 -->
          <div class="sc-countdown">
            <template v-if="item.status === 'waiting'">
              <div class="cd-label">距開賣</div>
              <div class="cd-value" :class="{ urgent: isUrgent(item.scheduledTime) }">
                {{ countdown(item.scheduledTime) }}
              </div>
            </template>
            <div v-else class="status-pill" :class="item.status">
              {{ statusLabel[item.status] }}
            </div>
          </div>

          <!-- 操作按鈕 -->
          <div class="sc-actions">
            <button
              v-if="item.status === 'waiting'"
              class="btn btn-sm btn-outline"
              @click="item.status = 'paused'"
            >暫停</button>
            <button
              v-if="item.status === 'paused'"
              class="btn btn-sm btn-outline"
              @click="item.status = 'waiting'"
            >恢復</button>
            <button
              v-if="['waiting', 'paused', 'failed'].includes(item.status)"
              class="btn btn-sm btn-success"
              :disabled="!backendConnected || monitorRunning"
              @click="triggerNow(item)"
            >立即搶</button>
            <button
              v-if="item.status === 'done' || item.status === 'failed'"
              class="btn btn-sm btn-outline"
              @click="resetItem(item)"
            >重設</button>
            <button class="btn btn-sm btn-danger" @click="removeSchedule(item.id)">刪除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 統計列 -->
    <div v-if="schedules.length > 0" class="stats-row">
      <div class="stat-card">
        <div class="stat-num">{{ schedules.length }}</div>
        <div class="stat-label">總排程數</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ countByStatus('waiting') }}</div>
        <div class="stat-label">等待中</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: #22c55e;">{{ countByStatus('done') }}</div>
        <div class="stat-label">成功</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color: #ef4444;">{{ countByStatus('failed') }}</div>
        <div class="stat-label">失敗</div>
      </div>
    </div>
  </div>
</template>

<script>
import { grabberStore } from '../store/grabberStore'
import socketService from '../services/socket'

export default {
  name: 'ScheduleView',
  data() {
    return {
      showForm: true,
      formError: '',
      now: Date.now(),
      ticker: null,
      draft: {
        name: '',
        eventUrl: '',
        ticketType: '',
        quantity: 1,
        scheduledTime: '',
      },
      statusLabel: {
        waiting: '等待中',
        paused: '已暫停',
        running: '搶票中...',
        done: '成功',
        failed: '失敗',
      },
      events: [],
      eventsLoading: false,
      dropdownOpen: false,
    }
  },
  computed: {
    schedules() { return grabberStore.schedules },
    backendConnected() { return grabberStore.monitor.backendConnected },
    monitorRunning() { return grabberStore.monitor.running },
    selectedEvent() {
      return this.events.find(e => e.url === this.draft.eventUrl) || null
    },
  },
  mounted() {
    this.ticker = setInterval(() => { this.now = Date.now() }, 500)
    this.loadEvents()
    document.addEventListener('click', this.onClickOutside)
  },
  beforeUnmount() {
    clearInterval(this.ticker)
    document.removeEventListener('click', this.onClickOutside)
  },
  methods: {
    async loadEvents() {
      this.eventsLoading = true
      try {
        const res = await fetch('http://localhost:3000/api/events?q=')
        const data = await res.json()
        if (data.ok) {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          this.events = data.events
            .filter(e => {
              const m = (e.date || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
              if (!m) return true
              return new Date(+m[1], +m[2] - 1, +m[3]) >= today
            })
            .sort((a, b) => {
              const parse = d => {
                const m = (d || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
                if (!m) return '9999/99/99'
                return `${m[1]}/${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}`
              }
              return parse(a.date).localeCompare(parse(b.date))
            })
        }
      } catch (e) { /* 後端未啟動時靜默 */ } finally {
        this.eventsLoading = false
      }
    },
    toggleDropdown() { this.dropdownOpen = !this.dropdownOpen },
    clearEvent() {
      this.draft.eventUrl = ''
      this.draft.name = ''
      this.draft.scheduledTime = ''
      this.dropdownOpen = false
    },
    pickEvent(e) {
      this.draft.name = e.title
      this.draft.eventUrl = e.url
      // 解析日期 2026/4/25(六) → datetime-local 格式 2026-04-25T10:00
      const m = (e.date || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
      if (m) {
        const y = m[1]
        const mo = m[2].padStart(2, '0')
        const d = m[3].padStart(2, '0')
        this.draft.scheduledTime = `${y}-${mo}-${d}T10:00`
      }
      this.dropdownOpen = false
    },
    onClickOutside(e) {
      if (this.$refs.evDropdown && !this.$refs.evDropdown.contains(e.target)) {
        this.dropdownOpen = false
      }
    },
    addSchedule() {
      this.formError = ''
      if (!this.draft.name.trim()) { this.formError = '請填入活動名稱'; return }
      if (!this.draft.eventUrl.trim()) { this.formError = '請填入活動網址'; return }
      if (!this.draft.scheduledTime) { this.formError = '請選擇開賣時間'; return }

      grabberStore.schedules.push({
        id: Date.now(),
        name: this.draft.name.trim(),
        eventUrl: this.draft.eventUrl.trim(),
        ticketType: this.draft.ticketType.trim(),
        quantity: this.draft.quantity || 1,
        scheduledTime: this.draft.scheduledTime,
        status: 'waiting',
        result: '',
      })

      this.draft = { name: '', eventUrl: '', ticketType: '', quantity: 1, scheduledTime: '' }
      this.showForm = false
    },
    removeSchedule(id) {
      const idx = grabberStore.schedules.findIndex(s => s.id === id)
      if (idx !== -1) grabberStore.schedules.splice(idx, 1)
    },
    resetItem(item) {
      item.status = 'waiting'
      item.result = ''
    },
    async triggerNow(item) {
      await grabberStore.triggerSchedule(item, socketService)
    },
    countdown(scheduledTime) {
      const diff = new Date(scheduledTime).getTime() - this.now
      if (diff <= 0) return '已到時間'
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (h >= 24) {
        const d = Math.floor(h / 24)
        return `${d} 天 ${h % 24}h`
      }
      if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
      if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
      return `${s}s`
    },
    isUrgent(scheduledTime) {
      const diff = new Date(scheduledTime).getTime() - this.now
      return diff > 0 && diff < 60000
    },
    formatTime(scheduledTime) {
      if (!scheduledTime) return '未設定'
      return new Date(scheduledTime).toLocaleString('zh-TW', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    },
    countByStatus(status) {
      return this.schedules.filter(s => s.status === status).length
    },
  },
}
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: #e2e8f0; }
.page-desc { font-size: 14px; color: #64748b; margin-top: 4px; }

.warn-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 8px;
  color: #f87171;
  font-size: 13px;
  margin-bottom: 16px;
}
.warn-bar code {
  background: rgba(255,255,255,0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.add-form { padding-top: 4px; }

.form-error {
  color: #ef4444;
  font-size: 13px;
  margin-top: 12px;
}

.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
}
.form-hint { font-size: 12px; color: #475569; }

.req { color: #ef4444; }

/* Empty state */
.empty-card {
  background: #1a1d2e;
  border: 1px dashed #2d3561;
  border-radius: 12px;
  padding: 60px 24px;
  text-align: center;
  margin-bottom: 20px;
}
.empty-icon { font-size: 40px; margin-bottom: 12px; }
.empty-title { font-size: 16px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: #475569; }

/* Schedule card */
.schedule-card {
  background: #1a1d2e;
  border: 1px solid #2d3561;
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 12px;
  transition: border-color 0.3s;
}
.schedule-card.waiting { border-color: #2d3561; }
.schedule-card.paused { border-color: #475569; opacity: 0.7; }
.schedule-card.running { border-color: #7c6aff; }
.schedule-card.done { border-color: #22c55e; }
.schedule-card.failed { border-color: #ef4444; }

.sc-main { display: flex; align-items: flex-start; gap: 20px; }
.sc-info { flex: 1; }

.sc-name {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
  margin-bottom: 4px;
}
.sc-url {
  font-size: 12px;
  color: #7c6aff;
  word-break: break-all;
  margin-bottom: 10px;
}
.sc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.meta-tag {
  font-size: 12px;
  background: rgba(45,53,97,0.8);
  color: #94a3b8;
  padding: 3px 10px;
  border-radius: 20px;
}
.sc-result {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
}
.sc-result.done { color: #4ade80; }
.sc-result.failed { color: #f87171; }

.sc-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  flex-shrink: 0;
  min-width: 140px;
}

.sc-countdown { text-align: center; }
.cd-label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
.cd-value {
  font-size: 22px;
  font-weight: 700;
  color: #7c6aff;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1px;
}
.cd-value.urgent { color: #f59e0b; animation: urgentPulse 0.8s infinite; }
@keyframes urgentPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-pill {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
}
.status-pill.paused { background: rgba(71,85,105,0.3); color: #94a3b8; }
.status-pill.running { background: rgba(124,106,255,0.2); color: #7c6aff; animation: runPulse 1.5s infinite; }
.status-pill.done { background: rgba(34,197,94,0.2); color: #4ade80; }
.status-pill.failed { background: rgba(239,68,68,0.2); color: #f87171; }
@keyframes runPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.sc-actions { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }

/* Stats */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 8px;
}
.stat-card {
  background: #1a1d2e;
  border: 1px solid #2d3561;
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.stat-num { font-size: 32px; font-weight: 700; color: #7c6aff; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }

/* Nav badge */
.nav-badge {
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 2px;
}

/* Slide transition */
.slide-enter-active, .slide-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; }
.slide-enter-to, .slide-leave-from { opacity: 1; max-height: 800px; }

/* 活動下拉選單 */
.loading-tag { font-size: 11px; color: #7c6aff; font-weight: 400; margin-left: 6px; }
.refresh-btn {
  background: none; border: none; color: #7c6aff; font-size: 16px;
  cursor: pointer; margin-left: 6px; padding: 0 4px; line-height: 1;
  vertical-align: middle; transition: transform 0.3s;
}
.refresh-btn:hover { transform: rotate(180deg); }

.ev-dropdown { position: relative; }
.ev-trigger {
  display: flex; align-items: center; gap: 8px;
  background: #0f1117; border: 1px solid #2d3561; border-radius: 8px;
  padding: 10px 14px; cursor: pointer; transition: border-color 0.2s;
  min-height: 42px; user-select: none;
}
.ev-trigger:hover, .ev-trigger.open { border-color: #7c6aff; }
.ev-trigger.loading { opacity: 0.6; cursor: wait; }
.ev-placeholder { color: #475569; font-size: 14px; flex: 1; }
.ev-name { color: #e2e8f0; font-size: 14px; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ev-date-tag {
  background: rgba(251,191,36,0.15); color: #fbbf24;
  border: 1px solid rgba(251,191,36,0.3); border-radius: 4px;
  padding: 2px 7px; font-size: 12px; font-weight: 600; white-space: nowrap; flex-shrink: 0;
}
.ev-arrow { color: #64748b; margin-left: auto; flex-shrink: 0; transition: transform 0.2s; font-size: 16px; }
.ev-arrow.rotated { transform: rotate(180deg); }
.ev-clear {
  margin-left: auto; background: none; border: none; color: #64748b;
  font-size: 14px; cursor: pointer; padding: 2px 6px; border-radius: 4px;
  flex-shrink: 0; line-height: 1; transition: color 0.15s, background 0.15s;
}
.ev-clear:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
.ev-list {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: #1a1d2e; border: 1px solid #2d3561; border-radius: 8px;
  max-height: 280px; overflow-y: auto; z-index: 200;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.ev-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  cursor: pointer; transition: background 0.15s; border-bottom: 1px solid #2d3561;
}
.ev-item:last-child { border-bottom: none; }
.ev-item:hover { background: #2d3561; }
.ev-item.active { background: rgba(124,106,255,0.15); }
.ev-empty { padding: 16px; color: #64748b; font-size: 14px; text-align: center; }

@media (max-width: 768px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .stat-card { padding: 14px; }
  .stat-num { font-size: 24px; }

  .sc-main { flex-direction: column; gap: 12px; }
  .sc-right { align-items: flex-start; flex-direction: row; flex-wrap: wrap; min-width: 0; width: 100%; }
  .sc-actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
  .sc-actions .btn { font-size: 12px; }

  .form-footer { flex-direction: column; align-items: flex-start; gap: 12px; }
  .form-footer .btn { width: 100%; }
}
</style>
