import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import ControlCenterCards from './ControlCenterCards';
import FriendsExpandedCard from './FriendsExpandedCard';
import NotificationsExpandedCard from './NotificationsExpandedCard';
import RadarFocusWrapper from './RadarFocusWrapper';
import { useTranslation } from '@/contexts/LanguageContext';
import { TranslationKey } from '@/i18n/translations';
import { soundService } from '@/services/soundService';

export interface NavItem {
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: TranslationKey;
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'home', labelKey: 'nav.home' },
  { icon: 'albums', labelKey: 'nav.switcher' },
  { icon: 'notifications', labelKey: 'nav.notifications' },
  { icon: 'people', labelKey: 'nav.gameBase' },
  { icon: 'musical-notes', labelKey: 'nav.music' },
  { icon: 'download', labelKey: 'nav.downloads' },
  { icon: 'volume-high', labelKey: 'nav.sound' },
  { icon: 'mic', labelKey: 'nav.mic' },
  { icon: 'game-controller', labelKey: 'nav.accessories' },
  { icon: 'person-circle', labelKey: 'nav.profile' },
  { icon: 'power', labelKey: 'nav.power' },
];

interface FloatingSystemNavProps {
  focusedIndex: number;
  isFocused: boolean;
  onPressItem: (index: number) => void;
  onClose: () => void;
  navLevel?: number; // 0 for menu, 1 for cards
  cardIndex?: number;
  isCardExpanded?: boolean;
  onPressCard?: (index: number) => void;
  onCloseExpanded?: () => void;
  onRefreshApps?: () => void;
  onCardsCountChange?: (maxIndex: number) => void;
  // controlled Game Base friends card (levantado a index.tsx para coordinar Escape con el nav)
  isFriendsOpen?: boolean;
  onFriendsOpenChange?: (open: boolean) => void;
  isNotificationsOpen?: boolean;
  onNotificationsOpenChange?: (open: boolean) => void;
}

export default function FloatingSystemNav({
  focusedIndex,
  isFocused,
  onPressItem,
  onClose,
  navLevel = 0,
  cardIndex = 0,
  isCardExpanded = false,
  onPressCard = () => { },
  onCloseExpanded = () => { },
  onRefreshApps,
  onCardsCountChange,
  isFriendsOpen: controlledFriendsOpen,
  onFriendsOpenChange,
  isNotificationsOpen: controlledNotificationsOpen,
  onNotificationsOpenChange,
}: FloatingSystemNavProps) {
  const { t } = useTranslation();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(50);

  const notificationsBtnRef = useRef<any>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState({ top: 0, left: 0 });

  // Game Base – Friends expanded card (controlado por padre si se provee, sino local)
  const [internalFriendsOpen, setInternalFriendsOpen] = useState(false);
  const isFriendsOpen = controlledFriendsOpen !== undefined ? controlledFriendsOpen : internalFriendsOpen;
  const setIsFriendsOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? (v as any)(isFriendsOpen) : v;
    if (onFriendsOpenChange) onFriendsOpenChange(next);
    else setInternalFriendsOpen(next);
  };

  // NUEVO — estado de la card de notificaciones (mismo patrón)
  const [internalNotificationsOpen, setInternalNotificationsOpen] = useState(false);
  const isNotificationsOpen = controlledNotificationsOpen !== undefined ? controlledNotificationsOpen : internalNotificationsOpen;
  const setIsNotificationsOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? (v as any)(isNotificationsOpen) : v;
    if (onNotificationsOpenChange) onNotificationsOpenChange(next);
    else setInternalNotificationsOpen(next);
  };

  // cerrar amigos si se cierra el nav
  useEffect(() => {
    if (!isFocused) {
      setIsFriendsOpen(false);
      setIsNotificationsOpen(false);
    }
  }, [isFocused]);


  useEffect(() => {
    if (isNotificationsOpen) {
      notificationsBtnRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
        setNotificationsAnchor({ top: y, left: x + width / 2 });
      });
    }
  }, [isNotificationsOpen]);

  const handlePressItem = (index: number) => {
    if (index === 2) {
      if (isFriendsOpen) setIsFriendsOpen(false);
      if (!isNotificationsOpen) {
        setIsNotificationsOpen(true);
        soundService.playActivation?.();
      } else {
        soundService.playNavigation();
      }
      return;
    }
    if (index === 3) {
      if (isNotificationsOpen) setIsNotificationsOpen(false);
      if (!isFriendsOpen) {
        setIsFriendsOpen(true);
        soundService.playActivation?.();
      } else {
        soundService.playNavigation();
      }
      return;
    }
    if (isFriendsOpen) setIsFriendsOpen(false);
    if (isNotificationsOpen) setIsNotificationsOpen(false);
    onPressItem(index);
  };

  const handleCloseFriends = () => {
    setIsFriendsOpen(false);
    soundService.playBack?.();
  };

  const handleCloseNotifications = () => {
    setIsNotificationsOpen(false);
    soundService.playBack?.();
  };

  useEffect(() => {
    if (isFocused) {
      opacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) });
    } else {
      opacity.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) });
      translateY.value = withTiming(50, { duration: 200, easing: Easing.in(Easing.ease) });
    }
  }, [isFocused]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    pointerEvents: isFocused ? 'auto' : 'none',
  }));

  const menuStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
    pointerEvents: isFocused ? 'auto' : 'none',
  }));

  if (!isFocused && opacity.value === 0) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]} pointerEvents={isFocused ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents="none">
        {/* Gradient overlay: transparent top → deep black bottom */}
        {/* @ts-ignore */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0, 0, 0, 1) 10%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.15) 100%)',
            pointerEvents: 'none',
          }}
        />
      </Animated.View>
      {/* Backdrop to close — disabled while a card is expanded so controls stay clickable.
          Si la card de amigos está abierta, el backdrop no cierra el nav completo, solo la card
          (la card tiene su propio backdrop). */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: 0 }]}
        pointerEvents={isFocused && !isCardExpanded && !isFriendsOpen && !isNotificationsOpen ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* FriendsExpandedCard – encima del gradient pero debajo del pill para mantener el fondo oscurecido */}
      <FriendsExpandedCard isOpen={isFriendsOpen} onClose={handleCloseFriends} />
      <NotificationsExpandedCard
        isOpen={isNotificationsOpen}
        onClose={handleCloseNotifications}
        anchorLeft={notificationsAnchor.left}
        anchorTop={notificationsAnchor.top}
      />

      <Animated.View style={[styles.menuContainer, menuStyle, { zIndex: 2 }]}>
        {isFocused && !isFriendsOpen && !isNotificationsOpen && (
          <ControlCenterCards
            isFocusedLayer={isFocused && navLevel === 1}
            focusedIndex={cardIndex}
            onPressCard={onPressCard}
            isExpanded={isCardExpanded}
            onCloseExpanded={onCloseExpanded}
            activeNavIndex={focusedIndex}
            onRefreshApps={onRefreshApps}
            onCardsCountChange={onCardsCountChange}
          />
        )}

        <BlurView intensity={0} tint="dark" style={styles.pillContainer}>
          {NAV_ITEMS.map((item, index) => {
            const isActive = isFocused && focusedIndex === index;
            // resaltar Game Base cuando la card de amigos está abierta
            const isFriendsActive = isFriendsOpen && index === 3;
            const isNotificationsActive = isNotificationsOpen && index === 2;
            const showActiveRing = isActive || isFriendsActive || isNotificationsActive;
            return (
              <TouchableOpacity
                key={index}
                ref={index === 2 ? notificationsBtnRef : undefined}
                activeOpacity={0.7}
                onPress={() => handlePressItem(index)}
                style={styles.iconButton}
              >
                {showActiveRing ? (
                  <RadarFocusWrapper id={`sys-nav-${index}`} isFocused={showActiveRing} size={58} innerSize={0}>
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={'#000'}
                      style={{
                        backgroundColor: '#FFF',
                        width: 40,
                        height: 40,
                        borderRadius: 29,
                        padding: 7,
                        paddingLeft: 8,
                      }}
                    />
                  </RadarFocusWrapper>
                ) : (
                  <View style={styles.iconWrapper}>
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={'rgba(255, 255, 255, 1)'}
                    />
                  </View>
                )}
                {isActive && (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipText}>{t(item.labelKey)}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuContainer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',

    width: '100%'
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    //borderRadius: 30,
    //borderWidth: 1,
    //borderColor: 'rgba(255, 255, 255, 0.1)',
    //backgroundColor: 'rgba(15, 23, 42, 0.4)',
    overflow: 'visible',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    width: 44,
    height: 44,
    position: 'relative',
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconWrapperActive: {
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    transform: [{ scale: 1.15 }],
  },
  tooltip: {
    position: 'absolute',
    top: -50,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    //borderWidth: 1,
    //borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 100,
  },
  tooltipText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'SSTMedium',
    letterSpacing: 0.5,
  },
});
