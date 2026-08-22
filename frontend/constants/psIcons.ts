// Fuente de íconos de botones de PlayStation (TRIANGLESQUAREPLAYSTATIONBUTTONCIRCLECROSS)
// El nombre de familia debe coincidir EXACTO con la key usada en useFonts() en app/_layout.tsx
export const PS_ICON_FONT = 'PSIcons';

// Mapa carácter -> ícono, extraído directamente del cmap del archivo .woff/.ttf
export const PSIcons = {
  // Botones de acción
  triangle: '(', // △
  square: ')',   // □
  circle: 'O',   // ○
  cross: 'X',    // ✕

  // Gatillos / bumpers
  l1: '%',
  r1: '&',
  l2: '*',
  r2: '^',

  // D-Pad
  dpadLeft: '!',
  dpadRight: '"',
  dpadUp: '#',
  dpadDown: '$',
  dpadFull: '+',

  // Misceláneos útiles
  fastForward: 'J', // ≫
  rewind: 'K',      // ≪
  info: 'I',        // ⓘ
  search: 'C',      // 🔍
  menuDots: '.',    // ⋮
  mute: '0',        // 🚫
  settings: 'G',    // ⚙
  redo: 'R',        // ↪
} as const;

export type PSIconName = keyof typeof PSIcons;
