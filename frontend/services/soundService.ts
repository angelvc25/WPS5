import { Audio } from 'expo-av';

class SoundService {
  private navigationSound: Audio.Sound | null = null;
  private activationSound: Audio.Sound | null = null;
  private backgroundSound: Audio.Sound | null = null;
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
        require('@/assets/sounds/navigation.wav')
      );
      this.navigationSound = navSound;

      const { sound: actSound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/activation.wav')
      );
      this.activationSound = actSound;
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

  setMuted(muted: boolean) {
    this.isMuted = muted;
  }
}

export const soundService = new SoundService();
