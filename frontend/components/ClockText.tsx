import React, { useEffect, useState } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';

interface ClockTextProps {
  style?: StyleProp<TextStyle>;
}

// Reloj del launcher.
//
// Antes vivía como estado dentro de ConsoleHome (el componente que contiene
// virtually todo el Home) y se actualizaba con un setInterval de 1 segundo.
// Eso provocaba un re-render del árbol completo de Home cada segundo
// (carrusel, widgets, panel de juego, blur...), que era suficiente para que
// el compositor no llegara a pintar a la frecuencia del monitor.
//
// Ahora el reloj es un componente aislado y memoizado: solo se re-renderiza
// cuando cambia el texto (una vez por minuto).
function formatClock(now: Date): string {
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

const ClockText = React.memo(({ style }: ClockTextProps) => {
  const [label, setLabel] = useState(() => formatClock(new Date()));

  useEffect(() => {
    let last = label;
    const update = () => {
      const next = formatClock(new Date());
      // setState con el mismo valor no dispara re-render: el tick de 1s solo
      // provoca un cambio real cuando cambia el minuto.
      if (next !== last) {
        last = next;
        setLabel(next);
      }
    };
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Text style={style}>{label}</Text>;
});

ClockText.displayName = 'ClockText';

export default ClockText;
