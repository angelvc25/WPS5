import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { DEFAULT_SOUND_PACK_ID, getSoundPack, type SoundName } from '@/constants/themes';

/** Fuente de sonido: módulo bundled (require) o URI (local-file://, https://...). */
export type SoundSource = any;

export interface SoundThemeResolution {
  /** Pack base (volúmenes + ficheros por defecto). */
  baseId?: string;
  /** Overrides por rol para los 8 efectos UI (módulo o URI). Ausente = fichero base. */
  audio?: Partial<Record<SoundName, SoundSource>>;
  /** Música de fondo (módulo, URI o null para silenciar). undefined = fondo base. */
  music?: SoundSource;
}

class SoundService {
  private navigationSound: AudioPlayer | null = null;
  private activationSound: AudioPlayer | null = null;
  private backgroundSound: AudioPlayer | null = null;
  private backSound: AudioPlayer | null = null;
  private tabSound: AudioPlayer | null = null;
  private startHomeSound: AudioPlayer | null = null;
  private contextMenuSound: AudioPlayer | null = null;
  private exitMenuSound: AudioPlayer | null = null;
  private notificationSound: AudioPlayer | null = null;
  private trophySound: AudioPlayer | null = null;
  private platinumTrophySound: AudioPlayer | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false; // Candado para evitar duplicados
  private soundPackId: string = DEFAULT_SOUND_PACK_ID;
  private uiVolume: number = 1.0;
  /** Overrides del tema actual (packs DeckThemes / bundled). */
  private customAudio: Partial<Record<SoundName, SoundSource>> = {};
  private customMusic: SoundSource | undefined = undefined;

  // Controles de volumen dedicados (Persistidos en localStorage)
  private launcherVolume: number = 1.0; // Sonido de ambiente, interfaz (0.0 - 1.0)
  private gameVolume: number = 0.8;     // Música de juegos al enfocarlos (0.0 - 1.0)
  private currentGameAudioPlayer: AudioPlayer | null = null;
  private volumeListeners: Set<(v: { launcherVolume: number; gameVolume: number }) => void> = new Set();

  constructor() {
    this.loadSavedVolumes();
  }

  private loadSavedVolumes() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedLauncher = window.localStorage.getItem('wps5_launcher_volume');
        if (savedLauncher !== null) {
          const val = parseFloat(savedLauncher);
          if (!isNaN(val)) this.launcherVolume = Math.max(0, Math.min(1, val));
        }
        const savedGame = window.localStorage.getItem('wps5_game_volume');
        if (savedGame !== null) {
          const val = parseFloat(savedGame);
          if (!isNaN(val)) this.gameVolume = Math.max(0, Math.min(1, val));
        }
      }
    } catch (_) {}
  }

  async init() {
    // Evita cargar los sonidos múltiples veces si init() se vuelve a llamar
    if (this.isInitialized) return;

    try {
      // La música de fondo NO arranca en init(): se inicia de forma explícita
      // con playBackground() una vez terminado el splash/video de booteo,
      // para no pisar el audio del video.
      const pack = getSoundPack(this.soundPackId);
      const bgSource = this.customMusic !== undefined
        ? this.customMusic
        : (pack.files?.background ?? require('@/assets/sounds/background.mp3'));
      if (bgSource) {
        const bgSound = createAudioPlayer(bgSource);
        bgSound.loop = true;
        bgSound.volume = Math.max(0, Math.min(1, pack.backgroundVolume * this.launcherVolume));
        bgSound.muted = this.isMuted;
        this.backgroundSound = bgSound;
      } else {
        this.backgroundSound = null;
      }
      this.uiVolume = pack.uiVolume;

      const pick = (name: SoundName, fallback: any) =>
        (this.customAudio[name] ?? pack.files?.[name] ?? fallback);

      const navSound = createAudioPlayer(pick('navigation', require('@/assets/sounds/navigation.mp3')));
      this.navigationSound = navSound;

      const actSound = createAudioPlayer(pick('activation', require('@/assets/sounds/activation.mp3')));
      this.activationSound = actSound;

      const startHomeSound = createAudioPlayer(pick('openHome', require('@/assets/sounds/openHome.mp3')));
      this.startHomeSound = startHomeSound;

      const tabSound = createAudioPlayer(pick('tab', require('@/assets/sounds/pestaña.mp3')));
      this.tabSound = tabSound;

      const backSound = createAudioPlayer(pick('back', require('@/assets/sounds/back.mp3')));
      this.backSound = backSound;

      const contextMenuSound = createAudioPlayer(pick('openControlCenter', require('@/assets/sounds/openControlCenter.mp3')));
      this.contextMenuSound = contextMenuSound;

      const exitMenuSound = createAudioPlayer(pick('exit', require('@/assets/sounds/salir.mp3')));
      this.exitMenuSound = exitMenuSound;

      const notificationSound = createAudioPlayer(pick('notification', require('@/assets/sounds/notification.mp3')));
      this.notificationSound = notificationSound;

      try {
        this.trophySound = createAudioPlayer(require('@/assets/sounds/Trophy Toas.mp3'));
        this.platinumTrophySound = createAudioPlayer(require('@/assets/sounds/Platinum Trophy Toast.mp3'));
      } catch (_) { }

      this.applyVolumes();

      this.isInitialized = true;
    } catch (error) {
      console.error('Error loading sounds:', error);
    }
  }

  async playNavigation() {
    if (this.isMuted || !this.navigationSound) return;
    try { await this.replay(this.navigationSound); } catch (e) { }
  }

  async playBackground() {
    if (this.isMuted || !this.backgroundSound) return;
    try {
      const res = this.backgroundSound.play() as any;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch (error) {
      // Ignorar error si ya está reproduciendo
    }
  }

  async playActivation() {
    if (this.isMuted || !this.activationSound) return;
    try { await this.replay(this.activationSound); } catch (e) { }
  }

  async playContextMenu() {
    if (this.isMuted || !this.contextMenuSound) return;
    try { await this.replay(this.contextMenuSound); } catch (e) { }
  }

  async playStartHome() {
    if (this.isMuted || !this.startHomeSound) return;
    try { await this.replay(this.startHomeSound); } catch (e) { }
  }

  async playTab() {
    if (this.isMuted || !this.tabSound) return;
    try { await this.replay(this.tabSound); } catch (e) { }
  }

  async playBack() {
    if (this.isMuted || !this.backSound) return;
    try { await this.replay(this.backSound); } catch (e) { }
  }

  async stopBackground() {
    if (!this.backgroundSound) return;
    try {
      // Usamos un estricto stop de la instancia actual
      this.backgroundSound.pause();
      await this.backgroundSound.seekTo(0);
    } catch (error) {
      console.error('Error stopping background:', error);
    }
  }

  async pauseBackground() {
    if (!this.backgroundSound) return;
    try { this.backgroundSound.pause(); } catch (_) { }
  }

  async playExitMenu() {
    if (this.isMuted || !this.exitMenuSound) return;
    try { await this.replay(this.exitMenuSound); } catch (e) { }
  }

  async playNotification() {
    if (this.isMuted || !this.notificationSound) return;
    try { await this.replay(this.notificationSound); } catch (e) { }
  }

  async playTrophy(rarity?: string) {
    if (this.isMuted) return;
    try {
      if (rarity === 'platinum' && this.platinumTrophySound) {
        await this.replay(this.platinumTrophySound);
      } else if (this.trophySound) {
        await this.replay(this.trophySound);
      } else if (this.notificationSound) {
        await this.replay(this.notificationSound);
      }
    } catch (_) { }
  }

  // Ahora es una función asíncrona que cambia el estado real del audio en reproducción
  async setMuted(muted: boolean) {
    this.isMuted = muted;

    if (this.backgroundSound) {
      try {
        // Mutea directamente la pista de fondo que está corriendo en tiempo real
        this.backgroundSound.muted = muted;
      } catch (error) {
        console.error('Error setting background mute status:', error);
      }
    }
  }

  /**
   * Silencia o reactiva únicamente la música de fondo, sin afectar los
   * efectos de sonido (navigation, activation, etc.). Útil para silenciar
   * el launcher mientras el usuario está jugando y reanudarla al volver al Home.
   */
  async setBackgroundMuted(muted: boolean) {
    if (this.backgroundSound) {
      try {
        this.backgroundSound.muted = muted;
      } catch (error) {
        console.error('Error setting background muted:', error);
      }
    }
  }

  getSoundPackId() {
    return this.soundPackId;
  }

  /**
   * Cambia el pack de sonido base (volúmenes). Compat: equivale a
   * applySoundTheme({ baseId }) conservando los customs actuales.
   */
  async setSoundPack(packId: string) {
    await this.applySoundTheme({ baseId: packId });
  }

  /**
   * Aplica el tema de sonido completo: pack base + pack de efectos
   * custom (DeckThemes/bundled) + música ambiente custom.
   * Recarga los players y reanuda la música si estaba sonando.
   */
  async applySoundTheme(res: SoundThemeResolution) {
    const pack = getSoundPack(res.baseId ?? this.soundPackId);
    this.soundPackId = pack.id;
    this.uiVolume = pack.uiVolume;
    this.customAudio = res.audio ? { ...res.audio } : this.customAudio;
    if (res.audio && Object.keys(res.audio).length === 0) this.customAudio = {};
    if ('music' in res) this.customMusic = res.music;

    if (!this.isInitialized) return;

    try {
      const hadBackground = !!this.backgroundSound;
      await this.unloadAll();
      await this.init();
      if (hadBackground) await this.playBackground();
    } catch (e) {
      console.error('Error applying sound theme:', e);
    }
  }

  /** Limpia los customs y vuelve a los sonidos originales. */
  async restoreDefaultSounds() {
    // Clave 'music' presente con undefined = restaura el fondo base.
    await this.applySoundTheme({ audio: {}, music: undefined });
  }

  getLauncherVolume(): number {
    return this.launcherVolume;
  }

  setLauncherVolume(volume: number) {
    this.launcherVolume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('wps5_launcher_volume', String(this.launcherVolume));
      }
    } catch (_) {}
    this.notifyVolumeListeners();
  }

  getGameVolume(): number {
    return this.gameVolume;
  }

  setGameVolume(volume: number) {
    this.gameVolume = Math.max(0, Math.min(1, volume));
    if (this.currentGameAudioPlayer) {
      try {
        this.currentGameAudioPlayer.volume = this.gameVolume;
      } catch (_) {}
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('wps5_game_volume', String(this.gameVolume));
      }
    } catch (_) {}
    this.notifyVolumeListeners();
  }

  setCurrentGameAudio(player: AudioPlayer | null) {
    this.currentGameAudioPlayer = player;
    if (player) {
      try {
        player.volume = this.gameVolume;
      } catch (_) {}
    }
  }

  getCurrentGameAudio(): AudioPlayer | null {
    return this.currentGameAudioPlayer;
  }

  subscribeVolumes(listener: (v: { launcherVolume: number; gameVolume: number }) => void) {
    this.volumeListeners.add(listener);
    listener({ launcherVolume: this.launcherVolume, gameVolume: this.gameVolume });
    return () => {
      this.volumeListeners.delete(listener);
    };
  }

  private notifyVolumeListeners() {
    const data = { launcherVolume: this.launcherVolume, gameVolume: this.gameVolume };
    this.volumeListeners.forEach((l) => {
      try { l(data); } catch (_) {}
    });
  }

  private applyVolumes() {
    try {
      const ui = Math.max(0, Math.min(1, this.uiVolume * this.launcherVolume));
      [
        this.navigationSound,
        this.activationSound,
        this.startHomeSound,
        this.tabSound,
        this.backSound,
        this.contextMenuSound,
        this.exitMenuSound,
        this.notificationSound,
        this.trophySound,
        this.platinumTrophySound,
      ].forEach((s) => {
        if (s) s.volume = ui;
      });
      if (this.backgroundSound) {
        const bgVol = getSoundPack(this.soundPackId).backgroundVolume * this.launcherVolume;
        this.backgroundSound.volume = Math.max(0, Math.min(1, bgVol));
      }
    } catch { /* noop */ }
  }

  // Opcional: método para liberar memoria si el componente global se desmonta
  async unloadAll() {
    try {
      [this.backgroundSound, this.navigationSound, this.activationSound, this.startHomeSound, this.tabSound, this.backSound, this.contextMenuSound, this.exitMenuSound, this.notificationSound, this.trophySound, this.platinumTrophySound].forEach(sound => sound?.remove());

      this.isInitialized = false;
    } catch (e) { }
  }

  private async replay(sound: AudioPlayer) {
    try {
      await sound.seekTo(0);
      const res = sound.play() as any;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch (_) {}
  }
}

export const soundService = new SoundService();
