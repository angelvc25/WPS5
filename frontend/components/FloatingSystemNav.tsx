import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import CircularNavButton from './CircularNavButton';

interface FloatingSystemNavProps {
  focusedIndex: number; // 0: Ajustes, 1: Cambiar Usuario, 2: Apagar
  isFocused: boolean;   // Whether the system nav currently has keyboard focus
  onPressItem: (index: number) => void;
}

export default function FloatingSystemNav({ focusedIndex, isFocused, onPressItem }: FloatingSystemNavProps) {
  return (
    <View style={styles.outerContainer}>
      <BlurView intensity={35} tint="dark" style={styles.pillContainer}>
        <CircularNavButton
          icon="settings-outline"
          label="Ajustes"
          isActive={isFocused && focusedIndex === 0}
          onPress={() => onPressItem(0)}
        />
        <CircularNavButton
          icon="sync-outline"
          label="Cambiar Usuario"
          isActive={isFocused && focusedIndex === 1}
          onPress={() => onPressItem(1)}
        />
        <CircularNavButton
          icon="power-outline"
          label="Apagar"
          isActive={isFocused && focusedIndex === 2}
          onPress={() => onPressItem(2)}
        />
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    // Positioned floating in the top right quadrant next to the avatar
    position: 'absolute',
    top: 36,
    right: 140,
    zIndex: 1000,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
});
