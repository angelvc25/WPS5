import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { soundService } from '../services/soundService';
import {
  EMULATORS,
  checkBiosFolder,
  detectEmulatorExe,
  emptyEmulatorConfig,
  formatBytes,
  importRomsToLauncher,
  isEmulatorReady,
  pickEmulatorExe,
  pickFolder,
  romDisplayName,
  scanRomFolders,
  type EmulatorConfig,
  type EmulatorDef,
  type RomFolderStat,
  type ScannedRom,
} from '../services/emulationService';
import type { UserProfile } from './UserSelectScreen';

interface EmulationViewProps {
  activeUser: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  libraryGames: any[];
  onBack: () => void;
  onGamesImported?: () => void;
}

function formatLastScan(t: (key: any, params?: any) => string, timestamp: number | null): string {
  if (!timestamp) return t('emu.neverScanned');
  const diffMin = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  let time: string;
  if (diffMin < 1) time = t('emu.justNow');
  else if (diffMin < 60) time = t('emu.minutesAgo', { n: diffMin });
  else if (diffMin < 60 * 24) time = t('emu.hoursAgo', { n: Math.round(diffMin / 60) });
  else time = t('emu.daysAgo', { n: Math.round(diffMin / (60 * 24)) });
  return t('emu.lastScan', { time });
}

export const EmulationView = ({ activeUser, updateUser, libraryGames, onBack, onGamesImported }: EmulationViewProps) => {
  const { t, language } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = Math.min(Math.max(Math.max(windowWidth / 1920, windowHeight / 1080), 0.6), 1.25);
  const s = (v: number) => Math.round(v * scale);

  const configs: Record<string, EmulatorConfig> = (activeUser?.settings as any)?.emulators || {};
  const [cardFocusIndex, setCardFocusIndex] = useState(0);

  // ── Vista Gestionar (consola ya configurada) ──────────────────────────────
  const [managingConsole, setManagingConsole] = useState<EmulatorDef | null>(null);
  const [manageTab, setManageTab] = useState<'emulator' | 'roms' | 'library'>('emulator');
  const [manageScanning, setManageScanning] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState('');

  const openManage = (def: EmulatorDef) => {
    setManagingConsole(def);
    setManageTab('emulator');
    setLibraryFilter('');
    soundService.playActivation?.();
  };

  const closeManage = () => {
    setManagingConsole(null);
    soundService.playBack?.();
  };

  // ── Wizard (solo primera configuración) ───────────────────────────────────
  const [wizardConsole, setWizardConsole] = useState<EmulatorDef | null>(null);
  const [wizardStep, setWizardStep] = useState(0); // 0 exe · 1 bios · 2 roms · 3 fin
  const [exePath, setExePath] = useState<string | null>(null);
  const [detectingExe, setDetectingExe] = useState(false);
  const [biosPath, setBiosPath] = useState<string | null>(null);
  const [biosDetected, setBiosDetected] = useState(false);
  const [checkingBios, setCheckingBios] = useState(false);
  const [romPaths, setRomPaths] = useState<string[]>([]);
  const [scannedRoms, setScannedRoms] = useState<ScannedRom[]>([]);
  const [scanning, setScanning] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const stepsFor = (def: EmulatorDef) => (def.biosPatterns?.length ? [0, 1, 2, 3] : [0, 2, 3]);
  const stepIndex = wizardConsole ? stepsFor(wizardConsole).indexOf(wizardStep) : 0;
  const stepCount = wizardConsole ? stepsFor(wizardConsole).length : 0;

  const openWizard = (def: EmulatorDef) => {
    const cfg = configs[def.id] || emptyEmulatorConfig();
    setWizardConsole(def);
    setExePath(cfg.exePath);
    setBiosPath(cfg.biosPath);
    setBiosDetected(cfg.biosDetected);
    // Sana configs viejas: si se perdieron las carpetas, se recuperan de los stats.
    const folders = (cfg.romPaths || []).length > 0 ? cfg.romPaths : Object.keys(cfg.romFolderStats || {});
    setRomPaths(folders);
    setScannedRoms([]);
    setImportedCount(0);
    setWizardStep(0);
    soundService.playActivation?.();
  };

  const closeWizard = () => {
    setWizardConsole(null);
    soundService.playBack?.();
  };

  const persistConfig = (def: EmulatorDef, partial: Partial<EmulatorConfig>) => {
    const current = configs[def.id] || emptyEmulatorConfig();
    updateUser({
      settings: {
        ...activeUser?.settings,
        emulators: { ...configs, [def.id]: { ...current, ...partial } },
      } as any,
    });
  };

  // Detección automática del ejecutable al entrar al paso 0.
  useEffect(() => {
    if (!wizardConsole || wizardStep !== 0 || exePath) return;
    let cancelled = false;
    setDetectingExe(true);
    detectEmulatorExe(wizardConsole).then((found) => {
      if (cancelled) return;
      setDetectingExe(false);
      if (found) setExePath(found);
    });
    return () => {
      cancelled = true;
    };
  }, [wizardConsole, wizardStep]);

  const goNext = () => {
    if (!wizardConsole) return;
    const steps = stepsFor(wizardConsole);
    const idx = steps.indexOf(wizardStep);
    if (idx < steps.length - 1) {
      setWizardStep(steps[idx + 1]);
      soundService.playNavigation();
    }
  };

  const goBackStep = () => {
    if (!wizardConsole) return;
    const steps = stepsFor(wizardConsole);
    const idx = steps.indexOf(wizardStep);
    if (idx > 0) {
      setWizardStep(steps[idx - 1]);
      soundService.playBack?.();
    } else {
      closeWizard();
    }
  };

  const handlePickExe = async () => {
    const picked = await pickEmulatorExe();
    if (picked) {
      setExePath(picked);
      soundService.playActivation?.();
    }
  };

  const handlePickBios = async () => {
    const picked = await pickFolder();
    if (picked && wizardConsole?.biosPatterns) {
      setBiosPath(picked);
      setCheckingBios(true);
      const check = await checkBiosFolder(picked, wizardConsole.biosPatterns);
      setCheckingBios(false);
      setBiosDetected(check.found);
      soundService.playActivation?.();
    }
  };

  const handleRecheckBios = async () => {
    if (!biosPath || !wizardConsole?.biosPatterns) return;
    setCheckingBios(true);
    const check = await checkBiosFolder(biosPath, wizardConsole.biosPatterns);
    setCheckingBios(false);
    setBiosDetected(check.found);
    soundService.playNavigation();
  };

  const handleAddRomFolder = async () => {
    const picked = await pickFolder();
    if (picked && !romPaths.some((p) => p.toLowerCase() === picked.toLowerCase())) {
      setRomPaths((prev) => [...prev, picked]);
      soundService.playActivation?.();
    }
  };

  const handleScanRoms = async () => {
    if (!wizardConsole || romPaths.length === 0) return;
    setScanning(true);
    const result = await scanRomFolders(wizardConsole, romPaths);
    setScanning(false);
    setScannedRoms(result.roms);
    soundService.playActivation?.();
  };

  const handleFinish = async () => {
    if (!wizardConsole || !exePath || finishing) return;
    setFinishing(true);
    // Si no se escaneó en este paso, escanear ahora.
    let roms = scannedRoms;
    if (romPaths.length > 0 && roms.length === 0) {
      const result = await scanRomFolders(wizardConsole, romPaths);
      roms = result.roms;
      setScannedRoms(roms);
    }
    const { added } = await rescanAndImport(wizardConsole, exePath, romPaths, {
      exePath,
      biosPath,
      biosDetected,
      romPaths,
    });
    setImportedCount(added);
    setFinishing(false);
    setWizardStep(3);
    soundService.playActivation?.();
  };

  /**
   * Reescanea carpetas, actualiza stats/ROMs en la config e importa al
   * launcher solo las ROMs nuevas. Hace UNA sola escritura de settings
   * (con `extra` para datos del wizard) para no pisar cambios con closures
   * obsoletos. Usado por el wizard y por Gestionar.
   */
  const rescanAndImport = async (
    def: EmulatorDef,
    exePath: string,
    folders: string[],
    extra?: Partial<EmulatorConfig>,
  ) => {
    const stats: Record<string, RomFolderStat> = {};
    const seen = new Set<string>();
    const allRoms: ScannedRom[] = [];
    for (const folder of folders) {
      const result = await scanRomFolders(def, [folder]);
      const fresh = result.roms.filter((r) => {
        const key = r.path.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      stats[folder] = {
        count: fresh.length,
        scannedAt: Date.now(),
        sizeBytes: fresh.reduce((acc, r) => acc + (r.size || 0), 0),
      };
      allRoms.push(...fresh);
    }
    const cfg = { ...(configs[def.id] || emptyEmulatorConfig()), ...(extra || {}) };
    // Rutas ya presentes: path del juego, launchArgs completo y cada ruta
    // entrecomillada dentro de launchArgs (los juegos de emulador guardan
    // el exe en `path` y la ROM citada en `launchArgs`).
    const existingPaths = new Set<string>();
    const addVariant = (p: unknown) => {
      const raw = String(p || '');
      if (!raw) return;
      existingPaths.add(raw.toLowerCase());
      const quoted = raw.match(/"([^"]+)"/g);
      if (quoted) quoted.forEach((q) => existingPaths.add(q.replace(/"/g, '').toLowerCase()));
    };
    for (const game of libraryGames || []) {
      addVariant((game as any)?.path);
      addVariant((game as any)?.launchArgs);
    }
    // El historial solo cuenta si el juego sigue en la librería: si el
    // usuario lo borró, el reescaneo debe volver a añadirlo.
    const liveAddedPaths = (cfg.addedPaths || []).filter((p) => existingPaths.has(p.toLowerCase()));
    for (const p of liveAddedPaths) existingPaths.add(p.toLowerCase());

    const { added, addedPaths } = await importRomsToLauncher(
      def, exePath, allRoms, existingPaths, { language, rawPrefs: activeUser?.settings?.syncPreferences },
    );
    const nextEmulators = {
      ...configs,
      [def.id]: {
        ...cfg,
        exePath,
        romFolderStats: stats,
        roms: allRoms.map((r) => ({ name: r.name, path: r.path, size: r.size || 0 })),
        gameCount: allRoms.length,
        lastScanAt: Date.now(),
        addedPaths: [...liveAddedPaths, ...addedPaths],
      },
    };
    const nextSettings: any = { ...activeUser?.settings, emulators: nextEmulators };
    // Para PS3, la carpeta del emulador alimenta también los trofeos RPCS3.
    if (def.id === 'ps3') {
      nextSettings.rpcs3Path = exePath.replace(/[/\\][^/\\]+$/, '');
    }
    updateUser({ settings: nextSettings });
    if (added > 0) onGamesImported?.();
    return { roms: allRoms, added };
  };

  // ── Acciones de Gestionar ─────────────────────────────────────────────────
  const handleManageRedetectExe = async (def: EmulatorDef) => {
    const found = await detectEmulatorExe(def);
    if (found) {
      persistConfig(def, { exePath: found });
      soundService.playActivation?.();
    } else {
      soundService.playBack?.();
    }
  };

  const handleManageBrowseExe = async (def: EmulatorDef) => {
    const picked = await pickEmulatorExe();
    if (picked) {
      persistConfig(def, { exePath: picked });
      soundService.playActivation?.();
    }
  };

  const handleManageBrowseBios = async (def: EmulatorDef) => {
    if (!def.biosPatterns) return;
    const picked = await pickFolder();
    if (picked) {
      const check = await checkBiosFolder(picked, def.biosPatterns);
      persistConfig(def, { biosPath: picked, biosDetected: check.found });
      soundService.playActivation?.();
    }
  };

  const handleManageRecheckBios = async (def: EmulatorDef) => {
    const cfg = configs[def.id];
    if (!cfg?.biosPath || !def.biosPatterns) return;
    const check = await checkBiosFolder(cfg.biosPath, def.biosPatterns);
    persistConfig(def, { biosDetected: check.found });
    soundService.playNavigation();
  };

  const handleManageAddRomFolder = async (def: EmulatorDef) => {
    const picked = await pickFolder();
    if (!picked) return;
    const cfg = configs[def.id] || emptyEmulatorConfig();
    if ((cfg.romPaths || []).some((p) => p.toLowerCase() === picked.toLowerCase())) return;
    persistConfig(def, { romPaths: [...(cfg.romPaths || []), picked] });
    soundService.playActivation?.();
  };

  const handleManageRemoveRomFolder = (def: EmulatorDef, folder: string) => {
    const cfg = configs[def.id] || emptyEmulatorConfig();
    persistConfig(def, { romPaths: (cfg.romPaths || []).filter((p) => p !== folder) });
    soundService.playBack?.();
  };

  const handleManageRescan = async (def: EmulatorDef) => {
    const cfg = configs[def.id];
    if (!cfg?.exePath || manageScanning) return;
    setManageScanning(true);
    await rescanAndImport(def, cfg.exePath, cfg.romPaths || []);
    setManageScanning(false);
    soundService.playActivation?.();
  };

  // Configs creadas antes del catálogo (gameCount>0 pero sin roms guardadas):
  // al abrir Gestionar se reescanea una vez para poblar la pestaña Biblioteca.
  const autoRescannedRef = React.useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!managingConsole || wizardConsole || manageScanning) return;
    const cfg = configs[managingConsole.id];
    if (!cfg?.exePath || (cfg.romPaths || []).length === 0) return;
    if ((cfg.roms || []).length > 0) return;
    if (autoRescannedRef.current[managingConsole.id]) return;
    autoRescannedRef.current[managingConsole.id] = true;
    handleManageRescan(managingConsole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managingConsole, wizardConsole, configs]);

  const handleRemoveEmulator = (def: EmulatorDef) => {
    persistConfig(def, { ...emptyEmulatorConfig() });
    closeManage();
  };

  // ── Teclado/mando en la grilla de consolas ────────────────────────────────
  useEffect(() => {
    if (wizardConsole || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (managingConsole) {
        if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          closeManage();
        }
        return;
      }
      const cols = windowWidth > 1400 ? 3 : 2;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCardFocusIndex((prev) => Math.min(prev + 1, EMULATORS.length - 1));
        soundService.playNavigation();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCardFocusIndex((prev) => Math.max(prev - 1, 0));
        soundService.playNavigation();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCardFocusIndex((prev) => Math.min(prev + cols, EMULATORS.length - 1));
        soundService.playNavigation();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCardFocusIndex((prev) => Math.max(prev - cols, 0));
        soundService.playNavigation();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openWizard(EMULATORS[cardFocusIndex]);
      } else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardConsole, managingConsole, cardFocusIndex, windowWidth]);

  const shortPath = (p: string | null) => {
    if (!p) return '';
    return p.length > 64 ? `…${p.slice(-63)}` : p;
  };

  const renderStepDots = () => (
    <View style={styles.dotsRow}>
      {Array.from({ length: stepCount }).map((_, idx) => (
        <View key={idx} style={[styles.dot, idx === stepIndex && styles.dotActive]} />
      ))}
    </View>
  );

  const renderExeStep = (def: EmulatorDef) => (
    <View>
      <Text style={[styles.modalTitle, { fontSize: s(20) }]}>
        {t('emu.stepExe', { emulator: def.emulatorName })}
      </Text>
      <Text style={[styles.modalDesc, { fontSize: s(14) }]}>
        {t('emu.stepExeDesc', { emulator: def.emulatorName })}
      </Text>

      <View style={styles.statusBox}>
        {detectingExe ? (
          <Text style={styles.statusText}>{t('emu.detecting')}</Text>
        ) : exePath ? (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={s(26)} color="#4CAF50" />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {t('emu.exeFound', { emulator: def.emulatorName })}
              </Text>
              <Text style={styles.statusPath} numberOfLines={2}>{exePath}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <Ionicons name="warning" size={s(26)} color="#FFB300" />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>
                {t('emu.exeNotFound', { emulator: def.emulatorName })}
              </Text>
              <Text style={styles.statusText}>{t('emu.exeNotFoundDesc')}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.linkRow}>
        <TouchableOpacity onPress={handlePickExe}>
          <Text style={styles.linkText}>
            <Text style={styles.linkDim}>{t('emu.notCorrect')} </Text>
            {t('emu.browseManually')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(def.downloadUrl)}>
          <Text style={styles.linkText}>⭳ {t('emu.noEmulator', { emulator: def.emulatorName })}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBiosStep = (def: EmulatorDef) => (
    <View>
      <Text style={[styles.modalTitle, { fontSize: s(20) }]}>
        {t('emu.stepBios', { name: def.name })}
      </Text>
      <Text style={[styles.modalDesc, { fontSize: s(14) }]}>{t('emu.stepBiosDesc')}</Text>

      <View style={styles.statusBox}>
        <View style={styles.instructionRow}>
          <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
          <Text style={styles.statusText}>{t('emu.biosStep1')}</Text>
        </View>
        <View style={styles.instructionRow}>
          <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
          <Text style={styles.statusText}>{t('emu.biosStep2', { emulator: def.emulatorName })}</Text>
        </View>
      </View>

      <View style={styles.folderRow}>
        <Text style={styles.folderPath} numberOfLines={1}>
          {biosPath ? shortPath(biosPath) : t('emu.biosNone')}
        </Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={handlePickBios}>
          <Ionicons name="folder-open-outline" size={s(16)} color="#FFF" />
          <Text style={styles.secondaryBtnText}>{t('emu.biosSelect')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusBox}>
        <View style={styles.statusRow}>
          <Ionicons
            name={biosDetected ? 'checkmark-circle' : 'time-outline'}
            size={s(26)}
            color={biosDetected ? '#4CAF50' : 'rgba(255,255,255,0.4)'}
          />
          <Text style={styles.statusTitle}>
            {checkingBios ? t('emu.checking') : biosDetected ? t('emu.biosFound') : t('emu.biosNotFound')}
          </Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleRecheckBios} disabled={checkingBios || !biosPath}>
            <Ionicons name="refresh" size={s(16)} color="#FFF" />
            <Text style={styles.secondaryBtnText}>{t('emu.biosRecheck')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderRomsStep = (def: EmulatorDef) => (
    <View>
      <Text style={[styles.modalTitle, { fontSize: s(20) }]}>
        {t('emu.stepRoms', { name: def.name })}
      </Text>
      <Text style={[styles.modalDesc, { fontSize: s(14) }]}>{t('emu.stepRomsDesc', { name: def.name })}</Text>

      <View style={styles.statusBox}>
        {romPaths.length === 0 ? (
          <View>
            <Text style={styles.statusTitle}>{t('emu.romsNone')}</Text>
            <Text style={styles.statusText}>{t('emu.romsNoneDesc', { name: def.name })}</Text>
          </View>
        ) : (
          romPaths.map((p) => (
            <View key={p} style={styles.romPathRow}>
              <Text style={styles.folderPath} numberOfLines={1}>{shortPath(p)}</Text>
              <TouchableOpacity onPress={() => setRomPaths((prev) => prev.filter((x) => x !== p))}>
                <Ionicons name="trash-outline" size={s(18)} color="#FF8899" />
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={styles.scanRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleAddRomFolder}>
            <Ionicons name="folder-open-outline" size={s(16)} color="#FFF" />
            <Text style={styles.secondaryBtnText}>{t('emu.browse')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, (scanning || romPaths.length === 0) && styles.btnDisabled]}
            onPress={handleScanRoms}
            disabled={scanning || romPaths.length === 0}
          >
            <Ionicons name="search" size={s(16)} color="#FFF" />
            <Text style={styles.secondaryBtnText}>
              {scanning ? t('emu.scanning') : t('emu.scanNow', { count: scannedRoms.length })}
            </Text>
          </TouchableOpacity>
        </View>
        {scannedRoms.length > 0 && (
          <Text style={styles.statusText}>
            {t('emu.scannedCount', { count: scannedRoms.length })}
          </Text>
        )}
      </View>

      <TouchableOpacity onPress={handleAddRomFolder}>
        <Text style={styles.linkText}>+ {t('emu.addFolder')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFinishStep = (def: EmulatorDef) => (
    <View style={styles.finishWrap}>
      <View style={styles.finishCheck}>
        <Ionicons name="checkmark" size={s(34)} color="#FFF" />
      </View>
      <Text style={[styles.modalTitle, { fontSize: s(22), textAlign: 'center' }]}>
        {t('emu.finishTitle', { name: def.name })}
      </Text>
      <Text style={[styles.modalDesc, { fontSize: s(14), textAlign: 'center' }]}>
        {t('emu.finishDesc', { count: importedCount })}
      </Text>
      <View style={styles.finishBtns}>
        <TouchableOpacity style={styles.primaryBtn} onPress={closeWizard}>
          <Text style={styles.primaryBtnText}>{t('emu.exploreGames')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => {
            if (wizardConsole) {
              const def = wizardConsole;
              closeWizard();
              openManage(def);
            }
          }}
        >
          <Text style={styles.secondaryBtnText}>{t('emu.manageEmulator')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Vista Gestionar ───────────────────────────────────────────────────────
  const renderManageView = () => {
    const def = managingConsole;
    if (!def) return null;
    const cfg = configs[def.id] || emptyEmulatorConfig();
    const roms = cfg.roms || [];
    const stats = cfg.romFolderStats || {};
    const totalSize = roms.reduce((acc, r) => acc + (r.size || 0), 0);
    const query = libraryFilter.trim().toLowerCase();
    const visibleRoms = query
      ? roms.filter((r) => romDisplayName(r.name).toLowerCase().includes(query))
      : roms;
    const tabs = [
      { id: 'emulator', label: t('emu.tabEmulator') },
      { id: 'roms', label: t('emu.tabRoms') },
      { id: 'library', label: t('emu.tabLibrary') },
    ] as const;

    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={styles.crumbs} onPress={closeManage}>
          <Ionicons name="chevron-back" size={s(16)} color="rgba(255,255,255,0.6)" />
          <Text style={styles.crumbsText}>{t('emu.title')}</Text>
        </TouchableOpacity>

        <View style={styles.manageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.manageTitle, { fontSize: s(30) }]}>{def.name}</Text>
            <Text style={[styles.manageSub, { fontSize: s(13) }]}>
              <Text style={styles.manageSubStrong}>{t('emu.exeDetected', { emulator: def.emulatorName })} </Text>
              <Text style={styles.manageSubDim}>• {t('emu.gamesFoundCount', { count: cfg.gameCount ?? 0 })}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, manageScanning && styles.btnDisabled]}
            onPress={() => handleManageRescan(def)}
            disabled={manageScanning}
          >
            <Text style={styles.primaryBtnText}>
              {manageScanning ? t('emu.scanning') : `⟳ ${t('emu.rescanLibrary')}`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabsRow}>
          {tabs.map((tab) => (
            <TouchableOpacity key={tab.id} onPress={() => { setManageTab(tab.id); soundService.playNavigation(); }}>
              <Text style={[styles.tabText, manageTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {manageTab === tab.id && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {manageTab === 'emulator' && (
            <View>
              <View style={styles.sectionHeadRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { fontSize: s(18) }]}>{t('emu.exeRoute')}</Text>
                  <Text style={[styles.sectionDesc, { fontSize: s(13) }]}>{t('emu.exeRouteDesc')}</Text>
                </View>
                <View style={styles.chip}>
                  <Ionicons name="checkmark-circle" size={s(14)} color="#4CAF50" />
                  <Text style={styles.chipText}>{t('emu.synced')}</Text>
                </View>
              </View>
              <View style={styles.pathBox}>
                <Text style={styles.pathText} numberOfLines={1}>{cfg.exePath || '—'}</Text>
              </View>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleManageRedetectExe(def)}>
                  <Ionicons name="refresh" size={s(15)} color="#FFF" />
                  <Text style={styles.secondaryBtnText}>{t('emu.redetect')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleManageBrowseExe(def)}>
                  <Ionicons name="folder-open-outline" size={s(15)} color="#FFF" />
                  <Text style={styles.secondaryBtnText}>{t('emu.browse')}</Text>
                </TouchableOpacity>
              </View>

              {def.biosPatterns && def.biosPatterns.length > 0 && (
                <View style={{ marginTop: s(24) }}>
                  <View style={styles.sectionHeadRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sectionTitle, { fontSize: s(18) }]}>BIOS</Text>
                      <Text style={[styles.sectionDesc, { fontSize: s(13) }]}>
                        {t('emu.biosManageDesc', { emulator: def.emulatorName })}
                      </Text>
                    </View>
                    {cfg.biosDetected && (
                      <View style={styles.chip}>
                        <Ionicons name="checkmark-circle" size={s(14)} color="#4CAF50" />
                        <Text style={styles.chipText}>{t('emu.biosFound')}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.pathBox}>
                    <Text style={styles.pathText} numberOfLines={1}>{cfg.biosPath || t('emu.biosNone')}</Text>
                  </View>
                  <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleManageRecheckBios(def)}>
                      <Ionicons name="refresh" size={s(15)} color="#FFF" />
                      <Text style={styles.secondaryBtnText}>{t('emu.redetect')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleManageBrowseBios(def)}>
                      <Ionicons name="folder-open-outline" size={s(15)} color="#FFF" />
                      <Text style={styles.secondaryBtnText}>{t('emu.browse')}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.sectionDesc, { fontSize: s(12), marginTop: s(10) }]}>
                    {t('emu.biosManagedNote', { emulator: def.emulatorName })}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.dangerRow} onPress={() => handleRemoveEmulator(def)}>
                <Ionicons name="trash-outline" size={s(16)} color="rgba(255,255,255,0.6)" />
                <Text style={styles.dangerText}>{t('emu.removeEmulator')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {manageTab === 'roms' && (
            <View>
              <View style={styles.sectionHeadRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { fontSize: s(18) }]}>{t('emu.romFoldersTitle')}</Text>
                  <Text style={[styles.sectionDesc, { fontSize: s(13) }]}>{t('emu.romFoldersDesc')}</Text>
                </View>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleManageAddRomFolder(def)}>
                  <Text style={styles.secondaryBtnText}>+ {t('emu.addFolderShort')}</Text>
                </TouchableOpacity>
              </View>

              {(cfg.romPaths || []).length === 0 && (
                <Text style={[styles.sectionDesc, { fontSize: s(13) }]}>{t('emu.romsNone')}</Text>
              )}
              {(cfg.romPaths || []).map((p) => {
                const stat = stats[p];
                return (
                  <View key={p} style={styles.folderCard}>
                    <Ionicons name="folder-outline" size={s(26)} color="rgba(255,255,255,0.8)" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.folderCardPath} numberOfLines={1}>{p}</Text>
                      <Text style={styles.folderCardSub}>
                        {t('emu.gamesInFolder', { count: stat?.count ?? 0 })} • {formatLastScan(t, stat?.scannedAt ?? null)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleManageRemoveRomFolder(def, p)}>
                      <Ionicons name="close" size={s(18)} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {manageTab === 'library' && (
            <View>
              <View style={styles.sectionHeadRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { fontSize: s(18) }]}>{t('emu.libraryTitle')}</Text>
                  <Text style={[styles.sectionDesc, { fontSize: s(13) }]}>{t('emu.libraryDesc', { name: def.name })}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.secondaryBtn, manageScanning && styles.btnDisabled]}
                  onPress={() => handleManageRescan(def)}
                  disabled={manageScanning}
                >
                  <Ionicons name="refresh" size={s(15)} color="#FFF" />
                  <Text style={styles.secondaryBtnText}>{manageScanning ? t('emu.scanning') : t('emu.rescan')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.statRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>🎮 {t('emu.statGames')}</Text>
                  <Text style={[styles.statValue, { fontSize: s(30) }]}>{roms.length}</Text>
                  <Text style={styles.statSub}>{t('emu.statGamesDesc', { name: def.name })}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>📦 {t('emu.statStorage')}</Text>
                  <Text style={[styles.statValue, { fontSize: s(30) }]}>{formatBytes(totalSize)}</Text>
                  <Text style={styles.statSub}>
                    {t('emu.statStorageDesc', { files: roms.length, folders: (cfg.romPaths || []).length })}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>🕐 {t('emu.statLastScan')}</Text>
                  <Text style={[styles.statValue, { fontSize: s(26) }]}>
                    {cfg.lastScanAt ? formatLastScan(t, cfg.lastScanAt).replace(/^.*hace |^.*ago |^.*há /i, '') : '—'}
                  </Text>
                  <Text style={styles.statSub}>{t('emu.statAllCounted')}</Text>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { fontSize: s(18), marginTop: s(20) }]}>{t('emu.romsDetected')}</Text>
              <Text style={[styles.sectionDesc, { fontSize: s(13), marginBottom: s(10) }]}>
                {t('emu.romsDetectedDesc', { name: def.name })}
              </Text>

              <View style={styles.searchBox}>
                <Ionicons name="search" size={s(16)} color="rgba(255,255,255,0.5)" />
                {/* @ts-ignore - RN Web input */}
                <input
                  value={libraryFilter}
                  onChange={(e: any) => setLibraryFilter(e.target.value)}
                  placeholder={t('emu.searchGames') as string}
                  style={styles.searchInput as any}
                />
              </View>

              {visibleRoms.length === 0 && (
                <Text style={[styles.sectionDesc, { fontSize: s(13) }]}>{t('emu.noRomsYet')}</Text>
              )}
              {visibleRoms.map((rom) => (
                <View key={rom.path} style={styles.romRow}>
                  <Ionicons name="game-controller-outline" size={s(22)} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.romName} numberOfLines={1}>{romDisplayName(rom.name)}</Text>
                  <View style={styles.romDots} />
                  <Text style={styles.romSize}>{formatBytes(rom.size || 0)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.contentWrapper}>
      <View style={styles.subScreenHeader}>
        <TouchableOpacity style={styles.backButtonInline} onPress={onBack}>
          <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.subScreenHeaderTitle}>{t('emu.title')}</Text>
      </View>
      <Text style={[styles.subtitle, { fontSize: s(15) }]}>{t('emu.subtitle')}</Text>

      {managingConsole && !wizardConsole ? (
        renderManageView()
      ) : (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
        {EMULATORS.map((def, idx) => {
          const cfg = configs[def.id];
          const ready = isEmulatorReady(cfg);
          const focused = !wizardConsole && cardFocusIndex === idx;
          return (
            <TouchableOpacity
              key={def.id}
              style={[styles.card, focused && styles.cardFocused]}
              activeOpacity={0.85}
              onPress={() => {
                setCardFocusIndex(idx);
                if (ready) openManage(def);
                else openWizard(def);
              }}
            >
              <View style={styles.cardIcon}>
                <Ionicons name="game-controller" size={s(44)} color="rgba(255,255,255,0.9)" />
              </View>
              <Text style={[styles.cardTitle, { fontSize: s(22) }]}>{def.name}</Text>
              <Text style={[styles.cardSub, { fontSize: s(13) }]}>{def.emulatorName}</Text>

              {!ready ? (
                <View style={styles.warnBox}>
                  <Text style={styles.warnTitle}>
                    <Ionicons name="warning-outline" size={s(14)} color="#FFB300" /> {t('emu.configRequired')}
                  </Text>
                  <Text style={[styles.warnDesc, { fontSize: s(12) }]}>
                    {t('emu.configRequiredDesc', { name: def.name })}
                  </Text>
                </View>
              ) : (
                <View style={styles.readyBox}>
                  <Text style={styles.readyCount}>
                    <Text style={[styles.readyNumber, { fontSize: s(30) }]}>{cfg?.gameCount ?? 0}</Text>
                    {' '}{t('emu.gamesFound')}
                  </Text>
                  <Text style={[styles.readySub, { fontSize: s(12) }]}>
                    {formatLastScan(t, cfg?.lastScanAt ?? null)}
                  </Text>
                </View>
              )}

              <View style={styles.cardFooter}>
                <View style={styles.statusPill}>
                  <View style={[styles.dot, ready ? styles.dotReady : styles.dotPending]} />
                  <Text style={[styles.statusPillText, { fontSize: s(12) }]}>
                    {ready ? t('emu.readyToPlay') : t('emu.needsSetup')}
                  </Text>
                </View>
                <View style={styles.manageRow}>
                  <Ionicons name="settings-outline" size={s(15)} color="rgba(255,255,255,0.8)" />
                  <Text style={[styles.manageText, { fontSize: s(13) }]}>
                    {ready ? t('emu.manage') : t('emu.configure')}
                  </Text>
                  <Ionicons name="chevron-forward" size={s(15)} color="rgba(255,255,255,0.8)" />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      )}

      {/* Wizard modal */}
      <Modal visible={!!wizardConsole} transparent animationType="fade" onRequestClose={closeWizard}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { width: Math.min(windowWidth * 0.6, 680) }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalHeaderTitle, { fontSize: s(16) }]}>
                {wizardConsole ? t('emu.wizardTitle', { name: wizardConsole.name }) : ''}
              </Text>
              <TouchableOpacity onPress={closeWizard}>
                <Ionicons name="close" size={s(22)} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: s(24) }}>
              {wizardConsole && wizardStep === 0 && renderExeStep(wizardConsole)}
              {wizardConsole && wizardStep === 1 && renderBiosStep(wizardConsole)}
              {wizardConsole && wizardStep === 2 && renderRomsStep(wizardConsole)}
              {wizardConsole && wizardStep === 3 && renderFinishStep(wizardConsole)}
            </ScrollView>

            {wizardStep !== 3 && (
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.ghostBtn} onPress={goBackStep}>
                  <Text style={styles.ghostBtnText}>{t('emu.back')}</Text>
                </TouchableOpacity>
                {renderStepDots()}
                {wizardStep === 1 ? (
                  <TouchableOpacity style={styles.ghostBtn} onPress={goNext}>
                    <Text style={styles.ghostBtnText}>{t('emu.skip')}</Text>
                  </TouchableOpacity>
                ) : <View style={{ width: s(70) }} />}
                <TouchableOpacity
                  style={[styles.primaryBtn, ((wizardStep === 0 && !exePath) || finishing) && styles.btnDisabled]}
                  onPress={wizardStep === 2 ? handleFinish : goNext}
                  disabled={(wizardStep === 0 && !exePath) || finishing}
                >
                  <Text style={styles.primaryBtnText}>
                    {wizardStep === 2 ? (finishing ? t('emu.importing') : t('emu.finish')) : t('emu.continue')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {wizardStep === 3 && (
              <View style={[styles.modalFooter, { justifyContent: 'center' }]}>
                {renderStepDots()}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  contentWrapper: { flex: 1 },
  subScreenHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  backButtonInline: { padding: 6 },
  subScreenHeaderTitle: { color: '#FFF', fontSize: 24, fontFamily: 'SSTMedium' },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontFamily: 'SSTLight', marginBottom: 18, marginLeft: 42 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, paddingBottom: 40 },
  card: {
    width: '31%',
    minWidth: 280,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 22,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardFocused: { borderColor: 'rgba(255,255,255,0.9)' },
  cardIcon: { marginBottom: 10 },
  cardTitle: { color: '#FFF', fontFamily: 'SSTBold', fontWeight: '700' },
  cardSub: { color: 'rgba(255,255,255,0.55)', fontFamily: 'SSTLight', marginBottom: 14 },
  warnBox: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12, marginBottom: 14, minHeight: 86 },
  warnTitle: { color: '#FFB300', fontFamily: 'SSTMedium', fontSize: 13, marginBottom: 4 },
  warnDesc: { color: 'rgba(255,255,255,0.55)', fontFamily: 'SSTLight' },
  readyBox: { marginBottom: 14, minHeight: 86 },
  readyCount: { color: 'rgba(255,255,255,0.75)', fontFamily: 'SSTLight' },
  readyNumber: { color: '#FFF', fontFamily: 'SSTLight', fontWeight: '300' },
  readySub: { color: 'rgba(255,255,255,0.4)', fontFamily: 'SSTLight', marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotReady: { backgroundColor: '#4CAF50' },
  dotPending: { backgroundColor: '#FFB300' },
  statusPillText: { color: 'rgba(255,255,255,0.8)', fontFamily: 'SSTLight' },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  manageText: { color: 'rgba(255,255,255,0.8)', fontFamily: 'SSTMedium' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBox: {
    maxHeight: '88%',
    backgroundColor: '#16181d',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalHeaderTitle: { color: '#FFF', fontFamily: 'SSTMedium' },
  modalTitle: { color: '#FFF', fontFamily: 'SSTBold', fontWeight: '700', marginBottom: 8 },
  modalDesc: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SSTLight', marginBottom: 16, lineHeight: 20 },
  statusBox: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 14, marginBottom: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusTitle: { color: '#FFF', fontFamily: 'SSTMedium', fontSize: 14 },
  statusText: { color: 'rgba(255,255,255,0.6)', fontFamily: 'SSTLight', fontSize: 13, marginTop: 2 },
  statusPath: { color: 'rgba(255,255,255,0.5)', fontFamily: 'SSTLight', fontSize: 12, marginTop: 4 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  linkText: { color: '#FFF', fontFamily: 'SSTMedium', fontSize: 13 },
  linkDim: { color: 'rgba(255,255,255,0.5)', fontFamily: 'SSTLight' },
  instructionRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 },
  stepNumber: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumberText: { color: '#FFF', fontSize: 12, fontFamily: 'SSTBold' },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  folderPath: { flex: 1, color: 'rgba(255,255,255,0.7)', fontFamily: 'SSTLight', fontSize: 13 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9,
  },
  secondaryBtnText: { color: '#FFF', fontFamily: 'SSTMedium', fontSize: 13 },
  primaryBtn: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10 },
  primaryBtnText: { color: '#111', fontFamily: 'SSTBold', fontSize: 14 },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  ghostBtnText: { color: 'rgba(255,255,255,0.85)', fontFamily: 'SSTMedium', fontSize: 14 },
  btnDisabled: { opacity: 0.4 },
  romPathRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  scanRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 6, flexWrap: 'wrap' },
  modalFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  dotsRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dotActive: { backgroundColor: '#FFF', width: 18 },
  finishWrap: { alignItems: 'center', paddingVertical: 20 },
  finishCheck: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: '#FF8A00',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  finishBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  // ── Vista Gestionar ──
  crumbs: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  crumbsText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'SSTLight' },
  manageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 18, marginBottom: 8,
  },
  manageTitle: { color: '#FFF', fontFamily: 'SSTBold', fontWeight: '700' },
  manageSub: { fontFamily: 'SSTLight', marginTop: 6 },
  manageSubStrong: { color: '#FFF', fontFamily: 'SSTMedium' },
  manageSubDim: { color: 'rgba(255,255,255,0.5)' },
  tabsRow: { flexDirection: 'row', gap: 28, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  tabText: { color: 'rgba(255,255,255,0.5)', fontSize: 15, fontFamily: 'SSTLight', paddingVertical: 10 },
  tabTextActive: { color: '#FFF', fontFamily: 'SSTMedium' },
  tabUnderline: { height: 2, backgroundColor: '#FFF', marginTop: -2 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontFamily: 'SSTBold', fontWeight: '700', marginBottom: 4 },
  sectionDesc: { color: 'rgba(255,255,255,0.55)', fontFamily: 'SSTLight' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
  },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'SSTMedium' },
  pathBox: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 10 },
  pathText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'SSTLight' },
  btnRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, paddingVertical: 6 },
  dangerText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: 'SSTLight' },
  folderCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 14, marginBottom: 10,
  },
  folderCardPath: { color: '#FFF', fontSize: 14, fontFamily: 'SSTMedium' },
  folderCardSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'SSTLight', marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, padding: 18 },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'SSTMedium', letterSpacing: 0.5 },
  statValue: { color: '#FFF', fontFamily: 'SSTLight', fontWeight: '300', marginTop: 8 },
  statSub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: 'SSTLight', marginTop: 6 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8, marginBottom: 6,
  },
  searchInput: {
    flex: 1, color: '#FFF', fontSize: 14,
    backgroundColor: 'transparent', borderWidth: 0,
  },
  romRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  romName: { color: '#FFF', fontSize: 14, fontFamily: 'SSTMedium', flexShrink: 1 },
  romDots: { flex: 1, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)', borderStyle: 'dotted' },
  romSize: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: 'SSTLight' },
});
