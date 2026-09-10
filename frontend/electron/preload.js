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
  selectAudio: () => ipcRenderer.invoke('select-audio'),
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
  listFolderAvatars: (folderPath) => ipcRenderer.invoke('list-folder-avatars', folderPath),
  getDefaultAvatarFolder: () => ipcRenderer.invoke('get-default-avatar-folder'),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  steamLogin: () => ipcRenderer.invoke('steam-login'),
  getSteamInstalledApps: () => ipcRenderer.invoke('get-steam-installed-apps'),
  getSteamInstalledAppsDetailed: () => ipcRenderer.invoke('get-steam-installed-apps-detailed'),
  getEpicInstalledGames: () => ipcRenderer.invoke('get-epic-installed-games'),
  getInstalledPrograms: () => ipcRenderer.invoke('get-installed-programs'),
  onGameClosed: (callback) => ipcRenderer.on('game-closed', (_event, id) => callback(id)),
  removeGameClosedListener: () => ipcRenderer.removeAllListeners('game-closed'),
  getMediaSessions: () => ipcRenderer.invoke('get-media-sessions'),
  mediaControl: (action, target) => ipcRenderer.invoke('media-control', action, target),
  getSteamDownloadProgress: () => ipcRenderer.invoke('get-steam-download-progress'),
  onSteamDownloadUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('steam-download-updated', listener);
    return () => ipcRenderer.removeListener('steam-download-updated', listener);
  },
  onMediaSessionsChanged: (callback) => {
    const listener = (_event, sessions) => callback(sessions);
    ipcRenderer.on('media-sessions-changed', listener);
    return () => ipcRenderer.removeListener('media-sessions-changed', listener);
  },
  // ── Logros de juegos PC manuales (detecta AppID automáticamente desde el exe) ─
  getPcGameAchievements: (exePath, steamApiKey, lang) =>
    ipcRenderer.invoke('get-pc-game-achievements', exePath, steamApiKey, lang),
  // ── Logros de juegos externos (emuladores Steam + GreenLuma) ──────────────
  // Devuelve un NormalizedSummary (mismo shape que SteamGameAchievementsSummary)
  // o null si no se encuentran datos en disco/registro.
  getExternalAchievements: (appId, steamApiKey, lang) =>
    ipcRenderer.invoke('get-external-achievements', appId, steamApiKey, lang),
  // ── Trofeos RPCS3 vía NPcommID directo ────────────────────────────────────
  // rpcs3Dir: carpeta raíz de RPCS3 (contiene rpcs3.exe + dev_hdd0/)
  // npCommId: NPcommID del juego ("NPWR00001-A", etc.)
  getRpcs3Trophies: (rpcs3Dir, npCommId) =>
    ipcRenderer.invoke('get-rpcs3-trophies', rpcs3Dir, npCommId),
  // ── Trofeos RPCS3 resolviendo desde un .lnk ───────────────────────────────
  // lnkPath:  ruta al .lnk del juego PS3
  // rpcs3Dir: carpeta raíz de RPCS3 configurada en Settings
  resolveRpcs3LnkTrophies: (lnkPath, rpcs3Dir) =>
    ipcRenderer.invoke('resolve-rpcs3-lnk-trophies', lnkPath, rpcs3Dir),
});



