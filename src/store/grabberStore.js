import { reactive, watch } from 'vue'

const STORAGE_KEY = 'grabber-store'

// 從 localStorage 讀取指定欄位，找不到就用 fallback
function load(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return saved[key] !== undefined ? saved[key] : fallback
  } catch (e) {
    return fallback
  }
}

// 把指定欄位寫回 localStorage
function save(key, value) {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    current[key] = value
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch (e) { /* localStorage 不可用時靜默失敗 */ }
}

const defaultSettings = {
  eventUrl: '',
  ticketType: '',
  quantity: 1,
  refreshInterval: 3000,
  autoRefresh: true,
  multiAccount: false,
  captchaHint: true,
  scheduledStart: false,
  scheduledTime: '',
}

const defaultFormData = {
  name: '',
  phone: '',
  idNumber: '',
  email: '',
}

export const grabberStore = reactive({
  // 持久化欄位：從 localStorage 還原，沒有紀錄則用預設值
  settings:  load('settings',  defaultSettings),
  formData:  load('formData',  defaultFormData),
  accounts:  load('accounts',  []),
  schedules: load('schedules', []),

  // 不持久化：信用卡資料只存記憶體（安全考量）
  paymentData: {
    cardNumber: '',
    expiry: '',
    cvv: '',
    cardHolder: '',
  },

  // 不持久化：執行時期狀態，每次啟動都是全新的
  monitor: {
    running: false,
    attempts: 0,
    startTime: null,
    currentStatus: '待機中',
    currentAccount: '',
    logs: [],
    backendConnected: false,
    waitingCaptcha: false,
  },

  addLog(message, type = 'info', time = null) {
    const t = time || new Date().toLocaleTimeString('zh-TW', { hour12: false })
    this.monitor.logs.unshift({ time: t, message, type, id: Date.now() + Math.random() })
    if (this.monitor.logs.length > 300) this.monitor.logs.pop()
  },

  resetMonitor() {
    this.monitor.attempts = 0
    this.monitor.startTime = null
    this.monitor.currentStatus = '待機中'
    this.monitor.currentAccount = ''
    this.monitor.logs = []
    this.monitor.waitingCaptcha = false
  },

  async triggerSchedule(item, socketService) {
    if (!this.monitor.backendConnected || this.monitor.running) return
    item.status = 'running'
    item.result = ''
    this.resetMonitor()
    this.monitor.running = true
    this.monitor.startTime = Date.now()
    this.monitor.currentStatus = '排程啟動中...'
    this.addLog(`排程觸發：${item.name}`, 'info')

    const overrideSettings = {
      ...this.settings,
      eventUrl: item.eventUrl,
      ticketType: item.ticketType,
      quantity: item.quantity,
    }

    const result = await socketService.startGrabbing({
      settings: overrideSettings,
      accounts: this.accounts,
      formData: this.formData,
      paymentData: this.paymentData,
    }).catch(err => ({ error: err.message }))

    if (result && result.error) {
      this.addLog(`排程啟動失敗：${result.error}`, 'error')
      this.monitor.running = false
      this.monitor.currentStatus = '啟動失敗'
      item.status = 'failed'
      item.result = result.error
    }
  },
})

// 監聽變更，自動寫入 localStorage（paymentData 和 monitor 不儲存）
watch(() => grabberStore.settings,  v => save('settings',  v), { deep: true })
watch(() => grabberStore.formData,  v => save('formData',  v), { deep: true })
watch(() => grabberStore.accounts,  v => save('accounts',  v), { deep: true })
watch(() => grabberStore.schedules, v => save('schedules', v), { deep: true })
