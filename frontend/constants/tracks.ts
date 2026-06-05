/**
 * constants/tracks.ts  —  AUTO-GENERADO por scripts/sync-music.mjs
 * ⚠️  No edites este archivo a mano; ejecuta:  npm run sync-music
 *
 * Para agregar una canción:
 *   1. Copia el archivo .mp3 / .flac / .ogg a  assets/music/
 *   2. Ejecuta:  npm run sync-music
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  source: number;
  artwork?: number;
  color?: string;
}

const tracks: Track[] = [
  {
    id: "1",
    title: "sería, incluso más fácil",
    artist: "ROBI",
    album: "Sorry si soy GRRRIS",
    source: require('../assets/music/sería, incluso más fácil.mp3'),
    artwork: require('../assets/music/covers/sería incluso más fácil.png'),
    color: "#b93c1dff",
  },
];

export default tracks;
