/**
 * sync-music.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Escanea assets/music/, lee los metadatos ID3 de cada archivo de audio,
 * extrae la portada embebida si existe, y regenera constants/tracks.ts
 * automáticamente.
 *
 * Uso:
 *   node scripts/sync-music.mjs
 *
 * O agrega a package.json:
 *   "scripts": { "sync-music": "node scripts/sync-music.mjs" }
 * y ejecuta:
 *   npm run sync-music
 *
 * Formatos soportados: .mp3  .flac  .ogg  .m4a  .aac  .wav
 *
 * Dependencia (instalar una sola vez):
 *   npm install music-metadata --save-dev
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { parseFile, selectCover } from 'music-metadata';
import fs   from 'node:fs';
import path from 'node:path';

// ─── Configuración ────────────────────────────────────────────────────────────
// Ajusta estas rutas si la estructura de tu proyecto es diferente.
const PROJECT_ROOT  = process.cwd();                          // raíz del proyecto
const MUSIC_DIR     = path.join(PROJECT_ROOT, 'assets', 'music');
const COVERS_DIR    = path.join(MUSIC_DIR, 'covers');         // portadas extraídas
const OUTPUT_FILE   = path.join(PROJECT_ROOT, 'constants', 'tracks.ts');

// Colores predeterminados asignados en rotación cuando no hay portada con color dominante
const FALLBACK_COLORS = [
  '#1DB954', '#e40d60', '#6a5acd', '#e67e22',
  '#2980b9', '#c0392b', '#16a085', '#8e44ad',
];

// Extensiones de audio aceptadas
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.ogg', '.m4a', '.aac', '.wav']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte texto a slug seguro para usar como id */
function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Extrae la portada embebida y la guarda como .jpg en COVERS_DIR.
 *  Devuelve la ruta relativa desde la carpeta music/ o null. */
function extractCover(pictures, baseSlug) {
  if (!pictures || pictures.length === 0) return null;
  const pic = selectCover(pictures) ?? pictures[0];
  if (!pic?.data) return null;

  const ext = pic.format?.split('/')[1] ?? 'jpg';
  const filename = `${baseSlug}.${ext}`;
  const dest = path.join(COVERS_DIR, filename);

  fs.mkdirSync(COVERS_DIR, { recursive: true });
  fs.writeFileSync(dest, pic.data);
  return filename; // relativo a COVERS_DIR
}

/** Genera un color hex simple desde el primer byte del buffer de portada (pseudo-dominante) */
function colorFromCover(pictures) {
  if (!pictures || pictures.length === 0) return null;
  const pic = selectCover(pictures) ?? pictures[0];
  if (!pic?.data || pic.data.length < 3) return null;
  // Usa los primeros bytes RGB del archivo como base (rápido, sin canvas)
  const r = pic.data[0];
  const g = pic.data[1];
  const b = pic.data[2];
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Verificar que existe la carpeta de música
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    console.log(`📁  Carpeta creada: ${path.relative(PROJECT_ROOT, MUSIC_DIR)}`);
    console.log('    Agrega archivos .mp3 y vuelve a ejecutar el script.');
    return;
  }

  // 2. Leer todos los archivos de audio
  const files = fs.readdirSync(MUSIC_DIR)
    .filter(f => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.log('⚠️   No se encontraron archivos de audio en', path.relative(PROJECT_ROOT, MUSIC_DIR));
    console.log('    Agrega archivos .mp3 / .flac / .ogg y vuelve a ejecutar.');
    return;
  }

  console.log(`🎵  Escaneando ${files.length} archivo(s) en assets/music/...\n`);

  const tracks = [];

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filepath = path.join(MUSIC_DIR, filename);
    const basename = path.basename(filename, path.extname(filename));
    const slug     = slugify(basename) || `track-${i + 1}`;

    let title   = basename;   // fallback = nombre del archivo
    let artist  = 'Desconocido';
    let album   = '';
    let coverFile = null;
    let color   = null;

    try {
      const meta = await parseFile(filepath, { skipCovers: false });
      const t = meta.common;

      if (t.title)  title  = t.title;
      if (t.artist) artist = t.artist;
      if (t.album)  album  = t.album;

      coverFile = extractCover(t.picture, slug);
      color     = colorFromCover(t.picture) ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];

      console.log(`  ✅  ${title} — ${artist}${coverFile ? ' (portada extraída)' : ''}`);
    } catch (err) {
      console.warn(`  ⚠️  No se pudieron leer los tags de "${filename}": ${err.message}`);
      color = FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    }

    tracks.push({ id: `${i + 1}`, title, artist, album, filename, coverFile, color });
  }

  // 3. Construir el contenido de tracks.ts
  const lines = [
    `/**`,
    ` * constants/tracks.ts  —  AUTO-GENERADO por scripts/sync-music.mjs`,
    ` * ⚠️  No edites este archivo a mano; ejecuta:  npm run sync-music`,
    ` *`,
    ` * Para agregar una canción:`,
    ` *   1. Copia el archivo .mp3 / .flac / .ogg a  assets/music/`,
    ` *   2. Ejecuta:  npm run sync-music`,
    ` */`,
    ``,
    `export interface Track {`,
    `  id: string;`,
    `  title: string;`,
    `  artist: string;`,
    `  album?: string;`,
    `  source: number;`,
    `  artwork?: number;`,
    `  color?: string;`,
    `}`,
    ``,
    `const tracks: Track[] = [`,
  ];

  for (const t of tracks) {
    const sourceRequire  = `require('../assets/music/${t.filename}')`;
    const artworkRequire = t.coverFile
      ? `require('../assets/music/covers/${t.coverFile}')`
      : null;

    lines.push(`  {`);
    lines.push(`    id: ${JSON.stringify(t.id)},`);
    lines.push(`    title: ${JSON.stringify(t.title)},`);
    lines.push(`    artist: ${JSON.stringify(t.artist)},`);
    if (t.album) lines.push(`    album: ${JSON.stringify(t.album)},`);
    lines.push(`    source: ${sourceRequire},`);
    if (artworkRequire) lines.push(`    artwork: ${artworkRequire},`);
    if (t.color) lines.push(`    color: ${JSON.stringify(t.color)},`);
    lines.push(`  },`);
  }

  lines.push(`];`);
  lines.push(``);
  lines.push(`export default tracks;`);
  lines.push(``);

  // 4. Escribir constants/tracks.ts
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');

  console.log(`\n✨  ${tracks.length} track(s) guardados en ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`);
  console.log(`\n📝  Para agregar más canciones:`);
  console.log(`      1. Copia el .mp3 a  assets/music/`);
  console.log(`      2. Ejecuta:  npm run sync-music\n`);
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
