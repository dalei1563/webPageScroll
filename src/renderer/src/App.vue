<template>
  <div>
    <!-- 所有 slide 都保持挂载，只控制显隐 + 预加载刷新逻辑 -->
    <div
      v-for="(item, i) in slides"
      :key="item.id"
      :ref="(el) => setWebviewRef(el, i)"
      class="slide"
      :class="{ active: currentIndex === i }"
    >
      <webview
        :src="item.url"
        class="viewer"
        partition="persist:sharedState"
        webpreferences="nativeWindowOpen=no"
      ></webview>
    </div>

    <!-- 控制面板 -->
    <n-card v-show="showpanel" class="ncard1" title="控制面板（按Ctrl+1隐藏）">
      <n-space vertical>
        <div class="panel-row">
          <n-space>
            <span>页码：</span>
            <span>{{ currentIndex + 1 }} / {{ slides.length }}</span>
            <span>轮播开关：</span>
            <n-switch v-model:value="loopactive" />
          </n-space>
        </div>
        <div class="panel-row">
          <span>间隔（秒）：</span>
          <n-input-number
            v-model:value="timeinterval"
            :min="10"
            :step="5"
            clearable
            placeholder="最小10秒"
          />
        </div>
        <div class="panel-row">
          <n-input
            v-model:value="setUrl"
            type="textarea"
            placeholder="填写URL"
            @keydown.enter="updateCurrentUrl"
          />
        </div>
        <div class="panel-row">
          <n-space>
            <n-button size="small" type="primary" @click="duplicate">复制当前页</n-button>
            <n-button size="small" strong secondary @click="lastIndex">上一页</n-button>
            <n-button size="small" strong secondary @click="nextIndex">下一页</n-button>
          </n-space>
        </div>
      </n-space>
    </n-card>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { NCard, NButton, NInputNumber, NSwitch, NSpace, useMessage, NInput } from 'naive-ui'

const slides = ref([
  {
    id: Date.now(),
    url: 'https://app.powerbi.cn/reportEmbed?reportId=02392115-a479-4eae-b93c-cc00ba195b11&autoAuth=true&ctid=26c29e36-ada6-4acf-ae8a-a32733c108f3&navContentPaneEnabled=false'
  }
])

const currentIndex = ref(0)
const showpanel = ref(true)
const timer = ref(null)
const timeinterval = ref(10)
const loopactive = ref(false)
const setUrl = ref(null)
// 存储每个 webview DOM 引用
const webviewRefs = ref([])

const setWebviewRef = (el, index) => {
  if (el) {
    webviewRefs.value[index] = el.querySelector('webview')
  }
}

// 获取下一个将要显示的 webview（用于预刷新）
const getNextWebview = () => {
  const nextIdx = (currentIndex.value + 1) % slides.value.length
  return webviewRefs.value[nextIdx]
}

const updateCurrentUrl = () => {
  const url = setUrl.value.trim()
  const msg = useMessage()
  if (!url) {
    msg.error('URL 不能为空')
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    msg.warning('建议输入完整 URL（如 https:// 开头）')
  }

  slides.value[currentIndex.value].url = url
  msg.success('URL 已更新，即将重新加载...')

  // 立即刷新当前页面
  nextTick(() => {
    const webview = getCurrentWebview()
    if (webview) {
      webview.src = url // 直接改 src 最彻底
      // 或者用 webview.reload()
    }
  })
}

const getCurrentWebview = () => {
  return webviewRefs.value[currentIndex.value]
}

// 开始轮播
function startLoop() {
  if (timer.value) return
  timer.value = setInterval(
    () => {
      // 1. 先切换到下一页
      currentIndex.value = (currentIndex.value + 1) % slides.value.length
      setUrl.value = ''
      // 2. 等待 DOM 更新完成后，刷新下下个页面（预加载）
      nextTick(() => {
        const nextWebview = getNextWebview()
        if (nextWebview && nextWebview.reload) {
          // 可选：只在已加载过一次后才 reload，避免首次白屏
          if (nextWebview.isWaitingForResponse?.() === false) {
            nextWebview.reload()
          }
        }
      })
    },
    Math.max(timeinterval.value, 10) * 1000
  )
}

function stopLoop() {
  if (timer.value) {
    clearInterval(timer.value)
    timer.value = null
  }
}

function nextIndex() {
  currentIndex.value = (currentIndex.value + 1) % slides.value.length
  setUrl.value = ''
}

function lastIndex() {
  currentIndex.value = (currentIndex.value + slides.value.length - 1) % slides.value.length
  setUrl.value = ''
}

function preloadNext() {
  nextTick(() => {
    const nextWebview = getNextWebview()
    if (nextWebview && nextWebview.reload) {
      setTimeout(() => {
        if (!nextWebview.isLoading?.()) {
          nextWebview.reload()
        }
      }, 800) // 延迟一点确保当前页面稳定显示
    }
  })
}

function duplicate() {
  const cur = slides.value[currentIndex.value]
  slides.value.push({ id: Date.now(), url: cur.url })
  // 复制后自动跳到最后一页（新复制的）
  nextTick(() => {
    currentIndex.value = slides.value.length - 1
    preloadNext()
  })
}

// 监听轮播开关
watch(loopactive, (val) => {
  if (val) {
    startLoop()
  } else {
    stopLoop()
  }
})

// 间隔变化时重启定时器（保证最小10秒）
watch(timeinterval, (newVal) => {
  const realInterval = Math.max(newVal || 10, 10)
  if (loopactive.value) {
    stopLoop()
    timeinterval.value = realInterval
    startLoop()
  } else {
    timeinterval.value = realInterval
  }
})

onMounted(() => {
  if (window.api?.onTogglePanel) {
    window.api.onTogglePanel(() => {
      showpanel.value = !showpanel.value
    })
  }
})
</script>

<style scoped>
.slide {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: #000;
  opacity: 0;
  transition: opacity 1.2s ease;
  pointer-events: none;
  overflow: hidden;
}

.slide.active {
  opacity: 1;
  pointer-events: auto;
  z-index: 1;
}

.viewer {
  width: 100%;
  height: 100%;
  border: none;
  background-color: #000000 !important;
  display: flex !important; /* 重要：防止某些页面布局崩溃 */
}

.ncard1 {
  position: fixed;
  right: 40px;
  bottom: 40px;
  width: 420px;
  z-index: 1000;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(10px);
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
