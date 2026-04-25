// KKTIX 頁面操作邏輯 - 所有 selector 與流程封裝在此

const SELECTORS = {
  // 登入頁
  login: {
    email: '#user_email',
    password: '#user_password',
    submit: 'input[type="submit"], button[type="submit"]',
    error: '.alert-danger, .error-message',
  },
  // 活動頁 - 票券區
  event: {
    registerBtn: 'a.register-btn, a[href*="registrations/new"], .ticket-apply-btn',
    soldOut: '.sold-out, .ticket-sold-out',
    notYet: '.not-yet, .coming-soon',
    ticketRows: '.ticket-row, .ticket-type-row, tr.ticket',
    ticketName: '.ticket-name, td.name',
    ticketQtySelect: 'select.ticket-count, select[name*="qty"], select[name*="count"]',
    applyBtn: 'input[type="submit"].apply, button.apply-btn, #register-submit',
  },
  // 報名表單
  form: {
    fields: 'input[type="text"], input[type="tel"], input[type="email"], select, textarea',
    nameField: 'input[name*="name"], input[placeholder*="姓名"], input[placeholder*="Name"]',
    phoneField: 'input[name*="phone"], input[placeholder*="手機"], input[placeholder*="電話"]',
    idField: 'input[name*="identity"], input[placeholder*="身分證"]',
    emailField: 'input[name*="email"][type="email"]',
    submitBtn: 'input[type="submit"], button[type="submit"]',
    agreeCheckbox: 'input[type="checkbox"][name*="agree"], input#agree',
  },
  // 付款頁
  payment: {
    creditCardOption: 'input[value="credit_card"], label[for*="credit"]',
    cardNumber: 'input[name*="card_number"], input[placeholder*="卡號"]',
    expiry: 'input[name*="expiry"], input[placeholder*="有效期"]',
    cvv: 'input[name*="cvv"], input[name*="cvc"]',
    confirmBtn: 'input[type="submit"].confirm, button.confirm-btn, #payment-submit',
  },
  // 驗證碼
  captcha: {
    iframe: 'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]',
    image: 'img.captcha-image, .captcha img',
    input: 'input#captcha, input[name="captcha"]',
  },
}

// 等待元素出現（含 timeout）
async function waitForAny(page, selectors, timeout = 5000) {
  return Promise.race(
    selectors.map(sel =>
      page.waitForSelector(sel, { timeout }).then(() => sel).catch(() => null)
    )
  )
}

// 安全點擊
async function safeClick(page, selector) {
  await page.waitForSelector(selector, { timeout: 10000 })
  await page.click(selector)
}

// 安全輸入
async function safeType(page, selector, text, clear = true) {
  await page.waitForSelector(selector, { timeout: 8000 })
  if (clear) {
    await page.click(selector, { clickCount: 3 })
    await page.keyboard.press('Delete')
  }
  await page.type(selector, String(text), { delay: 50 })
}

// 登入 KKTIX
async function login(page, email, password, log) {
  log('前往 KKTIX 登入頁...', 'info')
  await page.goto('https://kktix.com/users/sign_in', { waitUntil: 'domcontentloaded', timeout: 30000 })

  // 等待頁面穩定
  await page.waitForTimeout(1500)

  // 嘗試多組 email selector
  const emailSelectors = [
    '#user_email',
    'input[name="user[email]"]',
    'input[type="email"]',
    'input[placeholder*="Email"]',
    'input[placeholder*="email"]',
    'input[autocomplete="email"]',
  ]
  let emailSel = null
  for (const sel of emailSelectors) {
    const el = await page.$(sel)
    if (el) { emailSel = sel; break }
  }
  if (!emailSel) throw new Error('找不到 Email 輸入欄位，KKTIX 頁面結構可能已變更')
  log(`找到 Email 欄位：${emailSel}`, 'info')

  // 嘗試多組 password selector
  const passwordSelectors = [
    '#user_password',
    'input[name="user[password]"]',
    'input[type="password"]',
    'input[placeholder*="密碼"]',
    'input[placeholder*="Password"]',
    'input[autocomplete="current-password"]',
  ]
  let pwSel = null
  for (const sel of passwordSelectors) {
    const el = await page.$(sel)
    if (el) { pwSel = sel; break }
  }
  if (!pwSel) throw new Error('找不到密碼輸入欄位')

  log('輸入帳號密碼...', 'info')
  await safeType(page, emailSel, email)
  await safeType(page, pwSel, password)

  // 找送出按鈕
  const submitSelectors = [
    'input[type="submit"]',
    'button[type="submit"]',
    'button.login-btn',
    'button.sign-in-btn',
  ]
  let submitSel = null
  for (const sel of submitSelectors) {
    const el = await page.$(sel)
    if (el) { submitSel = sel; break }
  }
  if (!submitSel) throw new Error('找不到登入按鈕')

  await safeClick(page, submitSel)

  // 等待跳轉或錯誤
  await page.waitForNavigation({ timeout: 15000 }).catch(() => {})

  const url = page.url()
  if (url.includes('sign_in')) {
    const errEl = await page.$(SELECTORS.login.error)
    const errTxt = errEl ? await errEl.evaluate(el => el.innerText.trim()) : '帳號或密碼錯誤，請確認帳號管理頁填寫的資料'
    throw new Error(`登入失敗：${errTxt}`)
  }
  log('登入成功', 'success')
}

// 前往活動頁並監控票券狀態
async function gotoEvent(page, url, log) {
  log(`前往活動頁：${url}`, 'info')
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
}

// 檢查票券是否可搶（回傳 'available' | 'sold_out' | 'not_yet'）
async function checkTicketStatus(page, ticketType) {
  // 先找目標票種 row
  const rows = await page.$$(SELECTORS.event.ticketRows)
  for (const row of rows) {
    const nameEl = await row.$(SELECTORS.event.ticketName)
    if (!nameEl) continue
    const name = await nameEl.evaluate(el => el.innerText.trim())
    if (ticketType && !name.includes(ticketType)) continue

    // 判斷狀態
    const soldOut = await row.$('.sold-out, .ticket-sold-out, button[disabled]')
    if (soldOut) return 'sold_out'

    const notYet = await row.$('.not-yet, .coming-soon')
    if (notYet) return 'not_yet'

    return 'available'
  }

  // fallback: 直接找報名按鈕
  const regBtn = await page.$(SELECTORS.event.registerBtn)
  if (regBtn) {
    const disabled = await regBtn.evaluate(el => el.disabled || el.classList.contains('disabled'))
    if (disabled) return 'not_yet'
    return 'available'
  }

  return 'not_yet'
}

// 選票 + 設定數量 + 點報名
async function selectTicket(page, ticketType, quantity, log) {
  log(`選取票種「${ticketType || '第一個可用票種'}」...`, 'info')

  const rows = await page.$$(SELECTORS.event.ticketRows)
  let targetRow = null

  for (const row of rows) {
    if (!ticketType) { targetRow = row; break }
    const nameEl = await row.$(SELECTORS.event.ticketName)
    if (!nameEl) continue
    const name = await nameEl.evaluate(el => el.innerText.trim())
    if (name.includes(ticketType)) { targetRow = row; break }
  }

  if (targetRow) {
    // 設定數量
    const qtySelect = await targetRow.$(SELECTORS.event.ticketQtySelect)
    if (qtySelect) {
      await qtySelect.select(String(quantity))
      log(`數量設定為 ${quantity} 張`, 'info')
    }
  }

  // 點擊報名按鈕
  await safeClick(page, SELECTORS.event.registerBtn)
  await page.waitForNavigation({ timeout: 15000 }).catch(() => {})
  log('已進入報名頁面', 'info')
}

// 填寫報名表單
async function fillForm(page, formData, log) {
  log('填寫報名表單...', 'info')

  if (formData.name) {
    const nameEl = await page.$(SELECTORS.form.nameField)
    if (nameEl) {
      await safeType(page, SELECTORS.form.nameField, formData.name)
      log(`填入姓名：${formData.name}`, 'info')
    }
  }

  if (formData.phone) {
    const phoneEl = await page.$(SELECTORS.form.phoneField)
    if (phoneEl) {
      await safeType(page, SELECTORS.form.phoneField, formData.phone)
      log(`填入手機：${formData.phone}`, 'info')
    }
  }

  if (formData.idNumber) {
    const idEl = await page.$(SELECTORS.form.idField)
    if (idEl) {
      await safeType(page, SELECTORS.form.idField, formData.idNumber)
      log('填入身分證字號', 'info')
    }
  }

  if (formData.email) {
    const emailEls = await page.$$(SELECTORS.form.emailField)
    for (const el of emailEls) {
      const val = await el.evaluate(e => e.value)
      if (!val) await el.type(formData.email, { delay: 50 })
    }
  }

  // 勾選同意條款
  const agree = await page.$(SELECTORS.form.agreeCheckbox)
  if (agree) {
    const checked = await agree.evaluate(el => el.checked)
    if (!checked) await agree.click()
  }

  log('表單填寫完成，提交中...', 'info')
  await safeClick(page, SELECTORS.form.submitBtn)
  await page.waitForNavigation({ timeout: 20000 }).catch(() => {})
}

// 付款
async function fillPayment(page, paymentData, log) {
  log('進入付款頁面...', 'info')

  // 選信用卡
  const ccOption = await page.$(SELECTORS.payment.creditCardOption)
  if (ccOption) {
    await ccOption.click()
    await page.waitForTimeout(500)
  }

  // 信用卡資料可能在 iframe（如 Tappay）
  const frames = page.frames()
  let targetFrame = page

  for (const frame of frames) {
    const cardInput = await frame.$(SELECTORS.payment.cardNumber).catch(() => null)
    if (cardInput) { targetFrame = frame; break }
  }

  if (paymentData.cardNumber) {
    await safeType(targetFrame, SELECTORS.payment.cardNumber, paymentData.cardNumber.replace(/\s/g, ''))
    log('填入信用卡號', 'info')
  }

  if (paymentData.expiry) {
    await safeType(targetFrame, SELECTORS.payment.expiry, paymentData.expiry)
    log('填入有效期', 'info')
  }

  if (paymentData.cvv) {
    await safeType(targetFrame, SELECTORS.payment.cvv, paymentData.cvv)
    log('填入 CVV', 'info')
  }

  log('確認付款...', 'info')
  await safeClick(page, SELECTORS.payment.confirmBtn)
  await page.waitForNavigation({ timeout: 30000 }).catch(() => {})
}

// 偵測驗證碼
async function hasCaptcha(page) {
  const captchaFrame = await page.$(SELECTORS.captcha.iframe)
  const captchaImg = await page.$(SELECTORS.captcha.image)
  return !!(captchaFrame || captchaImg)
}

// 偵測是否成功
async function isOrderSuccess(page) {
  const url = page.url()
  if (url.includes('confirmation') || url.includes('complete') || url.includes('success')) return true
  const el = await page.$('.order-complete, .registration-complete, h1.success')
  return !!el
}

module.exports = {
  login,
  gotoEvent,
  checkTicketStatus,
  selectTicket,
  fillForm,
  fillPayment,
  hasCaptcha,
  isOrderSuccess,
  waitForAny,
}
