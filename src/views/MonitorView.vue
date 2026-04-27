<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">📊 監控紀錄</h1>
      <p class="page-desc">即時監控搶票狀態與執行日誌</p>
    </div>

    <!-- 後端連線狀態 -->
    <div
      class="backend-bar"
      :class="monitor.backendConnected ? 'connected' : 'disconnected'"
    >
      <span class="backend-dot"></span>
      <span v-if="monitor.backendConnected">後端伺服器已連線（port 3000）</span>
      <span v-else
        >後端伺服器未連線 — 請先執行 <code>cd server && npm start</code></span
      >
    </div>

    <!-- 驗證碼警告 -->
    <transition name="fade">
      <div v-if="monitor.waitingCaptcha" class="captcha-alert">
        <div class="captcha-icon">⚠️</div>
        <div class="captcha-text">
          <div class="captcha-title">需要手動完成驗證碼</div>
          <div class="captcha-desc">
            請在已開啟的瀏覽器視窗中完成驗證，完成後點擊下方按鈕
          </div>
        </div>
        <button class="btn btn-success" @click="resolveCaptcha">
          ✅ 我已完成驗證
        </button>
      </div>
    </transition>

    <!-- 狀態總覽 -->
    <div class="status-banner" :class="statusClass">
      <div class="status-dot" :class="{ pulse: monitor.running }"></div>
      <div class="status-text">{{ monitor.currentStatus }}</div>
    </div>

    <!-- 統計卡片 -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-icon">🔁</div>
        <div class="metric-value">{{ monitor.attempts }}</div>
        <div class="metric-label">嘗試次數</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">⏱️</div>
        <div class="metric-value">{{ elapsedTime }}</div>
        <div class="metric-label">執行時間</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">⚡</div>
        <div class="metric-value">{{ ratePerMin }}</div>
        <div class="metric-label">次/分鐘</div>
      </div>
      <div class="metric-card">
        <div class="metric-icon">👤</div>
        <div class="metric-value">{{ activeAccounts }}</div>
        <div class="metric-label">啟用帳號</div>
      </div>
    </div>

    <!-- 操作按鈕 -->
    <div class="control-bar">
      <button
        v-if="!monitor.running"
        class="btn btn-success btn-lg"
        @click="startGrabbing"
        :disabled="!canStart || !monitor.backendConnected"
      >
        🚀 開始搶票
      </button>
      <button v-else class="btn btn-danger btn-lg" @click="stopGrabbing">
        ⏹ 停止搶票
      </button>
      <button class="btn btn-outline" @click="clearLogs">🗑 清除日誌</button>

      <div v-if="!monitor.backendConnected" class="hint-text">
        ⚠️ 請先啟動後端伺服器
      </div>
      <div v-else-if="!canStart" class="hint-text">
        ⚠️ 請先在設定頁填入活動網址
      </div>
    </div>

    <!-- 目標資訊 -->
    <div v-if="settings.eventUrl" class="card target-info">
      <div class="card-title">🎯 搶票目標</div>
      <div class="target-grid">
        <div class="target-item">
          <span class="target-key">活動網址</span>
          <span class="target-val url-text">{{ settings.eventUrl }}</span>
        </div>
        <div class="target-item">
          <span class="target-key">票種</span>
          <span class="target-val">{{
            settings.ticketType || "未指定（自動選第一種）"
          }}</span>
        </div>
        <div class="target-item">
          <span class="target-key">數量</span>
          <span class="target-val">{{ settings.quantity }} 張</span>
        </div>
        <div class="target-item">
          <span class="target-key">刷新間隔</span>
          <span class="target-val">{{ settings.refreshInterval }} ms</span>
        </div>
        <div class="target-item">
          <span class="target-key">報名姓名</span>
          <span class="target-val">{{ formData.name || "未填" }}</span>
        </div>
        <div class="target-item">
          <span class="target-key">付款方式</span>
          <span class="target-val">{{
            paymentData.cardNumber
              ? "信用卡 ****" + paymentData.cardNumber.slice(-4)
              : "未填（手動付款）"
          }}</span>
        </div>
      </div>
    </div>

    <!-- 日誌 -->
    <div class="card">
      <div class="card-title" style="justify-content: space-between">
        <span>📋 執行日誌</span>
        <span class="log-count">{{ monitor.logs.length }} 筆</span>
      </div>
      <div class="log-container">
        <div v-if="monitor.logs.length === 0" class="log-empty">
          尚無日誌紀錄，點擊「開始搶票」後將顯示即時日誌
        </div>
        <div
          v-for="log in monitor.logs"
          :key="log.id"
          class="log-entry"
          :class="log.type"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-type-badge" :class="log.type">{{
            typeLabel(log.type)
          }}</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { grabberStore } from '../store/grabberStore'
import socketService from '../services/socket'

export default {
  name: 'MonitorView',
  data() {
    return {
      now: Date.now(),
      elapsedInterval: null,
    }
  },
  computed: {
    monitor() { return grabberStore.monitor },
    settings() { return grabberStore.settings },
    formData() { return grabberStore.formData },
    paymentData() { return grabberStore.paymentData },
    accounts() { return grabberStore.accounts },
    activeAccounts() { return this.accounts.filter(a => a.active).length },
    canStart() { return !!this.settings.eventUrl },
    elapsedTime() {
      if (!this.monitor.startTime) return '00:00'
      const secs = Math.floor((this.now - this.monitor.startTime) / 1000)
      const m = String(Math.floor(secs / 60)).padStart(2, '0')
      const s = String(secs % 60).padStart(2, '0')
      return `${m}:${s}`
    },
    ratePerMin() {
      if (!this.monitor.startTime || this.monitor.attempts === 0) return 0
      const mins = (this.now - this.monitor.startTime) / 60000
      return mins < 0.1 ? 0 : Math.round(this.monitor.attempts / mins)
    },
    statusClass() {
      const s = this.monitor.currentStatus
      if (!this.monitor.running && !s.includes('成功')) return 'idle'
      if (s.includes('成功') || s.includes('🎉')) return 'success'
      if (s.includes('驗證碼') || s.includes('警告')) return 'warn'
      return 'running'
    },
  },
  mounted() {
    socketService.connect()
    this.elapsedInterval = setInterval(() => { this.now = Date.now() }, 500)
  },
  beforeUnmount() {
    clearInterval(this.elapsedInterval)
  },
  methods: {
    typeLabel(type) {
      return { info: 'INFO', warn: 'WARN', success: 'OK', error: 'ERR' }[type] || 'INFO'
    },
    async startGrabbing() {
      grabberStore.resetMonitor()
      grabberStore.monitor.running = true
      grabberStore.monitor.startTime = Date.now()
      grabberStore.monitor.currentStatus = '啟動中...'

      const result = await socketService.startGrabbing({
        settings: grabberStore.settings,
        accounts: grabberStore.accounts,
        formData: grabberStore.formData,
        paymentData: grabberStore.paymentData,
      }).catch(err => ({ error: err.message }))

      if (result.error) {
        grabberStore.addLog(`啟動失敗：${result.error}`, 'error')
        grabberStore.monitor.running = false
        grabberStore.monitor.currentStatus = '啟動失敗'
      }
    },
    async stopGrabbing() {
      await socketService.stopGrabbing().catch(() => {})
      grabberStore.monitor.running = false
      grabberStore.monitor.currentStatus = '已停止'
    },
    resolveCaptcha() {
      socketService.sendCaptchaResolved()
    },
    clearLogs() {
      grabberStore.monitor.logs = []
    },
  },
}
</script>

<style scoped>
.page-header {
  margin-bottom: 20px;
}
.page-title {
  font-size: 24px;
  font-weight: 700;
  color: #e2e8f0;
}
.page-desc {
  font-size: 14px;
  color: #64748b;
  margin-top: 4px;
}

.backend-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
}
.backend-bar.connected {
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: #4ade80;
}
.backend-bar.disconnected {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #f87171;
}
.backend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.connected .backend-dot {
  background: #22c55e;
}
.disconnected .backend-dot {
  background: #ef4444;
}
.backend-bar code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.captcha-alert {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(234, 179, 8, 0.1);
  border: 1px solid rgba(234, 179, 8, 0.4);
  border-radius: 10px;
  margin-bottom: 16px;
  animation: alertPulse 2s infinite;
}
@keyframes alertPulse {
  0%,
  100% {
    border-color: rgba(234, 179, 8, 0.4);
  }
  50% {
    border-color: rgba(234, 179, 8, 0.8);
  }
}
.captcha-icon {
  font-size: 28px;
  flex-shrink: 0;
}
.captcha-text {
  flex: 1;
}
.captcha-title {
  font-size: 15px;
  font-weight: 600;
  color: #fbbf24;
}
.captcha-desc {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 4px;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-radius: 10px;
  margin-bottom: 16px;
  border: 1px solid;
  transition: all 0.3s;
}
.status-banner.idle {
  background: rgba(100, 116, 139, 0.1);
  border-color: #475569;
}
.status-banner.running {
  background: rgba(124, 106, 255, 0.1);
  border-color: #7c6aff;
}
.status-banner.warn {
  background: rgba(234, 179, 8, 0.1);
  border-color: #eab308;
}
.status-banner.success {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #475569;
  flex-shrink: 0;
}
.status-banner.running .status-dot {
  background: #7c6aff;
}
.status-banner.warn .status-dot {
  background: #eab308;
}
.status-banner.success .status-dot {
  background: #22c55e;
}
.status-dot.pulse {
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.3);
  }
}
.status-text {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.metric-card {
  background: #1a1d2e;
  border: 1px solid #2d3561;
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.metric-icon {
  font-size: 20px;
  margin-bottom: 8px;
}
.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #7c6aff;
}
.metric-label {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.control-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.btn-lg {
  padding: 12px 28px;
  font-size: 15px;
}
.hint-text {
  font-size: 13px;
  color: #ef4444;
}

.target-info {
  padding: 20px 24px;
}
.target-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.target-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.target-key {
  font-size: 12px;
  color: #64748b;
}
.target-val {
  font-size: 14px;
  color: #e2e8f0;
}
.url-text {
  word-break: break-all;
  color: #7c6aff;
  font-size: 12px;
}

.log-count {
  font-size: 12px;
  color: #64748b;
  font-weight: 400;
}
.log-container {
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.log-container::-webkit-scrollbar {
  width: 6px;
}
.log-container::-webkit-scrollbar-track {
  background: #0f1117;
}
.log-container::-webkit-scrollbar-thumb {
  background: #2d3561;
  border-radius: 3px;
}

.log-empty {
  text-align: center;
  padding: 40px;
  color: #64748b;
  font-size: 13px;
}
.log-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  background: rgba(15, 17, 23, 0.5);
  animation: slideIn 0.2s ease;
}
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
.log-time {
  color: #475569;
  font-family: monospace;
  flex-shrink: 0;
}
.log-type-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  flex-shrink: 0;
  font-family: monospace;
}
.log-type-badge.info {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}
.log-type-badge.warn {
  background: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
}
.log-type-badge.success {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}
.log-type-badge.error {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}
.log-msg {
  color: #cbd5e1;
  flex: 1;
}
.log-entry.success .log-msg {
  color: #4ade80;
}
.log-entry.warn .log-msg {
  color: #fbbf24;
}
.log-entry.error .log-msg {
  color: #f87171;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 768px) {
  .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .metric-card { padding: 14px; }
  .metric-value { font-size: 22px; }

  .captcha-alert { flex-direction: column; text-align: center; gap: 12px; }
  .captcha-alert .btn { width: 100%; }

  .control-bar { flex-wrap: wrap; }
  .control-bar .btn-lg { flex: 1; min-width: 0; font-size: 14px; padding: 12px 8px; }

  .target-grid { grid-template-columns: 1fr; }

  .log-entry { flex-wrap: wrap; gap: 6px; font-size: 12px; }
  .log-time { font-size: 11px; }
  .log-msg { flex-basis: 100%; }
}

@media (max-width: 480px) {
  .metrics-grid { grid-template-columns: repeat(2, 1fr); }
  .metric-value { font-size: 20px; }
  .log-container { max-height: 300px; }
}
</style>
