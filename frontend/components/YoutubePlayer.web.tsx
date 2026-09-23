import React from 'react';
import { View } from 'react-native';

interface YoutubePlayerProps {
  videoId: string;
  height: number;
  width?: number | string;
  play?: boolean;
  mute?: boolean;
}

const YoutubePlayer: React.FC<YoutubePlayerProps> = ({
  videoId,
  height,
  width = '100%',
  play = false,
  mute = false
}) => {
  // 1. Cambiar a youtube-nocookie.com
  // 2. Agregar enablejsapi=1 para evitar errores de inicialización
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${play ? 1 : 0}&mute=${mute ? 1 : 0}&controls=0&modestbranding=1&rel=0&loop=1&playlist=${videoId}&enablejsapi=1`;

  return (
    <View style={{ height, width: width as any }}>
      {/* @ts-ignore */}
      <iframe
        width="100%"
        height="100%"
        src={embedUrl}
        frameBorder="0"
        // Asegúrate de permitir las características necesarias
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ border: 'none', borderRadius: 12 }}
      />
    </View>
  );
};

export default YoutubePlayer;
