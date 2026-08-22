import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { PS_ICON_FONT } from '@/constants/psIcons';

interface PSIconProps {
  /** Carácter del ícono, usa el mapa en constants/psIcons.ts, ej. PSIcons.cross */
  char: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function PSIcon({ char, size = 20, color = '#fff', style }: PSIconProps) {
  return (
    <Text
      style={[
        {
          fontFamily: PS_ICON_FONT,
          fontSize: size,
          color,
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {char}
    </Text>
  );
}
