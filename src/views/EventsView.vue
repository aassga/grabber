<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">🎪 活動瀏覽</h1>
      <p class="page-desc">從 KKTIX 抓取可購買活動，點擊卡片直接設定搶票目標</p>
    </div>

    <!-- 搜尋列 -->
    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="搜尋活動名稱..."
        @keyup.enter="load"
      />
      <button class="btn btn-primary" :disabled="loading" @click="load">
        <span v-if="loading">載入中...</span>
        <span v-else>搜尋</span>
      </button>
      <button class="btn btn-outline" :disabled="loading" @click="reset">重置</button>
      <span class="result-count" v-if="!loading && events.length">共 {{ filtered.length }} 筆</span>
    </div>

    <!-- 載入中 -->
    <div v-if="loading" class="loading-box">
      <div class="spinner"></div>
      <p>正在從 KKTIX 抓取活動列表，首次載入約需 10–20 秒...</p>
    </div>

    <!-- 錯誤 -->
    <div v-else-if="error" class="empty-box">
      <p class="empty-icon">⚠️</p>
      <p>{{ error }}</p>
      <button class="btn btn-primary" @click="load">重試</button>
    </div>

    <!-- 空結果 -->
    <div v-else-if="filtered.length === 0 && events.length > 0" class="empty-box">
      <p class="empty-icon">🔍</p>
      <p>找不到符合「{{ query }}」的活動</p>
    </div>

    <!-- 初始未載入 -->
    <div v-else-if="events.length === 0 && !loading" class="empty-box">
      <p class="empty-icon">🎫</p>
      <p>點擊「搜尋」載入 KKTIX 活動列表</p>
      <button class="btn btn-primary" @click="load">立即載入</button>
    </div>

    <!-- 活動卡片格 -->
    <div v-else class="events-grid">
      <div
        v-for="event in filtered"
        :key="event.url"
        class="event-card"
        @click="selectEvent(event)"
      >
        <div class="event-img-wrap">
          <img
            v-if="event.image"
            :src="event.image"
            :alt="event.title"
            class="event-img"
            @error="e => e.target.style.display = 'none'"
          />
          <div v-else class="event-img-placeholder">🎫</div>
        </div>
        <div class="event-info">
          <div class="event-title">{{ event.title }}</div>
          <div v-if="event.date" class="event-date">📅 {{ event.date }}</div>
          <div v-if="event.price" class="event-price">{{ event.price }}</div>
          <div class="event-url">{{ event.url }}</div>
        </div>
        <button class="select-btn" @click.stop="selectEvent(event)">選擇此活動</button>
      </div>
    </div>
  </div>
</template>

<script>
import { grabberStore } from '../store/grabberStore'

export default {
  name: 'EventsView',
  data() {
    return {
      query: '',
      events: [],
      loading: false,
      error: null,
    }
  },
  computed: {
    filtered() {
      if (!this.query) return this.events
      const q = this.query.toLowerCase()
      return this.events.filter(e =>
        e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
      )
    },
  },
  methods: {
    async load() {
      this.loading = true
      this.error = null
      try {
        const res = await fetch(`http://localhost:3000/api/events?q=${encodeURIComponent(this.query)}`)
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || '載入失敗')
        const today = new Date(); today.setHours(0, 0, 0, 0)
        this.events = data.events.filter(e => {
          const m = (e.date || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
          if (!m) return true
          return new Date(+m[1], +m[2] - 1, +m[3]) >= today
        })
        if (this.events.length === 0) this.error = 'KKTIX 目前沒有找到活動，請稍後再試'
      } catch (e) {
        this.error = e.message
      } finally {
        this.loading = false
      }
    },
    reset() {
      this.query = ''
      this.load()
    },
    selectEvent(event) {
      grabberStore.settings.eventUrl = event.url
      this.$router.push('/settings')
    },
  },
}
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 700; color: #e2e8f0; }
.page-desc { font-size: 14px; color: #64748b; margin-top: 4px; }

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
  background: #0f1117;
  border: 1px solid #2d3561;
  border-radius: 8px;
  padding: 10px 16px;
  color: #e2e8f0;
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
}
.search-input:focus { border-color: #7c6aff; }

.result-count { color: #64748b; font-size: 13px; }

.loading-box, .empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 0;
  color: #64748b;
  text-align: center;
}
.empty-icon { font-size: 48px; }

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #2d3561;
  border-top-color: #7c6aff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 卡片格：每行最多 4 張，自動換行 */
.events-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.event-card {
  background: #1a1d2e;
  border: 1px solid #2d3561;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s, transform 0.15s;
}
.event-card:hover {
  border-color: #7c6aff;
  transform: translateY(-2px);
}

.event-img-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #0f1117;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.event-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.event-img-placeholder {
  font-size: 48px;
  color: #2d3561;
}

.event-info {
  padding: 12px 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.event-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.event-date {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}
.event-price {
  font-size: 12px;
  color: #22c55e;
  font-weight: 600;
}
.event-url {
  font-size: 10px;
  color: #475569;
  word-break: break-all;
  margin-top: 4px;
}

.select-btn {
  margin: 0 14px 14px;
  padding: 8px;
  background: #7c6aff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.select-btn:hover { background: #6855e8; }

@media (max-width: 768px) {
  .search-bar { gap: 8px; }
  .search-bar .btn { flex-shrink: 0; }
  .events-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
}

@media (max-width: 480px) {
  .events-grid { grid-template-columns: 1fr; }
  .event-title { font-size: 13px; }
}
</style>
