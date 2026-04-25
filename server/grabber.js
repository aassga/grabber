const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const kktix = require('./kktix')

puppeteer.use(StealthPlugin())

class Grabber {
  constructor(config, onLog, onStatus, onDone) {
    this.config = config       // { settings, accounts, formData, paymentData }
    this.onLog = onLog         // (msg, type) => void
    this.onStatus = onStatus   // (status) => void
    this.onDone = onDone       // (success, msg) => void

    this.browser = null
    this.page = null
    this.running = false
    this.attempts = 0
    this.waitingCaptcha = false
    this.captchaResolved = false
    this.accountIndex = 0
  }

  log(msg, type = 'info') {
    this.onLog(msg, type)
  }

  async start() {
    this.running = true
    this.onStatus('啟動中...')
    this.log('啟動 Puppeteer 瀏覽器...', 'info')

    try {
      this.browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--lang=zh-TW',
          '--accept-lang=zh-TW,zh;q=0.9',
        ],
      })

      this.page = await this.browser.newPage()
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
      await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9' })

      // 登入
      await this._login()

      // 開始搶票循環
      await this._grabLoop()

    } catch (err) {
      this.log(`錯誤：${err.message}`, 'error')
      this.onStatus('發生錯誤')
      this.onDone(false, err.message)
      await this._cleanup()
    }
  }

  async stop() {
    this.running = false
    this.log('搶票已停止', 'warn')
    this.onStatus('已停止')
    await this._cleanup()
  }

  // 驗證碼已手動解決，外部呼叫
  resolveCaptcha() {
    this.captchaResolved = true
    this.waitingCaptcha = false
    this.log('驗證碼已解決，繼續搶票...', 'info')
  }

  async _login() {
    const account = this._currentAccount()
    if (!account) throw new Error('沒有可用的帳號，請先在帳號管理頁新增帳號')

    this.log(`使用帳號：${account.name} (${account.email})`, 'info')
    this.onStatus(`登入中：${account.name}`)

    await kktix.login(this.page, account.email, account.password, this.log.bind(this))
  }

  async _grabLoop() {
    const { settings } = this.config

    while (this.running) {
      this.attempts++
      this.log(`第 ${this.attempts} 次嘗試...`, 'info')
      this.onStatus(`搶票中 (第 ${this.attempts} 次)`)

      // 前往活動頁
      await kktix.gotoEvent(this.page, settings.eventUrl, this.log.bind(this))

      // 檢查驗證碼
      if (await kktix.hasCaptcha(this.page)) {
        await this._handleCaptcha()
        if (!this.running) break
      }

      // 檢查票券狀態
      const status = await kktix.checkTicketStatus(this.page, settings.ticketType)
      this.log(`票券狀態：${this._statusText(status)}`, status === 'available' ? 'success' : 'warn')

      if (status === 'sold_out') {
        this.log('票已售罄', 'error')
        this.onDone(false, '票已售罄')
        break
      }

      if (status === 'available') {
        this.onStatus('票券可用！開始搶購...')
        this.log('票券開放！立即搶購', 'success')
        await this._purchase()
        break
      }

      // 尚未開賣，等待後重試
      if (this.running) {
        this.log(`尚未開賣，${settings.refreshInterval / 1000} 秒後重試...`, 'warn')
        await this._sleep(settings.refreshInterval)

        // 多帳號輪替
        if (settings.multiAccount && this.attempts % 3 === 0) {
          await this._switchAccount()
        }
      }
    }

    await this._cleanup()
  }

  async _purchase() {
    const { settings, formData, paymentData } = this.config

    // 選票並進入表單
    await kktix.selectTicket(
      this.page,
      settings.ticketType,
      settings.quantity,
      this.log.bind(this)
    )

    // 再次檢查驗證碼
    if (await kktix.hasCaptcha(this.page)) {
      await this._handleCaptcha()
      if (!this.running) return
    }

    // 填寫報名表單
    await kktix.fillForm(this.page, formData, this.log.bind(this))

    // 再次檢查驗證碼
    if (await kktix.hasCaptcha(this.page)) {
      await this._handleCaptcha()
      if (!this.running) return
    }

    // 付款
    if (paymentData && paymentData.cardNumber) {
      await kktix.fillPayment(this.page, paymentData, this.log.bind(this))
    }

    // 確認是否成功
    await this._sleep(2000)
    const success = await kktix.isOrderSuccess(this.page)

    if (success) {
      const orderUrl = this.page.url()
      this.log(`🎉 搶票成功！頁面：${orderUrl}`, 'success')
      this.onStatus('🎉 搶票成功！')
      this.onDone(true, `搶票成功！${orderUrl}`)
    } else {
      this.log('購票流程完成，請確認瀏覽器視窗內的結果', 'warn')
      this.onStatus('請確認瀏覽器視窗')
      this.onDone(true, '流程完成，請確認瀏覽器')
    }
  }

  async _handleCaptcha() {
    this.waitingCaptcha = true
    this.captchaResolved = false
    this.log('⚠️ 偵測到驗證碼，請在瀏覽器中手動完成驗證', 'warn')
    this.onStatus('⚠️ 等待驗證碼...')

    // 等待最多 120 秒讓使用者手動解驗證碼
    const maxWait = 120000
    const interval = 1000
    let waited = 0

    while (this.running && !this.captchaResolved && waited < maxWait) {
      await this._sleep(interval)
      waited += interval

      // 檢查驗證碼是否已消失（使用者完成）
      const stillHasCaptcha = await kktix.hasCaptcha(this.page)
      if (!stillHasCaptcha) {
        this.captchaResolved = true
        break
      }
    }

    if (!this.captchaResolved) {
      this.log('驗證碼等待超時', 'error')
    }
  }

  async _switchAccount() {
    const accounts = this.config.accounts.filter(a => a.active)
    if (accounts.length <= 1) return

    this.accountIndex = (this.accountIndex + 1) % accounts.length
    const next = accounts[this.accountIndex]
    this.log(`切換至帳號：${next.name}`, 'info')

    // 清除 cookies 並重新登入
    const client = await this.page.target().createCDPSession()
    await client.send('Network.clearBrowserCookies')
    await kktix.login(this.page, next.email, next.password, this.log.bind(this))
  }

  _currentAccount() {
    const accounts = this.config.accounts.filter(a => a.active)
    if (accounts.length === 0) return null
    // 優先主帳號
    const primary = accounts.find(a => a.role === 'primary')
    return primary || accounts[this.accountIndex % accounts.length]
  }

  _statusText(status) {
    return { available: '可購買', sold_out: '已售罄', not_yet: '尚未開賣' }[status] || status
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async _cleanup() {
    this.running = false
    if (this.browser) {
      // 延遲關閉讓使用者看到結果
      setTimeout(() => {
        this.browser.close().catch(() => {})
        this.browser = null
      }, 5000)
    }
  }
}

module.exports = Grabber
