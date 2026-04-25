<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">⚙️ 搶票設定</h1>
      <p class="page-desc">設定目標活動資訊與搶票參數</p>
    </div>

    <!-- 活動資訊 -->
    <div class="card">
      <div class="card-title">🎯 活動資訊</div>
      <div class="form-grid">
        <div class="form-group form-full">
          <label class="form-label">活動網址</label>
          <input
            v-model="settings.eventUrl"
            class="form-input"
            placeholder="https://kktix.com/events/..."
          />
        </div>
        <div class="form-group">
          <label class="form-label">票種名稱</label>
          <input
            v-model="settings.ticketType"
            class="form-input"
            placeholder="例：一般票、早鳥票"
          />
        </div>
        <div class="form-group">
          <label class="form-label">購買數量</label>
          <input
            v-model.number="settings.quantity"
            class="form-input"
            type="number"
            min="1"
            max="4"
          />
        </div>
        <div class="form-group">
          <label class="form-label">刷新間隔（毫秒）</label>
          <select v-model.number="settings.refreshInterval" class="form-select">
            <option :value="500">500 ms（極速）</option>
            <option :value="1000">1000 ms（快速）</option>
            <option :value="2000">2000 ms（標準）</option>
            <option :value="3000">3000 ms（穩定）</option>
            <option :value="5000">5000 ms（保守）</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 進階選項 -->
    <div class="card">
      <div class="card-title">🔧 進階選項</div>
      <div class="toggle-row">
        <div>
          <div class="toggle-label">自動刷新</div>
          <div class="toggle-desc">依設定間隔自動重新整理頁面直到票券開放</div>
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="settings.autoRefresh" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <div>
          <div class="toggle-label">多帳號輪替</div>
          <div class="toggle-desc">失敗時自動切換備用帳號重試</div>
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="settings.multiAccount" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <div>
          <div class="toggle-label">驗證碼提示</div>
          <div class="toggle-desc">偵測到驗證碼時發出視覺與聲音提示</div>
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="settings.captchaHint" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <div>
          <div class="toggle-label">排程自動開搶</div>
          <div class="toggle-desc">指定時間自動開始執行搶票流程</div>
        </div>
        <label class="toggle">
          <input type="checkbox" v-model="settings.scheduledStart" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div v-if="settings.scheduledStart" class="schedule-input">
        <div class="form-group">
          <label class="form-label">排程時間</label>
          <input
            v-model="settings.scheduledTime"
            class="form-input"
            type="datetime-local"
          />
        </div>
      </div>
    </div>

    <!-- 報名表單資料 -->
    <div class="card">
      <div class="card-title">📝 報名表單資料</div>
      <p class="section-hint">搶到票後，自動填入報名表單所需資料</p>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">真實姓名 <span class="req">*</span></label>
          <input v-model="formData.name" class="form-input" placeholder="王小明" />
        </div>
        <div class="form-group">
          <label class="form-label">手機號碼 <span class="req">*</span></label>
          <input v-model="formData.phone" class="form-input" placeholder="0912345678" />
        </div>
        <div class="form-group">
          <label class="form-label">身分證字號</label>
          <input v-model="formData.idNumber" class="form-input" placeholder="A123456789" />
        </div>
        <div class="form-group">
          <label class="form-label">聯絡 Email</label>
          <input v-model="formData.email" class="form-input" type="email" placeholder="example@email.com" />
        </div>
      </div>
    </div>

    <!-- 付款資訊 -->
    <div class="card">
      <div class="card-title">💳 付款資訊</div>
      <div class="security-notice">
        🔒 資料僅存於本機記憶體，不會上傳或儲存至任何伺服器
      </div>
      <div class="form-grid">
        <div class="form-group form-full">
          <label class="form-label">持卡人姓名</label>
          <input v-model="paymentData.cardHolder" class="form-input" placeholder="WANG XIAO MING" />
        </div>
        <div class="form-group form-full">
          <label class="form-label">信用卡號</label>
          <input
            v-model="paymentData.cardNumber"
            class="form-input card-input"
            placeholder="1234 5678 9012 3456"
            maxlength="19"
            @input="formatCard"
          />
        </div>
        <div class="form-group">
          <label class="form-label">有效期限</label>
          <input
            v-model="paymentData.expiry"
            class="form-input"
            placeholder="MM/YY"
            maxlength="5"
            @input="formatExpiry"
          />
        </div>
        <div class="form-group">
          <label class="form-label">CVV / 安全碼</label>
          <input
            v-model="paymentData.cvv"
            class="form-input"
            placeholder="123"
            maxlength="4"
            type="password"
          />
        </div>
      </div>
    </div>

    <!-- 操作按鈕 -->
    <div class="action-bar">
      <button class="btn btn-outline" @click="resetSettings">🔄 重置設定</button>
      <button class="btn btn-primary" @click="saveSettings">💾 儲存設定</button>
      <router-link to="/monitor">
        <button class="btn btn-success">🚀 前往搶票</button>
      </router-link>
    </div>

    <!-- 儲存提示 -->
    <transition name="fade">
      <div v-if="saved" class="toast">✅ 設定已儲存</div>
    </transition>
  </div>
</template>

<script>
import { grabberStore } from '../store/grabberStore'

export default {
  name: 'SettingsView',
  computed: {
    settings() { return grabberStore.settings },
    formData() { return grabberStore.formData },
    paymentData() { return grabberStore.paymentData },
  },
  data() {
    return { saved: false }
  },
  methods: {
    saveSettings() {
      this.saved = true
      setTimeout(() => { this.saved = false }, 2000)
    },
    resetSettings() {
      Object.assign(grabberStore.settings, {
        eventUrl: '', ticketType: '', quantity: 1,
        refreshInterval: 3000, autoRefresh: true,
        multiAccount: false, captchaHint: true,
        scheduledStart: false, scheduledTime: '',
      })
      Object.assign(grabberStore.formData, { name: '', phone: '', idNumber: '', email: '' })
      Object.assign(grabberStore.paymentData, { cardNumber: '', expiry: '', cvv: '', cardHolder: '' })
    },
    formatCard(e) {
      let v = e.target.value.replace(/\D/g, '').substring(0, 16)
      this.paymentData.cardNumber = v.replace(/(.{4})/g, '$1 ').trim()
    },
    formatExpiry(e) {
      let v = e.target.value.replace(/\D/g, '').substring(0, 4)
      if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2)
      this.paymentData.expiry = v
    },
  },
}
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: #e2e8f0; }
.page-desc { font-size: 14px; color: #64748b; margin-top: 4px; }

.schedule-input { padding-top: 16px; max-width: 320px; }

.action-bar {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  align-items: center;
}
.action-bar a { text-decoration: none; }

.toast {
  position: fixed;
  bottom: 32px;
  right: 32px;
  background: #22c55e;
  color: white;
  padding: 12px 24px;
  border-radius: 10px;
  font-weight: 600;
  box-shadow: 0 4px 20px rgba(34,197,94,0.4);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.section-hint { font-size: 13px; color: #64748b; margin-bottom: 16px; margin-top: -12px; }

.security-notice {
  font-size: 12px;
  color: #22c55e;
  background: rgba(34,197,94,0.08);
  border: 1px solid rgba(34,197,94,0.2);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
}

.req { color: #ef4444; }
.card-input { letter-spacing: 2px; font-family: monospace; }
</style>
