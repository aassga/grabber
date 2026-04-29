// KKTIX 頁面操作邏輯 - 所有 selector 與流程封裝在此

const SELECTORS = {
  // 登入頁
  login: {
    email: '#user_email',
    password: '#user_password',
    submit: 'input[type="submit"], button[type="submit"]',
    error: '.alert-danger, .error-message',
  },
  // Cloudflare 驗證
  cloudflare: {
    challenge: '#challenge-form, #challenge-running, #challenge-stage, .cf-browser-verification, #cf-please-wait',
    turnstile: 'iframe[src*="challenges.cloudflare.com"]',
  },
  // 活動頁 - 票券區
  event: {
    registerBtn: 'a.register-btn, a[href*="registrations/new"], .ticket-apply-btn, button.register-btn',
    soldOut: '.sold-out, .ticket-sold-out',
    notYet: '.not-yet, .coming-soon',
    ticketRows: '.ticket-row, .ticket-type-row, tr.ticket, tbody tr',
    ticketName: '.ticket-name, td.name, td:first-child',
    ticketQtySelect: 'select.ticket-count, select[name*="qty"], select[name*="count"]',
    applyBtn: 'input[type="submit"].apply, button.apply-btn, #register-submit',
    nextBtn: 'button, input[type="submit"]',
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

// 等待 Cloudflare 驗證通過（自動輪詢直到 challenge 消失）
async function waitForCloudflare(page, log, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const isChallenge = await page.evaluate((sel) => {
      return !!(
        document.querySelector(sel) ||
        document.title.includes('Just a moment') ||
        document.title.includes('正在執行安全驗證') ||
        document.title.includes('Attention Required')
      )
    }, SELECTORS.cloudflare.challenge).catch(() => false)

    if (!isChallenge) return true
    if (log) log('等待 Cloudflare 安全驗證...', 'info')
    await new Promise(r => setTimeout(r, 1500))
  }
  return false
}

// 用文字內容找可點擊的按鈕（比 XPath 更可靠，避免回傳文字節點）
async function findButtonByText(page, texts) {
  const textList = Array.isArray(texts) ? texts : [texts]
  const handle = await page.evaluateHandle((list) => {
    const candidates = [...document.querySelectorAll('button, input[type="submit"], a')]
    return candidates.find(el => {
      const t = (el.innerText || el.value || el.textContent || '').trim()
      return list.some(kw => t.includes(kw))
    }) || null
  }, textList)
  return handle.asElement() || null
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
  const LOGIN_URL = 'https://kktix.com/users/sign_in'
  log('前往 KKTIX 登入頁...', 'info')
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // 偵測是否已登入：KKTIX 會直接轉跳回首頁並顯示「你已經登入」
  const alreadyLoggedIn = await page.evaluate(() => {
    const url = location.href
    const bodyText = document.body?.innerText || ''
    return (
      !url.includes('sign_in') ||
      bodyText.includes('你已經登入') ||
      bodyText.includes('You are already signed in') ||
      !!document.querySelector('.current-user, [class*="current-user"], .user-nav')
    )
  }).catch(() => false)

  if (alreadyLoggedIn) {
    log('偵測到已登入狀態，跳過登入步驟直接繼續', 'success')
    return
  }

  // 等待 Cloudflare 驗證通過
  const cfQuick = await waitForCloudflare(page, log, 10000)
  if (!cfQuick) {
    log('⚠️ Cloudflare 人機驗證 — 請到瀏覽器視窗，點擊「驗證您是人類」方框，通過後系統自動繼續（最多等 120 秒）', 'warn')
    await waitForCloudflare(page, null, 120000)
    log('驗證通過，重新載入登入頁...', 'info')
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  }

  // 等待頁面穩定
  await page.waitForTimeout(800)

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

  // 等待跳轉（送出後可能觸發 Cloudflare 對 POST 請求的驗證）
  await page.waitForNavigation({ timeout: 15000 }).catch(() => {})

  // 送出後再次檢查 Cloudflare（POST 請求也會被攔截）
  const cfAfterSubmit = await waitForCloudflare(page, log, 8000)
  if (!cfAfterSubmit) {
    log('⚠️ 登入送出後出現 Cloudflare 驗證，請在瀏覽器完成後系統自動繼續...', 'warn')
    const cfPassed = await waitForCloudflare(page, null, 120000)
    if (!cfPassed) throw new Error('登入時 Cloudflare 驗證逾時，請重試')
    // Cloudflare 通過後可能需要等待頁面跳轉完成
    await page.waitForNavigation({ timeout: 10000 }).catch(() => {})
  }

  const url = page.url()
  if (url.includes('sign_in')) {
    // 確認是否真的還在登入頁（排除 Cloudflare 干擾）
    const errEl = await page.$(SELECTORS.login.error)
    if (errEl) {
      const errTxt = await errEl.evaluate(el => el.innerText.trim())
      throw new Error(`登入失敗：${errTxt}`)
    }
    // 若沒有錯誤訊息元素，可能是 Cloudflare 仍在驗證中
    const stillCf = await waitForCloudflare(page, log, 30000)
    if (!stillCf) throw new Error('登入被 Cloudflare 阻擋，請手動完成驗證後重試')
    throw new Error('登入後仍停留在登入頁，請確認帳號密碼是否正確')
  }
  log('登入成功', 'success')
}

// 前往活動頁並監控票券狀態
async function gotoEvent(page, url, log) {
  log(`前往活動頁：${url}`, 'info')

  const targetHostname = new URL(url).hostname  // e.g. myfitness.kktix.cc

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // KKTIX 跨網域 SSO 使用 JS redirect，page.goto 只等到第一頁。
  // 持續輪詢，直到 URL 落在目標 hostname，或超時 20 秒。
  const maxWait = 20000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const cur = page.url()
    if (cur.includes(targetHostname)) break
    await new Promise(r => setTimeout(r, 400))
  }

  const actualUrl = page.url()
  if (actualUrl.includes(targetHostname)) {
    log(`已到達活動頁：${actualUrl}`, 'info')
  } else {
    log(`⚠️ 落地頁為 ${actualUrl}，不是預期的 ${targetHostname}，可能跨網域驗證未完成`, 'warn')
  }
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

    const soldOut = await row.$('.sold-out, .ticket-sold-out, button[disabled]')
    if (soldOut) return 'sold_out'

    const notYet = await row.$('.not-yet, .coming-soon')
    if (notYet) return 'not_yet'

    return 'available'
  }

  // fallback 1: 找已知報名按鈕 selector
  const regBtn = await page.$(SELECTORS.event.registerBtn)
  if (regBtn) {
    const disabled = await regBtn.evaluate(el => el.disabled || el.classList.contains('disabled'))
    return disabled ? 'not_yet' : 'available'
  }

  // fallback 2: 找文字為「下一步」「立即報名」「報名」「購票」的按鈕
  const ctaBtn = await findButtonByText(page, ['下一步', '立即報名', '報名', '購票', 'Register', 'Next'])
  if (ctaBtn) {
    const disabled = await ctaBtn.evaluate(el => el.disabled || el.classList.contains('disabled') || el.hasAttribute('disabled'))
    return disabled ? 'not_yet' : 'available'
  }

  return 'not_yet'
}

// 自動回答 KKTIX 自訂問答（例：請輸入「我同意比賽規則」）
async function fillCustomQuestions(page, fallbackAnswer, log) {
  // 找所有可能的問答區塊
  const blocks = await page.$$([
    '[class*="question"]', '[class*="Question"]',
    '.custom-question', '.question-group',
    'section', '.form-group',
  ].join(','))

  let handled = 0
  const seenInputs = new Set()

  for (const block of blocks) {
    const text = await block.evaluate(el => el.innerText || '').catch(() => '')
    const inputs = await block.$$('input[type="text"]:not([type="hidden"]), textarea')

    for (const input of inputs) {
      const id = await input.evaluate(el => el.id || el.name || el.className)
      if (seenInputs.has(id)) continue
      seenInputs.add(id)

      // 已有值就跳過
      const existing = await input.evaluate(el => el.value.trim())
      if (existing) continue

      // 優先：從題目文字提取「」裡的答案（格式：請輸入「答案」）
      let answer = ''
      const match = text.match(/請輸入[「""](.+?)[」""]/)
      if (match) {
        answer = match[1]
        log(`偵測到自訂問題，自動回答：${answer}`, 'info')
      } else if (fallbackAnswer) {
        answer = fallbackAnswer
        log(`使用預設答案填入自訂問題：${answer}`, 'info')
      }

      if (answer) {
        await input.evaluate(el => { el.scrollIntoView({ block: 'center' }) })
        await input.click({ clickCount: 3 })
        await input.type(answer, { delay: 60 })
        handled++
      }
    }
  }

  if (handled === 0 && fallbackAnswer) {
    // 更寬鬆：找所有空白 text input 填入備用答案
    const allInputs = await page.$$('input[type="text"]:not([disabled]):not([readonly])')
    for (const input of allInputs) {
      const id = await input.evaluate(el => el.id || el.name || '')
      if (seenInputs.has(id)) continue
      const val = await input.evaluate(el => el.value.trim())
      if (!val) {
        await input.type(fallbackAnswer, { delay: 60 })
        log(`備用答案已填入（${id || '未知欄位'}）`, 'warn')
      }
    }
  }
}

// 共用：用 JS DOM click()，完全不受 viewport/遮擋限制
async function jsClick(el) {
  await el.evaluate(node => {
    node.scrollIntoView({ block: 'center', inline: 'nearest' })
    node.click()
  })
}

// 選票 + 設定數量 + 勾選同意 + 點下一步
async function selectTicket(page, ticketType, quantity, log, customAnswer) {
  log(`選取票種「${ticketType || '第一個可用票種'}」...`, 'info')

  // ── 預備：偵測是否在活動描述頁，若是則先點「立即購票」進入報名頁 ──────
  const isOnTicketForm = await page.evaluate(() => {
    const hasPlusBtn = [...document.querySelectorAll('button, span, a, div')].some(el => {
      const t = el.textContent.trim()
      const c = (el.className || '').toLowerCase()
      return t === '+' || t === '＋' || c.includes('btn-plus') || c.includes('quantity-up')
    })
    const hasQtySelect = !!document.querySelector('select[name*="qty"], select[name*="count"], select.ticket-count')
    const hasTicketRow  = !!document.querySelector('.ticket-row, .ticket-type-row')
    return hasPlusBtn || hasQtySelect || hasTicketRow
  }).catch(() => false)

  if (!isOnTicketForm) {
    log('偵測到活動描述頁，尋找「立即購票」按鈕...', 'info')
    const regBtn = await page.$(SELECTORS.event.registerBtn).catch(() => null)
      || await findButtonByText(page, ['立即購票', '立即報名', '購票', '報名', 'Register', 'Buy Tickets'])
    if (regBtn) {
      await jsClick(regBtn)
      log('已點擊「立即購票」，等待進入票種選擇頁...', 'info')
      await page.waitForNavigation({ timeout: 20000 }).catch(() => {})
      await new Promise(r => setTimeout(r, 1000))
    } else {
      log('⚠️ 找不到「立即購票」按鈕，嘗試在當前頁面繼續', 'warn')
    }
  }

  // ── 步驟 1：找目標票種 row ────────────────────────────────
  const rows = await page.$$(SELECTORS.event.ticketRows)
  let targetRow = null
  for (const row of rows) {
    if (!ticketType) { targetRow = row; break }
    const nameEl = await row.$(SELECTORS.event.ticketName)
    if (!nameEl) continue
    const name = await nameEl.evaluate(el => el.innerText.trim())
    if (name.includes(ticketType)) { targetRow = row; break }
  }

  // ── 步驟 2：設定數量 ─────────────────────────────────────
  if (targetRow) {
    // 優先嘗試 <select> 下拉選單（舊版活動頁）
    const qtySelect = await targetRow.$(SELECTORS.event.ticketQtySelect).catch(() => null)
    if (qtySelect) {
      await qtySelect.select(String(quantity))
      log(`數量設定為 ${quantity} 張（下拉選單）`, 'info')
    } else {
      // 新版活動頁：用 page.evaluate 在頁面內直接找並點擊 + 按鈕
      // 支援 button / span / a / div，比對文字、class、aria-label
      const clicked = await page.evaluate((ticketName, qty) => {
        // 找對應票種的行（任意容器）
        const allEls = [...document.querySelectorAll('tr, [class*="ticket"], [class*="row"]')]
        const targetEl = allEls.find(el => el.innerText.includes(ticketName)) || document.body

        // 在該行找 + 按鈕（廣義搜尋）
        const candidates = [...targetEl.querySelectorAll('button, a, span, div, [role="button"]')]
        const plusKeywords  = ['+', '＋', 'add', 'plus', 'increase', 'btn-plus', 'btn-increase', 'quantity-up']
        const minusKeywords = ['-', '－', 'minus', 'decrease', 'btn-minus', 'btn-decrease', 'quantity-down']

        const isPlusEl = el => {
          const t = el.textContent.trim()
          const c = (el.className || '').toLowerCase()
          const a = (el.getAttribute('aria-label') || '').toLowerCase()
          return plusKeywords.some(k => t === k || c.includes(k) || a.includes(k))
        }
        const isMinusEl = el => {
          const t = el.textContent.trim()
          const c = (el.className || '').toLowerCase()
          const a = (el.getAttribute('aria-label') || '').toLowerCase()
          return minusKeywords.some(k => t === k || c.includes(k) || a.includes(k))
        }

        const plusBtn  = candidates.find(isPlusEl)
        const minusBtn = candidates.find(isMinusEl)

        if (!plusBtn) return false

        // 先歸零
        if (minusBtn) {
          for (let i = 0; i < 10; i++) {
            const numEl = targetEl.querySelector('input[type="number"]')
              || targetEl.querySelector('[class*="count"], [class*="qty"], [class*="quantity"]')
            const cur = numEl ? parseInt(numEl.value || numEl.textContent || '0', 10) : 0
            if (cur <= 0) break
            minusBtn.click()
          }
        }

        // 按 + qty 次
        for (let i = 0; i < qty; i++) {
          plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        }
        return true
      }, ticketType || '', quantity)

      if (clicked) {
        await new Promise(r => setTimeout(r, 300))
        log(`數量設定為 ${quantity} 張（+按鈕）`, 'info')
      } else {
        log('⚠️ 找不到 +/- 數量按鈕，請手動確認數量', 'warn')
      }
    }
  }

  // ── 步驟 3：勾選同意條款 checkbox ────────────────────────
  await page.evaluate(() => {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.checked) return
      // 先嘗試點對應的 <label>（KKTIX 常用自訂 checkbox 樣式，input 本身不可見）
      const label = cb.labels?.[0] || document.querySelector(`label[for="${cb.id}"]`)
      if (label) {
        label.scrollIntoView({ block: 'center' })
        label.click()
      } else {
        cb.scrollIntoView({ block: 'center' })
        cb.click()
      }
      // 強制設為 checked 並觸發 Vue/React 監聽的事件
      cb.checked = true
      cb.dispatchEvent(new Event('change', { bubbles: true }))
      cb.dispatchEvent(new Event('input',  { bubbles: true }))
    })
  })
  await new Promise(r => setTimeout(r, 300))
  const checkResult = await page.evaluate(() =>
    [...document.querySelectorAll('input[type="checkbox"]')].every(cb => cb.checked)
  )
  log(checkResult ? '已勾選同意條款' : '⚠️ 同意條款勾選可能未成功，請手動確認', checkResult ? 'info' : 'warn')

  // ── 步驟 3.5：回答自訂問題（如需要輸入答案才能報名）────────
  await fillCustomQuestions(page, customAnswer, log)

  // ── 步驟 3.6：檢查是否還有未填的必填欄位（需要使用者手動介入）──
  const unfilledCount = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll(
      'input[type="text"]:not([disabled]):not([readonly]):not([type="hidden"]), textarea:not([disabled]):not([readonly])'
    )]
    // 排除已知欄位（姓名、電話等）和隱藏欄位
    return inputs.filter(el => {
      if (!el.offsetParent) return false // 不可見
      if (el.closest('[class*="agree"], [class*="payment"], .name-field, .phone-field')) return false
      return el.value.trim() === '' // 仍是空的
    }).length
  })

  if (unfilledCount > 0) {
    log(`⚠️ 偵測到 ${unfilledCount} 個未填欄位，需要手動處理`, 'warn')
    return 'needs_manual' // 通知 grabber 暫停
  }

  // ── 步驟 4：點擊「下一步」或報名按鈕 ─────────────────────
  let clicked = false

  const regBtn = await page.$(SELECTORS.event.registerBtn).catch(() => null)
  if (regBtn) {
    await jsClick(regBtn)
    clicked = true
    log('點擊報名按鈕', 'info')
  }

  if (!clicked) {
    const ctaBtn = await findButtonByText(page, ['下一步', '立即報名', '報名', '購票', 'Register', 'Next'])
    if (ctaBtn) {
      const text = await ctaBtn.evaluate(el => (el.innerText || el.value || '').trim())
      await jsClick(ctaBtn)
      clicked = true
      log(`點擊「${text}」按鈕`, 'info')
    }
  }

  if (!clicked) throw new Error('找不到前進按鈕（下一步/報名），頁面結構可能已變更')

  await page.waitForNavigation({ timeout: 15000 }).catch(() => {})
  log('已進入報名頁面', 'info')
}

// 填寫報名表單（支援多張票各填一份）
async function fillForm(page, formData, log) {
  log('填寫報名表單...', 'info')

  // 通用：找所有符合 selector 的空白欄位，全部填入同一個值
  const fillAll = async (selector, value, fieldName) => {
    if (!value) return
    const els = await page.$$(selector)
    let count = 0
    for (const el of els) {
      const isVisible = await el.evaluate(e => !!(e.offsetParent))
      if (!isVisible) continue
      const existing = await el.evaluate(e => e.value.trim())
      if (existing) continue  // 已有值跳過
      await el.evaluate(e => e.scrollIntoView({ block: 'center' }))
      await el.click({ clickCount: 3 })
      await el.type(String(value), { delay: 50 })
      count++
    }
    if (count > 0) log(`填入${fieldName}（${count} 個欄位）`, 'info')
  }

  await fillAll(SELECTORS.form.nameField,  formData.name,     '姓名')
  await fillAll(SELECTORS.form.phoneField, formData.phone,    '手機')
  await fillAll(SELECTORS.form.idField,    formData.idNumber, '身分證')
  await fillAll(SELECTORS.form.emailField, formData.email,    'Email')

  // 勾選所有同意條款 checkbox
  const agreeBoxes = await page.$$(SELECTORS.form.agreeCheckbox)
  for (const cb of agreeBoxes) {
    const checked = await cb.evaluate(el => el.checked)
    if (!checked) await cb.click()
  }

  log('表單填寫完成，提交中...', 'info')

  // 優先找 type="submit"，找不到就改用文字比對
  let submitClicked = false
  const submitBySelector = await page.$(SELECTORS.form.submitBtn).catch(() => null)
  if (submitBySelector) {
    await submitBySelector.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click() })
    submitClicked = true
    log('點擊送出按鈕（selector）', 'info')
  }

  if (!submitClicked) {
    const submitByText = await findButtonByText(page, ['下一步', '送出', '確認', '提交', '完成報名', 'Submit', 'Next', 'Confirm'])
    if (submitByText) {
      const txt = await submitByText.evaluate(el => (el.innerText || el.value || '').trim())
      await submitByText.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click() })
      submitClicked = true
      log(`點擊「${txt}」送出按鈕`, 'info')
    }
  }

  if (!submitClicked) {
    log('找不到送出按鈕，請手動確認', 'warn')
  }

  await page.waitForNavigation({ timeout: 20000 }).catch(() => {})
}

// 付款（支援信用卡 TapPay / ATM / 超商）
async function fillPayment(page, paymentData, log) {
  log('進入付款頁面...', 'info')
  await new Promise(r => setTimeout(r, 1500))

  const method = paymentData.method || 'credit_card'

  // ── 步驟 1：選擇付款方式 ────────────────────────────────
  const methodKeywords = {
    credit_card: ['信用卡', 'Credit Card', 'credit_card', 'credit'],
    atm:         ['ATM', '轉帳', 'vacc', 'atm'],
    cvs:         ['超商', '便利商店', 'CVS', 'barcode', 'cvs'],
  }
  const keywords = methodKeywords[method] || []

  let methodSelected = false
  for (const kw of keywords) {
    const radio = await page.$(`input[value="${kw}"]`).catch(() => null)
    if (radio) {
      await radio.click()
      log(`選擇付款方式：${kw}`, 'info')
      methodSelected = true
      await new Promise(r => setTimeout(r, 800))
      break
    }
  }
  if (!methodSelected) {
    const btn = await findButtonByText(page, keywords)
    if (btn) {
      await jsClick(btn)
      log(`選擇付款方式（按鈕）：${keywords[0]}`, 'info')
      await new Promise(r => setTimeout(r, 800))
    }
  }

  // ── 步驟 2：ATM / 超商 — 直接送出，系統顯示付款帳號 ───
  if (method !== 'credit_card') {
    log(`${method === 'atm' ? 'ATM 轉帳' : '超商'}付款：送出後系統將顯示付款資訊`, 'info')
    const confirmBtn = await findButtonByText(page, ['確認', '送出', '完成', 'Confirm', 'Submit'])
      || await page.$('input[type="submit"]').catch(() => null)
    if (confirmBtn) {
      await jsClick(confirmBtn)
      await page.waitForNavigation({ timeout: 20000 }).catch(() => {})
    }
    return
  }

  // ── 步驟 3：信用卡 — TapPay iframe 填入 ────────────────
  log('等待 TapPay 信用卡表單載入...', 'info')
  await new Promise(r => setTimeout(r, 3000))

  const tapPayFrames = page.frames().filter(f => {
    const u = f.url()
    return u.includes('tappay') || u.includes('tappaysdk')
  })

  const fillFrame = async (frame, value, fieldName) => {
    const input = await frame.$('input').catch(() => null)
    if (!input) return false
    await input.evaluate(el => { el.focus(); el.select() })
    await input.type(String(value), { delay: 80 })
    await input.evaluate(el => {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: el.value }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    log(`填入${fieldName}（TapPay）`, 'info')
    return true
  }

  if (tapPayFrames.length >= 1) {
    // TapPay 固定順序：[0] 卡號、[1] 到期日、[2] CVV
    if (paymentData.cardNumber)
      await fillFrame(tapPayFrames[0], paymentData.cardNumber.replace(/\s/g, ''), '卡號')
    await new Promise(r => setTimeout(r, 300))
    if (tapPayFrames[1] && paymentData.expiry)
      await fillFrame(tapPayFrames[1], paymentData.expiry.replace('/', ''), '到期日')
    await new Promise(r => setTimeout(r, 300))
    if (tapPayFrames[2] && paymentData.cvv)
      await fillFrame(tapPayFrames[2], paymentData.cvv, 'CVV')
  } else {
    // TapPay 未出現，fallback 到一般 iframe 或直接填入
    log('⚠️ 未偵測到 TapPay，嘗試一般信用卡欄位...', 'warn')
    let filled = false
    for (const frame of page.frames()) {
      const cardInput = await frame.$(SELECTORS.payment.cardNumber).catch(() => null)
      if (!cardInput) continue
      if (paymentData.cardNumber)
        await cardInput.type(paymentData.cardNumber.replace(/\s/g, ''), { delay: 60 })
      const expInput = await frame.$(SELECTORS.payment.expiry).catch(() => null)
      if (expInput && paymentData.expiry) await expInput.type(paymentData.expiry, { delay: 60 })
      const cvvInput = await frame.$(SELECTORS.payment.cvv).catch(() => null)
      if (cvvInput && paymentData.cvv) await cvvInput.type(paymentData.cvv, { delay: 60 })
      filled = true
      break
    }
    if (!filled) {
      log('⚠️ 找不到信用卡輸入欄位，請手動填入後繼續', 'warn')
      return
    }
  }

  // ── 步驟 4：確認付款 ────────────────────────────────────
  log('確認付款...', 'info')
  await new Promise(r => setTimeout(r, 500))
  const payBtn = await findButtonByText(page, ['確認付款', '付款', '送出', 'Pay', 'Confirm'])
    || await page.$(SELECTORS.payment.confirmBtn).catch(() => null)
  if (payBtn) {
    await jsClick(payBtn)
    await page.waitForNavigation({ timeout: 30000 }).catch(() => {})
  } else {
    log('⚠️ 找不到付款按鈕，請手動確認', 'warn')
  }
}

// 偵測並點擊訂單確認頁的「確認送出」按鈕
async function confirmOrder(page, log) {
  log('檢查訂單確認頁...', 'info')
  await new Promise(r => setTimeout(r, 1500))

  // 確認頁特徵：URL 含 /registrations/ 且不含 /new，或頁面有訂單摘要元素
  const isConfirmPage = await page.evaluate(() => {
    const url = location.href
    const hasOrderSummary = !!(
      document.querySelector('.order-summary, .registration-summary, .ticket-summary, [class*="summary"]') ||
      document.querySelector('[class*="confirm"], [class*="review"], [class*="order-detail"]')
    )
    const urlIsConfirm = url.includes('/registrations/') && !url.includes('/new') && !url.includes('payment')
    return hasOrderSummary || urlIsConfirm
  }).catch(() => false)

  if (!isConfirmPage) {
    log('未偵測到確認頁，跳過此步驟', 'info')
    return
  }

  const confirmBtn = await findButtonByText(page, [
    '確認送出', '送出訂單', '確認訂單', '確認報名', '送出報名',
    '確認', '送出', 'Confirm', 'Submit Order', 'Submit',
  ])

  if (confirmBtn) {
    const txt = await confirmBtn.evaluate(el => (el.innerText || el.value || '').trim())
    await jsClick(confirmBtn)
    log(`點擊「${txt}」確認訂單`, 'info')
    await page.waitForNavigation({ timeout: 20000 }).catch(() => {})
  } else {
    log('確認頁未找到確認按鈕，嘗試找 input[type="submit"]', 'warn')
    const submitInput = await page.$('input[type="submit"]').catch(() => null)
    if (submitInput) {
      await submitInput.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click() })
      log('點擊送出按鈕（input submit）', 'info')
      await page.waitForNavigation({ timeout: 20000 }).catch(() => {})
    }
  }
}

// 偵測驗證碼（含 Cloudflare Turnstile）
async function hasCaptcha(page) {
  const captchaFrame = await page.$(SELECTORS.captcha.iframe)
  const captchaImg = await page.$(SELECTORS.captcha.image)
  const cfChallenge = await page.$(SELECTORS.cloudflare.challenge)
  const cfTurnstile = await page.$(SELECTORS.cloudflare.turnstile)
  return !!(captchaFrame || captchaImg || cfChallenge || cfTurnstile)
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
  confirmOrder,
  fillPayment,
  hasCaptcha,
  isOrderSuccess,
  waitForAny,
  waitForCloudflare,
}
