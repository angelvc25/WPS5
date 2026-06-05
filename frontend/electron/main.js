const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { pathToFileURL } = require('url');
const serve = require('electron-serve').default || require('electron-serve');

const loadURL = serve({ directory: path.join(__dirname, '../dist') });

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

const dbPath = path.join(app.getPath('userData'), 'database.json');
const IGDB_CLIENT_ID = 'cedukeor213t2yrqswcerzpldefp43'; // REEMPLAZAR
const IGDB_CLIENT_SECRET = 'q9hm9iq6ahlaccv3osl19a7y71qd3t'; // REEMPLAZAR
const STEAMGRID_API_KEY = '6abd5716fa6f6cb81eaed8426560c5eb'; // REEMPLAZADO
let igdbAccessToken = null;



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
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Permitir carga de assets locales y externos sin restricciones de CORS/CSP en este entorno de consola
    },
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

app.whenReady().then(() => {
  initDB();

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
      return { success: false, error: 'App not found' };
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

  // IPC: Ejecutar un programa externo
  ipcMain.handle('launch-app', (event, id, executablePath) => {
    if (!executablePath) return;

    // Actualizar timestamp de último juego en la DB si el id existe
    if (id && id !== 'last_played') {
      console.log('Actualizando lastPlayed para:', id);
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      const updateInList = (list) => {
        const item = list.find(i => i.id === id);
        if (item) {
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

    // Ejecutar la ruta proporcionada
    exec(`"${executablePath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('Error al ejecutar la aplicación:', error);
      }
    });

    return { success: true };
  });

  // IPC: Abrir diálogo para seleccionar ejecutable
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Ejecutables', extensions: ['exe', 'bat', 'lnk', 'url'] }]
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

  createWindow();


  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
