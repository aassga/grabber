const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const fs = require('fs')
const path = require('path')
const kktix = require('./kktix')

puppeteer.use(StealthPlugin())

const USER_DATA_DIR = path.join(__dirname, '..', '.chrome-profile')

// 找系統安裝的 Chrome（不用 Puppeteer 內建 Chromium，Cloudflare 認得那個）
function findChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH
  const candidates = [
    // Windows
    (process.env.PROGRAMFILES || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    (process.env['PROGRAMFILES(X86)'] || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.PROGRAMFILES || '') + '\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux (Railway / Docker)
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

// 注入到每個頁面，蓋掉自動化瀏覽器的識別訊號
async function injectStealthScripts(page) {
  await page.evaluateOnNewDocument(() => {
    // 移除 webdriver 旗標
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    })

    // 偽造 chrome 物件（真實瀏覽器才有）
    if (!window.chrome) {
      window.chrome = {
        app: { isInstalled: false },
        runtime: {},
      }
    }

    // 修正 permissions query（自動化瀏覽器的 notifications 行為不同）
    const _origQuery = window.navigator.permissions.query.bind(navigator.permissions)
    window.navigator.permissions.__proto__.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : _origQuery(params)

    // 偽造 plugins（真實瀏覽器有插件清單）
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const list = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ]
        list.refresh = () => {}
        list.namedItem = (n) => list.find(p => p.name === n) || null
        list.item = (i) => list[i] || null
        return list
      },
    })

    // 語言與硬體資訊
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en-US', 'en'] })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
  })
}

class Grabber {
  constructor(config, onLog, onStatus, onDone) {
    this.config = config
    this.onLog = onLog
    this.onStatus = onStatus
    this.onDone = onDone

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

    const chromePath = findChrome()
    if (chromePath) {
      this.log(`使用系統 Chrome：${chromePath}`, 'info')
    } else {
      this.log('找不到系統 Chrome，使用內建 Chromium（可能被 Cloudflare 偵測）', 'warn')
    }

    try {
      const launchOptions = {
        headless: false,
        defaultViewport: null,
        userDataDir: USER_DATA_DIR,
        args: [
          '--start-maximized',
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-infobars',
          '--lang=zh-TW',
          '--accept-lang=zh-TW,zh;q=0.9',
        ],
      }
      if (chromePath) launchOptions.executablePath = chromePath

      this.browser = await puppeteer.launch(launchOptions)

      this.page = await this.browser.newPage()

      // 注入反偵測腳本（每個新頁面都要）
      await injectStealthScripts(this.page)

      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      )
      await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7' })

      await this._login()
      await this._grabLoop()

    } catch (err) {
      this.log(`錯誤：${err.message}`, 'error')
      this.onStatus('發生錯誤（視窗保持開啟，請查看）')
      this.onDone(false, err.message)
      this.running = false
      // 不關閉瀏覽器，讓使用者看到錯誤狀態
    }
  }

  async stop() {
    this.running = false
    this.log('搶票已停止', 'warn')
    this.onStatus('已停止')
    await this._closeBrowser()
  }

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

      await kktix.gotoEvent(this.page, settings.eventUrl, this.log.bind(this))

      // 快速檢查是否有 Cloudflare（單次查詢，不輪詢）
      const isCfNow = await this.page.evaluate(() => {
        return !!(
          document.querySelector('#challenge-form, #challenge-running, #challenge-stage, .cf-browser-verification, #cf-please-wait') ||
          document.title.includes('Just a moment') ||
          document.title.includes('正在執行安全驗證') ||
          document.title.includes('Attention Required')
        )
      }).catch(() => false)

      if (isCfNow) {
        this.log('⚠️ 偵測到 Cloudflare 驗證，請在瀏覽器中完成後系統自動繼續', 'warn')
        this.onStatus('⚠️ 等待 Cloudflare 驗證...')
        await kktix.waitForCloudflare(this.page, null, 120000)
        if (!this.running) break
      }

      if (await kktix.hasCaptcha(this.page)) {
        await this._handleCaptcha()
        if (!this.running) break
      }

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

      if (this.running) {
        this.log(`尚未開賣，${settings.refreshInterval / 1000} 秒後重試...`, 'warn')
        await this._sleep(settings.refreshInterval)

        if (settings.multiAccount && this.attempts % 3 === 0) {
          await this._switchAccount()
        }
      }
    }

    // 搶票流程結束後不自動關閉，讓使用者確認結果
    this.running = false
    this.log('流程結束，瀏覽器保持開啟供確認', 'info')
  }

  async _purchase() {
    const { settings, formData, paymentData } = this.config

    const selectResult = await kktix.selectTicket(this.page, settings.ticketType, settings.quantity, this.log.bind(this), formData.customAnswer)

    if (selectResult === 'needs_manual') {
      this.log('⚠️ 頁面有未填欄位（自訂問題或特殊驗證），請在瀏覽器中手動填寫後點擊「我已完成驗證」', 'warn')
      this.onStatus('⚠️ 等待手動填寫自訂問題...')
      await this._handleCaptcha()
      if (!this.running) return
    }

    if (await kktix.hasCaptcha(this.page)) {
      await this._handleCaptcha()
      if (!this.running) return
    }

    await kktix.fillForm(this.page, formData, this.log.bind(this))

    if (await kktix.hasCaptcha(this.page)) {
      await this._handleCaptcha()
      if (!this.running) return
    }

    if (paymentData && paymentData.cardNumber) {
      await kktix.fillPayment(this.page, paymentData, this.log.bind(this))
    }

    await this._sleep(2000)
    const success = await kktix.isOrderSuccess(this.page)

    if (success) {
      const orderUrl = this.page.url()
      this.log(`搶票成功！頁面：${orderUrl}`, 'success')
      this.onStatus('搶票成功！')
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

    const maxWait = 120000
    const interval = 1000
    let waited = 0

    while (this.running && !this.captchaResolved && waited < maxWait) {
      await this._sleep(interval)
      waited += interval
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

    const client = await this.page.target().createCDPSession()
    await client.send('Network.clearBrowserCookies')
    await kktix.login(this.page, next.email, next.password, this.log.bind(this))
  }

  _currentAccount() {
    const accounts = this.config.accounts.filter(a => a.active)
    if (accounts.length === 0) return null
    const primary = accounts.find(a => a.role === 'primary')
    return primary || accounts[this.accountIndex % accounts.length]
  }

  _statusText(status) {
    return { available: '可購買', sold_out: '已售罄', not_yet: '尚未開賣' }[status] || status
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async _closeBrowser() {
    if (this.browser) {
      await this.browser.close().catch(() => {})
      this.browser = null
    }
  }
}

module.exports = Grabber
