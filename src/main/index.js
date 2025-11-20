import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFile, writeFile, mkdir } from 'fs-extra'
import { homedir } from 'os'
import icon from '../../resources/icon.png?asset'

let mainWindow

// 配置路径（用户目录，跨平台）
const APP_DIR = join(homedir(), 'MyElectronSlides')
const CONFIG_PATH = join(APP_DIR, 'config.json')

// 默认配置
const defaultConfig = {
  timeinterval: 10,
  slides: []
}

// 确保目录存在
async function ensureConfig() {
  try {
    if (!require('fs').existsSync(CONFIG_PATH)) {
      await mkdir(APP_DIR, { recursive: true })
      await writeFile(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8')
      return defaultConfig
    }
    const data = await readFile(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(data)
    // 合并默认值，防止新增字段时丢失
    return { ...defaultConfig, ...parsed, slides: parsed.slides || defaultConfig.slides }
  } catch (err) {
    console.error('配置加载失败，使用默认值', err)
    return defaultConfig
  }
}

// 保存配置
async function saveConfig(config) {
  try {
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
    console.log(CONFIG_PATH)
    return true
  } catch (err) {
    console.error('保存配置失败', err)
    return false
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    icon: join(__dirname, '../renderer/src/assets/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      enableBlinkFeatures: 'FullscreenAPI'
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 全局快捷键 Ctrl+1 切换面板
  globalShortcut.register('Control+1', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-panel')
    }
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // === 配置系统核心 ===
  const config = await ensureConfig()

  // 获取配置（Vue 主动调用）
  ipcMain.handle('config:get', () => config)

  // 保存配置
  ipcMain.handle('config:save', async (event, newConfig) => {
    const success = await saveConfig(newConfig)
    if (success) {
      // 通知所有渲染进程更新
      mainWindow?.webContents.send('config:updated', newConfig)
    }
    return success
  })

  createWindow()

  // 关键：窗口 ready-to-show 后立即推送配置（保证 Vue 最快拿到）
  mainWindow?.once('ready-to-show', () => {
    mainWindow.webContents.send('config:loaded', config)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll() // 清理快捷键
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
// 复制文本到剪贴板
ipcMain.handle('copy-to-clipboard', (event, text) => {
  const { clipboard } = require('electron')
  clipboard.writeText(text)
})
