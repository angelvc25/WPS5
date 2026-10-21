import React from 'react';
import { Text, TextStyle, StyleProp, StyleSheet } from 'react-native';
import { PS_ICON_FONT, getKeyboardKeyForChar } from '@/constants/psIcons';
import { useGamepadConnected } from '@/hooks/useGamepadConnected';

interface PSIconProps {
  /** Carácter del ícono, usa el mapa en constants/psIcons.ts, ej. PSIcons.cross */
  char: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Botón de PlayStation de los avisos de controles.
 *
 * Si hay un mando conectado se muestra el botón tal cual (✕, ○, △, □, L1,
 * R1...). Si NO hay mando se muestra en su lugar la tecla de teclado
 * equivalente, que es la misma que genera `useGamepadInput` al pulsar ese
 * botón del mando: Enter, Esc, X, T, Q, E, Z, C, Home, S y las flechas.
 */
export default function PSIcon({ char, size = 20, color = '#fff', style }: PSIconProps) {
  const gamepadConnected = useGamepadConnected();
  const keyboardKey = getKeyboardKeyForChar(char);

  // Sin mando: se dibuja la tecla equivalente como una "tecla" de teclado.
  if (!gamepadConnected && keyboardKey) {
    const fontSize = Math.max(8, Math.round(size * (keyboardKey.length >= 5 ? 0.4 : 0.55)));
    return (
      <Text
        style={[
          styles.keyCap,
          {
            fontSize,
            lineHeight: size,
            minWidth: size + 8,
            color,
            borderColor: color,
          },
          style,
        ]}
      >
        {keyboardKey}
      </Text>
    );
  }

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

const styles = StyleSheet.create({
  keyCap: {
    textAlign: 'center',
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 0,
    overflow: 'hidden',
    includeFontPadding: false,
  },
});
