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
  openGameLocation: (path) => ipcRenderer.invoke('open-game-location', path),
  deleteApp: (id) => ipcRenderer.invoke('delete-app', id),
  fetchNews: () => ipcRenderer.invoke('fetch-news'),
  fetchSteamSpecials: () => ipcRenderer.invoke('fetch-steam-specials'),
  selectCaptureFolder: () => ipcRenderer.invoke('select-capture-folder'),
  getLatestCapture: (folderPath) => ipcRenderer.invoke('get-latest-capture', folderPath),
  listFolderImages: (folderPath) => ipcRenderer.invoke('list-folder-images', folderPath),
  getDefaultWallpaperFolder: () => ipcRenderer.invoke('get-default-wallpaper-folder'),
  getDefaultCaptureFolder: () => ipcRenderer.invoke('get-default-capture-folder'),
  steamLogin: () => ipcRenderer.invoke('steam-login'),
  getSteamInstalledApps: () => ipcRenderer.invoke('get-steam-installed-apps'),
  onGameClosed: (callback) => ipcRenderer.on('game-closed', (_event, id) => callback(id)),
  removeGameClosedListener: () => ipcRenderer.removeAllListeners('game-closed'),
});



