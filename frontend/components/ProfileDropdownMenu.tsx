import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  Image as RNImage,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/contexts/LanguageContext';
import { TranslationKey } from '@/i18n/translations';
import { UserProfile } from './UserSelectScreen';

// ─── Shimmer que barre todo el menú (igual que en GameContextMenu) ────────────
function ShimmerOverlay() {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        @keyframes wc-profile-shimmer {
          0% {
            transform: translate(-160%, -50%) rotate(-48deg);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          70% {
            transform: translate(130%, -50%) rotate(48deg);
            opacity: 0;
          }
          100% {
            transform: translate(130%, -50%) rotate(48deg);
            opacity: 0;
          }
        }

        .wc-profile-shimmer-line {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%;
          height: 420%;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(255, 255, 255, 0.01) 20%,
            rgba(255, 255, 255, 0.12) 50%,
            rgba(255, 255, 255, 0.01) 80%,
            transparent 100%
          );
          animation: wc-profile-shimmer 6s cubic-bezier(0.42, 0, 0.58, 1) infinite;
          pointer-events: none;
          z-index: 20;
        }
      `}</style>
      <div className="wc-profile-shimmer-line" />
    </>
  );
}

interface ProfileDropdownMenuProps {
  focusedIndex: number;
  onPressItem: (index: number) => void;
  activeUser: UserProfile | null;
  isOnline: boolean;
}

const GLOW_DURATION = 180;
const BASE_MENU_WIDTH = 320;

export default function ProfileDropdownMenu({
  focusedIndex,
  onPressItem,
  activeUser,
  isOnline,
}: ProfileDropdownMenuProps) {
  const { t } = useTranslation();

  // Mismo patrón de escalado que UserSelectScreen.tsx y GameContextMenu.tsx.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const scale = useMemo(
    () => Math.min(windowWidth / 1920, windowHeight / 1080),
    [windowWidth, windowHeight]
  );
  const s = (v: number) => Math.max(1, Math.round(v * scale));
  const MENU_WIDTH = s(BASE_MENU_WIDTH);

  const options = [
    {
      labelKey: 'profile.onlineStatus' as TranslationKey,
      icon: 'person' as const,
      rightComponent: (
        <View style={[styles.statusContainer, { gap: s(6) }]}>
          <View style={[styles.statusDot, { width: s(8), height: s(8), borderRadius: s(4), backgroundColor: isOnline ? '#4CD964' : '#8E8E93' }]} />
          <Text style={[styles.statusText, { fontSize: s(13) }]}>{isOnline ? t('common.online') : t('common.invisible')}</Text>
        </View>
      ),
    },
    {
      labelKey: 'profile.profile' as TranslationKey,
      image: require('@/assets/images/ProfilePicture.png'),
    },
    {
      labelKey: 'profile.trophies' as TranslationKey,
      image: require('@/assets/images/logo-trophy.png'),
    },
    {
      labelKey: 'profile.switchUser' as TranslationKey,
      icon: 'person' as const,
    },
    {
      labelKey: 'profile.exit' as TranslationKey,
      icon: 'log-out-outline' as const,
    },
  ];

  // ─── Animated opacity per item for smooth focus glow transition ───────────
  const glowAnims = useRef(
    options.map((_, i) => new Animated.Value(i === focusedIndex ? 1 : 0))
  ).current;
  const prevFocusRef = useRef(focusedIndex);

  useEffect(() => {
    const prev = prevFocusRef.current;
    if (prev === focusedIndex) return;
    prevFocusRef.current = focusedIndex;

    // Fade out old item
    Animated.timing(glowAnims[prev], {
      toValue: 0,
      duration: GLOW_DURATION,
      useNativeDriver: true,
    }).start();

    // Fade in new item
    Animated.timing(glowAnims[focusedIndex], {
      toValue: 1,
      duration: GLOW_DURATION,
      useNativeDriver: true,
    }).start();
  }, [focusedIndex]);

  return (
    <View style={[styles.container, { width: MENU_WIDTH, borderRadius: s(12), padding: s(6) }]}>
      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(
                45deg,
                rgba(232, 249, 255, 0.17) 0%,
                rgba(120,220,255,0.03) 40%,
                rgba(255,255,255,0.01) 60%,
                rgba(0,0,0,0.00) 100%
              )
            `,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* SHIMMER OVERLAY */}
      {/* <ShimmerOverlay /> */}

      {/* USER HEADER */}
      <View style={[styles.header, { paddingHorizontal: s(14), paddingVertical: s(12) }]}>
        <Text style={[styles.usernameText, { fontSize: s(14) }]} numberOfLines={1}>
          {activeUser?.name || 'Invitado'}
        </Text>
      </View>

      <View style={[styles.divider, { left: s(45), right: s(16) }]} />

      {/* OPTIONS LIST */}
      <View style={[styles.optionsList, { paddingVertical: s(4) }]}>
        {options.map((opt, idx) => {
          const isFocused = idx === focusedIndex;

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.8}
              onPress={() => onPressItem(idx)}
              style={[
                styles.item,
                { paddingVertical: s(10), paddingHorizontal: s(12), height: s(48), marginVertical: s(1) },
                isFocused && styles.itemFocused,
              ]}
            >
              {/* Animated glow focus — fades between items */}
              <Animated.View
                style={[styles.focusGlow, { opacity: glowAnims[idx], borderRadius: s(3) }]}
                pointerEvents="none"
              />
              {isFocused && <ShimmerOverlay />}

              <View style={styles.itemLeft}>
                {opt.image ? (
                  <RNImage
                    source={opt.image}
                    style={{
                      width: s(22),
                      height: s(22),
                      marginRight: s(12),
                    }}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons
                    name={opt.icon!}
                    size={s(22)}
                    color={isFocused ? '#e8ffff' : '#cacaca'}
                    style={{ marginRight: s(12) }}
                  />
                )}

                <Text
                  style={[
                    styles.label,
                    { fontSize: s(15) },
                    isFocused && styles.labelFocused,
                  ]}
                >
                  {t(opt.labelKey)}
                </Text>
              </View>

              {/* Right Side component (e.g., status pill) */}
              {opt.rightComponent && (
                <View style={styles.rightComponentWrapper}>
                  {opt.rightComponent}
                </View>
              )}

              {/* Divider */}
              {idx !== options.length - 1 && (
                <View style={[styles.divider, { left: s(45), right: s(16) }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: BASE_MENU_WIDTH,
    backgroundColor: 'rgba(23, 23, 30, 1)',
    borderRadius: 12,
    //borderWidth: 1,
    //borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    position: 'relative',
    padding: 6,

    // Sombra premium
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  usernameText: {
    fontSize: 14,
    color: '#FFF',
    fontFamily: 'SSTLight',
    letterSpacing: 0.5,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: 45,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  optionsList: {
    paddingVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 0,
    marginVertical: 1,
    height: 48,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
    //borderTopWidth: 1,
    //borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  itemFocused: {
    //backgroundColor: 'rgba(120,255,255,0.06)',
    borderWidth: 0,
    borderColor: 'rgba(120,255,255,0.3)',
  },
  focusGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: 'rgba(180,255,255,0.45)',
    backgroundColor: 'rgba(180,255,255,0.02)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightComponentWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 15,
    color: '#e8ffff',
    fontFamily: 'SSTLight',
    letterSpacing: 0.3,
  },
  labelFocused: {
    color: '#e8ffff',
    //fontWeight: '600',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#8E8E93',
    fontFamily: 'SSTLight',
  },
  trophyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  trophyBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: 'SSTBold',
  },
});