const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApps: () => ipcRenderer.invoke('get-apps'),
  getUsers: () => ipcRenderer.invoke('get-users'),
  saveApp: (appData) => ipcRenderer.invoke('save-app', appData),
  saveUsers: (users) => ipcRenderer.invoke('save-users', users),
  launchApp: (id, path) => ipcRenderer.invoke('launch-app', id, path),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectImage: () => ipcRenderer.invoke('select-image'),
  selectVideo: () => ipcRenderer.invoke('select-video'),
  updateApp: (appData) => ipcRenderer.invoke('update-app', appData),
  closeApp: () => ipcRenderer.invoke('close-app'),
  fetchGameData: (title) => ipcRenderer.invoke('fetch-game-data', title),
  fetchSteamGridData: (title) => ipcRenderer.invoke('fetch-steamgrid-data', title),
  fetchSteamGridAssets: (title) => ipcRenderer.invoke('fetch-steamgrid-assets', title),
  getStorageInfo: () => ipcRenderer.invoke('get-storage-info'),
  openScreenshots: () => ipcRenderer.invoke('open-screenshots'),
  deleteApp: (id) => ipcRenderer.invoke('delete-app', id),
  fetchNews: () => ipcRenderer.invoke('fetch-news'),
});



