const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeImage, screen, Tray, Menu } = require('electron');
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

// ── Single-instance lock ──
// Evita instancias duplicadas del launcher. Esto es especialmente importante
// con front-ends tipo "Xbox Game Bar replacement" (ej. Omniconsola): al
// minimizar la ventana para lanzar un juego, algunas de estas herramientas
// pueden creer que el launcher se cerró (porque deja de detectar una ventana
// "visible" del proceso) e intentar relanzarlo. Sin este lock, Electron
// permitiría que naciera un segundo proceso completo con su propia ventana,
// resultando en el launcher duplicado que se ve al volver del juego.
// Con el lock, ese segundo intento de arranque simplemente muere y en su
// lugar se restaura/enfoca la ventana original ya existente.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

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
let trayIcon = null;
const activeGameWatchers = new Map(); // id -> intervalId (vigilancia de juegos lanzados por protocolo, ej. steam://)

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
    show: false,
    icon: path.join(__dirname, '../assets/icons/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Permitir carga de assets locales y externos sin restricciones de CORS/CSP en este entorno de consola
    },
  });

  attachExternalLinkHandlers(mainWindow);

  // 👈 AÑADIR: mostrar la ventana solo cuando el renderer ya pintó su primer frame
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

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

// Restaura y enfoca la ventana principal, sin importar si estaba minimizada
// u oculta. Se usa tanto al recibir un intento de segunda instancia como al
// hacer clic en el icono de bandeja.
function restoreMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.show();
  mainWindow.focus();

  // ── Forzar el robo de foco real en Windows ──
  // Windows tiene un "foreground lock" que impide que un proceso en
  // segundo plano (nuestra ventana minimizada) le robe el foco a otro
  // proceso (el juego que se acaba de cerrar, o el shell) con solo llamar
  // a focus()/restore(). Sin foco real del SO, la ventana se ve pero el
  // Gamepad API de Chromium deja de entregar lecturas actualizadas de
  // botones/ejes (solo actualiza el documento que tiene foco real), por lo
  // que el mando queda "congelado" tras volver de un juego. Alternar
  // alwaysOnTop es el workaround estándar en Electron/Win32 para forzar al
  // compositor a cederle el foco a esta ventana incluso con el lock activo.
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
    mainWindow.focus();
  }

  // Reintento adicional con un pequeño delay: justo después de que el
  // juego termina de cerrar su proceso, el foco del SO puede tardar unos
  // milisegundos en liberarse por completo.
  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isFocused()) {
      if (process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true);
        mainWindow.setAlwaysOnTop(false);
      }
      mainWindow.focus();
    }
  }, 250);
}

// ── Icono de bandeja del sistema mientras el launcher está suspendido ──
// Al ocultar la ventana mientras un juego está en curso, mostramos un
// icono en la bandeja (aparecerá en "aplicaciones ocultas" de Windows,
// como cualquier icono de bandeja no anclado por el usuario) para que
// quede claro que WPS5 sigue en ejecución en segundo plano.
function restoreFromTray() {
  restoreMainWindow();
  hideTrayIcon();
}

function showTrayIcon(tooltip) {
  try {
    if (trayIcon && !trayIcon.isDestroyed()) {
      trayIcon.setToolTip(tooltip || 'WPS5');
      return;
    }
    const iconPath = path.join(__dirname, '../assets/icons/logo.png');
    let icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16 });
    }
    trayIcon = new Tray(icon);
    trayIcon.setToolTip(tooltip || 'WPS5 - Jugando');
    const menu = Menu.buildFromTemplate([
      { label: 'Mostrar WPS5', click: () => restoreFromTray() },
      { type: 'separator' },
      { label: 'Salir', click: () => { app.quit(); } },
    ]);
    trayIcon.setContextMenu(menu);
    trayIcon.on('click', () => restoreFromTray());
    trayIcon.on('double-click', () => restoreFromTray());
  } catch (err) {
    console.error('[Tray] Error creando icono de bandeja:', err);
  }
}

function hideTrayIcon() {
  try {
    if (trayIcon && !trayIcon.isDestroyed()) {
      trayIcon.destroy();
    }
  } catch (_) { /* ignore */ }
  trayIcon = null;
}

// ── Vigilancia de juegos lanzados por protocolo (steam://rungameid/...) ──
// Steam gestiona el proceso real del juego, así que no tenemos un child
// process propio que monitorear (como sí ocurre con .exe lanzados
// directamente). Para saber cuándo el juego se cierra y poder restaurar
// el launcher, resolvemos la carpeta de instalación desde el manifiesto
// de Steam y sondeamos periódicamente si algún proceso sigue corriendo
// desde esa carpeta.
function findSteamGameInstallDir(appId) {
  const steamPath = getSteamInstallPath();
  if (!steamPath) return null;

  const libraryFolders = getSteamLibraryFolders(steamPath);
  for (const steamappsDir of libraryFolders) {
    const manifestPath = path.join(steamappsDir, `appmanifest_${appId}.acf`);
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      const match = content.match(/"installdir"\s+"([^"]*)"/i);
      if (match && match[1]) {
        return path.join(steamappsDir, 'common', match[1]);
      }
    } catch (err) {
      console.error('[Steam] Error leyendo manifest de', appId, err);
    }
  }
  return null;
}

function isProcessRunningUnderDir(dirPath) {
  return new Promise((resolve) => {
    if (!dirPath || process.platform !== 'win32') return resolve(false);
    const escaped = dirPath.replace(/'/g, "''");
    const psCommand = `(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '${escaped}*' } | Select-Object -First 1 -ExpandProperty ProcessId)`;
    exec(`powershell -NoProfile -Command "${psCommand}"`, { timeout: 8000 }, (error, stdout) => {
      if (error) return resolve(false);
      resolve(Boolean(stdout && stdout.trim().length > 0));
    });
  });
}

function stopSteamGameWatch(id) {
  const timer = activeGameWatchers.get(id);
  if (timer) {
    clearInterval(timer);
    activeGameWatchers.delete(id);
  }
}

function startSteamGameWatch(id, appId, installDir, sourceLabel = 'Steam') {
  stopSteamGameWatch(id); // por si ya había un watcher previo para este id

  const POLL_MS = 4000;
  const MAX_WAIT_FOR_START_MS = 90 * 1000; // margen para que Steam/Epic abra el juego
  const startedAt = Date.now();
  let seenRunning = false;
  let gameExited = false;

  const finish = () => {
    if (gameExited) return;
    gameExited = true;
    stopSteamGameWatch(id);
    hideTrayIcon();

    if (mainWindow) {
      mainWindow.webContents.send('game-closed', id);
      if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
        setTimeout(() => {
          if (mainWindow) {
            restoreMainWindow();
            console.log(`Launcher restaurado (juego de ${sourceLabel} finalizado)`);
          }
        }, 300);
      }
    }
  };

  // Minimizar el launcher tras un breve delay, igual que con procesos nativos,
  // y mostrar el icono de bandeja mientras dure la sesión.
  // IMPORTANTE: usamos minimize() en vez de hide(). Con hide(), Windows
  // reporta la ventana como no-visible (IsWindowVisible = false), lo cual
  // hace que herramientas tipo "reemplazo de Xbox Game Bar" (ej.
  // Omniconsola) puedan creer que el launcher se cerró y traten de
  // relanzarlo, generando una instancia duplicada. Una ventana minimizada
  // sigue contando como visible/activa para ese tipo de detección.
  setTimeout(() => {
    if (!gameExited && mainWindow) {
      mainWindow.minimize();
      showTrayIcon('WPS5 - Jugando');
      console.log(`Launcher suspendido (juego de ${sourceLabel}) — ventana minimizada`);
    }
  }, 1500);

  const timer = setInterval(async () => {
    try {
      const running = await isProcessRunningUnderDir(installDir);
      if (running) {
        seenRunning = true;
        return;
      }
      if (seenRunning) {
        console.log(`[${sourceLabel}] Proceso del juego finalizado, restaurando launcher (` + appId + ')');
        finish();
        return;
      }
      if (Date.now() - startedAt > MAX_WAIT_FOR_START_MS) {
        console.warn(`[${sourceLabel}] No se detectó el proceso del juego tras`, MAX_WAIT_FOR_START_MS / 1000, 's — restaurando launcher');
        finish();
      }
    } catch (err) {
      console.error(`[${sourceLabel}] Error verificando proceso en ejecución:`, err);
    }
  }, POLL_MS);

  activeGameWatchers.set(id, timer);
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
    icon: path.join(__dirname, '../assets/icons/logo.png'),
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

function getEpicManifestsPath() {
  return path.join(
    process.env.ProgramData || 'C:\\ProgramData',
    'Epic',
    'EpicGamesLauncher',
    'Data',
    'Manifests'
  );
}

function getEpicInstalledGames() {
  const manifestsPath = getEpicManifestsPath();
  console.log('[Epic] Buscando manifests en:', manifestsPath);

  if (!fs.existsSync(manifestsPath)) {
    console.log('[Epic] Carpeta de manifests no encontrada');
    return [];
  }

  const games = [];

  try {
    const files = fs.readdirSync(manifestsPath).filter(f => f.endsWith('.item'));

    for (const file of files) {
      try {
        const filePath = path.join(manifestsPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const manifest = JSON.parse(content);

        if (!manifest.AppName || !manifest.DisplayName) {
          console.log('[Epic] Manifest inválido, ignorando:', file);
          continue;
        }

        if (manifest.MainGameAppName && manifest.MainGameAppName !== manifest.AppName) {
          console.log('[Epic] DLC detectado, ignorando:', manifest.DisplayName, '(juego base:', manifest.MainGameAppName, ')');
          continue;
        }

        if (!manifest.InstallLocation) {
          console.log('[Epic] Manifest sin InstallLocation, ignorando:', file);
          continue;
        }

        if (!fs.existsSync(manifest.InstallLocation)) {
          console.log('[Epic] InstallLocation no existe, ignorando:', manifest.DisplayName);
          continue;
        }

        const launchExecutable = manifest.LaunchExecutable || '';
        const launchPath = launchExecutable
          ? path.join(manifest.InstallLocation, launchExecutable)
          : manifest.InstallLocation;

        if (launchExecutable && !fs.existsSync(launchPath)) {
          console.log('[Epic] Ejecutable no existe, ignorando:', manifest.DisplayName);
          continue;
        }

        games.push({
          id: `epic_${manifest.AppName}`,
          appName: manifest.AppName,
          title: manifest.DisplayName,
          installLocation: manifest.InstallLocation,
          launchExecutable,
          launchPath,
        });
      } catch (e) {
        console.error('[Epic] Error leyendo manifest:', file, e.message);
      }
    }
  } catch (e) {
    console.error('[Epic] Error leyendo carpeta de manifests:', e.message);
  }

  console.log('[Epic] Juegos instalados encontrados:', games.length);
  return games;
}

// ── Vigilancia de juegos de Epic lanzados por protocolo ──
// Igual que con steam://rungameid/..., el Epic Games Launcher es quien
// gestiona el proceso real del juego, así que resolvemos la carpeta de
// instalación desde su manifiesto (Data/Manifests/*.item) para poder
// vigilarla y saber cuándo el juego se cierra.
function findEpicGameInstallDir(appName) {
  const manifestsPath = getEpicManifestsPath();
  if (!fs.existsSync(manifestsPath)) return null;

  try {
    const files = fs.readdirSync(manifestsPath).filter(f => f.endsWith('.item'));
    for (const file of files) {
      try {
        const filePath = path.join(manifestsPath, file);
        const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (
          manifest.AppName === appName &&
          manifest.InstallLocation &&
          fs.existsSync(manifest.InstallLocation)
        ) {
          return manifest.InstallLocation;
        }
      } catch (e) {
        console.error('[Epic] Error leyendo manifest:', file, e.message);
      }
    }
  } catch (e) {
    console.error('[Epic] Error leyendo carpeta de manifests:', e.message);
  }

  return null;
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

  // Deduplicar por ruta normalizada (case-insensitive en Windows), porque
  // libraryfolders.vdf casi siempre repite la carpeta principal como
  // entrada "0" y el Set() por string no la detecta si difiere el casing.
  const seen = new Set();
  const unique = [];
  for (const folder of folders) {
    const key = process.platform === 'win32'
      ? path.normalize(folder).toLowerCase()
      : path.normalize(folder);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(folder);
    }
  }
  return unique;
}

function getInstalledSteamAppIds() {
  const steamPath = getSteamInstallPath();
  if (!steamPath) return [];

  const appIds = new Set();
  const libraryFolders = getSteamLibraryFolders(steamPath);

  // Bits reales de StateFlags (EAppState de SteamKit)
  const STATE_FULLY_INSTALLED = 0x4;
  const STATE_UPDATE_RUNNING = 0x100;
  const STATE_UPDATE_STARTED = 0x400;
  const STATE_VALIDATING = 0x20000;
  const STATE_PREALLOCATING = 0x80000;
  const STATE_DOWNLOADING = 0x100000;
  const STATE_STAGING = 0x200000;
  const STATE_COMMITTING = 0x400000;
  const STILL_WORKING_MASK =
    STATE_UPDATE_RUNNING | STATE_UPDATE_STARTED | STATE_VALIDATING |
    STATE_PREALLOCATING | STATE_DOWNLOADING | STATE_STAGING | STATE_COMMITTING;

  for (const steamappsDir of libraryFolders) {
    if (!fs.existsSync(steamappsDir)) continue;

    try {
      for (const file of fs.readdirSync(steamappsDir)) {
        const match = file.match(/^appmanifest_(\d+)\.acf$/i);
        if (!match) continue;

        const appId = match[1];
        const manifestPath = path.join(steamappsDir, file);

        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          const get = (key) => {
            const m = content.match(new RegExp('"' + key + '"\\s+"([^"]*)"'));
            return m ? m[1] : '';
          };

          const stateFlags = parseInt(get('StateFlags') || '0', 10) || 0;
          const bytesToDownload = parseInt(get('BytesToDownload') || '0', 10) || 0;
          const bytesDownloaded = parseInt(get('BytesDownloaded') || '0', 10) || 0;
          const downloadingFolder = path.join(steamappsDir, 'downloading', appId);

          const isFullyInstalled = (stateFlags & STATE_FULLY_INSTALLED) !== 0;
          const isStillWorking = (stateFlags & STILL_WORKING_MASK) !== 0;
          const hasPendingBytes = bytesToDownload > 0 && bytesDownloaded < bytesToDownload;
          const hasDownloadingFolder = fs.existsSync(downloadingFolder);

          // Solo lo contamos como "instalado" si Steam lo marca como
          // completamente instalado Y no hay ningún indicio de que
          // todavía se esté descargando/procesando.
          if (isFullyInstalled && !isStillWorking && !hasPendingBytes && !hasDownloadingFolder) {
            appIds.add(appId);
          }
        } catch { /* ignorar manifiesto corrupto/ilegible */ }
      }
    } catch (e) {
      console.error('Error scanning Steam library folder:', steamappsDir, e);
    }
  }

  return Array.from(appIds);
}

function getInstalledSteamAppsDetailed() {
  const steamPath = getSteamInstallPath();
  if (!steamPath) return [];

  const apps = [];
  const seenAppIds = new Set();
  const libraryFolders = getSteamLibraryFolders(steamPath);

  const STATE_FULLY_INSTALLED = 0x4;
  const STATE_UPDATE_RUNNING = 0x100;
  const STATE_UPDATE_STARTED = 0x400;
  const STATE_VALIDATING = 0x20000;
  const STATE_PREALLOCATING = 0x80000;
  const STATE_DOWNLOADING = 0x100000;
  const STATE_STAGING = 0x200000;
  const STATE_COMMITTING = 0x400000;
  const STILL_WORKING_MASK =
    STATE_UPDATE_RUNNING | STATE_UPDATE_STARTED | STATE_VALIDATING |
    STATE_PREALLOCATING | STATE_DOWNLOADING | STATE_STAGING | STATE_COMMITTING;

  for (const steamappsDir of libraryFolders) {
    if (!fs.existsSync(steamappsDir)) continue;

    try {
      for (const file of fs.readdirSync(steamappsDir)) {
        const match = file.match(/^appmanifest_(\d+)\.acf$/i);
        if (!match) continue;

        const appId = match[1];
        if (seenAppIds.has(appId)) continue;

        const manifestPath = path.join(steamappsDir, file);

        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          const get = (key) => {
            const m = content.match(new RegExp('"' + key + '"\\s+"([^"]*)"'));
            return m ? m[1] : '';
          };

          const stateFlags = parseInt(get('StateFlags') || '0', 10) || 0;
          const bytesToDownload = parseInt(get('BytesToDownload') || '0', 10) || 0;
          const bytesDownloaded = parseInt(get('BytesDownloaded') || '0', 10) || 0;
          const downloadingFolder = path.join(steamappsDir, 'downloading', appId);

          const isFullyInstalled = (stateFlags & STATE_FULLY_INSTALLED) !== 0;
          const isStillWorking = (stateFlags & STILL_WORKING_MASK) !== 0;
          const hasPendingBytes = bytesToDownload > 0 && bytesDownloaded < bytesToDownload;
          const hasDownloadingFolder = fs.existsSync(downloadingFolder);

          if (isFullyInstalled && !isStillWorking && !hasPendingBytes && !hasDownloadingFolder) {
            const name = get('name');
            if (name) {
              apps.push({ appId, name });
              seenAppIds.add(appId);
            }
          }
        } catch { /* ignorar manifiesto corrupto/ilegible */ }
      }
    } catch (e) {
      console.error('Error scanning Steam library folder (detailed):', steamappsDir, e);
    }
  }

  return apps;
}

// ── Steam download progress tracking (real-time via content_log.txt + fs.watch) ──
const downloadInfoCache = new Map();
const downloadWatchers = [];
const watchedDirs = new Set();

function parseContentLogForDownloads() {
  const steamPath = getSteamInstallPath();
  if (!steamPath) return;

  const libraryFolders = getSteamLibraryFolders(steamPath);
  for (const steamappsDir of libraryFolders) {
    const logPath = path.join(steamappsDir, '..', 'logs', 'content_log.txt');
    if (!fs.existsSync(logPath)) continue;

    try {
      const stat = fs.statSync(logPath);
      const readSize = Math.min(stat.size, 512 * 1024);
      const fd = fs.openSync(logPath, 'r');
      const buffer = Buffer.alloc(readSize);
      fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
      fs.closeSync(fd);

      const content = buffer.toString('utf8');
      const lines = content.split('\n');

      let lastSpeed = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const speedMatch = lines[i].match(/Current download rate:\s*([\d.]+)\s*Mbps/);
        if (speedMatch) {
          lastSpeed = parseFloat(speedMatch[1]);
          break;
        }
      }

      const appUpdates = new Map();
      for (const line of lines) {
        const match = line.match(/AppID\s+(\d+)\s+update started\s*:\s*download\s+(\d+)\/(\d+)/);
        if (match) {
          const appId = match[1];
          const downloaded = parseInt(match[2], 10);
          const total = parseInt(match[3], 10);
          const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]/);
          let timestamp = Date.now();
          if (tsMatch) timestamp = new Date(tsMatch[1]).getTime();
          appUpdates.set(appId, { downloaded, total, timestamp });
        }
      }

      const now = Date.now();
      for (const [appId, info] of appUpdates) {
        const existing = downloadInfoCache.get(appId);
        if (!existing || info.timestamp >= existing.updated) {
          const elapsedSec = (now - info.timestamp) / 1000;
          const speedBytesPerSec = (lastSpeed * 1000000) / 8;
          const estimatedAdditional = speedBytesPerSec * elapsedSec;
          const estimatedDownloaded = Math.min(info.total, info.downloaded + estimatedAdditional);
          downloadInfoCache.set(appId, { downloaded: estimatedDownloaded, total: info.total, speed: lastSpeed, updated: now });
        } else {
          const elapsedSec = (now - existing.updated) / 1000;
          const speedBytesPerSec = (lastSpeed * 1000000) / 8;
          existing.downloaded = Math.min(existing.total, existing.downloaded + speedBytesPerSec * elapsedSec);
          existing.speed = lastSpeed;
          existing.updated = now;
        }
      }

      for (const [appId, info] of downloadInfoCache) {
        if (!appUpdates.has(appId) && info.speed > 0 && info.downloaded < info.total) {
          const elapsedSec = (now - info.updated) / 1000;
          const speedBytesPerSec = (info.speed * 1000000) / 8;
          info.downloaded = Math.min(info.total, info.downloaded + speedBytesPerSec * elapsedSec);
          info.updated = now;
        }
      }
    } catch { /* ignore */ }
  }
}

function setupDownloadWatchers() {
  const steamPath = getSteamInstallPath();
  if (!steamPath) return;

  const libraryFolders = getSteamLibraryFolders(steamPath);
  for (const steamappsDir of libraryFolders) {
    if (watchedDirs.has(steamappsDir) || !fs.existsSync(steamappsDir)) continue;
    watchedDirs.add(steamappsDir);

    try {
      const watcher = fs.watch(steamappsDir, { persistent: false }, (_eventType, filename) => {
        if (filename && filename.startsWith('appmanifest_') && filename.endsWith('.acf')) {
          parseContentLogForDownloads();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('steam-download-updated');
          }
        }
      });
      downloadWatchers.push(watcher);
    } catch { /* ignore */ }
  }
}

function broadcastDownloadProgress() {
  parseContentLogForDownloads();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('steam-download-updated');
  }
}

function getSteamDownloadProgress() {
  const steamPath = getSteamInstallPath();
  if (!steamPath) return [];

  const downloads = [];
  const seenAppIds = new Set(); // defensa extra por si algo se cuela duplicado
  const libraryFolders = getSteamLibraryFolders(steamPath);

  parseContentLogForDownloads();

  // Bits reales de StateFlags (EAppState de SteamKit)
  const STATE_UPDATE_RUNNING = 0x100;
  const STATE_UPDATE_PAUSED = 0x200;
  const STATE_UPDATE_STARTED = 0x400;
  const STATE_VALIDATING = 0x20000;
  const STATE_PREALLOCATING = 0x80000;
  const STATE_DOWNLOADING = 0x100000;
  const STATE_STAGING = 0x200000;
  const STATE_COMMITTING = 0x400000;

  for (const steamappsDir of libraryFolders) {
    if (!fs.existsSync(steamappsDir)) continue;

    try {
      const files = fs.readdirSync(steamappsDir);
      for (const file of files) {
        const match = file.match(/^appmanifest_(\d+)\.acf$/);
        if (!match) continue;

        const appId = match[1];
        if (seenAppIds.has(appId)) continue; // ya lo procesamos desde otra carpeta duplicada

        const manifestPath = path.join(steamappsDir, file);

        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          const get = (key) => {
            const m = content.match(new RegExp('"' + key + '"\\s+"([^"]*)"'));
            return m ? m[1] : '';
          };

          const name = get('name');
          const bytesToDownload = parseInt(get('BytesToDownload') || '0', 10) || 0;
          const bytesDownloaded = parseInt(get('BytesDownloaded') || '0', 10) || 0;
          const bytesToStage = parseInt(get('BytesToStage') || '0', 10) || 0;
          const bytesStaged = parseInt(get('BytesStaged') || '0', 10) || 0;
          const stateFlags = parseInt(get('StateFlags') || '0', 10) || 0;

          const downloading = (stateFlags & (STATE_DOWNLOADING | STATE_PREALLOCATING | STATE_UPDATE_RUNNING | STATE_UPDATE_STARTED)) !== 0;
          const validating = (stateFlags & STATE_VALIDATING) !== 0;
          const paused = (stateFlags & STATE_UPDATE_PAUSED) !== 0;
          const isStaging = (stateFlags & (STATE_STAGING | STATE_COMMITTING)) !== 0;

          const downloadingFolder = path.join(steamappsDir, 'downloading', appId);
          const hasDownloadingFolder = fs.existsSync(downloadingFolder);

          const realTimeInfo = downloadInfoCache.get(appId);

          let total, downloaded;
          if (realTimeInfo && realTimeInfo.total > 0) {
            total = realTimeInfo.total;
            downloaded = realTimeInfo.downloaded;
          } else if (isStaging && bytesToStage > 0) {
            total = bytesToStage;
            downloaded = bytesStaged;
          } else if (bytesToDownload > 0) {
            total = bytesToDownload;
            downloaded = bytesDownloaded;
          } else {
            total = 0;
            downloaded = 0;
          }

          const percent = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;
          const downloadSpeed = realTimeInfo?.speed || 0;

          // "Activo" = realmente descargando/procesando AHORA, no solo con
          // una actualización pendiente (eso es lo que hace que un juego
          // "Programado" se marque como activo para siempre).
          const isActive = downloading || validating || paused || isStaging || hasDownloadingFolder;

          if (isActive) {
            seenAppIds.add(appId);
            downloads.push({
              appId, name, bytesToDownload, bytesDownloaded, bytesToStage, bytesStaged,
              stateFlags, downloading: downloading || hasDownloadingFolder, validating, paused, percent, downloadSpeed
            });
          }
        } catch { /* ignore malformed manifest */ }
      }
    } catch { /* ignore unreadable directory */ }
  }

  return downloads;
}

let downloadParseInterval = null;

// Cuando el sistema (o una herramienta externa como Omniconsola) intenta
// abrir una segunda instancia del launcher, Electron dispara este evento en
// la instancia YA existente en vez de dejar que la nueva instancia arranque
// su propia ventana. En vez de ignorarlo, restauramos/enfocamos la ventana
// actual — así, si el launcher estaba minimizado por tener un juego abierto,
// simplemente se muestra de nuevo en lugar de quedar duplicado.
app.on('second-instance', () => {
  restoreMainWindow();
  hideTrayIcon();
});

app.whenReady().then(() => {
  initDB();
  startStoreBackend();
  startMediaSessionsBridge();
  setupDownloadWatchers();

  // Backup timer: re-parse content_log.txt every 2 seconds for smooth progress
  downloadParseInterval = setInterval(() => {
    broadcastDownloadProgress();
  }, 2000);

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
      const response = await fetch('https://store.steampowered.com/api/featuredcategories/?l=spanish&cc=US');
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
      } else if (updatedApp.id.toString().startsWith('steam_') || updatedApp.id.toString().startsWith('epic_')) {
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
    // Variables de Electron/Chromium/Node que hacen crashar juegos o
    // activan detección de depuración en algunos emuladores (Codex, Goldberg).
    const strip = [
      'ELECTRON_RUN_AS_NODE',
      'ELECTRON_NO_ASAR',
      'ELECTRON_NO_ATTACH_CONSOLE',
      'ELECTRON_ENABLE_LOGGING',
      'ELECTRON_LOG_ASAR_READS',
      'CHROME_CRASHPAD_PIPE_NAME',
      'CHROME_CRASHPAD_HANDLER_INITIAL_CLIENT_DATA',
      'NODE_OPTIONS',
      'NODE_SKIP_PLATFORM_CHECK',
      'NODE_ENV',
      // Variables internas de Chromium que pueden activar detección de sandbox/debug
      'GOOGLE_API_KEY',
      'GOOGLE_DEFAULT_CLIENT_ID',
      'GOOGLE_DEFAULT_CLIENT_SECRET',
    ];
    for (const key of strip) delete env[key];
    return env;
  }

  function formatExitCode(code) {
    if (code === 3221225477) return ' — acceso inválido a memoria (0xC0000005)';
    if (code === 3221225781) return ' — DLL no encontrada (0xC0000135)';
    if (code === 3221226505) return ' — stack buffer overrun (0xC0000409)';
    if (code === -4092) return ' — emulador/juego rechazó el arranque (puede ser detección de entorno o falta de prerequisites)';
    if (code === -1073741515) return ' — DLL no encontrada (0xC0000135)';
    return '';
  }

  // Helper: parsea manualmente el formato binario .lnk (MS-SHLLINK) sin
  // depender de PowerShell/COM. Sirve de respaldo cuando WScript.Shell
  // falla (política de ejecución, COM deshabilitado, lnk "raros" de
  // algunos emuladores, etc.). Sólo cubre el caso más común: LinkInfo
  // con ruta local (LocalBasePath) + StringData (Arguments/WorkingDir).
  function readNullTerminatedString(buf, start, isUnicode) {
    if (isUnicode) {
      let end = start;
      while (end + 1 < buf.length && !(buf[end] === 0 && buf[end + 1] === 0)) end += 2;
      return buf.toString('utf16le', start, end);
    }
    let end = start;
    while (end < buf.length && buf[end] !== 0) end += 1;
    return buf.toString('latin1', start, end);
  }

  function parseLnkFileNative(lnkPath) {
    try {
      const buf = fs.readFileSync(lnkPath);
      if (buf.length < 76) return null;

      // CLSID del ShellLink (offset 4, 16 bytes) — valida que sea un .lnk real
      const guid = buf.toString('hex', 4, 20);
      if (guid !== '0114020000000000c000000000000046') return null;

      const linkFlags = buf.readUInt32LE(20);
      const HAS_LINK_TARGET_ID_LIST = 0x1;
      const HAS_LINK_INFO = 0x2;
      const HAS_NAME = 0x4;
      const HAS_RELATIVE_PATH = 0x8;
      const HAS_WORKING_DIR = 0x10;
      const HAS_ARGUMENTS = 0x20;
      const IS_UNICODE = 0x80;

      let offset = 76; // fin del header fijo

      if (linkFlags & HAS_LINK_TARGET_ID_LIST) {
        const idListSize = buf.readUInt16LE(offset);
        offset += 2 + idListSize;
      }

      let targetPath = null;

      if (linkFlags & HAS_LINK_INFO) {
        const linkInfoStart = offset;
        const linkInfoSize = buf.readUInt32LE(linkInfoStart);
        const linkInfoHeaderSize = buf.readUInt32LE(linkInfoStart + 4);
        const linkInfoFlags = buf.readUInt32LE(linkInfoStart + 8);
        const VOLUME_ID_AND_LOCAL_BASE_PATH = 0x1;

        if (linkInfoFlags & VOLUME_ID_AND_LOCAL_BASE_PATH) {
          if (linkInfoHeaderSize >= 0x24) {
            const localBasePathOffsetUnicode = buf.readUInt32LE(linkInfoStart + 28);
            if (localBasePathOffsetUnicode) {
              targetPath = readNullTerminatedString(buf, linkInfoStart + localBasePathOffsetUnicode, true);
            }
          }
          if (!targetPath) {
            const localBasePathOffset = buf.readUInt32LE(linkInfoStart + 16);
            if (localBasePathOffset) {
              targetPath = readNullTerminatedString(buf, linkInfoStart + localBasePathOffset, false);
            }
          }
        }

        offset = linkInfoStart + linkInfoSize;
      }

      const isUnicodeStrings = (linkFlags & IS_UNICODE) !== 0;
      const readStringData = () => {
        const charCount = buf.readUInt16LE(offset);
        offset += 2;
        const byteLen = charCount * (isUnicodeStrings ? 2 : 1);
        const str = isUnicodeStrings
          ? buf.toString('utf16le', offset, offset + byteLen)
          : buf.toString('latin1', offset, offset + byteLen);
        offset += byteLen;
        return str;
      };

      let workingDir = null;
      let args = '';

      if (linkFlags & HAS_NAME) readStringData();
      if (linkFlags & HAS_RELATIVE_PATH) readStringData();
      if (linkFlags & HAS_WORKING_DIR) workingDir = readStringData();
      if (linkFlags & HAS_ARGUMENTS) args = readStringData();

      if (!targetPath) return null;
      return { targetPath, workingDir: workingDir || null, args: args || '' };
    } catch (err) {
      console.error('[LNK] Error parseando .lnk de forma nativa:', err.message);
      return null;
    }
  }

  // Divide una cadena de argumentos estilo línea de comandos en un array,
  // respetando fragmentos entre comillas dobles (ej: rutas con espacios).
  function parseCommandLineArgs(str) {
    if (!str) return [];
    const args = [];
    const regex = /"([^"]*)"|(\S+)/g;
    let m;
    while ((m = regex.exec(str)) !== null) {
      args.push(m[1] !== undefined ? m[1] : m[2]);
    }
    return args;
  }

  // Helper: Resolver acceso directo .lnk a su ruta real, argumentos y
  // directorio de trabajo (Windows).
  //
  // Orden de resolución:
  //   1) shell.readShortcutLink() de Electron — llamada nativa in-process
  //      (usa el propio IShellLink de Win32 vía Chromium). Es la más
  //      fiable porque NO pasa la ruta por cmd.exe, así que no sufre los
  //      problemas de codificación de página de códigos que rompen rutas
  //      con caracteres especiales (ej. "：" que usa ES-DE al sanitizar
  //      nombres con ":" para Windows).
  //   2) PowerShell/COM (WScript.Shell) — respaldo si (1) falla.
  //   3) Parser binario nativo del .lnk — último respaldo si ninguno de
  //      los anteriores funciona.
  function resolveLnkTarget(lnkPath) {
    return new Promise((resolve) => {
      if (process.platform === 'win32' && typeof shell.readShortcutLink === 'function') {
        try {
          const info = shell.readShortcutLink(lnkPath);
          if (info && info.target) {
            resolve({
              targetPath: info.target,
              args: info.args || '',
              workingDir: info.cwd || null,
            });
            return;
          }
          console.warn('[LNK] shell.readShortcutLink no devolvió target para:', lnkPath);
        } catch (err) {
          console.warn('[LNK] shell.readShortcutLink falló:', err.message);
        }
      }

      const escapedPath = lnkPath.replace(/'/g, "''");
      const psScript =
        `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${escapedPath}'); ` +
        `[PSCustomObject]@{ TargetPath = $s.TargetPath; Arguments = $s.Arguments; WorkingDirectory = $s.WorkingDirectory } | ConvertTo-Json -Compress`;

      exec(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
        if (!error && stdout && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed.TargetPath) {
              resolve({
                targetPath: parsed.TargetPath,
                args: parsed.Arguments || '',
                workingDir: parsed.WorkingDirectory || null,
              });
              return;
            }
            console.warn('[LNK] PowerShell no devolvió TargetPath para:', lnkPath);
          } catch (parseErr) {
            console.warn('[LNK] No se pudo parsear la salida de PowerShell:', parseErr.message, stdout);
          }
        } else if (error) {
          console.warn('[LNK] PowerShell falló al resolver el .lnk:', error.message, stderr || '');
        }

        // Fallback: parseo binario nativo, sin depender de COM/PowerShell
        const native = parseLnkFileNative(lnkPath);
        if (native) {
          console.log('[LNK] Resuelto mediante parser nativo:', native.targetPath);
          resolve(native);
        } else {
          resolve(null);
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

    // Caso especial: steam://rungameid/<appid>. Steam gestiona el proceso
    // del juego, así que no hay un child process nuestro que monitorear.
    // Resolvemos la carpeta de instalación desde el manifiesto y vigilamos
    // esa carpeta para saber cuándo el juego se cierra realmente y así
    // poder suspender/restaurar el launcher (antes esto se abría con
    // shell.openExternal y se devolvía "suspended: false" de inmediato,
    // por lo que el launcher nunca se ocultaba ni bloqueaba los controles).
    const steamRunMatch = executablePath.match(/^steam:\/\/rungameid\/(\d+)$/i);
    if (steamRunMatch) {
      const appId = steamRunMatch[1];
      shell.openExternal(executablePath).catch(console.error);

      const installDir = findSteamGameInstallDir(appId);
      if (!installDir) {
        console.warn('[Steam] No se pudo resolver la carpeta de instalación del appid', appId, '- el launcher no se suspenderá');
        return { success: true, suspended: false };
      }

      startSteamGameWatch(id, appId, installDir);
      return { success: true, suspended: true };
    }

    // Caso especial: com.epicgames.launcher://apps/<AppName>?action=launch...
    // Igual que con Steam, el Epic Games Launcher gestiona el proceso real
    // del juego, así que resolvemos la carpeta de instalación desde su
    // manifiesto y la vigilamos para poder suspender/restaurar el launcher
    // exactamente igual que con los juegos de Steam.
    const epicRunMatch = executablePath.match(/^com\.epicgames\.launcher:\/\/apps\/([^?]+)\?action=launch/i);
    if (epicRunMatch) {
      const epicAppName = decodeURIComponent(epicRunMatch[1]);
      shell.openExternal(executablePath).catch(console.error);

      const installDir = findEpicGameInstallDir(epicAppName);
      if (!installDir) {
        console.warn('[Epic] No se pudo resolver la carpeta de instalación de', epicAppName, '- el launcher no se suspenderá');
        return { success: true, suspended: false };
      }

      startSteamGameWatch(id, epicAppName, installDir, 'Epic');
      return { success: true, suspended: true };
    }

    // URLs y protocolos (http://, etc.)
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

    // Resolver .lnk a la ruta real del ejecutable (+ argumentos y cwd)
    let targetExe = executablePath;
    let launchArgs = [];
    let launchWorkingDir = null;
    if (lowerPath.endsWith('.lnk')) {
      const resolved = await resolveLnkTarget(executablePath);
      if (resolved && resolved.targetPath) {
        targetExe = resolved.targetPath;
        launchArgs = parseCommandLineArgs(resolved.args);
        if (resolved.workingDir && fs.existsSync(resolved.workingDir)) {
          launchWorkingDir = resolved.workingDir;
        }
        console.log('.lnk resuelto a:', targetExe, launchArgs.length ? `(args: ${resolved.args})` : '');
      } else {
        // No se pudo resolver ni con PowerShell ni con el parser nativo,
        // abrir sin suspender (mejor esto que no abrir nada)
        console.log('No se pudo resolver el .lnk (PowerShell ni parser nativo), abriendo sin suspensión');
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
      hideTrayIcon();

      if (mainWindow) {
        mainWindow.webContents.send('game-closed', id);
        if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
          // La ventana estaba minimizada/oculta, restaurarla con un breve delay
          setTimeout(() => {
            if (mainWindow) {
              restoreMainWindow();
              console.log('Launcher restaurado');
            }
          }, 300);
        }
      }
    };

    // Minimizar el launcher después de 1.5s para que se vea la animación de lanzamiento.
    // Usamos minimize() en vez de hide() por la misma razón explicada en
    // startSteamGameWatch(): hide() marca la ventana como no-visible ante
    // Windows, lo cual puede hacer que herramientas externas (ej.
    // Omniconsola) crean que el proceso terminó y relancen una segunda
    // instancia del launcher al salir del juego.
    hideTimer = setTimeout(() => {
      if (!gameExited && mainWindow) {
        mainWindow.minimize();
        showTrayIcon('WPS5 - Jugando');
        console.log('Launcher suspendido — ventana minimizada');
      }
    }, 1500);

    // Lanzar el juego y monitorear el proceso
    try {
      const gameCwd = launchWorkingDir || path.dirname(targetExe);
      console.log('Lanzando:', targetExe, launchArgs);
      console.log('Directorio de trabajo:', gameCwd);

      const child = spawn(targetExe, launchArgs, {
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

  // IPC: Abrir diálogo para seleccionar audio de foco del juego.
  ipcMain.handle('select-audio', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }]
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

      // 2. Buscar Grids 1:1, Grids 2:3, Grids Generales, Heroes (Fondos) y Logos en paralelo
      const [grids1x1Res, grids2x3Res, gridsAllRes, heroesRes, logosRes] = await Promise.all([
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=512x512,1024x1024`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/heroes/game/${gameId}?limit=1`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } }),
        fetch(`https://www.steamgriddb.com/api/v2/logos/game/${gameId}?limit=1`, { headers: { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` } })
      ]);

      const [grids1x1, grids2x3, gridsAll, heroes, logos] = await Promise.all([
        grids1x1Res.ok ? grids1x1Res.json() : { success: false, data: [] },
        grids2x3Res.ok ? grids2x3Res.json() : { success: false, data: [] },
        gridsAllRes.ok ? gridsAllRes.json() : { success: false, data: [] },
        heroesRes.ok ? heroesRes.json() : { success: false, data: [] },
        logosRes.ok ? logosRes.json() : { success: false, data: [] }
      ]);

      // Selección prioritaria de la portada: 1:1 -> 2:3 -> cualquier otra disponible
      let chosenGrid = null;
      if (grids1x1.success && grids1x1.data && grids1x1.data.length > 0) {
        chosenGrid = grids1x1.data[0].url || grids1x1.data[0].thumb;
      } else if (grids2x3.success && grids2x3.data && grids2x3.data.length > 0) {
        chosenGrid = grids2x3.data[0].url || grids2x3.data[0].thumb;
      } else if (gridsAll.success && gridsAll.data && gridsAll.data.length > 0) {
        const square = gridsAll.data.find(g => g.width && g.height && g.width === g.height);
        const vertical2x3 = gridsAll.data.find(g => g.width && g.height && Math.abs((g.width / g.height) - (2 / 3)) < 0.05);
        if (square) {
          chosenGrid = square.url || square.thumb;
        } else if (vertical2x3) {
          chosenGrid = vertical2x3.url || vertical2x3.thumb;
        } else {
          chosenGrid = gridsAll.data[0].url || gridsAll.data[0].thumb;
        }
      }

      return {
        success: true,
        data: {
          grid: chosenGrid,
          hero: heroes.success && heroes.data && heroes.data.length > 0 ? (heroes.data[0].url || heroes.data[0].thumb) : null,
          logo: logos.success && logos.data && logos.data.length > 0 ? (logos.data[0].url || logos.data[0].thumb) : null
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

      const list1x1 = squares.success ? squares.data : [];
      const listAll = grids.success ? grids.data : [];
      const list2x3 = listAll.filter(g => g.width && g.height && Math.abs((g.width / g.height) - (2 / 3)) < 0.05);
      const remaining = listAll.filter(g => !list1x1.some(s => s.id === g.id) && !list2x3.some(v => v.id === g.id));

      const mergedGridsMap = new Map();
      [...list1x1, ...list2x3, ...remaining].forEach(item => {
        if (!mergedGridsMap.has(item.id)) {
          mergedGridsMap.set(item.id, item);
        }
      });
      const mergedGrids = Array.from(mergedGridsMap.values());

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

  ipcMain.handle('get-steam-installed-apps-detailed', async () => {
    try {
      const apps = getInstalledSteamAppsDetailed();
      return { success: true, apps };
    } catch (error) {
      console.error('Error getting installed Steam apps (detailed):', error);
      return { success: false, apps: [], error: error.message };
    }
  });

  // IPC: Obtener progreso de descargas de Steam en tiempo real
  ipcMain.handle('get-steam-download-progress', async () => {
    try {
      const downloads = getSteamDownloadProgress();
      return downloads;
    } catch (error) {
      console.error('Error getting Steam download progress:', error);
      return [];
    }
  });

  // IPC: Obtener juegos instalados localmente de Epic Games
  ipcMain.handle('get-epic-installed-games', async () => {
    try {
      const games = getEpicInstalledGames();
      return { success: true, games };
    } catch (error) {
      console.error('[Epic] Error getting installed games:', error);
      return { success: false, games: [], error: error.message };
    }
  });

  // IPC: Obtener lista de programas instalados en Windows (estilo Steam)
  ipcMain.handle('get-installed-programs', async () => {
    if (process.platform !== 'win32') {
      return { success: true, programs: [] };
    }

    const programs = [];
    const seenPaths = new Set();
    const seenNames = new Set();

    const scanDir = (dirPath, maxDepth = 4, depth = 0) => {
      if (depth > maxDepth || !fs.existsSync(dirPath)) return;
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const lowerDir = entry.name.toLowerCase();
            if (
              lowerDir.includes('uninstall') ||
              lowerDir.includes('desinstal') ||
              lowerDir.includes('documentation') ||
              lowerDir.includes('help')
            ) {
              continue;
            }
            scanDir(fullPath, maxDepth, depth + 1);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
            const lowerName = entry.name.toLowerCase();
            if (
              lowerName.includes('uninstall') ||
              lowerName.includes('desinstal') ||
              lowerName.includes('help') ||
              lowerName.includes('ayuda') ||
              lowerName.includes('readme') ||
              lowerName.includes('website') ||
              lowerName.includes('página web') ||
              lowerName.includes('documentation') ||
              lowerName.includes('licencia') ||
              lowerName.includes('license')
            ) {
              continue;
            }

            let targetPath = fullPath;
            let appName = entry.name.replace(/\.lnk$/i, '');

            try {
              const shortcut = shell.readShortcutLink(fullPath);
              if (shortcut && shortcut.target) {
                const targetLower = shortcut.target.toLowerCase();
                if (
                  targetLower.endsWith('.exe') &&
                  !targetLower.includes('unins') &&
                  !targetLower.includes('cmd.exe') &&
                  !targetLower.includes('powershell.exe')
                ) {
                  targetPath = shortcut.target;
                }
              }
            } catch (_) { }

            const normPath = targetPath.toLowerCase();
            const normName = appName.toLowerCase();
            if (seenPaths.has(normPath) || seenNames.has(normName)) continue;

            if (fs.existsSync(targetPath)) {
              seenPaths.add(normPath);
              seenNames.add(normName);
              programs.push({
                name: appName,
                path: targetPath,
                lnkPath: fullPath,
              });
            }
          }
        }
      } catch (err) {
        console.error('Error scanning dir for programs:', dirPath, err.message);
      }
    };

    const startMenuUser = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const startMenuCommon = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const desktopUser = path.join(process.env.USERPROFILE || '', 'Desktop');
    const desktopCommon = path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop');

    scanDir(startMenuUser);
    scanDir(startMenuCommon);
    scanDir(desktopUser);
    scanDir(desktopCommon);

    // Incluir juegos de Epic Games si existen
    try {
      const epicGames = getEpicInstalledGames();
      for (const eg of epicGames) {
        const normPath = (eg.launchPath || eg.installLocation).toLowerCase();
        const normName = eg.title.toLowerCase();
        if (!seenPaths.has(normPath) && !seenNames.has(normName)) {
          seenPaths.add(normPath);
          seenNames.add(normName);
          programs.push({
            name: eg.title,
            path: eg.launchPath || eg.installLocation,
            source: 'epic',
          });
        }
      }
    } catch (_) { }

    programs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // Extraer icono base64 para cada programa mediante app.getFileIcon
    const programsWithIcons = await Promise.all(
      programs.map(async (p) => {
        let iconBase64 = null;
        try {
          const iconNative = await app.getFileIcon(p.path, { size: 'normal' });
          if (iconNative && !iconNative.isEmpty()) {
            iconBase64 = iconNative.toDataURL();
          }
        } catch (_) { }
        return {
          ...p,
          icon: iconBase64,
        };
      })
    );

    return { success: true, programs: programsWithIcons };
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
              // Leer logos como base64 / inline SVG para incrustarlos en el HTML del navegador del sistema
              const wps5SvgPath = path.join(__dirname, '..', 'assets', 'icons', 'wps5FullWhite.svg');
              const steamPngPath = path.join(__dirname, '..', 'assets', 'icons', 'steam.png');
              const wps5SvgContent = fs.existsSync(wps5SvgPath)
                ? fs.readFileSync(wps5SvgPath, 'utf8')
                : '';
              const steamPngB64 = fs.existsSync(steamPngPath)
                ? `data:image/png;base64,${fs.readFileSync(steamPngPath).toString('base64')}`
                : '';

              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Steam conectado</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #1E1E1E; color: #fff;
  }
  .container { text-align: center; max-width: 600px; padding: 40px; }

  .layout { display: flex; align-items: center; justify-content: center; gap: 32px; margin-bottom: 32px; }
  .wps5-logo { width: 140px; height: 140px; display: flex; align-items: center; justify-content: center; }
  .wps5-logo svg { width: 140px; height: 140px; }
  .steam-logo img { width: 120px; height: 120px; object-fit: contain; }
  .divider { font-size: 36px; font-weight: 700; color: #555; }

  .title { font-size: 24px; font-weight: 400; color: #fff; margin-bottom: 16px; }

  .subtitle { font-size: 14px; color: #aaa; line-height: 1.6; }
  .subtitle a { color: #66c0f4; text-decoration: none; font-weight: 500; }
  .subtitle a:hover { text-decoration: underline; }

  .links { margin-top: 24px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; }
  .links span { color: #555; }
  .links a { color: #888; text-decoration: none; font-weight: 500; }
  .links a:hover { color: #fff; }

  .fade-in { opacity: 0; animation: fadeIn 0.5s ease forwards; }
  .fade-in-d1 { animation-delay: 0.1s; }
  .fade-in-d2 { animation-delay: 0.2s; }
  .fade-in-d3 { animation-delay: 0.35s; }

  @keyframes fadeIn { to { opacity: 1; } }
</style>
</head>
<body>
  <div class="container">
    <div class="layout fade-in">
      <div class="wps5-logo">
        ${wps5SvgContent}
      </div>
      <span class="divider">×</span>
      <div class="steam-logo">
        <img src="${steamPngB64}" alt="Steam">
      </div>
    </div>
    <h1 class="title fade-in fade-in-d1">Te has conectado correctamente.</h1>
    <p class="subtitle fade-in fade-in-d2">Puedes cerrar esta ventana o <a href="#" onclick="window.close()">cerrarla automaticamente</a>.</p>
    <div class="links fade-in fade-in-d3">
      <a href="https://store.steampowered.com" target="_blank">Steam Store</a>
      <span>|</span>
      <a href="https://steamcommunity.com" target="_blank">Community</a>
    </div>
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

  // ── IPC: Logros de juegos externos (emuladores Steam: Codex, Goldberg, etc.) ──
  // Registrado aquí para tener acceso al scope de `app` (getPath, isPackaged).
  const achievementReader = require('./achievementReader.js');

  ipcMain.handle('get-external-achievements', async (_event, appId, steamApiKey, lang) => {
    try {
      const result = await achievementReader.scanExternalAchievements(appId, steamApiKey, lang || 'english');
      return { success: true, data: result };
    } catch (err) {
      console.error('[IPC:get-external-achievements]', err);
      return { success: false, data: null, error: err.message };
    }
  });

  // ── IPC: Logros de juegos PC manuales (detecta AppID desde el exe) ──────────
  ipcMain.handle('get-pc-game-achievements', async (_event, exePath, steamApiKey, lang) => {
    try {
      const result = await achievementReader.scanPcGameAchievements(exePath, steamApiKey, lang || 'english');
      return { success: true, data: result };
    } catch (err) {
      console.error('[IPC:get-pc-game-achievements]', err);
      return { success: false, data: null, error: err.message };
    }
  });

  // ── IPC: Trofeos de RPCS3 vía .lnk ──────────────────────────────────────────
  // lnkPath:  ruta al .lnk del juego PS3 (el que el usuario añadió al launcher)
  // rpcs3Dir: carpeta raíz de RPCS3 configurada en Settings
  ipcMain.handle('resolve-rpcs3-lnk-trophies', async (_event, lnkPath, rpcs3Dir) => {
    try {
      const result = await achievementReader.resolveRpcs3GameFromLnk(lnkPath, rpcs3Dir);
      return { success: true, data: result };
    } catch (err) {
      console.error('[IPC:resolve-rpcs3-lnk-trophies]', err);
      return { success: false, data: null, error: err.message };
    }
  });

  // ── IPC: Trofeos de RPCS3 ──────────────────────────────────────────────────
  // rpcs3Dir: carpeta raíz de RPCS3 (contiene rpcs3.exe + dev_hdd0/)
  // npCommId: NPcommID del juego ("NPWR00001-A", etc.)
  ipcMain.handle('get-rpcs3-trophies', async (_event, rpcs3Dir, npCommId) => {
    try {
      const result = await achievementReader.scanRpcs3Trophies(rpcs3Dir, npCommId);
      return { success: true, data: result };
    } catch (err) {
      console.error('[IPC:get-rpcs3-trophies]', err);
      return { success: false, data: null, error: err.message };
    }
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
  hideTrayIcon();
  for (const id of Array.from(activeGameWatchers.keys())) {
    stopSteamGameWatch(id);
  }
  if (downloadParseInterval) {
    clearInterval(downloadParseInterval);
    downloadParseInterval = null;
  }
  for (const watcher of downloadWatchers) {
    try { watcher.close(); } catch { /* ignore */ }
  }
  downloadWatchers.length = 0;
});