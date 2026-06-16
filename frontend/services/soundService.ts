import { Audio } from 'expo-av';

class SoundService {
  private navigationSound: Audio.Sound | null = null;
  private activationSound: Audio.Sound | null = null;
  private backgroundSound: Audio.Sound | null = null;
  private backSound: Audio.Sound | null = null;
  private tabSound: Audio.Sound | null = null;
  private startHomeSound: Audio.Sound | null = null;
  private contextMenuSound: Audio.Sound | null = null;
  private isMuted: boolean = false;

  async init() {
    try {
      const { sound: bgSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/background.mp3'),
        {
          isLooping: true,
          volume: 0.35, // ajusta el volumen (0.0 - 1.0)
          shouldPlay: true,
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

    } catch (error) {
      console.error('Error loading sounds:', error);
    }
  }

  async playNavigation() {
    if (this.isMuted || !this.navigationSound) return;
    try {
      await this.navigationSound.replayAsync();
    } catch (error) {
      // Ignore errors if sound is already playing or busy
    }
  }

  async playBackground() {
    if (this.isMuted || !this.backgroundSound) return;
    try {
      await this.backgroundSound.playAsync();
    } catch (error) {
      // Ignore errors if sound is already playing or busy
    }
  }

  async stopBackground() {
    if (!this.backgroundSound) return;
    try {
      await this.backgroundSound.stopAsync();
    } catch (error) {
      // Ignore errors
    }
  }

  async playActivation() {
    if (this.isMuted || !this.activationSound) return;
    try {
      await this.activationSound.replayAsync();
    } catch (error) {
      // Ignore errors
    }
  }

  async playContextMenu() {
    if (this.isMuted || !this.contextMenuSound) return;
    try {
      await this.contextMenuSound.replayAsync();
    } catch (error) {
      // Ignore errors
    }
  }

  async playStartHome() {
    if (this.isMuted || !this.startHomeSound) return;
    try {
      await this.startHomeSound.replayAsync();
    } catch (error) {
      // Ignore errors
    }
  }

  async playTab() {
    if (this.isMuted || !this.tabSound) return;
    try {
      await this.tabSound.replayAsync();
    } catch (error) {
      // Ignore errors
    }
  }

  async playTrophys() {
    if (this.isMuted || !this.trophysSound) return;
    try {
      await this.trophysSound.replayAsync();
    } catch (error) {
      // Ignore errors
    }
  }

  async playBack() {
    if (this.isMuted || !this.backSound) return;
    try {
      await this.backSound.replayAsync();
    } catch (error) {
      // Ignore errors
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }
}

export const soundService = new SoundService();
