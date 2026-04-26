const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const path = require('path')

puppeteer.use(StealthPlugin())

const USER_DATA_DIR = path.join(__dirname, '..', '.chrome-profile-scraper')

let cache = { data: null, query: null, at: 0 }
const CACHE_TTL = 5 * 60 * 1000

// 從單一頁面抓取活動連結
async function extractLinks(page) {
  return page.evaluate(() => {
    const seen = new Set()
    const results = []

    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href
      if (!href || !href.includes('/events/')) return
      if (seen.has(href)) return
      seen.add(href)

      const card = a.closest('li, article, [class*="card"], [class*="event-item"], [class*="EventItem"]') || a
      const fullText = card.innerText || ''

      if (fullText.includes('已結束')) return

      const img = card.querySelector('img')
      const titleEl = card.querySelector('[class*="title"], [class*="name"], [class*="Title"], [class*="Name"], h2, h3, h4, strong')
      let title = (titleEl ? titleEl.innerText : a.innerText || '').trim()
      title = title.replace(/\s+/g, ' ').split('\n')[0].trim()
      if (!title || title.length < 2) return

      const skip = ['登入', '登出', '帳號', '探索活動', '我的票券', '說明', '隱私', '服務條款', '建立活動', '選擇組織']
      if (skip.some(k => title.includes(k))) return

      const dateEl = card.querySelector('time, [class*="date"], [class*="Date"]')
      let date = dateEl ? dateEl.innerText.trim() : ''
      if (!date) {
        const m = fullText.match(/\d{4}\/\d{1,2}\/\d{1,2}[^\n]*/)
        if (m) date = m[0].trim()
      }

      results.push({
        title,
        date,
        image: img ? (img.src || img.dataset.src || img.dataset.lazySrc || '') : '',
        url: href,
      })
    })

    return results
  })
}

async function fetchEvents(query = '') {
  const now = Date.now()
  if (cache.data && cache.query === query && now - cache.at < CACHE_TTL) {
    return cache.data
  }

  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: USER_DATA_DIR,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--lang=zh-TW'],
  })

  try {
    const page = await browser.newPage()
    // 設定真實螢幕大小，讓 IntersectionObserver 正常運作
    await page.setViewport({ width: 1440, height: 900 })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-TW,zh;q=0.9' })

    const allSeen = new Map() // url → event
    const MAX_PAGES = 15

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = query
        ? `https://kktix.com/events?q=${encodeURIComponent(query)}&page=${pageNum}`
        : `https://kktix.com/events?page=${pageNum}`

      if (pageNum === 1) console.log('[Events] 前往:', url.replace(/&page=\d+/, '').replace(/\?page=\d+/, ''))

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

      // 等待活動連結出現
      await page.waitForFunction(
        () => document.querySelectorAll('a[href*="/events/"]').length > 0,
        { timeout: 10000 }
      ).catch(() => {})

      const pageTitle = await page.title()
      if (pageNum === 1) {
        console.log('[Events] 頁面標題:', pageTitle)
        if (pageTitle.includes('404') || pageTitle.includes('Not Found')) break
      }

      // 在這一頁做無限捲動
      let prevCount = 0
      let stable = 0
      for (let i = 0; i < 40 && stable < 3; i++) {
        await page.evaluate(() => {
          const el = document.scrollingElement || document.body
          el.scrollTop += 900
          window.dispatchEvent(new Event('scroll'))
        })
        await new Promise(r => setTimeout(r, 600))

        const cnt = await page.evaluate(() => document.querySelectorAll('a[href*="/events/"]').length)
        if (cnt === prevCount) { stable++ } else { stable = 0; prevCount = cnt }
      }

      const events = await extractLinks(page)
      const beforeCount = allSeen.size
      events.forEach(e => { if (!allSeen.has(e.url)) allSeen.set(e.url, e) })
      const added = allSeen.size - beforeCount

      console.log(`[Events] 第 ${pageNum} 頁，新增 ${added} 筆，累計 ${allSeen.size} 筆`)

      // 若這頁完全沒有新活動，代表已到底
      if (added === 0) break
    }

    const result = [...allSeen.values()]
    console.log('[Events] 最終抓到活動數:', result.length)
    cache = { data: result, query, at: now }
    return result
  } finally {
    await browser.close()
  }
}

module.exports = { fetchEvents }
