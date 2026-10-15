import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

interface UsePresentationModeOptions {
  isLaunching: boolean;
}

interface UsePresentationModeReturn {
  presentationEnabled: boolean;
  inactivityTime: string;
  isPresentationMode: boolean;
  setIsPresentationMode: React.Dispatch<React.SetStateAction<boolean>>;
  presentationAnim: ReturnType<typeof useSharedValue<number>>;
  slideshowAlbumName: string | null;
  setSlideshowAlbumName: React.Dispatch<React.SetStateAction<string | null>>;
  slideshowDuration: string;
  slideshowTransition: string;
  slideshowImages: string[];
  setSlideshowImages: React.Dispatch<React.SetStateAction<string[]>>;
  currentSlideIndex: number;
  setCurrentSlideIndex: React.Dispatch<React.SetStateAction<number>>;
  handlePresentationSettingsChange: (enabled: boolean, time: string) => void;
  handleSlidesSettingsChange: (settings: { albumName: string | null; duration: string; transition: string }) => void;
  resetInteraction: () => void;
}

/**
 * Gestiona el modo presentación: temporizador de inactividad, animación de
 * ocultación de UI, ciclo del slideshow y reset por interacción del usuario.
 */
export function usePresentationMode({
  isLaunching,
}: UsePresentationModeOptions): UsePresentationModeReturn {
  // ─── Estado de presentación ───────────────────────────────
  const [presentationEnabled, setPresentationEnabled] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('presentation_enabled') === 'true';
    return false;
  });
  const [inactivityTime, setInactivityTime] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('presentation_inactivity_time') || '15s';
    return '15s';
  });
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const lastInteractionRef = useRef(Date.now());
  const presentationAnim = useSharedValue(0);

  // ─── Estado del slideshow ─────────────────────────────────
  const [slideshowAlbumName, setSlideshowAlbumName] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('slideshow_album') || null;
    return null;
  });
  const [slideshowDuration, setSlideshowDuration] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('slideshow_duration') || '10s';
    return '10s';
  });
  const [slideshowTransition, setSlideshowTransition] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('slideshow_transition') || 'left';
    return 'left';
  });
  const [slideshowImages, setSlideshowImages] = useState<string[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const slideshowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Handlers ────────────────────────────────────────────
  const handlePresentationSettingsChange = useCallback((enabled: boolean, time: string) => {
    setPresentationEnabled(enabled);
    setInactivityTime(time);
    localStorage.setItem('presentation_enabled', String(enabled));
    localStorage.setItem('presentation_inactivity_time', time);
    lastInteractionRef.current = Date.now();
    setIsPresentationMode(false);
  }, []);

  const handleSlidesSettingsChange = useCallback((settings: { albumName: string | null; duration: string; transition: string }) => {
    setSlideshowAlbumName(settings.albumName);
    setSlideshowDuration(settings.duration);
    setSlideshowTransition(settings.transition);
    if (typeof window !== 'undefined') {
      localStorage.setItem('slideshow_album', settings.albumName || '');
      localStorage.setItem('slideshow_duration', settings.duration);
      localStorage.setItem('slideshow_transition', settings.transition);
    }
    // Cargar imágenes del álbum seleccionado
    if (settings.albumName) {
      try {
        const storedAlbums = JSON.parse(localStorage.getItem('mediaGallery_albums') || '[]');
        const album = storedAlbums.find((a: any) => a.name === settings.albumName);
        if (album) {
          setSlideshowImages(album.items);
          setCurrentSlideIndex(0);
        } else {
          setSlideshowImages([]);
        }
      } catch {
        setSlideshowImages([]);
      }
    } else {
      setSlideshowImages([]);
    }
  }, []);

  /**
   * Registra la interacción del usuario: actualiza el timestamp y sale del modo
   * presentación si estaba activo. Se expone para que handleKeyDown en index.tsx
   * la llame al inicio de cada pulsación de tecla.
   */
  const resetInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    if (isPresentationMode) setIsPresentationMode(false);
  }, [isPresentationMode]);

  // ─── Slideshow: cargar álbum guardado al iniciar ──────────
  useEffect(() => {
    if (!slideshowAlbumName || typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem('mediaGallery_albums') || '[]');
      const album = stored.find((a: any) => a.name === slideshowAlbumName);
      setSlideshowImages(album?.items ?? []);
      setCurrentSlideIndex(0);
    } catch {
      setSlideshowImages([]);
    }
    // Solo se ejecuta al montar: carga el álbum inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Presentation mode: inactivity timer ─────────────────
  useEffect(() => {
    if (!presentationEnabled || isPresentationMode || isLaunching) return;

    const getMs = () => {
      switch (inactivityTime) {
        case '15s': return 15000;
        case '30s': return 30000;
        case '60s': return 60000;
        case '300s': return 300000;
        default: return 15000;
      }
    };

    const interval = setInterval(() => {
      if (Date.now() - lastInteractionRef.current >= getMs()) {
        setIsPresentationMode(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [presentationEnabled, inactivityTime, isPresentationMode, isLaunching]);

  // ─── Presentation mode: animate UI hide/show ─────────────
  useEffect(() => {
    presentationAnim.value = withTiming(isPresentationMode ? 1 : 0, {
      duration: 800,
      easing: Easing.inOut(Easing.cubic),
    });
    // presentationAnim es un shared value: estable por referencia, no es dep real
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresentationMode]);

  // ─── Slideshow: cycle through album images ────────────────
  useEffect(() => {
    if (slideshowTimerRef.current) {
      clearInterval(slideshowTimerRef.current);
      slideshowTimerRef.current = null;
    }

    if (slideshowImages.length < 2) return;

    const getMs = () => {
      switch (slideshowDuration) {
        case '5s': return 5000;
        case '10s': return 10000;
        case '15s': return 15000;
        case '30s': return 30000;
        default: return 10000;
      }
    };

    slideshowTimerRef.current = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % slideshowImages.length);
    }, getMs());

    return () => {
      if (slideshowTimerRef.current) {
        clearInterval(slideshowTimerRef.current);
        slideshowTimerRef.current = null;
      }
    };
  }, [slideshowImages.length, slideshowDuration]);

  // ─── Presentation mode: reset on mouse/touch ─────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const reset = () => {
      lastInteractionRef.current = Date.now();
      if (isPresentationMode) setIsPresentationMode(false);
    };
    window.addEventListener('mousemove', reset);
    window.addEventListener('mousedown', reset);
    window.addEventListener('touchstart', reset);
    window.addEventListener('wheel', reset);
    return () => {
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('mousedown', reset);
      window.removeEventListener('touchstart', reset);
      window.removeEventListener('wheel', reset);
    };
  }, [isPresentationMode]);

  return {
    presentationEnabled,
    inactivityTime,
    isPresentationMode,
    setIsPresentationMode,
    presentationAnim,
    slideshowAlbumName,
    setSlideshowAlbumName,
    slideshowDuration,
    slideshowTransition,
    slideshowImages,
    setSlideshowImages,
    currentSlideIndex,
    setCurrentSlideIndex,
    handlePresentationSettingsChange,
    handleSlidesSettingsChange,
    resetInteraction,
  };
}
