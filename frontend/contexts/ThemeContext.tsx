import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ACCENTS,
  DEFAULT_ACCENT_ID,
  DEFAULT_SOUND_PACK_ID,
  getAccent,
  getSoundPack,
  type AccentTheme,
  type SoundPack,
  type SoundName,
} from '@/constants/themes';
import { useUser } from './UserContext';
import { soundService, type SoundSource } from '@/services/soundService';
import {
  getBundledAudioPack,
  getInstalledAudioPack,
  resolveInstalledPackSources,
} from '@/services/deckAudioService';

interface ThemeContextValue {
  accent: AccentTheme;
  accentId: string;
  soundPack: SoundPack;
  soundPackId: string;
  /** Pack de efectos aplicado (bundled-* o instalado), o null = original. */
  audioPackId: string | null;
  audioPackName: string | null;
  /** Pack de música ambiente aplicado, o null = original. */
  musicPackId: string | null;
  musicPackName: string | null;
  setAccent: (id: string) => void;
  setSoundPack: (id: string) => void;
  setAudioPack: (id: string | null) => void;
  setMusicPack: (id: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  accent: getAccent(DEFAULT_ACCENT_ID),
  accentId: DEFAULT_ACCENT_ID,
  soundPack: getSoundPack(DEFAULT_SOUND_PACK_ID),
  soundPackId: DEFAULT_SOUND_PACK_ID,
  audioPackId: null,
  audioPackName: null,
  musicPackId: null,
  musicPackName: null,
  setAccent: () => {},
  setSoundPack: () => {},
  setAudioPack: () => {},
  setMusicPack: () => {},
});

/** Expone el acento como variables CSS para que los anillos de foco (web) lo usen sin re-render. */
function applyAccentCssVars(accent: AccentTheme) {
  try {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--wps-accent', accent.color);
    root.style.setProperty('--wps-accent-glow', accent.glow);
    root.style.setProperty('--wps-accent-soft', accent.soft);
  } catch { /* noop */ }
}

interface ThemeIds {
  accentId: string;
  soundPackId: string;
  audioPackId: string | null;
  musicPackId: string | null;
}

/** Resuelve un slot (efectos o música) a fuentes reproducibles. */
function resolveSlotPack(
  packId: string | null,
  slot: 'audio' | 'music'
): { sources: Partial<Record<SoundName, SoundSource>>; name: string | null } {
  if (!packId) return { sources: {}, name: null };
  const bundled = getBundledAudioPack(packId);
  if (bundled && bundled.kind === slot) {
    return { sources: { ...bundled.files } as Partial<Record<SoundName, SoundSource>>, name: bundled.name };
  }
  const installed = getInstalledAudioPack(packId);
  if (installed && installed.kind === slot) {
    return { sources: resolveInstalledPackSources(installed), name: installed.name };
  }
  return { sources: {}, name: null };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { activeUser, updateUser } = useUser();

  const themeSettings = (activeUser?.settings as any)?.theme ?? {};
  const accentId = themeSettings.accentId ?? DEFAULT_ACCENT_ID;
  const soundPackId = themeSettings.soundPackId ?? DEFAULT_SOUND_PACK_ID;
  const audioPackId: string | null = themeSettings.audioPackId ?? null;
  const musicPackId: string | null = themeSettings.musicPackId ?? null;

  const [localFallback, setLocalFallback] = useState<ThemeIds | null>(null);

  // Sin usuario activo (pantalla de login): usa fallback local + último tema global.
  useEffect(() => {
    if (activeUser) return;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('wps5_global_theme') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        setLocalFallback({
          accentId: parsed.accentId ?? DEFAULT_ACCENT_ID,
          soundPackId: parsed.soundPackId ?? DEFAULT_SOUND_PACK_ID,
          audioPackId: parsed.audioPackId ?? null,
          musicPackId: parsed.musicPackId ?? null,
        });
      }
    } catch { /* noop */ }
  }, [activeUser]);

  const effective: ThemeIds = useMemo(() => (
    activeUser
      ? { accentId, soundPackId, audioPackId, musicPackId }
      : (localFallback ?? { accentId: DEFAULT_ACCENT_ID, soundPackId: DEFAULT_SOUND_PACK_ID, audioPackId: null, musicPackId: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [activeUser, accentId, soundPackId, audioPackId, musicPackId, localFallback]);
  const accent = getAccent(effective.accentId);

  // El acento cambia: anillos de foco, botones principales y resaltados (vía CSS vars en web).
  useEffect(() => {
    applyAccentCssVars(accent);
  }, [accent]);

  // Tema de sonido completo: base + efectos custom + música custom.
  const audioResolved = resolveSlotPack(effective.audioPackId, 'audio');
  const musicResolved = resolveSlotPack(effective.musicPackId, 'music');
  useEffect(() => {
    soundService.applySoundTheme({
      baseId: effective.soundPackId,
      audio: audioResolved.sources,
      music: musicResolved.sources.background !== undefined ? musicResolved.sources.background : undefined,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective.soundPackId, effective.audioPackId, effective.musicPackId]);

  const persist = useCallback((partial: Partial<ThemeIds>) => {
    if (activeUser) {
      updateUser({
        settings: {
          ...activeUser.settings,
          theme: {
            accentId: effective.accentId,
            soundPackId: effective.soundPackId,
            audioPackId: effective.audioPackId,
            musicPackId: effective.musicPackId,
            ...partial,
          },
        } as any,
      });
    } else {
      const next = { ...effective, ...partial };
      setLocalFallback(next);
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('wps5_global_theme', JSON.stringify(next));
      } catch { /* noop */ }
    }
    soundService.playActivation?.().catch(() => {});
  }, [activeUser, effective, updateUser]);

  const value = useMemo<ThemeContextValue>(() => ({
    accent,
    accentId: effective.accentId,
    soundPack: getSoundPack(effective.soundPackId),
    soundPackId: effective.soundPackId,
    audioPackId: effective.audioPackId,
    audioPackName: audioResolved.name,
    musicPackId: effective.musicPackId,
    musicPackName: musicResolved.name,
    setAccent: (id: string) => {
      if (ACCENTS.some((a) => a.id === id)) persist({ accentId: id });
    },
    setSoundPack: (id: string) => persist({ soundPackId: id }),
    setAudioPack: (id: string | null) => persist({ audioPackId: id }),
    setMusicPack: (id: string | null) => persist({ musicPackId: id }),
  }), [accent, effective, audioResolved.name, musicResolved.name, persist]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
