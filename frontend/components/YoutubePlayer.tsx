import React from 'react';
import YoutubeIframe from 'react-native-youtube-iframe';

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
  return (
    <YoutubeIframe
      height={height}
      width={width as number}
      play={play}
      videoId={videoId}
      mute={mute}
      // 1. Configurar parámetros de YouTube
      initialPlayerParams={{
        loop: true,
        controls: false,
        modestbranding: true,
        rel: false,
        preventFullScreen: false,
      }}
      // 2. Inyectar encabezados y políticas al iframe/webview subyacente
      webViewProps={{
        allowsInlineMediaPlayback: true,
        mediaPlaybackRequiresUserAction: false,
        // Atributos directos si corre en entorno Web / Electron
        html: undefined,
        androidLayerType: 'hardware',
        referrerPolicy: 'strict-origin-when-cross-origin',
      }}
    />
  );
};

export default YoutubePlayer;
