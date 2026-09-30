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
  private isMuted: boolean = false;
  private isInitialized: boolean = false; // Candado para evitar duplicados
  private soundPackId: string = DEFAULT_SOUND_PACK_ID;
  private uiVolume: number = 1.0;
  /** Overrides del tema actual (packs DeckThemes / bundled). */
  private customAudio: Partial<Record<SoundName, SoundSource>> = {};
  private customMusic: SoundSource | undefined = undefined;

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
        bgSound.volume = pack.backgroundVolume;
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
      this.backgroundSound.play();
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

  private applyVolumes() {
    try {
      const ui = this.uiVolume;
      [
        this.navigationSound,
        this.activationSound,
        this.startHomeSound,
        this.tabSound,
        this.backSound,
        this.contextMenuSound,
        this.exitMenuSound,
        this.notificationSound,
      ].forEach((s) => {
        if (s) s.volume = ui;
      });
      if (this.backgroundSound) {
        this.backgroundSound.volume = getSoundPack(this.soundPackId).backgroundVolume;
      }
    } catch { /* noop */ }
  }

  // Opcional: método para liberar memoria si el componente global se desmonta
  async unloadAll() {
    try {
      [this.backgroundSound, this.navigationSound, this.activationSound, this.startHomeSound, this.tabSound, this.backSound, this.contextMenuSound, this.exitMenuSound, this.notificationSound].forEach(sound => sound?.remove());

      this.isInitialized = false;
    } catch (e) { }
  }

  private async replay(sound: AudioPlayer) {
    await sound.seekTo(0);
    sound.play();
  }
}

export const soundService = new SoundService();
