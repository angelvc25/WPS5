import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { toastService } from '@/services/toastService';
import { fetchSteamGridData } from '@/services/steamGridService';
import { soundService } from '@/services/soundService';
import { useTranslation } from '@/contexts/LanguageContext';

export interface InstalledProgram {
  name: string;
  path: string;
  icon?: string | null;
  location?: string;
  checked?: boolean;
  isCustom?: boolean;
}

interface AddAppModalProps {
  visible: boolean;
  onClose: () => void;
  onAppsAdded: () => void;
}

const PLATFORMS = [
  { id: 'PC', icon: 'microsoft-windows' },
  { id: 'PS1', icon: 'playstation' },
  { id: 'PS2', icon: 'playstation' },
  { id: 'PS3', icon: 'playstation' },
  { id: 'PS4', icon: 'playstation' },
  { id: 'PS5', icon: 'playstation' },
];

export const AddAppModal: React.FC<AddAppModalProps> = ({
  visible,
  onClose,
  onAppsAdded,
}) => {
  const { t } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'game' | 'media' | 'web'>('game');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('PC');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const searchInputRef = useRef<TextInput>(null);

  // Escanear programas instalados cuando se abre el modal
  useEffect(() => {
    if (!visible) return;

    setSearchQuery('');
    setSelectedType('game');
    setSelectedPlatform('PC');
    setFocusedIndex(0);

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
        const filename = filePath.split(/[\\\/]/).pop() || '';
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

        // Verificar si ya existe
        const existingIdx = programs.findIndex((p) => p.path === filePath);
        if (existingIdx !== -1) {
          setPrograms((prev) =>
            prev.map((p, idx) => (idx === existingIdx ? { ...p, checked: true } : p))
          );
        } else {
          // Agregar al principio como chequeado
          const newProg: InstalledProgram = {
            name: nameWithoutExt,
            path: filePath,
            location: filePath,
            checked: true,
            isCustom: true,
          };
          setPrograms((prev) => [newProg, ...prev]);
        }
      }
    }
  };

  const [savingStatusText, setSavingStatusText] = useState<string>('');

  // Función para obtener todos los metadatos y arte del juego (SteamGridDB + IGDB)
  const fetchFullGameMetadata = async (title: string) => {
    let metadata: {
      image?: string;
      backgroundImage?: string;
      logo?: string;
      description?: string;
      rating?: number;
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
          if (d.summary) metadata.description = d.summary;
          if (d.rating || d.aggregated_rating) {
            metadata.rating = Math.round(d.rating || d.aggregated_rating);
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
          setSavingStatusText(`Descargando metadatos (${i + 1}/${total}): "${prog.name}"...`);
        } else {
          setSavingStatusText(`Añadiendo (${i + 1}/${total}): "${prog.name}"...`);
        }

        let appToSave: any = {
          title: prog.name,
          path: prog.path,
          type: selectedType,
          platform: selectedType === 'game' ? selectedPlatform : '',
          image: prog.icon || '',
          playtimeMinutes: 0,
          playtime_forever: 0,
        };

        if (selectedType === 'game') {
          const meta = await fetchFullGameMetadata(prog.name);
          if (meta.image) appToSave.image = meta.image;
          if (meta.backgroundImage) appToSave.backgroundImage = meta.backgroundImage;
          if (meta.logo) appToSave.logo = meta.logo;
          if (meta.description) appToSave.description = meta.description;
          if (meta.rating !== undefined) appToSave.rating = meta.rating;
        }

        if ((window as any).electronAPI?.saveApp) {
          await (window as any).electronAPI.saveApp(appToSave);
          addedCount++;
        }
      }

      toastService.show(
        `Se ${addedCount === 1 ? 'añadió' : 'añadieron'} ${addedCount} ${
          addedCount === 1 ? 'juego/aplicación con metadatos' : 'juegos/aplicaciones con metadatos'
        } a tu biblioteca`,
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
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

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
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
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
              <Text style={styles.title}>Añadir un producto a la biblioteca</Text>
              <Text style={styles.subtitle}>
                Selecciona los programas para añadirlos a tu biblioteca WPS5
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
                placeholder="Buscar en la lista..."
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
              <Text style={styles.tableHeaderText}>PROGRAMA</Text>
            </View>
            <View style={styles.tableHeaderColPath}>
              <Text style={styles.tableHeaderText}>UBICACIÓN</Text>
            </View>
          </View>

          {/* LIST CONTENT */}
          <View style={styles.listContainer}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color="#0070D1" />
                <Text style={styles.loadingText}>Escaneando programas instalados...</Text>
              </View>
            ) : filteredPrograms.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? 'No se encontraron programas que coincidan con la búsqueda.'
                    : 'No se detectaron programas instalados. Usa el botón "Buscar..." para agregar ejecutables manualmente.'}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
                {filteredPrograms.map((program, idx) => {
                  const isChecked = !!program.checked;
                  return (
                    <TouchableOpacity
                      key={program.path + '_' + idx}
                      style={[styles.row, isChecked && styles.rowSelected]}
                      activeOpacity={0.7}
                      onPress={() => toggleProgram(program.path)}
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
                        <Text style={styles.programName} numberOfLines={1}>
                          {program.name}
                        </Text>
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

          {/* FOOTER */}
          <View style={styles.footer}>
            {/* Left: Browse manual file */}
            <TouchableOpacity style={styles.browseBtn} onPress={handleBrowseFile}>
              <Ionicons name="folder-open-outline" size={18} color="#FFF" />
              <Text style={styles.browseBtnText}>Buscar...</Text>
            </TouchableOpacity>

            {/* Middle: Type & Platform selectors */}
            <View style={styles.middleOptions}>
              <Text style={styles.typeLabel}>Añadir como:</Text>
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
                    Juegos
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
                    Media
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
                    Web
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedType === 'game' && (
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
              )}
            </View>

            {/* Right: Actions */}
            <View style={styles.actionBtnsRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, isSaving && { opacity: 0.5 }]}
                onPress={onClose}
                disabled={isSaving}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
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
                    ? (savingStatusText || 'Buscando metadatos y guardando...')
                    : selectedCount > 0
                    ? `Añadir seleccionados (${selectedCount})`
                    : 'Añadir seleccionados'}
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
