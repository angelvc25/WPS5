import { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export const ResizeMode = {
  CONTAIN: 'contain',
  COVER: 'cover',
  STRETCH: 'fill',
} as const;

interface AppVideoProps {
  source: any;
  style?: ViewStyle | any;
  resizeMode?: (typeof ResizeMode)[keyof typeof ResizeMode];
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  useNativeControls?: boolean;
  onError?: (error: any) => void;
}

/** Compatibility surface for the former expo-av Video component. */
export function Video({
  source,
  style,
  resizeMode = ResizeMode.CONTAIN,
  shouldPlay = false,
  isLooping = false,
  isMuted = false,
  useNativeControls = false,
  onError,
}: AppVideoProps) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = isLooping;
    instance.muted = isMuted;
    if (shouldPlay) instance.play();
  });

  useEffect(() => {
    player.loop = isLooping;
    player.muted = isMuted;
    if (shouldPlay) player.play();
    else player.pause();
  }, [isLooping, isMuted, player, shouldPlay]);

  useEffect(() => {
    if (!onError) return;
    const subscription = player.addListener('statusChange', (payload) => {
      if (payload.status === 'error') {
        onError(payload.error);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [player, onError]);

  return <VideoView player={player} style={style} contentFit={resizeMode} nativeControls={useNativeControls} />;
}
