import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';
import { toastService } from './toastService';

export interface AndroidCatalogApp {
  name: string;
  packageName: string;
  platform: string;
  type: 'game' | 'media';
  description: string;
  image: string;
  backgroundImage?: string;
  rating?: number;
}

export const POPULAR_ANDROID_CATALOG: AndroidCatalogApp[] = [
  // ── Emuladores ────────────────────────────────────────────────────────────
  {
    name: 'RetroArch',
    packageName: 'com.retroarch',
    platform: 'Retro',
    type: 'game',
    description: 'Frontend multisistema para emulación de NES, SNES, GBA, PS1, Arcade y más.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co29qg.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc73j1.jpg',
    rating: 4.8,
  },
  {
    name: 'PPSSPP',
    packageName: 'org.ppsspp.ppsspp',
    platform: 'PSP',
    type: 'game',
    description: 'Emulador de PlayStation Portable para Android con escalado HD.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co28sm.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc72y5.jpg',
    rating: 4.9,
  },
  {
    name: 'NetherSX2 / AetherSX2',
    packageName: 'xyz.aethersx2.android',
    platform: 'PS2',
    type: 'game',
    description: 'Emulador de PlayStation 2 para dispositivos ARM64.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc72y4.jpg',
    rating: 4.8,
  },
  {
    name: 'Dolphin Emulator',
    packageName: 'org.dolphinemu.dolphinemu',
    platform: 'Retro',
    type: 'game',
    description: 'Emulador de GameCube y Wii para Android.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1x77.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc8cwy.jpg',
    rating: 4.8,
  },
  {
    name: 'DuckStation',
    packageName: 'com.github.stenzek.duckstation',
    platform: 'PS1',
    type: 'game',
    description: 'Emulador de PlayStation 1 con enfoque en fidelidad y velocidad.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2159.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc72y5.jpg',
    rating: 4.9,
  },
  {
    name: 'Citra Emulator',
    packageName: 'org.citra.citra_emu',
    platform: 'Retro',
    type: 'game',
    description: 'Emulador de Nintendo 3DS para Android.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r5e.jpg',
    rating: 4.6,
  },

  // ── Juegos Nativos Android ────────────────────────────────────────────────
  {
    name: 'Minecraft',
    packageName: 'com.mojang.minecraftpe',
    platform: 'Android',
    type: 'game',
    description: 'Explora mundos infinitos y construye desde la casa más simple hasta el castillo más grandioso.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co811o.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc8cwy.jpg',
    rating: 4.7,
  },
  {
    name: 'Genshin Impact',
    packageName: 'com.miHoYo.GenshinImpact',
    platform: 'Android',
    type: 'game',
    description: 'Juego de rol y acción en mundo abierto ambientado en Teyvat.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2m37.jpg',
    backgroundImage: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc86g3.jpg',
    rating: 4.6,
  },
  {
    name: 'Roblox',
    packageName: 'com.roblox.client',
    platform: 'Android',
    type: 'game',
    description: 'Un universo virtual para jugar, crear y ser lo que tú quieras.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co272k.jpg',
    rating: 4.4,
  },
  {
    name: 'Call of Duty: Mobile',
    packageName: 'com.activision.callofduty.shooter',
    platform: 'Android',
    type: 'game',
    description: 'Acción FPS icónica y multijugador frenético en la palma de tu mano.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1x3f.jpg',
    rating: 4.5,
  },
  {
    name: 'Dead Cells',
    packageName: 'com.playdigious.deadcells.mobile',
    platform: 'Android',
    type: 'game',
    description: 'Roguelike de acción y plataformas estilo metroidvania.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1re9.jpg',
    rating: 4.9,
  },

  // ── Cloud Gaming / Streaming ──────────────────────────────────────────────
  {
    name: 'Xbox Game Pass / Cloud',
    packageName: 'com.gamepass',
    platform: 'Xbox',
    type: 'game',
    description: 'Juega cientos de títulos de Xbox directo desde la nube con tu mando.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1v5j.jpg',
    rating: 4.7,
  },
  {
    name: 'GeForce NOW',
    packageName: 'com.nvidia.geforcenow',
    platform: 'PC',
    type: 'game',
    description: 'Transmite tus juegos de PC de Steam, Epic y Ubisoft con gráficos RTX.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co23kw.jpg',
    rating: 4.6,
  },
  {
    name: 'Steam Link',
    packageName: 'com.valvesoftware.steamlink',
    platform: 'PC',
    type: 'game',
    description: 'Transmite juegos desde tu PC de escritorio a tu dispositivo Android.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1xcd.jpg',
    rating: 4.5,
  },
  {
    name: 'Moonlight Game Streaming',
    packageName: 'com.limelight',
    platform: 'PC',
    type: 'game',
    description: 'Streaming de juegos de PC ultrarrápido y de bajísima latencia vía Sunshine/Nvidia.',
    image: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1xcd.jpg',
    rating: 4.8,
  },

  // ── Medios y Streaming ────────────────────────────────────────────────────
  {
    name: 'Spotify',
    packageName: 'com.spotify.music',
    platform: 'Android',
    type: 'media',
    description: 'Música, podcasts y listas de reproducción favoritas.',
    image: 'https://images.unsplash.com/photo-1614680376593-902f749f7ffc?w=600&auto=format&fit=crop&q=80',
    rating: 4.8,
  },
  {
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    platform: 'Android',
    type: 'media',
    description: 'Videos, gameplays, música y emisiones en vivo.',
    image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&auto=format&fit=crop&q=80',
    rating: 4.8,
  },
  {
    name: 'Twitch',
    packageName: 'tv.twitch.android.app',
    platform: 'Android',
    type: 'media',
    description: 'Transmisiones de esports, gameplays y creadores en vivo.',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    rating: 4.7,
  },
];

export const androidAppService = {
  /**
   * Lanza una app nativa en Android por su nombre de paquete o enlace URL.
   */
  async launchApp(item: { id?: string; title?: string; path?: string; launchArgs?: string }): Promise<boolean> {
    const rawPath = item.path || '';
    console.log('[AndroidAppService] Intentando lanzar:', item.title, rawPath);

    if (!rawPath) {
      toastService.show(`No se especificó la ruta o paquete de ${item.title || 'la app'}.`);
      return false;
    }

    // Si es un enlace web o esquema directo (http, https, intent, market)
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
      try {
        await Linking.openURL(rawPath);
        return true;
      } catch (err) {
        console.warn('[AndroidAppService] Error al abrir URL:', err);
      }
    }

    // Si es un paquete de Android (ej: com.retroarch, org.ppsspp.ppsspp, com.mojang.minecraftpe)
    const isPackageName = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(rawPath);
    if (isPackageName || Platform.OS === 'android') {
      try {
        // En Android usamos IntentLauncher para iniciar la actividad principal de la app
        await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
          packageName: rawPath,
          category: 'android.intent.category.LAUNCHER',
        });
        toastService.show(`Lanzando ${item.title || 'aplicación'}...`, {
          icon: require('@/assets/images/install.png'),
        });
        return true;
      } catch (intentErr: any) {
        console.warn(`[AndroidAppService] Falló startActivityAsync para ${rawPath}:`, intentErr);

        // Si la app no está instalada, intentamos abrir Google Play Store
        try {
          const playStoreUrl = `market://details?id=${rawPath}`;
          const canOpen = await Linking.canOpenURL(playStoreUrl);
          if (canOpen) {
            toastService.show(`${item.title} no está instalado. Abriendo Play Store...`);
            await Linking.openURL(playStoreUrl);
            return true;
          }
          const webPlayStore = `https://play.google.com/store/apps/details?id=${rawPath}`;
          await Linking.openURL(webPlayStore);
          return true;
        } catch (storeErr) {
          console.error('[AndroidAppService] No se pudo abrir Play Store:', storeErr);
        }
      }
    }

    // Intentar con Linking genérico
    try {
      const url = rawPath.includes('://') ? rawPath : `package:${rawPath}`;
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return true;
      }
    } catch {}

    toastService.show(`No se pudo ejecutar ${item.title || 'la app'}. Verifica que esté instalada.`);
    return false;
  },
};
