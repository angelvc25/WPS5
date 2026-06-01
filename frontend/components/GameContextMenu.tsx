import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

interface GameContextMenuProps {
  focusedIndex: number; // 0: Editar, 1: Ubicación, 2: Eliminar
  onPressItem: (index: number) => void;
}

export default function GameContextMenu({ focusedIndex, onPressItem }: GameContextMenuProps) {
  const options = [
    { icon: 'pencil-outline', label: 'Editar Datos', color: '#FFF' },
    { icon: 'folder-open-outline', label: 'Ubicación', color: '#FFF' },
    { icon: 'trash-outline', label: 'Eliminar Juego', color: '#FF2D55' },
  ];

  return (
    <View style={styles.absoluteWrapper}>
      <BlurView intensity={45} tint="dark" style={styles.container}>
        {options.map((opt, idx) => {
          const isFocused = idx === focusedIndex;
          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.8}
              onPress={() => onPressItem(idx)}
              style={[
                styles.item,
                isFocused && styles.itemFocused,
              ]}
            >
              <Ionicons
                name={opt.icon as any}
                size={16}
                color={isFocused ? '#00FFFF' : opt.color}
                style={{ marginRight: 10 }}
              />
              <Text
                style={[
                  styles.label,
                  { color: opt.color },
                  isFocused && styles.labelFocused,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteWrapper: {
    position: 'absolute',
    left: 140, // Fits right next to the card (since CARD_SIZE is 130)
    top: 0,
    zIndex: 9999,
    width: 170,
  },
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
    backgroundColor: 'transparent',
  },
  itemFocused: {
    backgroundColor: 'rgba(0, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 255, 0.25)',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  labelFocused: {
    color: '#00FFFF',
    fontWeight: 'bold',
  },
});
