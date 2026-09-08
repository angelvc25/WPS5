import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

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

  async init() {
    // Evita cargar los sonidos múltiples veces si init() se vuelve a llamar
    if (this.isInitialized) return;

    try {
      const bgSound = createAudioPlayer(require('@/assets/sounds/background.mp3'));
      bgSound.loop = true;
      bgSound.volume = 0.70;
      bgSound.muted = this.isMuted;
      if (!this.isMuted) bgSound.play();
      this.backgroundSound = bgSound;

      const navSound = createAudioPlayer(require('@/assets/sounds/navigation.mp3'));
      this.navigationSound = navSound;

      const actSound = createAudioPlayer(require('@/assets/sounds/activation.mp3'));
      this.activationSound = actSound;

      const startHomeSound = createAudioPlayer(require('@/assets/sounds/openHome.mp3'));
      this.startHomeSound = startHomeSound;

      const tabSound = createAudioPlayer(require('@/assets/sounds/pestaña.mp3'));
      this.tabSound = tabSound;

      const backSound = createAudioPlayer(require('@/assets/sounds/back.mp3'));
      this.backSound = backSound;

      const contextMenuSound = createAudioPlayer(require('@/assets/sounds/openControlCenter.mp3'));
      this.contextMenuSound = contextMenuSound;

      const exitMenuSound = createAudioPlayer(require('@/assets/sounds/salir.mp3'));
      this.exitMenuSound = exitMenuSound;

      const notificationSound = createAudioPlayer(require('@/assets/sounds/notification.mp3'));
      this.notificationSound = notificationSound;

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
