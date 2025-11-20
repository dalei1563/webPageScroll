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
        webpreferences="nativeWindowOpen=no, backgroundThrottling=no, contextIsolation=yes"
        disablehtmlfullscreenwindowresize
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
            <n-button size="small" strong secondary @click="lastIndex">上一页</n-button>
            <n-button size="small" strong secondary @click="nextIndex">下一页</n-button>
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
            placeholder="请输入URL，多个请换行，填写完成后点击保存并应用配置"
          />
        </div>
        <div class="panel-row">
          <n-button size="small" type="primary" @click="saveConfig">保存并应用配置</n-button>
          <n-button size="small" type="warning" @click="resetConfig">重置配置</n-button>
          <n-button size="small" type="info" @click="copyCurrentConfig"
            >复制当前配置URL到剪贴板</n-button
          >
        </div>
        <div class="panel-row">
          <span>日志：{{ logContent }}</span>
        </div>
      </n-space>
    </n-card>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick, toRaw } from 'vue'
import { NCard, NButton, NInputNumber, NSwitch, NSpace, NInput } from 'naive-ui'

const slides = ref([
  {
    id: Date.now(),
    url: 'https://app.powerbi.cn/'
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
const logContent = ref(null)

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
//应用配置，更新slides
const updateSlides = () => {
  // 按行拆分，去掉空行
  const lines = setUrl.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const urlReg = /^https?:\/\/[^\s/$.?#].[^\s]*$/i
  // URL 格式校验
  for (const line of lines) {
    if (!urlReg.test(line)) {
      logContent.value = `URL 格式不正确：${line}`
      return
    }
  }

  // 转换成对象数组
  slides.value = lines.map((url, index) => ({
    id: index + 1,
    url
  }))

  // 立即刷新所有页面
  nextTick(() => {
    const webview = getAllWebviews()
    webview.map((wb, index) => ({
      ...wb,
      src: slides.value[index].url
    }))
  })
}

const getAllWebviews = () => {
  return webviewRefs.value
}

// 开始轮播
function startLoop() {
  if (timer.value) return
  timer.value = setInterval(
    () => {
      // 1. 先切换到下一页
      currentIndex.value = (currentIndex.value + 1) % slides.value.length
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
}

function lastIndex() {
  currentIndex.value = (currentIndex.value + slides.value.length - 1) % slides.value.length
}

// 保存配置到本地
const saveConfig = async () => {
  updateSlides()
  const plainConfig = {
    timeinterval: timeinterval.value,
    slides: toRaw(slides.value)
  }

  const success = await window.api.saveConfig(plainConfig)
  if (success) {
    logContent.value = '保存成功'
  }
}
//重置配置并保存本地
const resetConfig = async () => {
  timeinterval.value = 10
  slides.value = [
    {
      id: Date.now(),
      url: 'https://app.powerbi.cn/'
    }
  ]
  nextTick(() => {
    const webview = getAllWebviews()
    webview.map((wb, index) => ({
      ...wb,
      src: slides.value[index].url
    }))
  })
  const plainConfig = {
    timeinterval: timeinterval.value,
    slides: toRaw(slides.value)
  }

  const success = await window.api.saveConfig(plainConfig)
  if (success) {
    logContent.value = '重置成功'
  }
}

//将当前配置中所有的URL复制到剪贴板
const copyCurrentConfig = () => {
  const urls = slides.value.map((slide) => slide.url).join('\n')
  window.api.copyToClipboard(urls)
  logContent.value = `当前配置中所有URL已复制到剪贴板`
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

onMounted(() => {
  window.api.onConfigLoaded((loadedConfig) => {
    timeinterval.value = loadedConfig.timeinterval || timeinterval.value
    slides.value = loadedConfig.slides || slides.value
    console.log('配置已加载：', loadedConfig)
  })
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
  width: 500px;
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
