import { getApiBase } from '../services/socket'

export function startKeepAlive() {
  const ping = async () => {
    try {
      await fetch(`${getApiBase()}/api/health`)
    } catch (e) { /* 後端休眠中或未啟動，靜默忽略 */ }
  }

  ping()
  setInterval(ping, 14 * 60 * 1000)
}
