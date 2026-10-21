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
  share: 'share',   // ◂
  options: 'options',    // ▸

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

// ── Equivalente de teclado de cada botón de PlayStation ────────────────────
// Esta tabla es EXACTAMENTE la que usa `useGamepadInput` para traducir los
// botones del mando a pulsaciones de teclado (button 0 -> Enter, 1 -> Escape,
// 2 -> x, 3 -> t, 4 -> q, 5 -> e, 6 -> z, 7 -> c, 8 -> Home, 9 -> s, d-pad ->
// flechas). Por eso la tecla que se muestra hace exactamente lo mismo que el
// botón del mando.
//
// Se usa para mostrar la tecla en lugar del botón cuando no hay mando
// conectado (ver components/PSIcon.tsx).
export const PS_ICON_KEYBOARD_KEYS: Partial<Record<PSIconName, string>> = {
  cross: 'ENTER',
  circle: 'ESC',
  triangle: 'X',
  square: 'T',
  l1: 'Q',
  r1: 'E',
  l2: 'Z',
  r2: 'C',
  share: 'HOME',
  options: 'S',
  dpadUp: '↑',
  dpadDown: '↓',
  dpadLeft: '←',
  dpadRight: '→',
  dpadFull: '↑↓←→',
};

// Reverso carácter -> nombre del icono (los chars de PSIcons son únicos).
const PS_ICON_NAME_BY_CHAR: Record<string, PSIconName> = Object.entries(PSIcons)
  .reduce((acc, entry) => {
    acc[entry[1]] = entry[0] as PSIconName;
    return acc;
  }, {} as Record<string, PSIconName>);

/**
 * Devuelve la tecla de teclado equivalente al icono recibido, o null si ese
 * icono no corresponde a un botón con equivalente de teclado.
 */
export function getKeyboardKeyForChar(char: string): string | null {
  const name = PS_ICON_NAME_BY_CHAR[char];
  if (!name) return null;
  return PS_ICON_KEYBOARD_KEYS[name] ?? null;
}

