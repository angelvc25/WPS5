import { useTranslation } from '@/contexts/LanguageContext';
import { RETRO_SYSTEMS } from '@/constants/platforms';
import { soundService } from '@/services/soundService';
import { fetchSteamGridData } from '@/services/steamGridService';
import { toastService } from '@/services/toastService';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { fetchSteamInfo } from '@/services/steamDescriptionService';
import { fetchPsnMetadata, psnLocaleForLanguage, isPsnEligiblePlatform } from '@/services/psnMetadataService';
import { resolveFieldSyncPreferences } from '@/services/metadataPreferences';
import { fetchRawgFieldData } from '@/services/metadataFields';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

export interface InstalledProgram {
  name: string;
  path: string;
  icon?: string | null;
  location?: string;
  checked?: boolean;
  isCustom?: boolean;
  folderName?: string;
  exeName?: string;
}

interface AddAppModalProps {
  visible: boolean;
  onClose: () => void;
  onAppsAdded: () => void;
}

const PLATFORMS = [
  { id: 'PC', icon: 'microsoft-windows' },
  { id: 'PS1', icon: 'sony-playstation' },
  { id: 'PS2', icon: 'sony-playstation' },
  { id: 'PS3', icon: 'sony-playstation' },
  { id: 'PS4', icon: 'sony-playstation' },
  { id: 'PS5', icon: 'sony-playstation' },
  { id: 'Retro', icon: 'gamepad-variant' },
];

const GENERIC_SUBFOLDERS = new Set([
  'bin', 'binaries', 'bin32', 'bin64', 'x64', 'x86', 'x86_64',
  'win32', 'win64', 'windows', 'windows_x64', 'windows_x86',
  'retail', 'release', 'shipping', 'game', 'games', 'engine',
  'build', 'dist', 'app', 'launcher', 'client', 'system', 'root',
  'win', 'pc', 'cooked', 'cookedpc', 'cookedpcconsole'
]);

function cleanGameTitle(str: string): string {
  let clean = str;
  // Quitar corchetes y paréntesis típicos de grupos de release (e.g. [FitGirl Repack], (DODI), etc.)
  clean = clean.replace(/\[[^\]]*\]/g, ' ').replace(/\([^\)]*\)/g, ' ');
  // Quitar tags de grupos scene (-CODEX, -RUNE, etc.)
  clean = clean.replace(/[-_](CODEX|RUNE|CPY|SKIDROW|GOG|TENOKE|FLT|EMPRESS|ElAmigos|FitGirl|DODI|Razor1911|RELOADED|HOODLUM|PLAZA)\b/gi, ' ');
  // Reemplazar puntos y guiones bajos por espacios
  clean = clean.replace(/[._]/g, ' ');
  // Quitar tags de versión aislados como v1 0, v1 04
  clean = clean.replace(/\bv\d+(\s\d+)*\b/gi, ' ');
  // Quitar palabras de packaging comunes
  clean = clean.replace(/\b(Repack|Clean Rip)\b/gi, ' ');
  return clean.replace(/\s+/g, ' ').trim();
}

function extractSmartGameName(filePath: string): { suggestedName: string; folderName: string; exeName: string } {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return { suggestedName: '', folderName: '', exeName: '' };

  const rawFilename = parts[parts.length - 1];
  const rawExeName = rawFilename.replace(/\.[^/.]+$/, '');
  const exeName = cleanGameTitle(rawExeName);

  let folderName = '';
  // Buscar hacia atrás la carpeta que no sea genérica (bin, x64, etc.)
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i];
    // Evitar raíces de unidad como "C:" o "D:"
    if (!part || /^[a-zA-Z]:$/.test(part)) break;
    const lower = part.toLowerCase();
    if (GENERIC_SUBFOLDERS.has(lower)) continue;
    folderName = part;
    break;
  }

  const cleanedFolder = folderName ? cleanGameTitle(folderName) : '';

  const isGenericExe = /^(game|launcher|shipping|client|start|app|main|play|run|loader|bootstrap|patcher)$/i.test(exeName) ||
                       /win(32|64)[-_]shipping/i.test(rawExeName);

  // Se prefiere el nombre de la carpeta si existe, especialmente si el exe es genérico o la carpeta es más descriptiva
  let suggestedName = cleanedFolder || exeName || rawExeName;
  if (!isGenericExe && exeName.length > 4 && (!cleanedFolder || cleanedFolder.length < 3)) {
    suggestedName = exeName;
  }

  return {
    suggestedName: suggestedName || rawExeName,
    folderName: cleanedFolder || folderName,
    exeName: exeName || rawExeName,
  };
}



export const AddAppModal: React.FC<AddAppModalProps> = ({
  visible,
  onClose,
  onAppsAdded,
}) => {
  const { t, language } = useTranslation();
  const { activeUser } = useUser();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'game' | 'media' | 'web'>('game');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('PC');
  const [retroSystem, setRetroSystem] = useState<string>('PSP');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  // Edición rápida de nombre del programa
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const handleStartEdit = (prog: InstalledProgram) => {
    soundService.playNavigation();
    setEditingPath(prog.path);
    setEditingName(prog.name);
  };

  const handleSaveEdit = (targetPath: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      setPrograms((prev) =>
        prev.map((p) => (p.path === targetPath ? { ...p, name: trimmed } : p))
      );
    }
    setEditingPath(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingPath(null);
    setEditingName('');
  };

  const searchInputRef = useRef<TextInput>(null);

  // Escanear programas instalados cuando se abre el modal
  useEffect(() => {
    if (!visible) return;

    setSearchQuery('');
    setSelectedType('game');
    setSelectedPlatform('PC');
    setRetroSystem('PSP');
    setFocusedIndex(0);
    setEditingPath(null);
    setEditingName('');

    if (Platform.OS === 'web' && (window as any).electronAPI?.getInstalledPrograms) {
      setLoading(true);
      (window as any).electronAPI
        .getInstalledPrograms()
        .then((res: any) => {
          if (res.success && Array.isArray(res.programs)) {
            const formatted = res.programs.map((p: any) => ({
              name: p.name,
              path: p.path,
              icon: p.icon || null,
              location: p.path,
              checked: false,
            }));
            setPrograms(formatted);
          } else {
            setPrograms([]);
          }
        })
        .catch((err: any) => {
          console.error('Error fetching installed programs:', err);
          setPrograms([]);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setPrograms([]);
      setLoading(false);
    }
  }, [visible]);

  // Filtrado por búsqueda
  const filteredPrograms = useMemo(() => {
    if (!searchQuery.trim()) return programs;
    const query = searchQuery.toLowerCase().trim();
    return programs.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.path && p.path.toLowerCase().includes(query))
    );
  }, [programs, searchQuery]);

  // Selección individual
  const toggleProgram = (targetPath: string) => {
    soundService.playNavigation();
    setPrograms((prev) =>
      prev.map((p) => (p.path === targetPath ? { ...p, checked: !p.checked } : p))
    );
  };

  // Seleccionar / deseleccionar todos
  const allChecked = useMemo(() => {
    if (filteredPrograms.length === 0) return false;
    return filteredPrograms.every((p) => p.checked);
  }, [filteredPrograms]);

  const toggleSelectAll = () => {
    soundService.playNavigation();
    const targetState = !allChecked;
    const filteredPathSet = new Set(filteredPrograms.map((p) => p.path));
    setPrograms((prev) =>
      prev.map((p) =>
        filteredPathSet.has(p.path) ? { ...p, checked: targetState } : p
      )
    );
  };

  // Botón "Buscar..." para explorar un ejecutable / shortcut manualmente
  const handleBrowseFile = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI?.selectFile) {
      soundService.playNavigation();
      const filePath = await (window as any).electronAPI.selectFile();
      if (filePath) {
        const { suggestedName, folderName, exeName } = extractSmartGameName(filePath);

        // Verificar si ya existe
        const existingIdx = programs.findIndex((p) => p.path === filePath);
        if (existingIdx !== -1) {
          setPrograms((prev) =>
            prev.map((p, idx) => (idx === existingIdx ? { ...p, checked: true, name: suggestedName || p.name, folderName, exeName } : p))
          );
        } else {
          // Agregar al principio como chequeado con el nombre inteligente de la carpeta
          const newProg: InstalledProgram = {
            name: suggestedName,
            path: filePath,
            location: filePath,
            checked: true,
            isCustom: true,
            folderName,
            exeName,
          };
          setPrograms((prev) => [newProg, ...prev]);
        }
        // Iniciar edición de nombre de inmediato para que el usuario pueda confirmar o afinar
        setEditingPath(filePath);
        setEditingName(suggestedName);
      }
    }
  };

  const [savingStatusText, setSavingStatusText] = useState<string>('');

  // Función para obtener todos los metadatos y arte del juego (SteamGridDB + IGDB)
  const fetchFullGameMetadata = async (title: string, allowSteam: boolean = true) => {
    const fieldPrefs = resolveFieldSyncPreferences(activeUser?.settings?.syncPreferences);
    // El Store moderno solo indexa PS4/PS5: en plataformas retro/emuladas
    // PSN traería el juego homónimo equivocado, así que esos campos usan IGDB.
    const psnEligible = isPsnEligiblePlatform(selectedPlatform);
    const eff = (src: string): string => (src === 'psn' && !psnEligible ? 'igdb' : src);
    const descSource = eff(fieldPrefs.description);
    const ratingSource = eff(fieldPrefs.rating);
    const infoSource = (key: 'publisher' | 'genres' | 'releaseDate') => eff(fieldPrefs[key]);

    let metadata: {
      image?: string;
      backgroundImage?: string;
      logo?: string;
      description?: string;
      rating?: number;
      publisher?: string;
      genres?: string[];
      releaseDate?: string;
    } = {};

    // 1. Obtener arte desde SteamGridDB (grid/portada, hero/fondo, logo)
    try {
      const res = (window as any).electronAPI?.fetchSteamGridData
        ? await (window as any).electronAPI.fetchSteamGridData(title)
        : await fetchSteamGridData(title);

      if (res?.success && res.data) {
        if (res.data.grid) metadata.image = res.data.grid;
        if (res.data.hero) metadata.backgroundImage = res.data.hero;
        if (res.data.logo) metadata.logo = res.data.logo;
      }
    } catch (e) {
      console.error('[AddAppModal] Error en SteamGridDB para:', title, e);
    }

    // 2. Obtener metadatos desde IGDB (descripción, rating, arte alternativo)
    try {
      if ((window as any).electronAPI?.fetchGameData) {
        const igdbRes = await (window as any).electronAPI.fetchGameData(title);
        if (igdbRes?.success && igdbRes.data) {
          const d = igdbRes.data;
          if (descSource === 'igdb' && d.summary) metadata.description = d.summary;
          if (ratingSource === 'igdb' && (d.rating || d.aggregated_rating)) {
            metadata.rating = Math.round(((d.rating || d.aggregated_rating) / 20) * 10) / 10;
          }
          if (infoSource('publisher') === 'igdb' && Array.isArray(d.involved_companies)) {
            const pub = d.involved_companies.find((c: any) => c?.publisher)?.company?.name;
            if (pub) metadata.publisher = pub;
          }
          if (infoSource('genres') === 'igdb' && Array.isArray(d.genres)) {
            const names = d.genres.map((g: any) => g?.name).filter(Boolean);
            if (names.length > 0) metadata.genres = names;
          }
          if (infoSource('releaseDate') === 'igdb' && d.first_release_date) {
            const dt = new Date(d.first_release_date * 1000);
            metadata.releaseDate = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
          }

          if (!metadata.image && d.cover?.url) {
            let coverUrl = d.cover.url;
            if (coverUrl.startsWith('//')) coverUrl = 'https:' + coverUrl;
            metadata.image = coverUrl.replace('t_thumb', 't_cover_big');
          }

          if (!metadata.backgroundImage) {
            let rawBg = d.artworks?.[0]?.url || d.screenshots?.[0]?.url;
            if (rawBg) {
              if (rawBg.startsWith('//')) rawBg = 'https:' + rawBg;
              metadata.backgroundImage = rawBg.replace('t_thumb', 't_1080p');
            }
          }
        }
      }
    } catch (e) {
      console.error('[AddAppModal] Error en IGDB para:', title, e);
    }

    // 2b. RAWG (descripción, rating e info cuando es la fuente elegida)
    if ([descSource, ratingSource, infoSource('publisher'), infoSource('genres'), infoSource('releaseDate')].includes('rawg')) {
      try {
        const rawgData = await fetchRawgFieldData(title);
        if (rawgData) {
          if (descSource === 'rawg' && rawgData.description) metadata.description = rawgData.description;
          if (ratingSource === 'rawg' && rawgData.rating != null) metadata.rating = rawgData.rating;
          if (infoSource('publisher') === 'rawg' && rawgData.publisher) metadata.publisher = rawgData.publisher;
          if (infoSource('genres') === 'rawg' && rawgData.genres.length > 0) metadata.genres = rawgData.genres;
          if (infoSource('releaseDate') === 'rawg' && rawgData.releaseDate) metadata.releaseDate = rawgData.releaseDate;
        }
      } catch (e) {
        console.error('[AddAppModal] Error en RAWG para:', title, e);
      }
    }

    // 3. PSN: descripción + rating + arte (API propia /api/psn).
    // Se omite en plataformas no elegibles para no mezclar el juego homónimo.
    if (psnEligible && [descSource, ratingSource, infoSource('publisher'), infoSource('genres'), infoSource('releaseDate')].includes('psn')) {
      try {
        const psnRes = await fetchPsnMetadata(title, { locale: psnLocaleForLanguage(language) });
        if (descSource === 'psn' && psnRes?.details?.description) metadata.description = psnRes.details.description;
        if (ratingSource === 'psn' && psnRes?.details?.communityScore != null) {
          metadata.rating = Math.round((psnRes.details.communityScore / 20) * 10) / 10;
        }
        if (infoSource('publisher') === 'psn' && psnRes?.details?.publisher) metadata.publisher = psnRes.details.publisher;
        if (infoSource('genres') === 'psn' && psnRes?.details?.genres?.length) metadata.genres = psnRes.details.genres;
        if (infoSource('releaseDate') === 'psn' && psnRes?.details?.releaseDate) metadata.releaseDate = psnRes.details.releaseDate;
      } catch (e) {
        console.error('[AddAppModal] Error en PSN para:', title, e);
      }
    }

    // PSN como arte alternativo (igual que antes, solo en elegibles).
    if (psnEligible && (!metadata.image || !metadata.backgroundImage)) {
      try {
        const psnRes = await fetchPsnMetadata(title, { locale: psnLocaleForLanguage(language) });
        const psnCover = psnRes?.details?.coverUrl || psnRes?.match?.coverUrl;
        const psnBackground = psnRes?.details?.backgroundUrl || psnRes?.match?.backgroundUrl;
        if (!metadata.image && psnCover) metadata.image = psnCover;
        if (!metadata.backgroundImage && psnBackground) metadata.backgroundImage = psnBackground;
      } catch (e) {
        console.error('[AddAppModal] Error en PSN para:', title, e);
      }
    }

    // 4. Steam: descripción localizada + rating
    if ((descSource === 'steam' || ratingSource === 'steam') && allowSteam) {
      try {
        const info = await fetchSteamInfo(title, language);
        if (descSource === 'steam' && info.description) metadata.description = info.description;
        if (ratingSource === 'steam' && info.rating != null) metadata.rating = info.rating;
      } catch (e) {
        console.error('[AddAppModal] Error en Steam para:', title, e);
      }
    }

    return metadata;
  };

  // Guardar programas seleccionados
  const handleSaveSelected = async () => {
    const selectedPrograms = programs.filter((p) => p.checked);
    if (selectedPrograms.length === 0) return;

    setIsSaving(true);
    soundService.playActivation?.();

    try {
      let addedCount = 0;
      const total = selectedPrograms.length;

      for (let i = 0; i < total; i++) {
        const prog = selectedPrograms[i];

        if (selectedType === 'game') {
          setSavingStatusText(t('addModal.downloadingMetadata', { current: i + 1, total, name: prog.name }));
        } else {
          setSavingStatusText(t('addModal.addingApp', { current: i + 1, total, name: prog.name }));
        }

        let appToSave: any = {
          title: prog.name,
          path: prog.path,
          type: selectedType,
          platform: selectedType === 'game'
            ? (selectedPlatform === 'Retro' ? 'Retro' : selectedPlatform)
            : '',
          ...(selectedType === 'game' && selectedPlatform === 'Retro'
            ? { retroSystem: retroSystem.trim() || 'PSP' }
            : {}),
          image: prog.icon || '',
          playtimeMinutes: 0,
          playtime_forever: 0,
        };

        if (selectedType === 'game') {
          const meta = await fetchFullGameMetadata(prog.name, selectedPlatform !== 'Retro');
          if (meta.image) appToSave.image = meta.image;
          if (meta.backgroundImage) appToSave.backgroundImage = meta.backgroundImage;
          if (meta.logo) appToSave.logo = meta.logo;
          if (meta.description) appToSave.description = meta.description;
          if (meta.rating !== undefined) appToSave.rating = meta.rating;
          if (meta.publisher) appToSave.publisher = meta.publisher;
          if (meta.genres) appToSave.genres = meta.genres;
          if (meta.releaseDate) appToSave.releaseDate = meta.releaseDate;
        }

        if ((window as any).electronAPI?.saveApp) {
          await (window as any).electronAPI.saveApp(appToSave);
          addedCount++;
        }
      }

      toastService.show(
        addedCount === 1
          ? t('addModal.addedSingle', { count: addedCount })
          : t('addModal.addedMultiple', { count: addedCount }),
        { icon: require('@/assets/images/install.png') }
      );

      onAppsAdded();
      onClose();
    } catch (err) {
      console.error('Error al guardar programas seleccionados:', err);
    } finally {
      setIsSaving(false);
      setSavingStatusText('');
    }
  };

  const selectedCount = useMemo(() => programs.filter((p) => p.checked).length, [programs]);

  // Manejador de teclado para navegación fluida
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingPath) {
          setEditingPath(null);
          setEditingName('');
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose, editingPath]);

  // Estilos dinámicos calculados según el tamaño de la ventana
  const styles = useMemo(() => {
    const scaleW = windowWidth / 1920;
    const scaleH = windowHeight / 1080;
    const scale = Math.min(scaleW, scaleH);
    const s = (px: number) => Math.max(1, Math.round(px * scale));
    const sW = (px: number) => Math.max(1, Math.round(px * scaleW));
    const sH = (px: number) => Math.max(1, Math.round(px * scaleH));

    return StyleSheet.create({
      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        justifyContent: 'center',
        alignItems: 'center',
      },
      modalContainer: {
        width: Math.min(sW(1020), windowWidth * 0.9),
        height: Math.min(sH(780), windowHeight * 0.88),
        backgroundColor: '#12171F',
        borderRadius: s(16),
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
      } as any,
      header: {
        paddingHorizontal: s(28),
        paddingTop: s(22),
        paddingBottom: s(16),
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      },
      title: {
        color: '#FFFFFF',
        fontSize: s(22),
        fontFamily: 'SSTMedium',
        fontWeight: '600',
        letterSpacing: 0.2,
      },
      subtitle: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: s(14),
        fontFamily: 'SSTRg',
        marginTop: s(4),
      },
      closeBtn: {
        padding: s(6),
        borderRadius: s(20),
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
      },
      searchContainer: {
        paddingHorizontal: s(28),
        paddingVertical: s(14),
        backgroundColor: '#0E1219',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
      },
      searchInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: s(8),
        paddingHorizontal: s(14),
        height: s(42),
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
      },
      searchInput: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: s(15),
        fontFamily: 'SSTRg',
        marginLeft: s(10),
        outlineStyle: 'none' as any,
      },
      tableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: s(28),
        paddingVertical: s(10),
        backgroundColor: '#161C26',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
      },
      tableHeaderColCheck: {
        width: s(46),
        alignItems: 'center',
      },
      tableHeaderColName: {
        flex: 1.2,
        flexDirection: 'row',
        alignItems: 'center',
      },
      tableHeaderColPath: {
        flex: 1.8,
      },
      tableHeaderText: {
        color: 'rgba(255, 255, 255, 0.55)',
        fontSize: s(12),
        fontFamily: 'SSTMedium',
        fontWeight: '600',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
      },
      listContainer: {
        flex: 1,
        backgroundColor: '#0E1219',
      },
      loadingWrap: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: s(40),
      },
      loadingText: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: s(15),
        fontFamily: 'SSTRg',
        marginTop: s(14),
      },
      emptyWrap: {
        padding: s(40),
        alignItems: 'center',
      },
      emptyText: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: s(15),
        fontFamily: 'SSTRg',
      },
      row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: s(28),
        paddingVertical: s(10),
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.04)',
        backgroundColor: 'transparent',
      },
      rowSelected: {
        backgroundColor: 'rgba(0, 112, 209, 0.12)',
      },
      rowFocused: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
      },
      checkboxContainer: {
        width: s(46),
        alignItems: 'center',
        justifyContent: 'center',
      },
      checkbox: {
        width: s(20),
        height: s(20),
        borderRadius: s(4),
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
      },
      checkboxChecked: {
        backgroundColor: '#0070D1',
        borderColor: '#0070D1',
      },
      programColName: {
        flex: 1.2,
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: s(12),
      },
      iconWrap: {
        width: s(32),
        height: s(32),
        borderRadius: s(6),
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: s(12),
        overflow: 'hidden',
      },
      appIcon: {
        width: s(26),
        height: s(26),
      },
      programName: {
        color: '#FFFFFF',
        fontSize: s(15),
        fontFamily: 'SSTMedium',
        fontWeight: '500',
        flex: 1,
      },
      nameWithEditWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: s(6),
      },
      editPencilBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(4),
        paddingHorizontal: s(6),
        paddingVertical: s(3),
        borderRadius: s(4),
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginLeft: s(8),
      },
      editPencilText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: s(11),
        fontFamily: 'SSTRg',
      },
      inlineEditWrap: {
        flex: 1,
        flexDirection: 'column',
        gap: s(4),
      },
      inlineInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(6),
      },
      inlineEditInput: {
        flex: 1,
        backgroundColor: '#090D14',
        borderRadius: s(6),
        borderWidth: 1.5,
        borderColor: '#0070D1',
        color: '#FFFFFF',
        fontSize: s(14),
        fontFamily: 'SSTMedium',
        paddingHorizontal: s(10),
        paddingVertical: s(4),
        height: s(32),
        outlineStyle: 'none' as any,
      },
      inlineEditConfirmBtn: {
        width: s(30),
        height: s(30),
        borderRadius: s(6),
        backgroundColor: '#0070D1',
        alignItems: 'center',
        justifyContent: 'center',
      },
      inlineEditCancelBtn: {
        width: s(30),
        height: s(30),
        borderRadius: s(6),
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
      },
      quickChipsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: s(6),
        marginTop: s(2),
      },
      quickChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: s(7),
        paddingVertical: s(2),
        borderRadius: s(4),
        backgroundColor: 'rgba(0, 112, 209, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(0, 112, 209, 0.35)',
      },
      quickChipText: {
        color: '#70B5FF',
        fontSize: s(11),
        fontFamily: 'SSTRg',
      },
      programColPath: {
        flex: 1.8,
      },
      programPath: {
        color: 'rgba(255, 255, 255, 0.45)',
        fontSize: s(13),
        fontFamily: 'SSTRg',
        fontStyle: 'italic',
      },
      footer: {
        paddingHorizontal: s(28),
        paddingVertical: s(16),
        backgroundColor: '#141A24',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: s(12),
      },
      browseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: s(18),
        paddingVertical: s(10),
        borderRadius: s(8),
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        gap: s(8),
      },
      browseBtnText: {
        color: '#FFFFFF',
        fontSize: s(14),
        fontFamily: 'SSTMedium',
      },
      middleOptions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(16),
      },
      typeLabel: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: s(13),
        fontFamily: 'SSTMedium',
      },
      typeSelectorRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: s(8),
        padding: s(3),
        gap: s(2),
      },
      typeBtn: {
        paddingHorizontal: s(14),
        paddingVertical: s(7),
        borderRadius: s(6),
      },
      typeBtnActive: {
        backgroundColor: '#0070D1',
      },
      typeBtnText: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: s(13),
        fontFamily: 'SSTMedium',
      },
      typeBtnTextActive: {
        color: '#FFFFFF',
        fontWeight: '600',
      },
      platformSelectorRow: {
        flexDirection: 'row',
        gap: s(6),
        alignItems: 'center',
      },
      platformBtn: {
        paddingHorizontal: s(10),
        paddingVertical: s(6),
        borderRadius: s(6),
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(4),
      },
      platformBtnActive: {
        backgroundColor: 'rgba(0, 112, 209, 0.4)',
        borderColor: '#0070D1',
        borderWidth: 1,
      },
      platformBtnText: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: s(12),
        fontFamily: 'SSTMedium',
      },
      platformBtnTextActive: {
        color: '#FFFFFF',
        fontWeight: '600',
      },
      retroSystemWrap: {
        marginTop: s(8),
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        overflow: 'hidden',
      },
      retroFloatingPanel: {
        width: '100%',
        backgroundColor: '#0E1520',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 150, 0, 0.25)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
        paddingVertical: s(4),
      },
      retroSystemScrollRow: {
        flexDirection: 'row',
        gap: s(6),
        paddingHorizontal: s(10),
        paddingVertical: s(8),
        alignItems: 'center',
      },
      retroSystemChip: {
        paddingHorizontal: s(12),
        paddingVertical: s(5),
        borderRadius: s(20),
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
      },
      retroSystemChipActive: {
        backgroundColor: 'rgba(255, 150, 0, 0.25)',
        borderColor: 'rgba(255, 150, 0, 0.6)',
      },
      retroSystemChipText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: s(12),
        fontFamily: 'SSTMedium',
      },
      retroSystemChipTextActive: {
        color: '#FFAA00',
        fontFamily: 'SSTBold',
      },
      retroSystemInput: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: s(13),
        fontFamily: 'SSTRg',
        outlineStyle: 'none' as any,
      },
      actionBtnsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
      },
      cancelBtn: {
        paddingHorizontal: s(20),
        paddingVertical: s(11),
        borderRadius: s(8),
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
      },
      cancelBtnText: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: s(14),
        fontFamily: 'SSTMedium',
      },
      saveBtn: {
        paddingHorizontal: s(24),
        paddingVertical: s(11),
        borderRadius: s(8),
        backgroundColor: '#0070D1',
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(8),
      },
      saveBtnDisabled: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        opacity: 0.5,
      },
      saveBtnText: {
        color: '#FFFFFF',
        fontSize: s(14),
        fontFamily: 'SSTMedium',
        fontWeight: '600',
      },
    });
  }, [windowWidth, windowHeight]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* HEADER */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{t('addModal.title')}</Text>
              <Text style={styles.subtitle}>
                {t('addModal.subtitle')}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.7)" />
            </TouchableOpacity>
          </View>

          {/* SEARCH INPUT */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={18} color="rgba(255, 255, 255, 0.4)" />
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder={t('addModal.searchPlaceholder')}
                placeholderTextColor="rgba(255, 255, 255, 0.35)"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="rgba(255, 255, 255, 0.4)" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* TABLE HEADER */}
          <View style={styles.tableHeader}>
            <TouchableOpacity style={styles.tableHeaderColCheck} onPress={toggleSelectAll}>
              <View
                style={[
                  styles.checkbox,
                  allChecked && filteredPrograms.length > 0 && styles.checkboxChecked,
                ]}
              >
                {allChecked && filteredPrograms.length > 0 && (
                  <Ionicons name="checkmark" size={14} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.tableHeaderColName}>
              <Text style={styles.tableHeaderText}>{t('addModal.colProgram')}</Text>
            </View>
            <View style={styles.tableHeaderColPath}>
              <Text style={styles.tableHeaderText}>{t('addModal.colLocation')}</Text>
            </View>
          </View>

          {/* LIST CONTENT */}
          <View style={styles.listContainer}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#0070D1" />
                <Text style={styles.loadingText}>{t('addModal.scanning')}</Text>
              </View>
            ) : filteredPrograms.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? t('addModal.emptySearch')
                    : t('addModal.emptyList')}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
                {filteredPrograms.map((program, idx) => {
                  const isChecked = !!program.checked;
                  const isEditing = editingPath === program.path;
                  return (
                    <TouchableOpacity
                      key={program.path + '_' + idx}
                      style={[styles.row, isChecked && styles.rowSelected]}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (!isEditing) {
                          toggleProgram(program.path);
                        }
                      }}
                    >
                      <View style={styles.checkboxContainer}>
                        <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                          {isChecked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </View>
                      </View>

                      <View style={styles.programColName}>
                        <View style={styles.iconWrap}>
                          {program.icon ? (
                            <Image
                              source={{ uri: program.icon }}
                              style={styles.appIcon}
                              contentFit="contain"
                            />
                          ) : (
                            <Ionicons
                              name="cube-outline"
                              size={20}
                              color="rgba(255, 255, 255, 0.6)"
                            />
                          )}
                        </View>

                        {isEditing ? (
                          <View
                            style={styles.inlineEditWrap}
                            // @ts-ignore
                            onClick={(e: any) => e.stopPropagation()}
                          >
                            <View style={styles.inlineInputRow}>
                              <TextInput
                                style={styles.inlineEditInput}
                                value={editingName}
                                onChangeText={setEditingName}
                                autoFocus
                                selectTextOnFocus
                                onSubmitEditing={() => handleSaveEdit(program.path)}
                                placeholder={t('addModal.namePlaceholder')}
                                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                              />
                              <TouchableOpacity
                                style={styles.inlineEditConfirmBtn}
                                onPress={() => handleSaveEdit(program.path)}
                              >
                                <Ionicons name="checkmark" size={16} color="#FFF" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.inlineEditCancelBtn}
                                onPress={handleCancelEdit}
                              >
                                <Ionicons name="close" size={16} color="rgba(255, 255, 255, 0.7)" />
                              </TouchableOpacity>
                            </View>

                            {(program.folderName || program.exeName) && (
                              <View style={styles.quickChipsRow}>
                                {program.folderName && program.folderName !== editingName && (
                                  <TouchableOpacity
                                    style={styles.quickChip}
                                    onPress={() => setEditingName(program.folderName!)}
                                  >
                                    <Ionicons name="folder-outline" size={12} color="#70B5FF" style={{ marginRight: 4 }} />
                                    <Text style={styles.quickChipText} numberOfLines={1}>{program.folderName}</Text>
                                  </TouchableOpacity>
                                )}
                                {program.exeName && program.exeName !== editingName && (
                                  <TouchableOpacity
                                    style={styles.quickChip}
                                    onPress={() => setEditingName(program.exeName!)}
                                  >
                                    <Ionicons name="cog-outline" size={12} color="#70B5FF" style={{ marginRight: 4 }} />
                                    <Text style={styles.quickChipText} numberOfLines={1}>{program.exeName}</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}
                          </View>
                        ) : (
                          <View style={styles.nameWithEditWrap}>
                            <Text style={styles.programName} numberOfLines={1}>
                              {program.name}
                            </Text>
                            <TouchableOpacity
                              style={styles.editPencilBtn}
                              onPress={(e: any) => {
                                e?.stopPropagation?.();
                                handleStartEdit(program);
                              }}
                            >
                              <Ionicons name="pencil" size={12} color="rgba(255, 255, 255, 0.5)" />
                              <Text style={styles.editPencilText}>{t('addModal.editName')}</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      <View style={styles.programColPath}>
                        <Text style={styles.programPath} numberOfLines={1}>
                          {program.path}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Floating retro system picker — aparece encima del footer */}
          {selectedType === 'game' && selectedPlatform === 'Retro' && (
            <View style={styles.retroFloatingPanel}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.retroSystemScrollRow}
              >
                {RETRO_SYSTEMS.map((sys) => (
                  <TouchableOpacity
                    key={sys.id}
                    style={[
                      styles.retroSystemChip,
                      retroSystem === sys.id && styles.retroSystemChipActive,
                    ]}
                    onPress={() => setRetroSystem(sys.id)}
                  >
                    <Text
                      style={[
                        styles.retroSystemChipText,
                        retroSystem === sys.id && styles.retroSystemChipTextActive,
                      ]}
                    >
                      {sys.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* FOOTER */}
          <View style={styles.footer}>
            {/* Left: Browse manual file */}
            <TouchableOpacity style={styles.browseBtn} onPress={handleBrowseFile}>
              <Ionicons name="folder-open-outline" size={18} color="#FFF" />
              <Text style={styles.browseBtnText}>{t('addModal.browseBtn')}</Text>
            </TouchableOpacity>

            {/* Middle: Type & Platform selectors */}
            <View style={styles.middleOptions}>
              <Text style={styles.typeLabel}>{t('addModal.typeLabel')}</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, selectedType === 'game' && styles.typeBtnActive]}
                  onPress={() => setSelectedType('game')}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      selectedType === 'game' && styles.typeBtnTextActive,
                    ]}
                  >
                    {t('cc.typeGames')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, selectedType === 'media' && styles.typeBtnActive]}
                  onPress={() => setSelectedType('media')}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      selectedType === 'media' && styles.typeBtnTextActive,
                    ]}
                  >
                    {t('cc.typeMedia')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, selectedType === 'web' && styles.typeBtnActive]}
                  onPress={() => setSelectedType('web')}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      selectedType === 'web' && styles.typeBtnTextActive,
                    ]}
                  >
                    {t('cc.typeWeb')}
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedType === 'game' && (
                <>
                  <View style={styles.platformSelectorRow}>
                    {PLATFORMS.map((plat) => (
                      <TouchableOpacity
                        key={plat.id}
                        style={[
                          styles.platformBtn,
                          selectedPlatform === plat.id && styles.platformBtnActive,
                        ]}
                        onPress={() => setSelectedPlatform(plat.id)}
                      >
                        <MaterialCommunityIcons
                          name={plat.icon as any}
                          size={14}
                          color={
                            selectedPlatform === plat.id ? '#FFF' : 'rgba(255, 255, 255, 0.4)'
                          }
                        />
                        <Text
                          style={[
                            styles.platformBtnText,
                            selectedPlatform === plat.id && styles.platformBtnTextActive,
                          ]}
                        >
                          {plat.id}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Right: Actions */}
            <View style={styles.actionBtnsRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, isSaving && { opacity: 0.5 }]}
                onPress={onClose}
                disabled={isSaving}
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (selectedCount === 0 || isSaving) && styles.saveBtnDisabled,
                ]}
                onPress={handleSaveSelected}
                disabled={selectedCount === 0 || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                )}
                <Text style={styles.saveBtnText}>
                  {isSaving
                    ? (savingStatusText || t('addModal.savingDefault'))
                    : selectedCount > 0
                      ? t('addModal.addSelectedCount', { count: selectedCount })
                      : t('addModal.addSelected')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default AddAppModal;
