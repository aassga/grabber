import { API_BASE } from '../services/socket'

export function startKeepAlive() {
  const ping = async () => {
    try {
      await fetch(`${API_BASE}/api/health`)
    } catch (e) { /* 後端休眠中或未啟動，靜默忽略 */ }
  }

  // 立即 ping 一次，再每 14 分鐘定期喚醒
  ping()
  setInterval(ping, 14 * 60 * 1000)
}
