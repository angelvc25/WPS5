import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { soundService } from '@/services/soundService';

interface AvatarImage {
  uri: string;
  thumbnail: string;
  name: string;
  mtime: number;
}

interface AvatarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectAvatar: (uri: string) => void;
  currentAvatarUri?: string | null;
  avatarPath?: string;
}

interface AvatarTileProps {
  previewUri: string;
  isFocused: boolean;
  isSelected: boolean;
  shouldLoad: boolean;
  tileSize: number;
  onPress: () => void;
  onFocus: () => void;
  onMouseEnter?: () => void;
}

const AvatarTile = React.memo<AvatarTileProps>(({
  previewUri,
  isFocused,
  isSelected,
  shouldLoad,
  tileSize,
  onPress,
  onFocus,
  onMouseEnter,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [previewUri]);

  return (
    <View style={{ width: tileSize, height: tileSize }}>
      <TouchableOpacity
        style={[
          styles.tileInner,
          isFocused && styles.tileFocused,
          isSelected && !isFocused && styles.tileSelected,
        ]}
        onPress={() => {
          onFocus();
          onPress();
        }}
        {...(Platform.OS === 'web' && onMouseEnter ? { onMouseEnter } as any : {}) as any}
        activeOpacity={0.9}
      >
        {shouldLoad ? (
          <>
            {!isLoaded && (
              <View style={styles.tilePlaceholder}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.55)" />
              </View>
            )}
            <Image
              source={{ uri: previewUri }}
              style={[styles.tileImage, !isLoaded && styles.tileImageHidden]}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={previewUri}
              transition={120}
              onLoad={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
            />
          </>
        ) : (
          <View style={styles.tilePlaceholder} />
        )}
      </TouchableOpacity>
    </View>
  );
});

AvatarTile.displayName = 'AvatarTile';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07080cff',
  },
  backdropImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 8, 12, 0.12)',
  },
  content: {
    flex: 1,
    zIndex: 2,
  },
  tileInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileFocused: {
    borderColor: '#ffffff93',
  },
  tileSelected: {
    borderColor: 'rgba(255,255,255,0.45)',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileImageHidden: {
    opacity: 0,
  },
  tilePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
});

const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  visible,
  onClose,
  onSelectAvatar,
  currentAvatarUri,
  avatarPath,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [focusIndex, setFocusIndex] = useState(0);
  const [avatars, setAvatars] = useState<AvatarImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvedAvatarFolder, setResolvedAvatarFolder] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const focusIndexRef = useRef(focusIndex);
  const avatarsRef = useRef(avatars);
  const lastNavSoundRef = useRef(0);

  const scale = useMemo(() => Math.min(windowWidth / 1920, windowHeight / 1080), [windowWidth, windowHeight]);
  const s = (v: number) => Math.round(v * scale);

  const columns = windowWidth >= 1400 ? 8 : windowWidth >= 900 ? 6 : 3;
  const gap = s(24);
  const tileSize = Math.min(s(130), (windowWidth - s(100) * 2 - gap * (columns - 1)) / columns);
  const tileStrideX = tileSize + gap;
  const tileStrideY = tileSize + gap;

  focusIndexRef.current = focusIndex;
  avatarsRef.current = avatars;

  const playNavSound = useCallback(() => {
    const now = Date.now();
    if (now - lastNavSoundRef.current > 55) {
      lastNavSoundRef.current = now;
      soundService.playNavigation();
    }
  }, []);

  const loadAvatars = useCallback(async () => {
    if (Platform.OS !== 'web' || !(window as any).electronAPI) {
      setAvatars([]);
      return;
    }

    setLoading(true);
    setAvatars([]);
    try {
      const api = (window as any).electronAPI;
      let folder: string | null = avatarPath || resolvedAvatarFolder || await api.getDefaultAvatarFolder?.();
      if (!resolvedAvatarFolder && folder) setResolvedAvatarFolder(folder);

      if (!folder) {
        setAvatars([]);
        return;
      }

      const result: AvatarImage[] = await api.listFolderAvatars(folder);
      setAvatars(result);
      setFocusIndex(0);
    } catch (err) {
      console.error('Error loading avatars:', err);
      setAvatars([]);
    } finally {
      setLoading(false);
    }
  }, [avatarPath, resolvedAvatarFolder]);

  useEffect(() => {
    if (visible) {
      setFocusIndex(0);
      loadAvatars();
    }
  }, [visible, loadAvatars]);

  const scrollToFocusedTile = useCallback((index: number) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const targetX = Math.max(0, col * tileStrideX - s(40));
    const targetY = Math.max(0, row * tileStrideY - s(40));
    scrollRef.current?.scrollTo({ x: targetX, y: targetY, animated: false });
  }, [columns, tileStrideX, tileStrideY, s]);

  useEffect(() => {
    if (!visible || avatars.length === 0) return;
    scrollToFocusedTile(focusIndex);
  }, [visible, focusIndex, avatars.length, scrollToFocusedTile]);

  const selectFocusedAvatar = useCallback(() => {
    const selected = avatarsRef.current[focusIndexRef.current];
    if (selected) {
      onSelectAvatar(selected.uri);
      onClose();
    }
  }, [onSelectAvatar, onClose]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        soundService.playBack();
        onClose();
        return;
      }

      const currentAvatars = avatarsRef.current;
      if (currentAvatars.length === 0) return;

      if (e.key === 'ArrowRight') {
        playNavSound();
        setFocusIndex(prev => {
          const next = Math.min(prev + 1, currentAvatars.length - 1);
          focusIndexRef.current = next;
          return next;
        });
      } else if (e.key === 'ArrowLeft') {
        playNavSound();
        setFocusIndex(prev => {
          const next = Math.max(prev - 1, 0);
          focusIndexRef.current = next;
          return next;
        });
      } else if (e.key === 'ArrowDown') {
        playNavSound();
        setFocusIndex(prev => {
          const next = Math.min(prev + columns, currentAvatars.length - 1);
          focusIndexRef.current = next;
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        playNavSound();
        setFocusIndex(prev => {
          const next = Math.max(prev - columns, 0);
          focusIndexRef.current = next;
          return next;
        });
      } else if (e.key === 'Enter' || e.key === ' ') {
        soundService.playActivation();
        selectFocusedAvatar();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, columns, onClose, selectFocusedAvatar, playNavSound]);

  const uiStyles = useMemo(() => StyleSheet.create({
    content: {
      flex: 1,
      paddingTop: s(48),
      paddingHorizontal: s(100),
      paddingBottom: s(40),
    },
    title: {
      color: '#FFF',
      fontSize: s(28),
      fontWeight: '300',
      fontFamily: 'SSTLight',
      marginLeft: s(-50),
      marginBottom: s(44),
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: gap,
      paddingTop: s(8),
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: s(80),
    },
    emptyText: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: s(16),
      textAlign: 'center',
      maxWidth: s(480),
      lineHeight: s(24),
    },
    footerLeft: {
      position: 'absolute',
      bottom: s(28),
      left: s(72),
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(16),
      zIndex: 3,
    },
    footer: {
      position: 'absolute',
      bottom: s(28),
      right: s(72),
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
      zIndex: 3,
    },
    footerText: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: s(13),
      fontFamily: 'SSTLight',
    },
    footerKey: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: s(13),
      fontFamily: 'SSTBold',
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: s(60),
      gap: s(16),
    },
    loadingText: {
      color: 'rgba(255,255,255,0.45)',
      fontSize: s(14),
      fontFamily: 'SSTLight',
    },
  }), [s, gap]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={styles.root} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
        <View style={styles.backdropDim} />

        <Animated.View style={[styles.content, uiStyles.content]} entering={FadeIn.delay(60).duration(240)}>
          <Text style={uiStyles.title}>Elegir avatar</Text>

          {loading ? (
            <View style={uiStyles.loadingWrap}>
              <ActivityIndicator size="large" color="#FFF" />
              <Text style={uiStyles.loadingText}>Preparando avatares…</Text>
            </View>
          ) : avatars.length > 0 ? (
            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: s(80) }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={uiStyles.grid}>
                {avatars.map((img, idx) => (
                  <AvatarTile
                    key={img.uri}
                    previewUri={img.thumbnail || img.uri}
                    isFocused={focusIndex === idx}
                    isSelected={currentAvatarUri === img.uri}
                    shouldLoad={true}
                    tileSize={tileSize}
                    onFocus={() => setFocusIndex(idx)}
                    onMouseEnter={() => setFocusIndex(idx)}
                    onPress={() => {
                      onSelectAvatar(img.uri);
                      onClose();
                    }}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={uiStyles.emptyState}>
              <Ionicons name="person-circle-outline" size={s(48)} color="rgba(255,255,255,0.25)" style={{ marginBottom: s(16) }} />
              <Text style={uiStyles.emptyText}>
                No hay avatares en la carpeta configurada. Configura una carpeta en Ajustes → Accesibilidad → Avatares, o añade imágenes a la carpeta predeterminada.
              </Text>
            </View>
          )}
        </Animated.View>

        <View style={uiStyles.footerLeft}>
          <Text style={uiStyles.footerKey}>↑↓←→</Text>
          <Text style={uiStyles.footerText}>Navegar</Text>
          <Text style={uiStyles.footerKey}>Enter</Text>
          <Text style={uiStyles.footerText}>Seleccionar</Text>
        </View>

        <View style={uiStyles.footer}>
          <Text style={uiStyles.footerKey}>Esc</Text>
          <Text style={uiStyles.footerText}>Cerrar</Text>
        </View>
      </Animated.View>
    </Modal>
  );
};

export default AvatarPickerModal;
