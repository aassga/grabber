<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">👤 帳號管理</h1>
      <p class="page-desc">管理多組 KKTIX 帳號與輪替策略</p>
    </div>

    <!-- 輪替策略 -->
    <div class="card">
      <div class="card-title">🔄 帳號切換策略</div>
      <div class="strategy-grid">
        <div
          v-for="s in strategies"
          :key="s.id"
          class="strategy-card"
          :class="{ active: selectedStrategy === s.id }"
          @click="selectedStrategy = s.id"
        >
          <div class="strategy-icon">{{ s.icon }}</div>
          <div class="strategy-name">{{ s.name }}</div>
          <div class="strategy-desc">{{ s.desc }}</div>
        </div>
      </div>
    </div>

    <!-- 帳號列表 -->
    <div class="card">
      <div class="card-title" style="justify-content: space-between;">
        <span>📋 帳號列表</span>
        <button class="btn btn-primary btn-sm" @click="addAccount">+ 新增帳號</button>
      </div>

      <div v-if="accounts.length === 0" class="empty-state">
        尚未新增任何帳號
      </div>

      <div v-for="(acc, idx) in accounts" :key="acc.id" class="account-row">
        <div class="account-badge" :class="acc.role">
          {{ acc.role === 'primary' ? '主' : '備' }}
        </div>
        <div class="account-info">
          <div class="account-name-row">
            <input v-model="acc.name" class="form-input inline-input" placeholder="帳號名稱" />
            <span class="role-badge" :class="acc.role">
              {{ acc.role === 'primary' ? '主帳號' : '備用帳號' }}
            </span>
          </div>
          <div class="account-fields">
            <input v-model="acc.email" class="form-input" placeholder="Email" />
            <input v-model="acc.password" class="form-input" type="password" placeholder="密碼" />
          </div>
        </div>
        <div class="account-actions">
          <label class="toggle">
            <input type="checkbox" v-model="acc.active" />
            <span class="toggle-slider"></span>
          </label>
          <button
            class="btn btn-outline btn-sm"
            @click="toggleRole(acc)"
          >
            {{ acc.role === 'primary' ? '設為備用' : '設為主要' }}
          </button>
          <button class="btn btn-danger btn-sm" @click="removeAccount(idx)">刪除</button>
        </div>
      </div>
    </div>

    <!-- 帳號統計 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-num">{{ accounts.length }}</div>
        <div class="stat-label">總帳號數</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ activeCount }}</div>
        <div class="stat-label">啟用中</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ primaryCount }}</div>
        <div class="stat-label">主帳號</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ backupCount }}</div>
        <div class="stat-label">備用帳號</div>
      </div>
    </div>
  </div>
</template>

<script>
import { grabberStore } from '../store/grabberStore'

export default {
  name: 'AccountsView',
  data() {
    return {
      selectedStrategy: 'sequential',
      strategies: [
        { id: 'sequential', icon: '➡️', name: '順序輪替', desc: '依序嘗試每個帳號' },
        { id: 'random', icon: '🎲', name: '隨機輪替', desc: '隨機選擇可用帳號' },
        { id: 'fastest', icon: '⚡', name: '最快優先', desc: '優先使用成功率最高的帳號' },
        { id: 'parallel', icon: '⚡⚡', name: '同步並發', desc: '所有帳號同時嘗試搶票' },
      ],
    }
  },
  computed: {
    accounts() { return grabberStore.accounts },
    activeCount() { return this.accounts.filter(a => a.active).length },
    primaryCount() { return this.accounts.filter(a => a.role === 'primary').length },
    backupCount() { return this.accounts.filter(a => a.role === 'backup').length },
  },
  methods: {
    addAccount() {
      const id = Date.now()
      grabberStore.accounts.push({
        id,
        name: `帳號 ${grabberStore.accounts.length + 1}`,
        email: '',
        password: '',
        role: 'backup',
        active: true,
      })
    },
    removeAccount(idx) {
      grabberStore.accounts.splice(idx, 1)
    },
    toggleRole(acc) {
      acc.role = acc.role === 'primary' ? 'backup' : 'primary'
    },
  },
}
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: #e2e8f0; }
.page-desc { font-size: 14px; color: #64748b; margin-top: 4px; }

.strategy-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

.strategy-card {
  padding: 16px;
  border: 2px solid #2d3561;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.strategy-card:hover { border-color: #7c6aff; }
.strategy-card.active { border-color: #7c6aff; background: rgba(124,106,255,0.1); }

.strategy-icon { font-size: 24px; margin-bottom: 8px; }
.strategy-name { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
.strategy-desc { font-size: 12px; color: #64748b; }

.account-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid #2d3561;
}
.account-row:last-child { border-bottom: none; }

.account-badge {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 4px;
}
.account-badge.primary { background: rgba(124,106,255,0.2); color: #7c6aff; }
.account-badge.backup { background: rgba(100,116,139,0.2); color: #94a3b8; }

.account-info { flex: 1; display: flex; flex-direction: column; gap: 10px; }

.account-name-row { display: flex; align-items: center; gap: 10px; }
.inline-input { max-width: 160px; }

.role-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 600;
}
.role-badge.primary { background: rgba(124,106,255,0.2); color: #7c6aff; }
.role-badge.backup { background: rgba(100,116,139,0.2); color: #94a3b8; }

.account-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

.account-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #64748b;
  font-size: 14px;
}

.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

.stat-card {
  background: #1a1d2e;
  border: 1px solid #2d3561;
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.stat-num { font-size: 32px; font-weight: 700; color: #7c6aff; }
.stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }

@media (max-width: 768px) {
  .strategy-grid { grid-template-columns: repeat(2, 1fr); }
  .stats-row { grid-template-columns: repeat(2, 1fr); }

  .account-row { flex-wrap: wrap; gap: 12px; }
  .account-info { width: 100%; }
  .account-fields { grid-template-columns: 1fr; }
  .account-actions { flex-direction: row; flex-wrap: wrap; width: 100%; justify-content: flex-start; }
  .inline-input { max-width: 100%; flex: 1; }
}

@media (max-width: 480px) {
  .strategy-grid { grid-template-columns: 1fr 1fr; }
  .strategy-card { padding: 12px 8px; }
  .strategy-icon { font-size: 20px; }
}
</style>
