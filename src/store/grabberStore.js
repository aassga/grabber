import { reactive } from 'vue'

export const grabberStore = reactive({
  // Settings
  settings: {
    eventUrl: '',
    ticketType: '',
    quantity: 1,
    refreshInterval: 3000,
    autoRefresh: true,
    multiAccount: false,
    captchaHint: true,
    scheduledStart: false,
    scheduledTime: '',
  },

  // Registration form data
  formData: {
    name: '',
    phone: '',
    idNumber: '',
    email: '',
  },

  // Payment info (kept in memory only, never persisted)
  paymentData: {
    cardNumber: '',
    expiry: '',
    cvv: '',
    cardHolder: '',
  },

  // Accounts
  accounts: [
    { id: 1, name: '主帳號', email: '', password: '', role: 'primary', active: true },
  ],

  // Monitor state
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

  // Schedule list
  schedules: [],

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
