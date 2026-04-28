import { grabberStore } from '../store/grabberStore'

const WS_URL = 'wss://desirable-dedication-production.up.railway.app'
export const API_URL = 'https://desirable-dedication-production.up.railway.app/api'
export const API_BASE = 'https://desirable-dedication-production.up.railway.app'

let ws = null
let reconnectTimer = null

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return

  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    grabberStore.monitor.backendConnected = true
    grabberStore.addLog('已連線至後端伺服器', 'info')
    clearTimeout(reconnectTimer)
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleMessage(msg)
    } catch (e) { /* ignore malformed messages */ }
  }

  ws.onclose = () => {
    grabberStore.monitor.backendConnected = false
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = () => {
    grabberStore.monitor.backendConnected = false
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      grabberStore.addLog(msg.message, 'success')
      break

    case 'log':
      grabberStore.addLog(msg.message, msg.logType, msg.time)
      if (msg.logType === 'warn' && msg.message.includes('驗證碼')) {
        grabberStore.monitor.waitingCaptcha = true
      }
      break

    case 'status':
      grabberStore.monitor.currentStatus = msg.status
      if (msg.status.includes('搶票中')) {
        grabberStore.monitor.attempts++
      }
      break

    case 'done':
      grabberStore.monitor.running = false
      grabberStore.monitor.waitingCaptcha = false
      grabberStore.addLog(msg.message, msg.success ? 'success' : 'error')
      if (msg.success) {
        grabberStore.monitor.currentStatus = '🎉 搶票成功！'
      }
      break
  }
}

function sendCaptchaResolved() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'captcha_resolved' }))
    grabberStore.monitor.waitingCaptcha = false
    grabberStore.addLog('已通知後端驗證碼完成', 'info')
  }
}

async function startGrabbing(payload) {
  const res = await fetch(`${API_URL}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

async function stopGrabbing() {
  const res = await fetch(`${API_URL}/stop`, { method: 'POST' })
  return res.json()
}

async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/health`)
    return res.json()
  } catch {
    return { ok: false }
  }
}

export default {
  connect,
  sendCaptchaResolved,
  startGrabbing,
  stopGrabbing,
  checkHealth,
}
