import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // 获取配置（启动时最快拿到）
  onConfigLoaded: (callback) => {
    ipcRenderer.once('config:loaded', (event, config) => callback(config))
  },

  // 监听配置保存后的更新
  onConfigUpdated: (callback) => {
    ipcRenderer.on('config:updated', (event, config) => callback(config))
  },

  // 主动获取配置（备用）
  getConfig: () => ipcRenderer.invoke('config:get'),

  // 保存配置
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),

  // 快捷键触发的面板切换
  onTogglePanel: (callback) => {
    ipcRenderer.on('toggle-panel', callback)
  },

  // 可选：移除监听
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
