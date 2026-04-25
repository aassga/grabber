const express = require('express')
const cors = require('cors')
const http = require('http')
const { WebSocketServer } = require('ws')
const Grabber = require('./grabber')

const app = express()
app.use(cors())
app.use(express.json())

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

let activeGrabber = null
let wsClient = null

// ─── WebSocket ───────────────────────────────────────────────
wss.on('connection', (ws) => {
  wsClient = ws
  console.log('[WS] 前端已連線')

  send({ type: 'connected', message: '後端連線成功' })

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw)
      if (msg.type === 'captcha_resolved' && activeGrabber) {
        activeGrabber.resolveCaptcha()
      }
    } catch {}
  })

  ws.on('close', () => {
    wsClient = null
    console.log('[WS] 前端已斷線')
  })
})

function send(data) {
  if (wsClient && wsClient.readyState === 1) {
    wsClient.send(JSON.stringify(data))
  }
}

function sendLog(message, type = 'info') {
  send({ type: 'log', message, logType: type, time: new Date().toLocaleTimeString('zh-TW', { hour12: false }) })
}

function sendStatus(status) {
  send({ type: 'status', status })
}

// ─── REST API ─────────────────────────────────────────────────

// 開始搶票
app.post('/api/start', async (req, res) => {
  if (activeGrabber && activeGrabber.running) {
    return res.status(400).json({ error: '搶票已在執行中' })
  }

  const { settings, accounts, formData, paymentData } = req.body

  if (!settings?.eventUrl) return res.status(400).json({ error: '請填入活動網址' })
  if (!accounts?.length) return res.status(400).json({ error: '請新增至少一組帳號' })

  const account = accounts.find(a => a.role === 'primary' && a.active) || accounts.find(a => a.active)
  if (!account?.email || !account?.password) {
    return res.status(400).json({ error: '請填入帳號的 Email 與密碼' })
  }

  res.json({ ok: true, message: '搶票啟動中...' })

  activeGrabber = new Grabber(
    { settings, accounts, formData, paymentData },
    (msg, type) => sendLog(msg, type),
    (status) => sendStatus(status),
    (success, msg) => {
      send({ type: 'done', success, message: msg })
      activeGrabber = null
    }
  )

  activeGrabber.start().catch(err => {
    sendLog(`未預期錯誤：${err.message}`, 'error')
    activeGrabber = null
  })
})

// 停止搶票
app.post('/api/stop', async (req, res) => {
  if (!activeGrabber) return res.json({ ok: true, message: '沒有執行中的任務' })
  await activeGrabber.stop()
  activeGrabber = null
  res.json({ ok: true, message: '已停止' })
})

// 手動確認驗證碼已完成
app.post('/api/captcha-resolved', (req, res) => {
  if (activeGrabber) activeGrabber.resolveCaptcha()
  res.json({ ok: true })
})

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, running: !!(activeGrabber?.running) })
})

// ─── 啟動 ─────────────────────────────────────────────────────
const PORT = 3000
server.listen(PORT, () => {
  console.log(`[Server] 後端啟動於 http://localhost:${PORT}`)
  console.log('[Server] WebSocket 監聽中...')
})
