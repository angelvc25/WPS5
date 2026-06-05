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
    artist: "Desconocido",
    source: require('../assets/music/sería, incluso más fácil.mp3'),
    color: "#1DB954",
  },
];

export default tracks;
