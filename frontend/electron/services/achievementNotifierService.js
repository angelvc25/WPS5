'use strict';

/**
 * achievementNotifierService.js
 *
 * Motor de logros y notificaciones estilo Steam Achievement Notifier (SAN) para WPS5.
 *
 * Características:
 *  - Renderizado idéntico 1:1 al preset PS5 de SAN (como en la imagen del usuario).
 *  - Detección en tiempo real (<250ms) de Steam oficial (binarios locales UserGameStats).
 *  - Detección en tiempo real de RetroAchievements (logs de emuladores).
 *  - Detección en tiempo real de juegos externos (Goldberg, Codex, RPCS3).
 *  - Soporte completo para Importar y Exportar temas .san (archivos ZIP con usertheme.json y assets).
 *  - Personalización de posiciones, tamaños, duración, sonidos y temas.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { BrowserWindow, screen, ipcMain, dialog, app } = require('electron');

// ── Parser VDF Binario nativo ligero ──────────────────────────────────────────
function parseBinaryVdf(buf) {
  let offset = 0;
  function readString() {
    const start = offset;
    while (offset < buf.length && buf[offset] !== 0) offset++;
    const s = buf.toString('utf8', start, offset);
    offset++;
    return s;
  }
  function parseObject() {
    const obj = {};
    while (offset < buf.length) {
      const type = buf[offset++];
      if (type === 0x08) break;
      const key = readString();
      switch (type) {
        case 0x00:
          obj[key] = parseObject();
          break;
        case 0x01:
          obj[key] = readString();
          break;
        case 0x02:
          obj[key] = buf.readInt32LE(offset);
          offset += 4;
          break;
        case 0x03:
          obj[key] = buf.readFloatLE(offset);
          offset += 4;
          break;
        case 0x07:
          obj[key] = buf.readBigInt64LE(offset);
          offset += 8;
          break;
        default:
          return obj;
      }
    }
    return obj;
  }
  try {
    return parseObject();
  } catch (_) {
    return {};
  }
}

// ── Configuración inicial ───────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  themeId: 'ps5_modern',
  position: 'topright',
  durationMs: 6000,
  scale: 100,

  // 1. Tipografía y Textos
  fontColor: '#ffffff',
  descFontColor: 'rgba(255, 255, 255, 0.78)',
  fontSize: 100,
  showGameIcon: true,

  // 2. Sonido y Volumen
  soundEnabled: true,
  soundVolume: 100,
  customSoundFile: null,

  // 3. Estilos de Fondo
  bgStyle: 'gradient', // 'solid' | 'gradient'
  gradientAngle: 90,
  primaryColor: '#18191e',
  secondaryColor: '#101114',
  opacity: 100,
  roundness: 8,

  // 4. Contorno y Brillo
  useOutline: false,
  outlineColor: '#00c8ff',
  outlineWidth: 1,
  useGlow: false,
  glowColor: '#00c8ff',

  // 5. Iconos y Logos
  rightLogo: null, // null = IntroLogo.png
  rightLogoScale: 100,
  bronzeIcon: null, // null = assets/images/bronce.png
  silverIcon: null, // null = assets/images/plata.png
  goldIcon: null, // null = assets/images/oro.png
  platinumIcon: null, // null = assets/images/platino.png
};

class AchievementNotifierService {
  constructor() {
    this.mainWindow = null;
    this.config = { ...DEFAULT_CONFIG };
    this.activeWatchers = new Map();
    this.trophyQueue = [];
    this.trophyWindow = null;
    this.isShowingNotification = false;
    this.configFilePath = null;
    this.steamPath = null;
    this.trophyAssetsDir = null;
    this.userThemesDir = null;
    this.loadedThemeData = null;
  }

  init(mainWindow, options = {}) {
    this.mainWindow = mainWindow;
    this.steamPath = options.steamPath || null;

    const appDir = path.join(__dirname, '..');
    this.trophyAssetsDir = path.join(appDir, '..', 'assets', 'trophies');

    const userData = app.getPath('userData');
    this.configFilePath = path.join(userData, 'achievement_notifier_config.json');
    this.userThemesDir = path.join(userData, 'userthemes');

    try {
      if (!fs.existsSync(this.userThemesDir)) {
        fs.mkdirSync(this.userThemesDir, { recursive: true });
      }
    } catch (_) { }

    this.loadConfig();
    this.loadActiveTheme();
    this.registerIpc();
  }

  loadConfig() {
    try {
      if (this.configFilePath && fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf8');
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (_) {
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  saveConfig(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      if (this.configFilePath) {
        fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2), 'utf8');
      }
    } catch (e) {
      console.warn('[AchievementNotifier] Error guardando config:', e.message);
    }
  }

  loadActiveTheme() {
    try {
      if (this.config.themeId && this.config.themeId !== 'ps5_modern') {
        const themeDir = path.join(this.userThemesDir, this.config.themeId);
        const themeJson = path.join(themeDir, 'usertheme.json');
        if (fs.existsSync(themeJson)) {
          this.loadedThemeData = JSON.parse(fs.readFileSync(themeJson, 'utf8'));
          return;
        }
      }
    } catch (e) {
      console.warn('[AchievementNotifier] Error cargando tema activo:', e.message);
    }
    this.loadedThemeData = null;
  }

  // ── Registrar IPCs ──────────────────────────────────────────────────────────
  registerIpc() {
    ipcMain.handle('ach-notifier:get-config', () => this.config);
    ipcMain.handle('ach-notifier:set-config', (_event, cfg) => {
      this.saveConfig(cfg);
      if (cfg.themeId) this.loadActiveTheme();
      return this.config;
    });

    ipcMain.handle('ach-notifier:test-trophy', (_event, rarity = 'platinum') => {
      this.showTestTrophy(rarity);
      return { success: true };
    });

    ipcMain.handle('ach-notifier:get-themes', () => this.getThemesList());
    ipcMain.handle('ach-notifier:import-theme', async () => this.importThemeDialog());
    ipcMain.handle('ach-notifier:export-theme', async () => this.exportCurrentThemeDialog());

    ipcMain.handle('ach-notifier:pick-file', async (_event, type = 'image') => {
      const isAudio = type === 'audio';
      const filters = isAudio
        ? [{ name: 'Archivos de Sonido (*.mp3, *.wav, *.ogg)', extensions: ['mp3', 'wav', 'ogg', 'aac', 'flac'] }]
        : [{ name: 'Archivos de Imagen (*.png, *.jpg, *.jpeg, *.svg, *.webp)', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'ico'] }];

      const res = await dialog.showOpenDialog(this.mainWindow, {
        title: isAudio ? 'Seleccionar Sonido de Notificación' : 'Seleccionar Imagen / Icono',
        filters,
        properties: ['openFile'],
      });

      if (res.canceled || !res.filePaths.length) {
        return { success: false, canceled: true };
      }
      return { success: true, filePath: res.filePaths[0] };
    });

    ipcMain.handle('ach-notifier:reset-config', () => {
      this.config = { ...DEFAULT_CONFIG };
      this.saveConfig(this.config);
      this.loadActiveTheme();
      return this.config;
    });
  }

  getThemesList() {
    const list = [
      { id: 'ps5_modern', label: 'PS Modern (Oficial PS5)' },
    ];
    try {
      if (fs.existsSync(this.userThemesDir)) {
        const entries = fs.readdirSync(this.userThemesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const jsonPath = path.join(this.userThemesDir, entry.name, 'usertheme.json');
            if (fs.existsSync(jsonPath)) {
              try {
                const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                list.push({
                  id: entry.name,
                  label: data.label || entry.name,
                });
              } catch (_) {
                list.push({ id: entry.name, label: entry.name });
              }
            }
          }
        }
      }
    } catch (_) { }
    return list;
  }

  // ── Importar archivo .san (formato oficial SAN) ──────────────────────────────
  async importThemeDialog() {
    const res = await dialog.showOpenDialog(this.mainWindow, {
      title: 'Seleccionar Tema SAN (.san)',
      filters: [
        { name: 'Temas Steam Achievement Notifier (*.san, *.zip)', extensions: ['san', 'zip'] },
      ],
      properties: ['openFile'],
    });

    if (res.canceled || !res.filePaths.length) {
      return { success: false, canceled: true };
    }

    const filePath = res.filePaths[0];
    try {
      const themeName = path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_-]/g, '_');
      const targetDir = path.join(this.userThemesDir, themeName);

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      // Descomprimir usando PowerShell Expand-Archive (nativo en Windows)
      const escapedZip = filePath.replace(/'/g, "''");
      const escapedDest = targetDir.replace(/'/g, "''");
      const psCommand = `powershell -Command "Expand-Archive -Path '${escapedZip}' -DestinationPath '${escapedDest}' -Force"`;
      execSync(psCommand, { stdio: 'ignore' });

      // Validar si existe usertheme.json
      const jsonPath = path.join(targetDir, 'usertheme.json');
      if (!fs.existsSync(jsonPath)) {
        // Podría estar dentro de una subcarpeta
        const subdirs = fs.readdirSync(targetDir, { withFileTypes: true }).filter(d => d.isDirectory());
        for (const sub of subdirs) {
          const subJson = path.join(targetDir, sub.name, 'usertheme.json');
          if (fs.existsSync(subJson)) {
            // Mover contenidos al targetDir
            const files = fs.readdirSync(path.join(targetDir, sub.name));
            for (const f of files) {
              fs.renameSync(path.join(targetDir, sub.name, f), path.join(targetDir, f));
            }
            break;
          }
        }
      }

      if (fs.existsSync(jsonPath)) {
        const themeData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const c = themeData?.customisation || {};

        const findAsset = (rel) => {
          if (!rel) return null;
          const abs = path.resolve(targetDir, rel);
          return fs.existsSync(abs) ? abs : null;
        };

        const importedSound = findAsset(c.soundfile);
        const importedLogo = findAsset(c.customicons?.ps5?.logo);
        const rarities = c.customicons?.ps5?.rarities || {};

        this.saveConfig({
          themeId: themeName,
          primaryColor: c.primarycolor || this.config.primaryColor,
          secondaryColor: c.secondarycolor || this.config.secondaryColor,
          bgStyle: c.bgstyle || 'gradient',
          gradientAngle: c.gradientangle != null ? c.gradientangle : 90,
          roundness: c.roundness != null ? (c.roundness > 24 ? Math.round(c.roundness / 3) : c.roundness) : 8,
          opacity: c.opacity != null ? c.opacity : 100,
          useOutline: Boolean(c.useoutline),
          outlineColor: c.outlinecolor || '#00c8ff',
          outlineWidth: c.outlinewidth || 1,
          useGlow: Boolean(c.glow),
          glowColor: c.glowcolor || '#00c8ff',
          fontColor: c.fontcolor || '#ffffff',
          descFontColor: c.descfontcolor || 'rgba(255, 255, 255, 0.78)',
          fontSize: c.fontsize || 100,
          showGameIcon: c.usegameicon !== false,
          soundVolume: c.volume != null ? c.volume : 100,
          durationMs: c.displaytime ? c.displaytime * 1000 : 6000,
          scale: c.scale || 100,
          rightLogoScale: c.logoscale || 100,
          customSoundFile: importedSound || null,
          rightLogo: importedLogo || null,
          bronzeIcon: findAsset(rarities.bronze) || null,
          silverIcon: findAsset(rarities.silver) || null,
          goldIcon: findAsset(rarities.gold) || null,
          platinumIcon: findAsset(rarities.platinum) || null,
        });

        this.loadActiveTheme();
        return { success: true, themeId: themeName, label: themeData.label || themeName };
      } else {
        return { success: false, error: 'El archivo .san no contiene usertheme.json válido.' };
      }
    } catch (err) {
      console.error('[AchievementNotifier] Error importando tema .san:', err);
      return { success: false, error: err.message };
    }
  }

  // ── Exportar Tema actual a archivo .san ──────────────────────────────────────
  async exportCurrentThemeDialog() {
    const res = await dialog.showSaveDialog(this.mainWindow, {
      title: 'Exportar Tema SAN (.san)',
      defaultPath: 'PS5_Theme.san',
      filters: [
        { name: 'Tema Steam Achievement Notifier (*.san)', extensions: ['san'] },
      ],
    });

    if (res.canceled || !res.filePath) {
      return { success: false, canceled: true };
    }

    try {
      const destSan = res.filePath;
      const tempDir = path.join(app.getPath('temp'), `san_export_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      const assetsDir = path.join(tempDir, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });

      const imagesDir = path.join(__dirname, '..', '..', 'assets', 'images');
      const copyAsset = (sourcePath, targetName) => {
        try {
          if (sourcePath && fs.existsSync(sourcePath)) {
            const ext = path.extname(sourcePath) || '.png';
            const dest = path.join(assetsDir, `${targetName}${ext}`);
            fs.copyFileSync(sourcePath, dest);
            return `assets/${targetName}${ext}`;
          }
        } catch (_) { }
        return null;
      };

      const soundRel = copyAsset(this.config.customSoundFile, 'sound') ||
                       copyAsset(path.join(__dirname, '..', '..', 'assets', 'sounds', 'Trophy Toas.mp3'), 'sound') ||
                       'assets/Trophy Toas.mp3';

      const logoRel = copyAsset(this.config.rightLogo, 'logo') ||
                      copyAsset(path.join(imagesDir, 'IntroLogo.png'), 'logo') ||
                      'assets/IntroLogo.png';

      const bronzeRel = copyAsset(this.config.bronzeIcon, 'bronze') ||
                        copyAsset(path.join(imagesDir, 'bronce.png'), 'bronze');
      const silverRel = copyAsset(this.config.silverIcon, 'silver') ||
                        copyAsset(path.join(imagesDir, 'plata.png'), 'silver');
      const goldRel = copyAsset(this.config.goldIcon, 'gold') ||
                      copyAsset(path.join(imagesDir, 'oro.png'), 'gold');
      const platRel = copyAsset(this.config.platinumIcon, 'platinum') ||
                      copyAsset(path.join(imagesDir, 'platino.png'), 'platinum');

      const fullUserTheme = {
        id: 1,
        label: this.config.themeId || 'PS5 Custom Theme',
        customisation: {
          preset: 'ps5',
          soundmode: 'file',
          soundfile: soundRel,
          volume: this.config.soundVolume || 100,
          displaytime: Math.round((this.config.durationMs || 6000) / 1000),
          scale: this.config.scale || 100,
          bgstyle: this.config.bgStyle || 'gradient',
          gradientangle: this.config.gradientAngle != null ? this.config.gradientAngle : 90,
          primarycolor: this.config.primaryColor || '#18191e',
          secondarycolor: this.config.secondaryColor || '#101114',
          opacity: this.config.opacity != null ? this.config.opacity : 100,
          roundness: this.config.roundness != null ? this.config.roundness : 8,
          useoutline: Boolean(this.config.useOutline),
          outlinecolor: this.config.outlineColor || '#00c8ff',
          outlinewidth: this.config.outlineWidth || 1,
          glow: Boolean(this.config.useGlow),
          glowcolor: this.config.glowColor || '#00c8ff',
          fontcolor: this.config.fontColor || '#ffffff',
          descfontcolor: this.config.descFontColor || 'rgba(255, 255, 255, 0.78)',
          fontsize: this.config.fontSize || 100,
          usegameicon: this.config.showGameIcon !== false,
          logoscale: this.config.rightLogoScale || 100,
          customicons: {
            ps5: {
              logo: logoRel,
              rarities: {
                bronze: bronzeRel,
                silver: silverRel,
                gold: goldRel,
                platinum: platRel,
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(tempDir, 'usertheme.json'), JSON.stringify(fullUserTheme, null, 2), 'utf8');

      // Comprimir a .zip temporal y renombrar a .san
      const tempZip = `${tempDir}.zip`;
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
      if (fs.existsSync(destSan)) fs.unlinkSync(destSan);

      const psCompress = `powershell -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${tempZip}' -Force"`;
      execSync(psCompress, { stdio: 'ignore' });

      fs.renameSync(tempZip, destSan);
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { }

      return { success: true, filePath: destSan };
    } catch (err) {
      console.error('[AchievementNotifier] Error exportando tema .san:', err);
      return { success: false, error: err.message };
    }
  }

  fileToDataUri(filePath, defaultMime = 'image/png') {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath).toLowerCase();
      let mime = defaultMime;
      if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
      else if (ext === '.svg') mime = 'image/svg+xml';
      else if (ext === '.png') mime = 'image/png';
      else if (ext === '.mp3') mime = 'audio/mpeg';
      else if (ext === '.wav') mime = 'audio/wav';

      const base64 = fs.readFileSync(filePath).toString('base64');
      return `data:${mime};base64,${base64}`;
    } catch (_) {
      return null;
    }
  }

  // ── Encolar y mostrar notificación ──────────────────────────────────────────
  enqueueTrophy(achievement, gameInfo = {}, options = {}) {
    this.trophyQueue.push({ achievement, gameInfo, options });
    this.processQueue();
  }

  showTestTrophy(rarity = 'platinum') {
    // Texto y configuración idénticos a los de SAN en la imagen 2
    let category = '100% Completado';
    let title = '¡Has desbloqueado todos los logros!';
    let desc = 'Has obtenido todos los trofeos del juego';

    if (rarity === 'gold') {
      category = 'Trofeo de Oro Desbloqueado';
      title = 'Maestro Legendario';
      desc = 'Superaste todos los desafíos al máximo nivel';
    } else if (rarity === 'silver') {
      category = 'Trofeo de Plata Desbloqueado';
      title = 'Combatiente Experto';
      desc = 'Dominaste todas las técnicas especiales';
    } else if (rarity === 'bronze') {
      category = 'Trofeo de Bronce Desbloqueado';
      title = 'Primeros Pasos';
      desc = 'Completaste la misión introductoria';
    }

    this.enqueueTrophy({
      apiName: `test_${rarity}`,
      name: title,
      category,
      description: desc,
      rarity: rarity,
      icon: null, // usará gameicon.png tal como en la imagen 2 de SAN
    }, {
      title: 'GAME ICON',
    }, {
      isTest: true, // Flag para evitar emitir evento duplicado al frontend
    });
  }

  processQueue() {
    if (this.isShowingNotification || this.trophyQueue.length === 0) return;
    this.isShowingNotification = true;

    const { achievement, gameInfo, options } = this.trophyQueue.shift();

    try {
      if (this.trophyWindow && !this.trophyWindow.isDestroyed()) {
        this.trophyWindow.close();
      }
    } catch (_) { }

    const rarity = achievement.rarity || 'bronze';
    const display = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = display.workAreaSize;

    // Dimensiones idénticas al preset PS5 de SAN
    // Base SAN: 320px x 52px
    const scaleFactor = (this.config.scale || 100) / 100;
    const baseW = 350;
    const baseH = 56;
    const W = Math.round(baseW * scaleFactor);
    const H = Math.round(baseH * scaleFactor);
    const margin = Math.round(20 * scaleFactor);

    let posX = display.workArea.x + sw - W - margin;
    let posY = display.workArea.y + margin;

    const pos = this.config.position || 'topright';
    if (pos === 'topcenter') {
      posX = Math.round(display.workArea.x + (sw - W) / 2);
      posY = Math.round(display.workArea.y + margin);
    } else if (pos === 'topleft') {
      posX = Math.round(display.workArea.x + margin);
      posY = Math.round(display.workArea.y + margin);
    } else if (pos === 'bottomright') {
      posX = Math.round(display.workArea.x + sw - W - margin);
      posY = Math.round(display.workArea.y + sh - H - margin);
    } else if (pos === 'bottomcenter') {
      posX = Math.round(display.workArea.x + (sw - W) / 2);
      posY = Math.round(display.workArea.y + sh - H - margin);
    } else if (pos === 'bottomleft') {
      posX = Math.round(display.workArea.x + margin);
      posY = Math.round(display.workArea.y + sh - H - margin);
    }

    try {
      this.trophyWindow = new BrowserWindow({
        width: W,
        height: H,
        x: posX,
        y: posY,
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
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      this.trophyWindow.setAlwaysOnTop(true, 'screen-saver');
      this.trophyWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

      // Directorios de assets
      const trophiesDir = this.trophyAssetsDir;
      const imagesDir = path.join(__dirname, '..', '..', 'assets', 'images');
      const defaultIntroLogo = path.join(imagesDir, 'IntroLogo.png');
      const defaultBronze = path.join(imagesDir, 'bronce.png');
      const defaultSilver = path.join(imagesDir, 'plata.png');
      const defaultGold = path.join(imagesDir, 'oro.png');
      const defaultPlatinum = path.join(imagesDir, 'platino.png');

      const custom = this.loadedThemeData?.customisation || {};
      const themeDir = this.config.themeId && this.config.themeId !== 'ps5_modern'
        ? path.join(this.userThemesDir, this.config.themeId)
        : null;

      // 1. Fondo (Sólido / Degradado)
      const isGradient = (this.config.bgStyle || custom.bgstyle || 'gradient') === 'gradient';
      const primaryColor = this.config.primaryColor || custom.primarycolor || '#18191e';
      const secondaryColor = this.config.secondaryColor || custom.secondarycolor || '#101114';
      const gradAngle = this.config.gradientAngle != null ? this.config.gradientAngle : (custom.gradientangle != null ? custom.gradientangle : 90);
      const bgCss = isGradient
        ? `linear-gradient(${gradAngle}deg, ${primaryColor} 0%, ${secondaryColor} 100%)`
        : primaryColor;

      const opacityVal = (this.config.opacity != null ? this.config.opacity : (custom.opacity != null ? custom.opacity : 100)) / 100;
      const roundnessVal = `${this.config.roundness != null ? this.config.roundness : (custom.roundness != null ? Math.min(24, Math.max(0, Math.round(custom.roundness / 3))) : 8)}px`;

      // 2. Contorno
      const useOutline = this.config.useOutline != null ? this.config.useOutline : Boolean(custom.useoutline);
      const outlineColor = this.config.outlineColor || custom.outlinecolor || '#00c8ff';
      const outlineWidth = this.config.outlineWidth || custom.outlinewidth || 1;
      const borderCss = useOutline
        ? `${outlineWidth}px solid ${outlineColor}`
        : '1px solid rgba(255, 255, 255, 0.09)';

      // 3. Brillo
      const useGlow = this.config.useGlow != null ? this.config.useGlow : Boolean(custom.glow);
      const glowColor = this.config.glowColor || custom.glowcolor || '#00c8ff';
      const shadowCss = useGlow
        ? `0 0 16px ${glowColor}, 0 6px 20px rgba(0, 0, 0, 0.7)`
        : `0 6px 20px rgba(0, 0, 0, 0.7)`;

      // 4. Tipografía y Textos
      const fontColorVal = this.config.fontColor || custom.fontcolor || '#ffffff';
      const descFontColorVal = this.config.descFontColor || custom.descfontcolor || 'rgba(255, 255, 255, 0.78)';
      const fontScale = (this.config.fontSize || custom.fontsize || 100) / 100;
      const showGameIcon = this.config.showGameIcon !== false && custom.usegameicon !== false;

      // 5. Logo de la derecha y escala
      let psLogoUri = null;
      if (this.config.rightLogo && fs.existsSync(this.config.rightLogo)) {
        psLogoUri = this.fileToDataUri(this.config.rightLogo);
      } else if (themeDir && custom.customicons?.ps5?.logo) {
        const customLogo = path.resolve(themeDir, custom.customicons.ps5.logo);
        if (fs.existsSync(customLogo)) psLogoUri = this.fileToDataUri(customLogo);
      }
      if (!psLogoUri) {
        psLogoUri = this.fileToDataUri(defaultIntroLogo) ||
                    this.fileToDataUri(path.join(trophiesDir, 'sanlogo.svg')) ||
                    this.fileToDataUri(path.join(trophiesDir, 'sanlogo.png')) ||
                    this.fileToDataUri(path.join(trophiesDir, 'logo-trophy.png'));
      }
      const logoScale = (this.config.rightLogoScale || custom.logoscale || 100) / 100;
      const logoSize = Math.max(14, Math.round(24 * logoScale));

      // 6. Iconos de trofeos según rareza
      let trophySvgUri = null;
      if (rarity === 'platinum') {
        if (this.config.platinumIcon && fs.existsSync(this.config.platinumIcon)) {
          trophySvgUri = this.fileToDataUri(this.config.platinumIcon);
        } else if (fs.existsSync(defaultPlatinum)) {
          trophySvgUri = this.fileToDataUri(defaultPlatinum);
        } else {
          trophySvgUri = this.fileToDataUri(path.join(trophiesDir, 'trophy_plat.svg'));
        }
      } else if (rarity === 'gold') {
        if (this.config.goldIcon && fs.existsSync(this.config.goldIcon)) {
          trophySvgUri = this.fileToDataUri(this.config.goldIcon);
        } else if (fs.existsSync(defaultGold)) {
          trophySvgUri = this.fileToDataUri(defaultGold);
        } else {
          trophySvgUri = this.fileToDataUri(path.join(trophiesDir, 'trophy_gold.svg'));
        }
      } else if (rarity === 'silver') {
        if (this.config.silverIcon && fs.existsSync(this.config.silverIcon)) {
          trophySvgUri = this.fileToDataUri(this.config.silverIcon);
        } else if (fs.existsSync(defaultSilver)) {
          trophySvgUri = this.fileToDataUri(defaultSilver);
        } else {
          trophySvgUri = this.fileToDataUri(path.join(trophiesDir, 'trophy_silver.svg'));
        }
      } else {
        // bronze
        if (this.config.bronzeIcon && fs.existsSync(this.config.bronzeIcon)) {
          trophySvgUri = this.fileToDataUri(this.config.bronzeIcon);
        } else if (fs.existsSync(defaultBronze)) {
          trophySvgUri = this.fileToDataUri(defaultBronze);
        } else {
          trophySvgUri = this.fileToDataUri(path.join(trophiesDir, 'trophy_bronze.svg'));
        }
      }

      // 7. Sonido y volumen
      let soundUri = null;
      const volumeLevel = (this.config.soundVolume != null ? this.config.soundVolume : (custom.volume != null ? custom.volume : 100)) / 100;
      if (this.config.soundEnabled) {
        if (this.config.customSoundFile && fs.existsSync(this.config.customSoundFile)) {
          soundUri = this.fileToDataUri(this.config.customSoundFile);
        } else if (themeDir && custom.soundfile) {
          const customSound = path.resolve(themeDir, custom.soundfile);
          if (fs.existsSync(customSound)) soundUri = this.fileToDataUri(customSound);
        }
        if (!soundUri) {
          const soundFile = rarity === 'platinum'
            ? path.join(__dirname, '..', '..', 'assets', 'sounds', 'Platinum Trophy Toast.mp3')
            : path.join(__dirname, '..', '..', 'assets', 'sounds', 'Trophy Toas.mp3');

          if (fs.existsSync(soundFile)) {
            soundUri = this.fileToDataUri(soundFile, 'audio/mpeg');
          }
        }
      }

      // 8. Icono del juego / logro a la izquierda
      const gameIconUri = this.fileToDataUri(path.join(trophiesDir, 'gameicon.png'));
      let iconSrc = gameIconUri;
      if (achievement.icon && (achievement.icon.startsWith('http') || achievement.icon.startsWith('data:'))) {
        iconSrc = achievement.icon;
      } else if (gameInfo.image && fs.existsSync(gameInfo.image)) {
        iconSrc = this.fileToDataUri(gameInfo.image);
      }

      const categoryText = achievement.category ||
        (rarity === 'platinum' ? '100% Completado' :
         rarity === 'gold' ? 'Trofeo de Oro Desbloqueado' :
         rarity === 'silver' ? 'Trofeo de Plata Desbloqueado' :
         'Trofeo de Bronce Desbloqueado');

      const titleText = achievement.name || '¡Has desbloqueado todos los logros!';
      const displayMs = this.config.durationMs || 6000;
      const exitMs = 300;

      // Dimensiones escaladas proporcionalmente con scaleFactor
      const s = scaleFactor;
      const cardPadX = Math.round(15 * s);
      const cardRadius = Math.round(9 * s);
      const cardShadowY = Math.round(8 * s);
      const cardShadowBlur = Math.round(24 * s);
      const animTranslateX = Math.round(20 * s);

      const iconSize = Math.round(42 * s);
      const iconRadius = Math.round(7 * s);
      const iconMarginRight = Math.round(12 * s);

      const trophySize = Math.round(17 * s);
      const trophyGap = Math.round(6 * s);
      const categoryFontSize = Math.max(9, Math.round(12 * s * fontScale));
      const titleFontSize = Math.max(10, Math.round(13.5 * s * fontScale));
      const textGap = Math.max(1, Math.round(3 * s));

      const logoWrapperSize = Math.round(36 * s);
      const psLogoSize = Math.round(26 * s);
      const logoRingSize = Math.round(30 * s);
      const logoRingBorder = Math.max(1, Math.round(1.5 * s));
      const logoRingBorder2 = Math.max(1, Math.round(1 * s));
      const logoMarginLeft = Math.round(10 * s);

      // HTML y CSS de la notificación estilo PlayStation 5 (sin bordes, expansión a la izquierda y pulsación en logo)
      const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; user-select:none; }
  html, body {
    width: 100%; height: 100%;
    background: transparent;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  }
  .san-notification {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    padding: 0 ${cardPadX}px;
    background: linear-gradient(90deg, #18191e 0%, #101114 100%);
    border-radius: ${cardRadius}px;
    border: none;
    outline: none;
    box-shadow: 0 ${cardShadowY}px ${cardShadowBlur}px rgba(0, 0, 0, 0.75);
    transform-origin: right center;
    animation: ps5ExpandLeft 0.42s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .san-notification.exit {
    transform-origin: right center;
    animation: ps5CollapseRight 0.32s cubic-bezier(0.4, 0, 1, 1) forwards;
  }

  /* Animación: aparece expandiéndose hacia la izquierda */
  @keyframes ps5ExpandLeft {
    0% {
      opacity: 0;
      clip-path: inset(0 0 0 100% round ${cardRadius}px);
      transform: scaleX(0.2) translateX(${animTranslateX}px);
    }
    40% {
      opacity: 1;
    }
    100% {
      opacity: 1;
      clip-path: inset(0 0 0 0% round ${cardRadius}px);
      transform: scaleX(1) translateX(0);
    }
  }

  @keyframes ps5CollapseRight {
    0% {
      opacity: 1;
      clip-path: inset(0 0 0 0% round ${cardRadius}px);
      transform: scaleX(1) translateX(0);
    }
    100% {
      opacity: 0;
      clip-path: inset(0 0 0 100% round ${cardRadius}px);
      transform: scaleX(0.2) translateX(${animTranslateX}px);
    }
  }

  /* Cuadro izquierdo (Game Icon) */
  .icon-wrapper {
    width: ${iconSize}px;
    height: ${iconSize}px;
    border-radius: ${iconRadius}px;
    background-color: #20232a;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-right: ${iconMarginRight}px;
    overflow: hidden;
    border: none;
  }
  .icon-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border: none;
  }

  /* Contenido central */
  .text-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: ${textGap}px;
  }
  .top-row {
    display: flex;
    align-items: center;
    gap: ${trophyGap}px;
  }
  .trophy-svg-icon {
    width: ${trophySize}px;
    height: ${trophySize}px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .category-text {
    font-size: ${categoryFontSize}px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.78);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.2px;
  }
  .title-text {
    font-size: ${titleFontSize}px;
    font-weight: 500;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  /* Logo derecho (PlayStation) estático con aro de pulsación */
  .logo-wrapper {
    position: relative;
    width: ${logoWrapperSize}px;
    height: ${logoWrapperSize}px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: ${logoMarginLeft}px;
  }
  .ps-logo {
    position: relative;
    z-index: 2;
    width: ${psLogoSize}px;
    height: ${psLogoSize}px;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0,0,0,0.7));
  }
  /* Aro exterior pulsante alrededor del logo */
  .logo-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${logoRingSize}px;
    height: ${logoRingSize}px;
    border-radius: 50%;
    border: ${logoRingBorder}px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.5);
    box-sizing: border-box;
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0;
    pointer-events: none;
    z-index: 1;
    animation: ringPulse 2.2s cubic-bezier(0.2, 0.4, 0.4, 1) infinite;
  }
  .logo-ring-2 {
    position: absolute;
    top: 50%;
    left: 50%;
    width: ${logoRingSize}px;
    height: ${logoRingSize}px;
    border-radius: 50%;
    border: ${logoRingBorder2}px solid rgba(255, 255, 255, 0.45);
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
    box-sizing: border-box;
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0;
    pointer-events: none;
    z-index: 1;
    animation: ringPulse 2.2s cubic-bezier(0.2, 0.4, 0.4, 1) 1.1s infinite;
  }

  @keyframes ringPulse {
    0% {
      transform: translate(-50%, -50%) scale(0.85);
      opacity: 0.9;
    }
    50% {
      opacity: 0.6;
    }
    100% {
      transform: translate(-50%, -50%) scale(1.6);
      opacity: 0;
    }
  }
</style>
</head>
<body>
  <div class="san-notification" id="card">
    <div class="icon-wrapper">
      <img src="${iconSrc}" class="icon-img" alt="icon"/>
    </div>
    <div class="text-content">
      <div class="top-row">
        ${trophySvgUri ? `<img src="${trophySvgUri}" class="trophy-svg-icon"/>` : ''}
        <span class="category-text">${categoryText}</span>
      </div>
      <div class="title-text">${titleText}</div>
    </div>
    <div class="logo-wrapper">
      <div class="logo-ring"></div>
      <div class="logo-ring-2"></div>
      ${psLogoUri ? `<img src="${psLogoUri}" class="ps-logo"/>` : ''}
    </div>
  </div>

  ${soundUri ? `<audio id="audioEl" src="${soundUri}" autoplay></audio>` : ''}

  <script>
    const displayMs = ${displayMs};
    const exitMs = ${exitMs};
    const audioEl = document.getElementById('audioEl');
    if (audioEl) {
      audioEl.volume = ${Math.max(0, Math.min(1, volumeLevel))};
    }
    setTimeout(() => {
      const card = document.getElementById('card');
      if (card) card.classList.add('exit');
    }, displayMs - exitMs);
  </script>
</body>
</html>`;

      let shown = false;
      const showWin = () => {
        if (shown) return;
        shown = true;
        if (this.trophyWindow && !this.trophyWindow.isDestroyed()) {
          this.trophyWindow.showInactive();
        }
      };

      this.trophyWindow.once('ready-to-show', showWin);
      this.trophyWindow.webContents.once('did-finish-load', showWin);
      this.trophyWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      setTimeout(showWin, 120);

      // SOLO si no es prueba y mainWindow existe, notificar al renderer para guardar en BD/historial
      if (!options.isTest && this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('trophy-unlocked', {
          achievement,
          gameInfo,
        });
      }

      const closeTimer = setTimeout(() => {
        try {
          if (this.trophyWindow && !this.trophyWindow.isDestroyed()) {
            this.trophyWindow.close();
          }
        } catch (_) { }
        this.trophyWindow = null;
        this.isShowingNotification = false;
        this.processQueue();
      }, displayMs);

      this.trophyWindow.on('closed', () => {
        this.trophyWindow = null;
        clearTimeout(closeTimer);
        this.isShowingNotification = false;
        this.processQueue();
      });

    } catch (err) {
      console.error('[AchievementNotifier] Error mostrando notificación:', err);
      this.trophyWindow = null;
      this.isShowingNotification = false;
      this.processQueue();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MOTOR 1: STEAM OFICIAL EN TIEMPO REAL (< 250ms)
  // ════════════════════════════════════════════════════════════════════════════
  startSteamWatcher(id, numericAppId, creds, gameInfo) {
    this.stopWatcher(id);

    if (!this.steamPath) {
      console.warn('[AchievementNotifier] SteamPath no disponible para AppID', numericAppId);
      return;
    }

    const steam3id = creds?.steamId
      ? Number(BigInt(creds.steamId) - 76561197960265728n)
      : null;

    const statsDir = path.join(this.steamPath, 'appcache', 'stats');
    const binFile = steam3id
      ? path.join(statsDir, `UserGameStats_${steam3id}_${numericAppId}.bin`)
      : null;
    const schemaFile = path.join(statsDir, `UserGameStatsSchema_${numericAppId}.bin`);

    console.log(`[AchievementNotifier] Watcher Steam para AppID ${numericAppId} (Steam3ID: ${steam3id})`);

    let knownUnlockedBits = new Set();
    let schemaMap = new Map();
    let schemaLoaded = false;
    let pollTimer = null;
    let lastMtime = 0;

    const loadSchema = () => {
      try {
        if (fs.existsSync(schemaFile)) {
          const schemaObj = parseBinaryVdf(fs.readFileSync(schemaFile));
          const appStats = schemaObj?.[String(numericAppId)]?.stats || schemaObj?.[numericAppId]?.stats || {};
          for (const [statid, stat] of Object.entries(appStats)) {
            if (stat?.type !== 'ACHIEVEMENTS') continue;
            for (const [bitstr, ach] of Object.entries(stat.bits || {})) {
              const bit = Number(bitstr);
              const d = ach.display || {};
              const names = d.name || {};
              const descs = d.desc || {};
              const name = names.LATAM || names.spanish || names.english || ach.name;
              const desc = descs.LATAM || descs.spanish || descs.english || '';
              const iconHash = d.icon;
              const iconUrl = iconHash
                ? `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${numericAppId}/${iconHash}`
                : null;

              schemaMap.set(bit, {
                apiName: ach.name,
                name,
                description: desc,
                icon: iconUrl,
                hidden: Boolean(d.hidden),
                statid,
              });
            }
          }
          schemaLoaded = schemaMap.size > 0;
        }
      } catch (err) {
        console.warn('[AchievementNotifier] Error cargando schema local:', err.message);
      }
    };

    loadSchema();

    const readCurrentUnlocked = () => {
      if (!binFile || !fs.existsSync(binFile)) return new Set();
      try {
        const statsObj = parseBinaryVdf(fs.readFileSync(binFile));
        const cache = statsObj?.cache || {};
        const unlocked = new Set();

        for (const [statid, entry] of Object.entries(cache)) {
          const data = typeof entry?.data === 'number' ? entry.data : 0;
          for (let bit = 0; bit < 32; bit++) {
            if (((data >> bit) & 1) === 1) {
              unlocked.add(`${statid}:${bit}`);
            }
          }
        }
        return unlocked;
      } catch (_) {
        return new Set();
      }
    };

    if (binFile && fs.existsSync(binFile)) {
      lastMtime = fs.statSync(binFile).mtimeMs;
      knownUnlockedBits = readCurrentUnlocked();
    }

    pollTimer = setInterval(() => {
      if (!binFile || !fs.existsSync(binFile)) return;

      try {
        const currentMtime = fs.statSync(binFile).mtimeMs;
        if (currentMtime === lastMtime) return;
        lastMtime = currentMtime;

        if (!schemaLoaded) loadSchema();

        const currentUnlocked = readCurrentUnlocked();
        const newBits = [...currentUnlocked].filter(k => !knownUnlockedBits.has(k));

        if (newBits.length > 0) {
          for (const key of newBits) {
            const [statid, bitStr] = key.split(':');
            const bit = Number(bitStr);
            const info = schemaMap.get(bit) || {
              apiName: `ach_${bit}`,
              name: 'Logro Desbloqueado',
              description: '',
              icon: null,
            };

            this.enqueueTrophy({
              apiName: info.apiName,
              name: info.name,
              category: 'Trofeo Desbloqueado',
              description: info.description,
              icon: info.icon,
              rarity: 'gold',
            }, gameInfo);
          }

          knownUnlockedBits = currentUnlocked;
        }
      } catch (err) {
        console.warn('[AchievementNotifier] Error en poller Steam binario:', err.message);
      }
    }, 250);

    this.activeWatchers.set(id, {
      type: 'steam',
      cleanup: () => clearInterval(pollTimer),
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MOTOR 2: RETROACHIEVEMENTS EN VIVO
  // ════════════════════════════════════════════════════════════════════════════
  startRetroAchievementsWatcher(id, gameTitle, gamePlatform, creds, gameInfo) {
    this.stopWatcher(id);

    const candidates = [
      path.join(process.env.APPDATA || '', 'RetroArch', 'retroarch.log'),
      path.join(process.env.LOCALAPPDATA || '', 'RetroArch', 'retroarch.log'),
      path.join(process.env.USERPROFILE || '', 'Documents', 'PCSX2', 'logs', 'emulog.txt'),
      path.join(process.env.USERPROFILE || '', 'Documents', 'DuckStation', 'duckstation.log'),
      path.join(process.env.USERPROFILE || '', 'Documents', 'Dolphin Emulator', 'Logs', 'dolphin.log'),
      path.join(process.env.USERPROFILE || '', 'Documents', 'PPSSPP', 'SYSTEM', 'logs', 'ppsspp.log'),
    ];

    let logFile = candidates.find(p => fs.existsSync(p));
    let lastOffset = 0;

    if (logFile) {
      try { lastOffset = fs.statSync(logFile).size; } catch (_) { }
    }

    const retroService = require('../retroAchievements.js');
    let gameAchievements = new Map();

    if (creds?.raUser && creds?.raApiKey) {
      retroService.fetchRetroAchievements(gameTitle, gamePlatform, creds.raUser, creds.raApiKey)
        .then((summary) => {
          if (summary && summary.achievements) {
            for (const ach of summary.achievements) {
              gameAchievements.set(String(ach.apiName), ach);
            }
          }
        })
        .catch(() => { });
    }

    const pollTimer = setInterval(() => {
      if (!logFile) {
        logFile = candidates.find(p => fs.existsSync(p));
        if (logFile) {
          try { lastOffset = fs.statSync(logFile).size; } catch (_) { }
        }
        return;
      }

      try {
        const stats = fs.statSync(logFile);
        if (stats.size <= lastOffset) {
          if (stats.size < lastOffset) lastOffset = 0;
          return;
        }

        const stream = fs.createReadStream(logFile, { start: lastOffset, end: stats.size });
        let chunk = '';
        stream.on('data', d => { chunk += d.toString('utf8'); });
        stream.on('end', () => {
          lastOffset = stats.size;
          const lines = chunk.split('\n');
          for (const line of lines) {
            const match = line.match(/Awarding achievement\s+(\d+)/i) ||
                          line.match(/Awarded achievement\s+(\d+)/i) ||
                          line.match(/Achievement\s+(\d+)\s+unlocked/i);

            if (match) {
              const achId = match[1];
              const ach = gameAchievements.get(achId) || {
                apiName: achId,
                name: `Logro #${achId}`,
                category: 'RetroAchievements',
                description: '¡Logro clásico desbloqueado!',
                rarity: 'gold',
                icon: null,
              };

              this.enqueueTrophy(ach, gameInfo);
            }
          }
        });
      } catch (_) { }
    }, 500);

    this.activeWatchers.set(id, {
      type: 'retroachievements',
      cleanup: () => clearInterval(pollTimer),
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MOTOR 3: JUEGOS EXTERNOS (Goldberg, Codex, RPCS3)
  // ════════════════════════════════════════════════════════════════════════════
  startExternalGameWatcher(id, appId, installDir, extraOpts = {}, gameInfo = {}) {
    this.stopWatcher(id);

    const achievementReader = require('../achievementReader.js');
    const candidateFiles = [];

    if (appId) {
      candidateFiles.push(path.join(process.env.APPDATA || '', 'Goldberg SteamEmu Saves', String(appId), 'achievements.json'));
      candidateFiles.push(path.join(process.env.APPDATA || '', 'Steam', 'CODEX', String(appId), 'achievements.ini'));
    }

    if (installDir) {
      candidateFiles.push(path.join(installDir, 'steam_settings', 'achievements.json'));
      candidateFiles.push(path.join(installDir, 'achievements.json'));
    }

    let watchedFile = candidateFiles.find(p => fs.existsSync(p));
    let lastMtime = watchedFile ? fs.statSync(watchedFile).mtimeMs : 0;
    let knownUnlockedNames = new Set();

    achievementReader.scanExternalAchievements(appId, null, 'spanish')
      .then((summary) => {
        if (summary && summary.achievements) {
          for (const a of summary.achievements) {
            if (a.achieved) knownUnlockedNames.add(a.apiName);
          }
        }
      })
      .catch(() => { });

    const pollTimer = setInterval(async () => {
      if (!watchedFile) {
        watchedFile = candidateFiles.find(p => fs.existsSync(p));
        if (watchedFile) lastMtime = fs.statSync(watchedFile).mtimeMs;
        return;
      }

      try {
        const mtime = fs.statSync(watchedFile).mtimeMs;
        if (mtime === lastMtime) return;
        lastMtime = mtime;

        const summary = await achievementReader.scanExternalAchievements(appId, null, 'spanish');
        if (!summary || !summary.achievements) return;

        for (const ach of summary.achievements) {
          if (ach.achieved && !knownUnlockedNames.has(ach.apiName)) {
            knownUnlockedNames.add(ach.apiName);
            this.enqueueTrophy(ach, gameInfo);
          }
        }
      } catch (_) { }
    }, 1000);

    this.activeWatchers.set(id, {
      type: 'external',
      cleanup: () => clearInterval(pollTimer),
    });
  }

  stopWatcher(id) {
    const watcher = this.activeWatchers.get(id);
    if (watcher) {
      try { watcher.cleanup(); } catch (_) { }
      this.activeWatchers.delete(id);
    }
  }

  stopAllWatchers() {
    for (const [id] of this.activeWatchers) {
      this.stopWatcher(id);
    }
  }
}

module.exports = new AchievementNotifierService();
