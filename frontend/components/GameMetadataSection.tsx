import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConsoleItem } from '../app/(tabs)/index';
import { fetchPsnMetadata, isPsnEligiblePlatform, psnLocaleForLanguage, type PsnMetadata } from '../services/psnMetadataService';

// Caché en memoria por título para no repetir la petición al recorrer el carrusel.
const metadataCache = new Map<string, PsnMetadata | null>();
const igdbExtraCache = new Map<string, { publishers: string[]; genres: string[] } | null>();

function parseIgdbGenres(game: any): string[] {
  const raw = game?.genres;
  if (!Array.isArray(raw)) return [];
  const names = raw
    .map((g: any) => (typeof g === 'string' ? g : g?.name))
    .filter((n: any): n is string => typeof n === 'string' && n.trim().length > 0);
  return [...new Set(names)];
}

function parseIgdbPublishers(game: any): string[] {
  const companies = game?.involved_companies;
  if (Array.isArray(companies) && companies.length > 0) {
    const flagged = companies
      .filter((c: any) => c?.publisher)
      .map((c: any) => c?.company?.name ?? c?.name)
      .filter((n: any): n is string => typeof n === 'string' && n.trim().length > 0);
    if (flagged.length > 0) return [...new Set(flagged)];
  }
  const direct = game?.publishers;
  if (Array.isArray(direct) && direct.length > 0) {
    const names = direct
      .map((p: any) => (typeof p === 'string' ? p : p?.name))
      .filter((n: any): n is string => typeof n === 'string' && n.trim().length > 0);
    if (names.length > 0) return [...new Set(names)];
  }
  return [];
}

interface GameMetadataSectionProps {
  item: ConsoleItem;
  language: string;
  windowWidth: number;
  windowHeight: number;
  /** Foco por mando/teclado (índice 300 del panel): resalta la descripción. */
  isFocused?: boolean;
}

function formatReleaseDate(iso: string | null): string | null {
  if (!iso) return null;
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return iso;
}

export const GameMetadataSection = ({ item, language, windowWidth, windowHeight, isFocused = false }: GameMetadataSectionProps) => {
  const { t } = useTranslation();

  // Scale factor: igual que GameInfoPanel (1.0 a 1080p).
  const scale = Math.min(
    Math.max(Math.max(windowWidth / 1920, windowHeight / 1080), 0.6),
    1.25
  );
  const s = (v: number) => Math.round(v * scale);

  const title = item?.title || '';
  // El Store moderno solo indexa PS4/PS5: para plataformas retro/emuladas
  // (PS1-PS3, PSP, Vita, Nintendo...) el match por nombre trae el juego
  // equivocado, así que no se busca nada fuera y se muestra tal cual el
  // campo de descripción local del juego.
  const psnEligible = isPsnEligiblePlatform(item?.platform);
  const [metadata, setMetadata] = React.useState<PsnMetadata | null>(() => metadataCache.get(title) ?? null);
  const [igdbExtra, setIgdbExtra] = React.useState<{ publishers: string[]; genres: string[] } | null>(
    () => igdbExtraCache.get(title) ?? null,
  );
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    // Al cambiar de juego (o de elegibilidad) se limpia la ficha anterior
    // para no mostrar datos obsoletos del juego previo.
    if (!title || !psnEligible) {
      setMetadata(null);
      setLoading(false);
      return;
    }
    if (metadataCache.has(title)) {
      setMetadata(metadataCache.get(title) ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // debounce: evita pedir fichas mientras se recorre el carrusel
    const timer = setTimeout(() => {
      fetchPsnMetadata(title, { locale: psnLocaleForLanguage(language) }).then((result) => {
        metadataCache.set(title, result);
        if (!cancelled) {
          setMetadata(result);
          setLoading(false);
        }
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, psnEligible]);

  const details = metadata?.details;
  const match = metadata?.match;

  // En plataformas no elegibles no se busca nada fuera para la descripción
  // (se muestra el campo local), pero IGDB sí aporta publicadora y géneros
  // exactos del juego emulado. Carga silenciosa en segundo plano: el contenido
  // local se muestra de inmediato y estas filas aparecen al llegar.
  React.useEffect(() => {
    // Sin título o con PSN elegible no hay extra de IGDB: se limpia para
    // no mostrar datos obsoletos del juego anterior.
    if (!title || psnEligible) {
      setIgdbExtra(null);
      return;
    }
    if (igdbExtraCache.has(title)) {
      setIgdbExtra(igdbExtraCache.get(title) ?? null);
      return;
    }
    if (typeof window === 'undefined' || !(window as any).electronAPI?.fetchGameData) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      (window as any).electronAPI.fetchGameData(title).then((result: any) => {
        const extra = result?.success && result.data
          ? { publishers: parseIgdbPublishers(result.data), genres: parseIgdbGenres(result.data) }
          : null;
        igdbExtraCache.set(title, extra);
        if (!cancelled) setIgdbExtra(extra);
      }).catch(() => {
        igdbExtraCache.set(title, null);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, psnEligible]);

  const description = details?.description || item?.description;
  const publisher = details?.publisher || igdbExtra?.publishers?.[0] || null;
  const releaseDate = formatReleaseDate(details?.releaseDate || null);
  const genres = details?.genres && details.genres.length > 0
    ? details.genres.join(', ')
    : (igdbExtra?.genres && igdbExtra.genres.length > 0 ? igdbExtra.genres.join(', ') : null);
  const classification = details
    ? (match?.classificationLabel || match?.classification || null)
    : null;
  const platform = item?.platform
    ? (item.platform === 'Retro' && item.retroSystem ? item.retroSystem : item.platform)
    : null;

  const scoreOutOf100 = details?.communityScore ?? null;
  const scoreOutOf5 = scoreOutOf100 != null
    ? scoreOutOf100 / 20
    : (typeof item?.rating === 'number' ? item.rating : null);
  const filledStars = scoreOutOf5 != null ? Math.round(Math.min(Math.max(scoreOutOf5, 0), 5)) : 0;

  if (!loading && !description && !publisher && !releaseDate && !genres && !classification && !platform && scoreOutOf5 == null) {
    return null;
  }

  return (
    <View style={[styles.sectionWrapper, { width: windowWidth, marginTop: s(30) }]}>
      <Text style={[styles.sectionTitle, { fontSize: s(18), marginBottom: s(16), paddingLeft: s(50) }]}>
        {t('game.metadataTitle')}
      </Text>

      {loading && !metadata ? (
        <View style={[styles.loadingRow, { paddingLeft: s(50) }]}>
          <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.25)" />
          <Text style={styles.loadingText}>{t('game.metadataLoading')}</Text>
        </View>
      ) : (
        <View style={[styles.cardsRow, { paddingLeft: s(50), paddingRight: s(50), gap: s(20) }]}>
          {/* Descripción (foco 300 del panel) */}
          {description ? (
            <View style={[styles.card, { padding: s(24), flex: 1.2 }, isFocused && styles.cardFocused]}>
              <Text style={[styles.descriptionText, { fontSize: s(16), lineHeight: s(24) }]}>
                {description}
              </Text>
            </View>
          ) : null}

          {/* Datos de la ficha */}
          {(publisher || releaseDate || platform || genres || classification) ? (
            <View style={[styles.card, { padding: s(24), flex: 1 }]}>
              {publisher ? (
                <Text style={[styles.factPrimary, { fontSize: s(15), marginBottom: s(12) }]} numberOfLines={2}>
                  {publisher.toUpperCase()}
                </Text>
              ) : null}
              {releaseDate ? (
                <Text style={[styles.factText, { fontSize: s(15), marginBottom: s(12) }]}>
                  {releaseDate}
                </Text>
              ) : null}
              {platform ? (
                <View style={{ marginBottom: s(12) }}>
                  <Text style={[styles.platformChip, { fontSize: s(13), paddingHorizontal: s(10), paddingVertical: s(4) }]}>
                    {platform}
                  </Text>
                </View>
              ) : null}
              {genres ? (
                <Text style={[styles.factText, { fontSize: s(15) }]} numberOfLines={3}>
                  {genres}
                </Text>
              ) : null}
              {classification ? (
                <Text style={[styles.factDim, { fontSize: s(14), marginTop: s(12) }]} numberOfLines={2}>
                  {classification}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Puntuación */}
          {scoreOutOf5 != null ? (
            <View style={[styles.card, { padding: s(24), flex: 0.9 }]}>
              <Text style={[styles.scoreLabel, { fontSize: s(14), marginBottom: s(8) }]}>
                {t('game.metadataScore')}
              </Text>
              <Text style={[styles.scoreValue, { fontSize: s(40) }]}>
                {scoreOutOf5.toFixed(2)}
              </Text>
              <View style={[styles.starsRow, { marginTop: s(8), gap: s(4) }]}>
                {[0, 1, 2, 3, 4].map((idx) => (
                  <Ionicons
                    key={idx}
                    name={idx < filledStars ? 'star' : 'star-outline'}
                    size={s(22)}
                    color="#FFF"
                  />
                ))}
              </View>
              {scoreOutOf100 != null ? (
                <Text style={[styles.factDim, { fontSize: s(14), marginTop: s(12) }]}>
                  {scoreOutOf100} / 100
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionWrapper: {},
  sectionTitle: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'SSTLight',
    fontWeight: '300',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  card: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardFocused: {
    borderColor: 'rgba(255,255,255,0.9)',
  },
  descriptionText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'SSTLight',
    fontWeight: '300',
  },
  factPrimary: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'SSTMedium',
    letterSpacing: 0.5,
  },
  factText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'SSTLight',
    fontWeight: '300',
  },
  factDim: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'SSTLight',
    fontWeight: '300',
  },
  platformChip: {
    color: '#111',
    backgroundColor: '#FFF',
    fontFamily: 'SSTBold',
    fontWeight: '700',
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'SSTLight',
    fontWeight: '300',
  },
  scoreValue: {
    color: '#FFF',
    fontFamily: 'SSTLight',
    fontWeight: '300',
  },
  starsRow: {
    flexDirection: 'row',
  },
});
