import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { startKeepAlive } from './utils/keepAlive'

createApp(App).use(router).mount('#app')

startKeepAlive()
