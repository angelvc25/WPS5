import { Audio } from 'expo-av';

class SoundService {
  private navigationSound: Audio.Sound | null = null;
  private activationSound: Audio.Sound | null = null;
  private backgroundSound: Audio.Sound | null = null;
  private backSound: Audio.Sound | null = null;
  private tabSound: Audio.Sound | null = null;
  private startHomeSound: Audio.Sound | null = null;
  private contextMenuSound: Audio.Sound | null = null;
  private exitMenuSound: Audio.Sound | null = null;
  private notificationSound: Audio.Sound | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false; // Candado para evitar duplicados

  async init() {
    // Evita cargar los sonidos múltiples veces si init() se vuelve a llamar
    if (this.isInitialized) return;

    try {
      const { sound: bgSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/background.mp3'),
        {
          isLooping: true,
          volume: 0.70,
          shouldPlay: !this.isMuted, // No reproduce de golpe si ya se configuró muteado
        }
      );
      this.backgroundSound = bgSound;

      const { sound: navSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/navigation.mp3')
      );
      this.navigationSound = navSound;

      const { sound: actSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/activation.mp3')
      );
      this.activationSound = actSound;

      const { sound: startHomeSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/openHome.mp3')
      );
      this.startHomeSound = startHomeSound;

      const { sound: tabSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/pestaña.mp3')
      );
      this.tabSound = tabSound;

      const { sound: backSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/back.mp3')
      );
      this.backSound = backSound;

      const { sound: contextMenuSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/openControlCenter.mp3')
      );
      this.contextMenuSound = contextMenuSound;

      const { sound: exitMenuSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/salir.mp3')
      );
      this.exitMenuSound = exitMenuSound;

      const { sound: notificationSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/notification.mp3')
      );
      this.notificationSound = notificationSound;

      this.isInitialized = true;
    } catch (error) {
      console.error('Error loading sounds:', error);
    }
  }

  async playNavigation() {
    if (this.isMuted || !this.navigationSound) return;
    try { await this.navigationSound.replayAsync(); } catch (e) { }
  }

  async playBackground() {
    if (this.isMuted || !this.backgroundSound) return;
    try {
      await this.backgroundSound.playAsync();
    } catch (error) {
      // Ignorar error si ya está reproduciendo
    }
  }

  async playActivation() {
    if (this.isMuted || !this.activationSound) return;
    try { await this.activationSound.replayAsync(); } catch (e) { }
  }

  async playContextMenu() {
    if (this.isMuted || !this.contextMenuSound) return;
    try { await this.contextMenuSound.replayAsync(); } catch (e) { }
  }

  async playStartHome() {
    if (this.isMuted || !this.startHomeSound) return;
    try { await this.startHomeSound.replayAsync(); } catch (e) { }
  }

  async playTab() {
    if (this.isMuted || !this.tabSound) return;
    try { await this.tabSound.replayAsync(); } catch (e) { }
  }

  async playBack() {
    if (this.isMuted || !this.backSound) return;
    try { await this.backSound.replayAsync(); } catch (e) { }
  }

  async stopBackground() {
    if (!this.backgroundSound) return;
    try {
      // Usamos un estricto stop de la instancia actual
      await this.backgroundSound.stopAsync();
    } catch (error) {
      console.error('Error stopping background:', error);
    }
  }

  async playExitMenu() {
    if (this.isMuted || !this.exitMenuSound) return;
    try { await this.exitMenuSound.replayAsync(); } catch (e) { }
  }

  async playNotification() {
    if (this.isMuted || !this.notificationSound) return;
    try { await this.notificationSound.replayAsync(); } catch (e) { }
  }

  // Ahora es una función asíncrona que cambia el estado real del audio en reproducción
  async setMuted(muted: boolean) {
    this.isMuted = muted;

    if (this.backgroundSound) {
      try {
        // Mutea directamente la pista de fondo que está corriendo en tiempo real
        await this.backgroundSound.setIsMutedAsync(muted);
      } catch (error) {
        console.error('Error setting background mute status:', error);
      }
    }
  }

  // Opcional: método para liberar memoria si el componente global se desmonta
  async unloadAll() {
    try {
      if (this.backgroundSound) await this.backgroundSound.unloadAsync();
      if (this.navigationSound) await this.navigationSound.unloadAsync();
      if (this.activationSound) await this.activationSound.unloadAsync();
      if (this.startHomeSound) await this.startHomeSound.unloadAsync();
      if (this.tabSound) await this.tabSound.unloadAsync();
      if (this.backSound) await this.backSound.unloadAsync();
      if (this.contextMenuSound) await this.contextMenuSound.unloadAsync();
      if (this.exitMenuSound) await this.exitMenuSound.unloadAsync();
      if (this.notificationSound) await this.notificationSound.unloadAsync();

      this.isInitialized = false;
    } catch (e) { }
  }
}

export const soundService = new SoundService();