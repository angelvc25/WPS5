const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, spawn, fork } = require('child_process');
const { pathToFileURL } = require('url');
const serve = require('electron-serve').default || require('electron-serve');

const distPath = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '../dist');

const loadURL = serve({ directory: distPath });

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

const dbPath = path.join(app.getPath('userData'), 'database.json');
const IGDB_CLIENT_ID = 'cedukeor213t2yrqswcerzpldefp43'; // REEMPLAZAR
const IGDB_CLIENT_SECRET = 'q9hm9iq6ahlaccv3osl19a7y71qd3t'; // REEMPLAZAR
const STEAMGRID_API_KEY = '6abd5716fa6f6cb81eaed8426560c5eb'; // REEMPLAZADO
let igdbAccessToken = null;
let mainWindow = null;
let webMediaWindow = null;
let toastOverlayWindow = null;
let toastOverlayTimer = null;
let backendProcess = null;
let mediaSessionsUnsubscribe = null;
let mediaSessionsPollTimer = null;
let wps5WebMediaHint = null;
let windowsMediaSessionsModule = null;

const WINDOWS_MEDIA_SESSIONS_PATH = path.join(__dirname, '..', 'node_modules', 'windows-media-sessions');

// Si la aplicación está empaquetada, redirigimos el backend ejecutable al directorio unpacked de ASAR
if (app.isPackaged && process.platform === 'win32') {
  const backendPath = path.join(
    __dirname.replace('app.asar', 'app.asar.unpacked'),
    '..',
    'node_modules',
    'windows-media-sessions',
    'bin',
    'win-x64',
    'windows-media-sessions-backend.exe'
  );
  process.env.WINDOWS_MEDIA_SESSIONS_BACKEND = backendPath;
}

function getWindowsMediaSessionsModule() {
  if (windowsMediaSessionsModule) return windowsMediaSessionsModule;

  const candidates = [
    WINDOWS_MEDIA_SESSIONS_PATH,
    'windows-media-sessions',
  ];

  for (const candidate of candidates) {
    try {
      windowsMediaSessionsModule = require(candidate);
      return windowsMediaSessionsModule;
    } catch (_) {
      // try next candidate
    }
  }

  return null;
}

let winMediaControlModulePromise = null;

function resolveWinMediaControlImportUrl() {
  if (!app.isPackaged) return 'win-media-control';

  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'win-media-control', 'index.js'),
    path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'node_modules', 'win-media-control', 'index.js'),
  ];

  for (const modulePath of candidates) {
    if (fs.existsSync(modulePath)) {
      console.log('[MediaControl] Cargando win-media-control desde:', modulePath);
      return pathToFileURL(modulePath).href;
    }
  }

  console.warn('[MediaControl] win-media-control/index.js no encontrado en rutas unpacked:', candidates);
  return 'win-media-control';
}

function getWinMediaControlModule() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (!winMediaControlModulePromise) {
    const importUrl = resolveWinMediaControlImportUrl();
    winMediaControlModulePromise = import(importUrl).catch((err) => {
      console.warn('[MediaControl] win-media-control no disponible:', err.message);
      winMediaControlModulePromise = null;
      return null;
    });
  }
  return winMediaControlModulePromise;
}

function resolveMediaControlApp(target) {
  if (!target || typeof target !== 'object') return undefined;

  const appName = String(target.appName || '').trim();
  if (appName) {
    const lower = appName.toLowerCase();
    if (lower.includes('chrome') || lower.includes('youtube')) return 'Chrome';
    if (lower.includes('spotify')) return 'Spotify';
    if (lower.includes('firefox')) return 'Firefox';
    if (lower.includes('edge')) return 'Edge';
    if (lower.includes('groove')) return 'Groove';
    return appName;
  }

  const aumid = String(target.sourceAppUserModelId || '').trim();
  return aumid || undefined;
}

async function sendMediaControlAction(action, target) {
  if (process.platform !== 'win32') return { success: false };

  const media = await getWinMediaControlModule();
  if (!media) return { success: false, error: 'win-media-control unavailable' };

  const fnByAction = {
    play_pause: media.togglePlayPause,
    next: media.next,
    prev: media.previous,
  };
  const fn = fnByAction[action];
  if (!fn) return { success: false, error: 'unknown action' };

  const app = resolveMediaControlApp(target);

  try {
    let result = app !== undefined ? await fn(app) : await fn();
    let ok = Array.isArray(result?.success) && result.success.length > 0;

    // Si el control por app falla, reintentar con la sesión activa del sistema
    if (!ok && app !== undefined) {
      console.warn('[MediaControl]', action, 'falló para app', app, '- reintentando sesión actual');
      result = await fn();
      ok = Array.isArray(result?.success) && result.success.length > 0;
    }

    if (!ok) {
      console.warn('[MediaControl]', action, 'failed', result?.failed || 'no success');
    } else {
      console.log('[MediaControl]', action, 'ok', result.success.join(', '));
    }
    setTimeout(broadcastMediaSessions, 350);
    return { success: ok, ...result };
  } catch (err) {
    console.warn('[MediaControl]', action, err.message);
    return { success: false, error: err.message };
  }
}

function isMediaBrowserName(name) {
  const lower = (name || '').toLowerCase();
  return (
    lower.includes('chrome')
    || lower.includes('edge')
    || lower.includes('firefox')
    || lower.includes('spotify')
    || lower.includes('groove')
    || lower.includes('youtube')
  );
}

function resolveAppRecordThumbnail(appRecord) {
  if (!appRecord?.image || typeof appRecord.image !== 'string') return undefined;
  if (/^https?:\/\//i.test(appRecord.image)) return appRecord.image;
  if (fs.existsSync(appRecord.image)) return toLocalFileUri(appRecord.image);
  return undefined;
}

function setWps5WebMediaHint(appRecord, url) {
  const title = appRecord?.title?.trim()
    || (isYouTubeUrl(url) ? 'YouTube' : 'Multimedia');
  const appLabel = isYouTubeUrl(url) ? 'YouTube' : (appRecord?.platform || title);

  wps5WebMediaHint = {
    id: 'wps5-web-media-hint',
    sourceAppUserModelId: 'wps5.web.launcher',
    sourceAppDisplayName: isYouTubeUrl(url) ? 'Google Chrome' : appLabel,
    title,
    artist: appLabel,
    thumbnail: resolveAppRecordThumbnail(appRecord),
    playbackStatus: 'playing',
    timeline: { positionMs: 0, durationMs: 0 },
    controls: {
      canPlay: true,
      canPause: true,
      canSkipNext: true,
      canSkipPrevious: true,
    },
    launchedAt: Date.now(),
  };

  broadcastMediaSessions();
}

function clearWps5WebMediaHintIfMatched(sessions) {
  if (!wps5WebMediaHint) return;

  const hasBrowserSession = sessions.some((session) => {
    const status = session.playbackStatus;
    const isActive = status === 'playing' || status === 'paused' || status === 'opened';
    return isActive && isMediaBrowserName(session.sourceAppDisplayName || session.sourceAppUserModelId);
  });

  if (hasBrowserSession) {
    wps5WebMediaHint = null;
  }
}

async function fetchMediaSessionsForRenderer() {
  let sessions = [];
  const mediaModule = getWindowsMediaSessionsModule();

  if (process.platform === 'win32' && mediaModule?.getAllSessions) {
    try {
      sessions = await mediaModule.getAllSessions();
      clearWps5WebMediaHintIfMatched(sessions);
    } catch (err) {
      console.warn('[MediaSessions] fetch:', err.message);
    }
  }

  if (wps5WebMediaHint) {
    const alreadyPresent = sessions.some((session) => session.id === wps5WebMediaHint.id);
    if (!alreadyPresent) {
      sessions = [wps5WebMediaHint, ...sessions];
    }
  }

  return sessions;
}

function broadcastMediaSessions() {
  fetchMediaSessionsForRenderer()
    .then((sessions) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('media-sessions-changed', sessions);
      }
    })
    .catch((err) => {
      console.warn('[MediaSessions] broadcast:', err.message);
    });
}

function startMediaSessionsBridge() {
  if (process.platform !== 'win32') return;

  const mediaModule = getWindowsMediaSessionsModule();
  if (!mediaModule) {
    console.warn(
      '[MediaSessions] Paquete no instalado. Ejecuta: npm install windows-media-sessions',
    );
    mediaSessionsPollTimer = setInterval(broadcastMediaSessions, 2500);
    return;
  }

  try {
    broadcastMediaSessions();
    if (mediaModule.onSessionsChanged) {
      mediaSessionsUnsubscribe = mediaModule.onSessionsChanged(() => {
        broadcastMediaSessions();
      });
    }
    mediaSessionsPollTimer = setInterval(broadcastMediaSessions, 2500);
  } catch (err) {
    console.warn('[MediaSessions] No disponible:', err.message);
    mediaSessionsPollTimer = setInterval(broadcastMediaSessions, 2500);
  }
}

function stopMediaSessionsBridge() {
  if (mediaSessionsPollTimer) {
    clearInterval(mediaSessionsPollTimer);
    mediaSessionsPollTimer = null;
  }
  if (mediaSessionsUnsubscribe) {
    mediaSessionsUnsubscribe();
    mediaSessionsUnsubscribe = null;
  }

  const mediaModule = getWindowsMediaSessionsModule();
  if (mediaModule?.shutdown) {
    mediaModule.shutdown().catch(() => { });
  }
}

const THUMB_CACHE_DIR = path.join(app.getPath('userData'), 'thumbnail-cache');
// Ajusta calidad vs. rendimiento: más ancho = más nitidez en tiles grandes; quality 1-100
const THUMB_MAX_WIDTH = 640;
const THUMB_JPEG_QUALITY = 78;

function ensureThumbCacheDir() {
  if (!fs.existsSync(THUMB_CACHE_DIR)) {
    fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
  }
}

function toLocalFileUri(filePath) {
  return `local-file:///${filePath.replace(/\\/g, '/')}`;
}

function getThumbCachePath(sourcePath, mtimeMs) {
  const hash = crypto.createHash('md5').update(`${sourcePath}|${mtimeMs}|${THUMB_MAX_WIDTH}`).digest('hex');
  return path.join(THUMB_CACHE_DIR, `${hash}.jpg`);
}

function getOrCreateThumbnail(sourcePath, mtimeMs) {
  ensureThumbCacheDir();
  const cachePath = getThumbCachePath(sourcePath, mtimeMs);
  if (fs.existsSync(cachePath)) {
    return toLocalFileUri(cachePath);
  }

  try {
    const img = nativeImage.createFromPath(sourcePath);
    if (img.isEmpty()) return null;

    const { width, height } = img.getSize();
    let thumb = img;
    if (width > THUMB_MAX_WIDTH) {
      const targetH = Math.max(1, Math.round(height * (THUMB_MAX_WIDTH / width)));
      thumb = img.resize({ width: THUMB_MAX_WIDTH, height: targetH, quality: 'best' });
    }

    fs.writeFileSync(cachePath, thumb.toJPEG(THUMB_JPEG_QUALITY));
    return toLocalFileUri(cachePath);
  } catch (error) {
    console.error('Error creating thumbnail:', sourcePath, error);
    return null;
  }
}

function storeBackendLog(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ')}\n`;
  try {
    const logPath = path.join(app.getPath('userData'), 'store-backend.log');
    fs.appendFileSync(logPath, line);
  } catch (_) { /* noop */ }
  console.log(line.trim());
}

function startStoreBackend() {
  if (!app.isPackaged) {
    return;
  }

  const backendEntry = path.join(process.resourcesPath, 'backend/app.js');
  const backendCwd = path.join(process.resourcesPath, 'backend');

  storeBackendLog('[StoreBackend] entry=', backendEntry, 'cwd=', backendCwd);

  if (!fs.existsSync(backendEntry)) {
    storeBackendLog('[StoreBackend] No se encontró el backend empaquetado en', backendEntry, '- ¿corriste "npm run backend:build" antes de electron-builder?');
    return;
  }

  // Log de salida real del proceso hijo, en vez de heredar la consola (invisible en el .exe empaquetado)
  const logPath = path.join(app.getPath('userData'), 'store-backend.log');
  const outFd = fs.openSync(logPath, 'a');

  backendProcess = fork(backendEntry, [], {
    cwd: backendCwd,
    env: {
      ...process.env,
      PORT: process.env.STORE_API_PORT || '3000',
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', outFd, outFd, 'ipc'],
  });

  backendProcess.on('error', (error) => {
    storeBackendLog('[StoreBackend] Error al iniciar:', error);
  });

  backendProcess.on('exit', (code, signal) => {
    storeBackendLog('[StoreBackend] Proceso finalizado. code=', code, 'signal=', signal);
    backendProcess = null;
  });
}

function stopStoreBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}



// Inicializar la base de datos local
function initDB() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ games: [], media: [], users: [] }, null, 2));
  } else {
    // Asegurar que las claves básicas existan
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    let modified = false;
    if (!data.games) { data.games = []; modified = true; }
    if (!data.media) { data.media = []; modified = true; }
    if (!data.users) { data.users = []; modified = true; }
    if (modified) fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    fullscreen: true,
    icon: path.join(__dirname, '../assets/images/ps5.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Permitir carga de assets locales y externos sin restricciones de CORS/CSP en este entorno de consola
    },
  });

  attachExternalLinkHandlers(mainWindow);
  mainWindow.webContents.on('did-finish-load', () => {
    broadcastMediaSessions();
  });

  // Determinar si estamos en modo desarrollo o producción
  const isDev = !app.isPackaged;

  if (isDev) {
    // En desarrollo, carga Expo Web (por defecto corre en el puerto 8081)
    mainWindow.loadURL('http://localhost:8081');
    mainWindow.webContents.openDevTools();
  } else {
    // En producción, usa electron-serve para servir la carpeta dist de Expo
    loadURL(mainWindow);
  }
}

// Función para inyectar Base64 de imágenes locales
function injectMediaToBase64(item) {
  const newItem = { ...item };
  // Portada / Avatar
  const imageField = newItem.avatar ? 'avatar' : 'image';
  const targetPath = newItem[imageField];

  if (targetPath && fs.existsSync(targetPath)) {
    try {
      const ext = path.extname(targetPath).substring(1).toLowerCase();
      const mimeType = ext === 'jpg' ? 'jpeg' : (ext || 'png');
      const base64Data = fs.readFileSync(targetPath, 'base64');
      if (newItem.avatar) {
        newItem.avatarBase64 = `data:image/${mimeType};base64,${base64Data}`;
      } else {
        newItem.imageBase64 = `data:image/${mimeType};base64,${base64Data}`;
      }
    } catch (e) { console.error('Error leyendo imagen', e); }
  }
  // Fondo
  if (newItem.backgroundImage && fs.existsSync(newItem.backgroundImage)) {
    try {
      const ext = path.extname(newItem.backgroundImage).substring(1).toLowerCase();
      const mimeType = ext === 'jpg' ? 'jpeg' : (ext || 'png');
      const base64Data = fs.readFileSync(newItem.backgroundImage, 'base64');
      newItem.backgroundImageBase64 = `data:image/${mimeType};base64,${base64Data}`;
    } catch (e) { console.error('Error leyendo fondo', e); }
  }
  // Logo
  if (newItem.logo && fs.existsSync(newItem.logo)) {
    try {
      const ext = path.extname(newItem.logo).substring(1).toLowerCase();
      const mimeType = ext === 'jpg' ? 'jpeg' : (ext || 'png');
      const base64Data = fs.readFileSync(newItem.logo, 'base64');
      newItem.logoBase64 = `data:image/${mimeType};base64,${base64Data}`;
    } catch (e) { console.error('Error leyendo logo', e); }
  }
  return newItem;
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Cualquier URL con un esquema de protocolo (steam:, mailto:, discord:, etc.)
// que no sea http(s). Estas siempre deben delegarse al sistema operativo
// (shell.openExternal) en vez de intentar "navegar" a ellas dentro de Electron,
// ya que Chromium no sabe renderizarlas y termina en una ventana en blanco.
function isCustomProtocolUrl(url) {
  if (typeof url !== 'string') return false;
  if (isHttpUrl(url)) return false;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url);
}

function isExternalUrl(url) {
  return isHttpUrl(url) || isCustomProtocolUrl(url);
}

function shouldOpenInDefaultBrowser(targetUrl, currentUrl) {
  if (!isHttpUrl(targetUrl)) return false;
  try {
    if (!currentUrl) return true;
    const target = new URL(targetUrl);
    const current = new URL(currentUrl);
    return target.origin !== current.origin;
  } catch {
    return true;
  }
}

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be');
  } catch {
    return false;
  }
}

function shouldLaunchWebFullscreen(executablePath, appRecord) {
  if (!isHttpUrl(executablePath)) return false;
  if (appRecord?.type === 'web') return true;
  return isYouTubeUrl(executablePath);
}

function getWebBrowserProfileDir() {
  const profileDir = path.join(app.getPath('userData'), 'web-browser-profile');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  return profileDir;
}

function tryLaunchBrowserFullscreen(url) {
  // Perfil dedicado: si Chrome/Edge ya está abierto, los flags se ignoran sin --user-data-dir
  const profileDir = getWebBrowserProfileDir();
  const args = [
    `--user-data-dir=${profileDir}`,
    `--app=${url}`,
    '--kiosk',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (process.platform === 'win32') {
    const browserPaths = [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];

    for (const browserPath of browserPaths) {
      if (browserPath && fs.existsSync(browserPath)) {
        spawn(browserPath, args, { detached: true, stdio: 'ignore' }).unref();
        return true;
      }
    }
    return false;
  }

  if (process.platform === 'darwin') {
    const browserPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];

    for (const browserPath of browserPaths) {
      if (fs.existsSync(browserPath)) {
        spawn(browserPath, args, { detached: true, stdio: 'ignore' }).unref();
        return true;
      }
    }
  }

  return false;
}

function openElectronWebFullscreen(url) {
  if (webMediaWindow && !webMediaWindow.isDestroyed()) {
    webMediaWindow.close();
  }

  webMediaWindow = new BrowserWindow({
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../assets/images/ps5.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  attachExternalLinkHandlers(webMediaWindow);
  webMediaWindow.once('ready-to-show', () => {
    webMediaWindow.setFullScreen(true);
    webMediaWindow.show();
  });
  webMediaWindow.webContents.on('did-finish-load', () => {
    if (webMediaWindow && !webMediaWindow.isDestroyed()) {
      webMediaWindow.setFullScreen(true);
    }
  });
  webMediaWindow.loadURL(url);
  webMediaWindow.on('closed', () => {
    webMediaWindow = null;
  });
}

function openWebMediaFullscreen(url) {
  if (tryLaunchBrowserFullscreen(url)) {
    console.log('Web media abierto en navegador a pantalla completa:', url);
    setTimeout(showWebMediaCloseToast, 700);
    return;
  }
  console.log('Navegador no encontrado, usando ventana Electron a pantalla completa:', url);
  openElectronWebFullscreen(url);
  setTimeout(showWebMediaCloseToast, 700);
}

function showWebMediaCloseToast() {
  if (toastOverlayTimer) {
    clearTimeout(toastOverlayTimer);
    toastOverlayTimer = null;
  }
  if (toastOverlayWindow && !toastOverlayWindow.isDestroyed()) {
    toastOverlayWindow.close();
  }

  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  const toastWidth = 420;
  const toastHeight = 60;
  const marginBottom = 52;

  toastOverlayWindow = new BrowserWindow({
    width: toastWidth,
    height: toastHeight,
    x: Math.round(display.workArea.x + (screenWidth - toastWidth) / 2),
    y: Math.round(display.workArea.y + screenHeight - toastHeight - marginBottom),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  toastOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  toastOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
  }
  .toast {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    height: 100%;
    background: rgba(18, 18, 20, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
    animation: slideUp 0.35s ease-out;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(18px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .icon {
    color: #60A5FA;
    font-size: 18px;
    line-height: 1;
    font-weight: 700;
  }
  .keys { display: flex; align-items: center; gap: 6px; }
  .key {
    background: #2A2A2E;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 5px 10px;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .plus { color: rgba(255, 255, 255, 0.5); font-size: 14px; font-weight: 600; }
  .label { color: rgba(255, 255, 255, 0.85); font-size: 14px; font-weight: 600; }
</style>
</head>
<body>
  <div class="toast">
    <span class="icon">i</span>
    <div class="keys">
      <span class="key">ALT</span>
      <span class="plus">+</span>
      <span class="key">F4</span>
    </div>
    <span class="label">para cerrar</span>
  </div>
</body>
</html>`;

  toastOverlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  toastOverlayWindow.once('ready-to-show', () => {
    if (toastOverlayWindow && !toastOverlayWindow.isDestroyed()) {
      toastOverlayWindow.showInactive();
    }
  });

  toastOverlayTimer = setTimeout(() => {
    if (toastOverlayWindow && !toastOverlayWindow.isDestroyed()) {
      toastOverlayWindow.close();
    }
    toastOverlayWindow = null;
    toastOverlayTimer = null;
  }, 5000);

  toastOverlayWindow.on('closed', () => {
    toastOverlayWindow = null;
    if (toastOverlayTimer) {
      clearTimeout(toastOverlayTimer);
      toastOverlayTimer = null;
    }
  });
}

function attachExternalLinkHandlers(win) {
  const wc = win.webContents;

  wc.setWindowOpenHandler(({ url }) => {
    if (shouldOpenInDefaultBrowser(url, wc.getURL())) {
      shell.openExternal(url).catch(console.error);
      return { action: 'deny' };
    }
    // steam://, mailto:, discord:, etc. — Chromium no puede renderizarlos,
    // así que se delegan siempre al sistema en vez de abrir una ventana vacía.
    if (isCustomProtocolUrl(url)) {
      shell.openExternal(url).catch(console.error);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  wc.on('will-navigate', (event, url) => {
    if (shouldOpenInDefaultBrowser(url, wc.getURL()) || isCustomProtocolUrl(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(console.error);
    }
  });
}

function getSteamInstallPath() {
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      const output = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (match) return match[1].trim();
    } catch (e) { /* fallback paths below */ }

    const defaults = [
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam'),
    ];
    for (const candidate of defaults) {
      if (fs.existsSync(path.join(candidate, 'steam.exe'))) return candidate;
    }
  } else if (process.platform === 'linux') {
    const candidates = [
      path.join(process.env.HOME || '', '.steam', 'steam'),
      path.join(process.env.HOME || '', '.local', 'share', 'Steam'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, 'steam.sh'))) return candidate;
    }
  } else if (process.platform === 'darwin') {
    const candidate = path.join(process.env.HOME || '', 'Library', 'Application Support', 'Steam');
    if (fs.existsSync(path.join(candidate, 'Steam.app'))) return candidate;
  }
  return null;
}

function parseVdfLibraryPaths(content) {
  const paths = [];
  const regex = /"path"\s+"((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    paths.push(match[1].replace(/\\\\/g, '\\'));
  }
  return paths;
}

function getSteamLibraryFolders(steamPath) {
  const folders = [path.join(steamPath, 'steamapps')];
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');

  if (fs.existsSync(vdfPath)) {
    try {
      const content = fs.readFileSync(vdfPath, 'utf8');
      for (const libPath of parseVdfLibraryPaths(content)) {
        folders.push(path.join(libPath, 'steamapps'));
      }
    } catch (e) {
      console.error('Error reading libraryfolders.vdf:', e);
    }
  }

  return [...new Set(folders)];
}

function getInstalledSteamAppIds() {
  const steamPath = getSteamInstallPath();
  if (!steamPath) return [];

  const appIds = new Set();
  const libraryFolders = getSteamLibraryFolders(steamPath);

  for (const steamappsDir of libraryFolders) {
    if (!fs.existsSync(steamappsDir)) continue;

    try {
      for (const file of fs.readdirSync(steamappsDir)) {
        const match = file.match(/^appmanifest_(\d+)\.acf$/i);
        if (match) appIds.add(match[1]);
      }
    } catch (e) {
      console.error('Error scanning Steam library folder:', steamappsDir, e);
    }
  }

  return Array.from(appIds);
}

app.whenReady().then(() => {
  initDB();
  startStoreBackend();
  startMediaSessionsBridge();

  // Registrar protocolo personalizado para cargar imágenes locales y videos de forma segura
  // Usamos protocol.handle para mejor soporte en versiones recientes de Electron
  protocol.handle('local-file', async (request) => {
    try {
      let filePath = decodeURIComponent(request.url.replace('local-file://', ''));

      // En Windows, las rutas pueden venir como /C:/ o C/ o C:/
      if (process.platform === 'win32') {
        if (filePath.startsWith('/')) filePath = filePath.slice(1);
        if (/^[a-zA-Z]\//.test(filePath)) {
          filePath = filePath[0] + ':' + filePath.slice(1);
        }
      }

      // Convertimos la ruta a un formato de URL de archivo válido
      const fileUrl = pathToFileURL(path.normalize(filePath)).toString();
      return net.fetch(fileUrl);
    } catch (err) {
      console.error('Protocol error:', err);
      return new Response('Error loading local file', { status: 500 });
    }
  });

  // IPC: Obtener noticias (desde el Proceso Principal para evitar bloqueos de red en el renderer)
  ipcMain.handle('fetch-news', async () => {
    const API_KEY = '84b43625d92547c89d24fab37f0543af';
    const BASE_URL = 'https://newsapi.org/v2';
    try {
      const response = await fetch(
        `${BASE_URL}/everything?q=videojuegos+gaming&sortBy=publishedAt&pageSize=10&apiKey=${API_KEY}`
      );
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching news in main:', error);
      return { status: 'error', message: error.message };
    }
  });

  // IPC: Obtener ofertas destacadas de Steam (para bypass de CORS)
  ipcMain.handle('fetch-steam-specials', async () => {
    try {
      const response = await fetch('https://store.steampowered.com/api/featuredgcategories/?l=spanish&cc=US');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching Steam specials in main:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC: Obtener todas las aplicaciones y usuarios
  ipcMain.handle('get-apps', () => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    data.games = (data.games || []).map(injectMediaToBase64);
    data.media = (data.media || []).map(injectMediaToBase64);
    return data;
  });

  ipcMain.handle('get-users', () => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return (data.users || []).map(injectMediaToBase64);
  });

  // IPC: Guardar una nueva aplicación
  ipcMain.handle('save-app', (event, appData) => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    appData.id = Date.now().toString();

    if (appData.type === 'game') {
      data.games = data.games || [];
      data.games.push(appData);
    } else {
      data.media = data.media || [];
      data.media.push(appData);
    }

    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return data;
  });

  // IPC: Guardar lista de usuarios
  ipcMain.handle('save-users', (event, users) => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    data.users = users;
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return { success: true };
  });

  // IPC: Actualizar una aplicación existente
  ipcMain.handle('update-app', (event, updatedApp) => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    const updateInList = (list) => {
      const index = list.findIndex(item => item.id === updatedApp.id);
      if (index !== -1) {
        // Filtramos campos vacíos para no borrar datos existentes accidentalmente
        const filteredUpdate = Object.fromEntries(
          Object.entries(updatedApp).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
        );
        list[index] = { ...list[index], ...filteredUpdate };
        return true;
      }
      return false;
    };

    if (!updateInList(data.games || []) && !updateInList(data.media || [])) {
      if (updatedApp.id === 'spotify_default') {
        data.media = data.media || [];
        const filteredUpdate = Object.fromEntries(
          Object.entries(updatedApp).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
        );
        data.media.push({
          id: 'spotify_default',
          title: 'Spotify',
          type: 'media',
          platform: 'Spotify',
          ...filteredUpdate
        });
      } else if (updatedApp.id.toString().startsWith('steam_')) {
        data.games = data.games || [];
        const filteredUpdate = Object.fromEntries(
          Object.entries(updatedApp).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
        );
        data.games.push({
          ...filteredUpdate
        });
      } else {
        return { success: false, error: 'App not found' };
      }
    }

    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return { success: true, data };
  });

  // IPC: Eliminar una aplicación
  ipcMain.handle('delete-app', (event, id) => {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    let found = false;

    if (data.games) {
      const initialLength = data.games.length;
      data.games = data.games.filter(item => item.id !== id);
      if (data.games.length < initialLength) found = true;
    }

    if (!found && data.media) {
      const initialLength = data.media.length;
      data.media = data.media.filter(item => item.id !== id);
      if (data.media.length < initialLength) found = true;
    }

    if (!found) {
      return { success: false, error: 'App not found' };
    }

    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return { success: true };
  });

  // Los procesos hijos heredan variables de Electron/Chromium que hacen
  // crashar (0xC0000005) a muchos juegos al cargar DLLs o Crashpad.
  function envForExternalApp() {
    const env = { ...process.env };
    const strip = [
      'ELECTRON_RUN_AS_NODE',
      'ELECTRON_NO_ASAR',
      'ELECTRON_NO_ATTACH_CONSOLE',
      'CHROME_CRASHPAD_PIPE_NAME',
      'NODE_OPTIONS',
      'NODE_SKIP_PLATFORM_CHECK',
    ];
    for (const key of strip) delete env[key];
    return env;
  }

  function formatExitCode(code) {
    if (code === 3221225477) return ' — acceso inválido a memoria (0xC0000005)';
    if (code === 3221225781) return ' — DLL no encontrada (0xC0000135)';
    if (code === 3221226505) return ' — stack buffer overrun (0xC0000409)';
    return '';
  }

  // Helper: Resolver acceso directo .lnk a su ruta real (Windows)
  function resolveLnkTarget(lnkPath) {
    return new Promise((resolve) => {
      const escapedPath = lnkPath.replace(/'/g, "''");
      exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).CreateShortcut('${escapedPath}').TargetPath"`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  // IPC: Ejecutar un programa externo (con suspensión del launcher)
  ipcMain.handle('launch-app', async (event, id, executablePath) => {
    if (!executablePath) return;

    let appRecord = null;

    // Actualizar timestamp de último juego en la DB si el id existe
    if (id && id !== 'last_played') {
      console.log('Actualizando lastPlayed para:', id);
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const updateInList = (list) => {
        const item = list.find(i => i.id === id);
        if (item) {
          appRecord = item;
          item.lastPlayed = Date.now();
          console.log('Timestamp actualizado para:', item.title);
          return true;
        }
        return false;
      };

      if (updateInList(data.games || []) || updateInList(data.media || [])) {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
        console.log('DB guardada con éxito');
      } else {
        console.log('ID no encontrado en la base de datos:', id);
      }
    }

    const lowerPath = executablePath.toLowerCase();

    // URLs y protocolos (http://, steam://, epic://, etc.)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(executablePath)) {
      if (shouldLaunchWebFullscreen(executablePath, appRecord)) {
        setWps5WebMediaHint(appRecord, executablePath);
        openWebMediaFullscreen(executablePath);
        return { success: true, suspended: false, fullscreen: true };
      }
      shell.openExternal(executablePath).catch(console.error);
      return { success: true, suspended: false };
    }

    // .url files: abrir sin suspender
    if (lowerPath.endsWith('.url')) {
      shell.openPath(executablePath).catch(console.error);
      return { success: true, suspended: false };
    }

    // Resolver .lnk a la ruta real del ejecutable
    let targetExe = executablePath;
    if (lowerPath.endsWith('.lnk')) {
      const resolved = await resolveLnkTarget(executablePath);
      if (resolved) {
        targetExe = resolved;
        console.log('.lnk resuelto a:', targetExe);
      } else {
        // No se pudo resolver, abrir sin suspender
        console.log('No se pudo resolver el .lnk, abriendo sin suspensión');
        shell.openPath(executablePath).catch(console.error);
        return { success: true, suspended: false };
      }
    }

    // --- Suspensión del launcher mientras el juego está activo ---
    let gameExited = false;
    let hideTimer = null;

    const resumeLauncher = () => {
      if (gameExited) return; // Evitar doble ejecución
      gameExited = true;
      if (hideTimer) clearTimeout(hideTimer);

      if (mainWindow) {
        mainWindow.webContents.send('game-closed', id);
        if (!mainWindow.isVisible()) {
          // La ventana estaba oculta, restaurarla con un breve delay
          setTimeout(() => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
              console.log('Launcher restaurado');
            }
          }, 300);
        }
      }
    };

    // Ocultar el launcher después de 1.5s para que se vea la animación de lanzamiento
    hideTimer = setTimeout(() => {
      if (!gameExited && mainWindow) {
        mainWindow.hide();
        console.log('Launcher suspendido — ventana oculta');
      }
    }, 1500);

    // Lanzar el juego y monitorear el proceso
    try {
      const gameCwd = path.dirname(targetExe);
      console.log('Lanzando:', targetExe);
      console.log('Directorio de trabajo:', gameCwd);

      const child = spawn(targetExe, [], {
        cwd: gameCwd,
        env: envForExternalApp(),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        windowsVerbatimArguments: true,
      });

      child.on('error', (err) => {
        console.error('Error al iniciar el juego:', err);
        resumeLauncher();
      });

      child.on('close', (code) => {
        console.log(`Juego cerrado (código: ${code})${formatExitCode(code)}`);
        resumeLauncher();
      });
    } catch (err) {
      console.error('Excepción al lanzar el juego:', err);
      resumeLauncher();
    }

    return { success: true, suspended: true };
  });

  // IPC: Abrir diálogo para seleccionar ejecutable
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'noResolveAliases'],
      filters: [
        { name: 'Ejecutables', extensions: ['exe', 'bat', 'lnk', 'url'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // IPC: Abrir diálogo para seleccionar imagen (portada)
  ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // IPC: Abrir diálogo para seleccionar video
  ipcMain.handle('select-video', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'avi'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // IPC: Abrir diálogo para seleccionar carpeta de capturas
  ipcMain.handle('select-capture-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // IPC: Listar imágenes de una carpeta (fondos, capturas, etc.)
  ipcMain.handle('list-folder-images', async (event, folderPath) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) return [];

      const files = fs.readdirSync(folderPath);
      const entries = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
          const fullPath = path.join(folderPath, file);
          try {
            const stats = fs.statSync(fullPath);
            entries.push({
              fullPath,
              name: file,
              mtime: stats.mtimeMs,
            });
          } catch (_) { /* skip unreadable files */ }
        }
      }

      entries.sort((a, b) => b.mtime - a.mtime);

      const images = entries.map(({ fullPath, name, mtime }) => {
        const uri = toLocalFileUri(fullPath);
        const thumbnail = getOrCreateThumbnail(fullPath, mtime) || uri;
        return { uri, thumbnail, name, mtime };
      });

      return images;
    } catch (error) {
      console.error('Error listing folder images:', error);
      return [];
    }
  });

  // IPC: Carpeta predeterminada de fondos de PlayStation
  ipcMain.handle('get-default-wallpaper-folder', async () => {
    const folder = path.join(app.getPath('userData'), 'wallpapers');
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    return folder;
  });

  // IPC: Carpeta predeterminada de capturas
  ipcMain.handle('get-default-capture-folder', async () => {
    const folder = path.join(app.getPath('pictures'), 'Screenshots');
    return folder;
  });

  // IPC: Lista imágenes de una carpeta de avatares
  ipcMain.handle('list-folder-avatars', async (event, folderPath) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) return [];

      const files = fs.readdirSync(folderPath);
      const entries = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
          const fullPath = path.join(folderPath, file);
          try {
            const stats = fs.statSync(fullPath);
            entries.push({
              fullPath,
              name: file,
              mtime: stats.mtimeMs,
            });
          } catch (_) { /* skip unreadable files */ }
        }
      }

      entries.sort((a, b) => b.mtime - a.mtime);

      const images = entries.map(({ fullPath, name, mtime }) => {
        const uri = toLocalFileUri(fullPath);
        const thumbnail = getOrCreateThumbnail(fullPath, mtime) || uri;
        return { uri, thumbnail, name, mtime };
      });

      return images;
    } catch (error) {
      console.error('Error listing avatar images:', error);
      return [];
    }
  });

  // IPC: Carpeta predeterminada de avatares
  ipcMain.handle('get-default-avatar-folder', async () => {
    const folder = path.join(app.getPath('userData'), 'avatars');
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
    return folder;
  });

  // IPC: Obtener última captura de un directorio
  ipcMain.handle('get-latest-capture', async (event, folderPath) => {
    try {
      let targetPath = folderPath;
      if (!targetPath) {
        targetPath = path.join(app.getPath('pictures'), 'Screenshots');
      }
      if (!fs.existsSync(targetPath)) return null;

      const files = fs.readdirSync(targetPath);
      let latestFile = null;
      let latestTime = 0;

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          const fullPath = path.join(targetPath, file);
          const stats = fs.statSync(fullPath);
          if (stats.mtimeMs > latestTime) {
            latestTime = stats.mtimeMs;
            latestFile = fullPath;
          }
        }
      }

      if (latestFile) {
        return `local-file:///${latestFile.replace(/\\/g, '/')}`;
      }
      return null;
    } catch (error) {
      console.error('Error getting latest capture:', error);
      return null;
    }
  });

  // IGDB: Obtener token de acceso
  async function getIGDBAccessToken() {
    if (igdbAccessToken) return igdbAccessToken;

    try {
      const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`, {
        method: 'POST'
      });
      const data = await response.json();
      igdbAccessToken = data.access_token;
      return igdbAccessToken;
    } catch (error) {
      console.error('Error obteniendo token de IGDB:', error);
      return null;
    }
  }

  // IPC: Buscar datos de un juego en IGDB
  ipcMain.handle('fetch-game-data', async (event, title) => {
    const token = await getIGDBAccessToken();
    if (!token) return { success: false, error: 'No se pudo obtener el token de IGDB' };

    try {
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': IGDB_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: `fields name, videos.video_id, videos.name, rating, summary, aggregated_rating, cover.url, screenshots.url, artworks.url; search "${title}"; limit 1;`

      });

      const data = await response.json();
      console.log('IGDB Data:', JSON.stringify(data, null, 2));
      if (data && data.length > 0) {
        return { success: true, data: data[0] };
      }

      return { success: false, error: 'No se encontró el juego' };
    } catch (error) {
      console.error('Error buscando datos en IGDB:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC: Buscar assets de un juego en SteamGridDB
  ipcMain.handle('fetch-steamgrid-data', async (event, title) => {
    if (!STEAMGRID_API_KEY || STEAMGRID_API_KEY.includes('TU_')) {
      return { success: false, error: 'Configuración pendiente: Pon tu API Key en la línea 17 de main.js' };
    }


    console.log('Buscando en SteamGridDB:', title);


    try {
      // 1. Buscar el juego para obtener el ID
      const searchRes = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`, {
        headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` }
      });
      const searchData = await searchRes.json();

      if (!searchData.success) {
        return { success: false, error: 'Error de API: ' + (searchData.errors ? searchData.errors.join(', ') : '¿Quizás la API Key es incorrecta?') };
      }

      if (!searchData.data || searchData.data.length === 0) {
        return { success: false, error: 'Juego no encontrado en SteamGridDB' };
      }

      const gameId = searchData.data[0].id;


      // 2. Buscar Grids (Portadas), Heroes (Fondos) y Logos en paralelo
      // Quitamos filtros restrictivos de dimensiones para asegurar que siempre encuentre algo
      const [gridsRes, heroesRes, logosRes] = await Promise.all([
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=512x512,1024x1024&limit=1`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/heroes/game/${gameId}?limit=1`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}?limit=1`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } })
      ]);


      const [grids, heroes, logos] = await Promise.all([gridsRes.json(), heroesRes.json(), logosRes.json()]);

      return {
        success: true,
        data: {
          grid: grids.success && grids.data.length > 0 ? grids.data[0].url : null,
          hero: heroes.success && heroes.data.length > 0 ? heroes.data[0].url : null,
          logo: logos.success && logos.data.length > 0 ? logos.data[0].url : null
        }
      };
    } catch (error) {
      console.error('Error buscando en SteamGridDB:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC: Buscar todos los assets disponibles de un juego en SteamGridDB
  ipcMain.handle('fetch-steamgrid-assets', async (event, title) => {
    if (!STEAMGRID_API_KEY || STEAMGRID_API_KEY.includes('TU_')) {
      return { success: false, error: 'Configuración pendiente: Pon tu API Key en la línea 17 de main.js' };
    }

    console.log('Buscando todos los assets en SteamGridDB para:', title);

    try {
      // 1. Buscar el juego para obtener el ID
      const searchRes = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`, {
        headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` }
      });
      const searchData = await searchRes.json();

      if (!searchData.success || !searchData.data || searchData.data.length === 0) {
        return { success: false, error: 'Juego no encontrado en SteamGridDB' };
      }

      const gameId = searchData.data[0].id;

      // 2. Buscar Grids, Squares, Heroes, Logos e Iconos en paralelo
      const [gridsRes, squaresRes, heroesRes, logosRes, iconsRes] = await Promise.all([
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=512x512,1024x1024`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/icons/game/${gameId}`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } })
      ]);

      const [grids, squares, heroes, logos, icons] = await Promise.all([
        gridsRes.json(),
        squaresRes.json(),
        heroesRes.json(),
        logosRes.json(),
        iconsRes.json()
      ]);

      const mergedGrids = [
        ...(grids.success ? grids.data : []),
        ...(squares.success ? squares.data : [])
      ];

      return {
        success: true,
        data: {
          grids: mergedGrids,
          heroes: heroes.success ? heroes.data : [],
          logos: logos.success ? logos.data : [],
          icons: icons.success ? icons.data : []
        }
      };
    } catch (error) {
      console.error('Error buscando todos los assets en SteamGridDB:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC: Cerrar la aplicación


  ipcMain.handle('get-media-sessions', async () => {
    try {
      return await fetchMediaSessionsForRenderer();
    } catch (err) {
      console.warn('[MediaSessions] get-media-sessions:', err.message);
      return wps5WebMediaHint ? [wps5WebMediaHint] : [];
    }
  });

  ipcMain.handle('media-control', async (_event, action, target) => {
    if (!['play_pause', 'next', 'prev'].includes(action)) return { success: false };
    return sendMediaControlAction(action, target);
  });

  ipcMain.handle('close-app', () => {
    app.quit();
  });

  // IPC: Obtener info de almacenamiento (Windows)
  ipcMain.handle('get-storage-info', async () => {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        resolve({ success: false, error: 'Plataforma no soportada' });
        return;
      }
      exec('powershell "Get-CimInstance Win32_LogicalDisk | Where-Object DeviceID -eq \'C:\' | Select-Object Size, FreeSpace"', (error, stdout) => {
        if (error) {
          resolve({ success: false, error: error.message });
          return;
        }
        const lines = stdout.trim().split('\n').filter(l => l.trim() !== '' && !l.includes('---') && !l.includes('Size'));
        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          const size = parseInt(parts[0]);
          const free = parseInt(parts[1]);
          const used = size - free;
          const percent = Math.round((used / size) * 100);
          const freeGB = Math.round(free / (1024 * 1024 * 1024));
          resolve({ success: true, percent, freeGB });
        } else {
          resolve({ success: false, error: 'No se pudo leer la info del disco' });
        }
      });
    });
  });

  // IPC: Abrir carpeta de capturas
  ipcMain.handle('open-external-url', async (event, url) => {
    if (!isExternalUrl(url)) {
      return { success: false, error: 'URL no válida' };
    }
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Error abriendo URL externa:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('open-screenshots', async () => {
    const picturesPath = app.getPath('pictures');
    const screenshotsPath = path.join(picturesPath, 'Screenshots');
    if (!fs.existsSync(screenshotsPath)) {
      fs.mkdirSync(screenshotsPath, { recursive: true });
    }
    shell.openPath(screenshotsPath);
    return { success: true };
  });

  // IPC: Abrir ubicación del juego
  ipcMain.handle('open-game-location', async (event, gamePath) => {
    try {
      if (!gamePath) {
        return { success: false, error: 'Ruta inválida' };
      }

      // Si es un archivo (.exe) muestra el archivo en el explorador
      if (fs.existsSync(gamePath)) {
        shell.showItemInFolder(gamePath);
        return { success: true };
      }

      return {
        success: false,
        error: 'La ruta no existe'
      };
    } catch (error) {
      console.error('Error abriendo ubicación:', error);

      return {
        success: false,
        error: error.message
      };
    }
  });

  // IPC: Obtener AppIDs instalados localmente en Steam
  ipcMain.handle('get-steam-installed-apps', async () => {
    try {
      const appIds = getInstalledSteamAppIds();
      return { success: true, appIds };
    } catch (error) {
      console.error('Error getting installed Steam apps:', error);
      return { success: false, appIds: [], error: error.message };
    }
  });

  // IPC: Login de Steam OpenID a través del navegador por defecto
  ipcMain.handle('steam-login', async () => {
    return new Promise((resolve) => {
      const http = require('http');
      const { parse } = require('url');

      // Iniciar servidor temporal en el puerto 31415
      const PORT = 31415;
      const returnUrl = `http://localhost:${PORT}/auth/steam/return`;

      const server = http.createServer((req, res) => {
        const parsedUrl = parse(req.url, true);

        if (parsedUrl.pathname === '/auth/steam/return') {
          try {
            const claimedId = parsedUrl.query['openid.claimed_id'];
            if (claimedId) {
              const steamId = claimedId.split('/').pop();
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html>
                  <body style="background-color:#1b2838; color:white; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh;">
                    <div style="text-align:center;">
                      <h1>¡Sesión iniciada con éxito!</h1>
                      <p>Ya puedes cerrar esta pestaña y volver a la aplicación.</p>
                      <script>setTimeout(() => window.close(), 3000);</script>
                    </div>
                  </body>
                </html>
              `);
              server.close();
              resolve({ success: true, steamId });
            } else {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Error: No se encontró el SteamID en la respuesta.');
              server.close();
              resolve({ success: false, error: 'No se encontró el SteamID en la respuesta' });
            }
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error interno.');
            server.close();
            resolve({ success: false, error: e.message });
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(PORT, '127.0.0.1', () => {
        const openIdUrl = `https://steamcommunity.com/openid/login?openid.ns=http://specs.openid.net/auth/2.0&openid.mode=checkid_setup&openid.return_to=${returnUrl}&openid.realm=http://localhost:${PORT}&openid.identity=http://specs.openid.net/auth/2.0/identifier_select&openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select`;

        // Abrir la URL en el navegador predeterminado del sistema (Chrome, Edge, etc.)
        shell.openExternal(openIdUrl).catch(err => {
          server.close();
          resolve({ success: false, error: 'Error al abrir el navegador: ' + err.message });
        });
      });

      // Timeout de seguridad: si el usuario no inicia sesión en 3 minutos, cerramos el servidor
      setTimeout(() => {
        if (server.listening) {
          server.close();
          resolve({ success: false, error: 'Tiempo de espera agotado' });
        }
      }, 3 * 60 * 1000);
    });
  });

  createWindow();


  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  stopStoreBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopStoreBackend();
  stopMediaSessionsBridge();
});