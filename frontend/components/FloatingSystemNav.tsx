import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

export interface NavItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'home', label: 'Inicio' },
  { icon: 'albums-outline', label: 'Cambiador' },
  { icon: 'notifications-outline', label: 'Notificaciones' },
  { icon: 'people-outline', label: 'Game Base' },
  { icon: 'musical-notes-outline', label: 'Música' },
  { icon: 'download-outline', label: 'Descargas' },
  { icon: 'volume-high-outline', label: 'Sonido' },
  { icon: 'mic-outline', label: 'Micrófono' },
  { icon: 'game-controller-outline', label: 'Accesorios' },
  { icon: 'person-circle-outline', label: 'Perfil' },
  { icon: 'power-outline', label: 'Alimentación' },
];

interface FloatingSystemNavProps {
  focusedIndex: number;
  isFocused: boolean;
  onPressItem: (index: number) => void;
  onClose: () => void;
}

export default function FloatingSystemNav({ focusedIndex, isFocused, onPressItem, onClose }: FloatingSystemNavProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(50);

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
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
        </Pressable>
      </Animated.View>

      <Animated.View style={[styles.menuContainer, menuStyle]}>
        <BlurView intensity={50} tint="dark" style={styles.pillContainer}>
          {NAV_ITEMS.map((item, index) => {
            const isActive = isFocused && focusedIndex === index;
            return (
              <TouchableOpacity
                key={index}
                activeOpacity={0.7}
                onPress={() => onPressItem(index)}
                style={styles.iconButton}
              >
                <View style={[styles.iconWrapper, isActive && styles.iconWrapperActive]}>
                  <Ionicons
                    name={item.icon}
                    size={24}
                    color={isActive ? '#000' : 'rgba(255, 255, 255, 0.7)'}
                  />
                </View>
                {isActive && (
                  <View style={styles.tooltip}>
                    <Text style={styles.tooltipText}>{item.label}</Text>
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
    bottom: 60,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 100,
  },
  tooltipText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
