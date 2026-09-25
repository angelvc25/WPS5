import { useTranslation } from '@/contexts/LanguageContext';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ConsoleItem } from '../app/(tabs)/index';
import { isPsnEligiblePlatform } from '../services/psnMetadataService';
import {
  fetchIgdbFieldData,
  fetchPsnFieldData,
  fetchRawgFieldData,
  fetchSteamFieldData,
  type SourceFieldData,
} from '../services/metadataFields';
import type { FieldSyncPreferences } from '../services/metadataPreferences';
import type { Language } from '@/i18n/translations';

interface GameMetadataSectionProps {
  item: ConsoleItem;
  language: string;
  windowWidth: number;
  windowHeight: number;
  /** Fuentes por campo elegidas en Accesibilidad. */
  sources: FieldSyncPreferences;
  /** Foco por mando/teclado (índice 300 del panel): resalta la descripción. */
  isFocused?: boolean;
}

function formatReleaseDate(iso: string | null): string | null {
  if (!iso) return null;
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return iso;
}

export const GameMetadataSection = ({ item, language, windowWidth, windowHeight, sources, isFocused = false }: GameMetadataSectionProps) => {
  const { t } = useTranslation();

  // Scale factor: igual que GameInfoPanel (1.0 a 1080p).
  const scale = Math.min(
    Math.max(Math.max(windowWidth / 1920, windowHeight / 1080), 0.6),
    1.25
  );
  const s = (v: number) => Math.round(v * scale);

  const title = item?.title || '';
  // El Store moderno solo indexa PS4/PS5: en plataformas retro/emuladas los
  // campos PSN caen a IGDB para no traer el juego homónimo equivocado.
  const psnEligible = isPsnEligiblePlatform(item?.platform);
  const eff = (src: string): string => (src === 'psn' && !psnEligible ? 'igdb' : src);
  const effSources = {
    description: eff(sources.description),
    rating: eff(sources.rating),
    publisher: eff(sources.publisher),
    genres: eff(sources.genres),
    releaseDate: eff(sources.releaseDate),
  };

  type SourceKey = 'steam' | 'igdb' | 'rawg' | 'psn';
  const [sourceData, setSourceData] = React.useState<Record<SourceKey, SourceFieldData | null> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const prevTitleRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (prevTitleRef.current !== title) {
      prevTitleRef.current = title;
      setSourceData(null);
    }
    if (!title) {
      setLoading(false);
      return;
    }
    const needed = [...new Set(Object.values(effSources))].filter((v) => v !== 'none') as SourceKey[];
    if (needed.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // debounce: evita pedir fichas mientras se recorre el carrusel
    const timer = setTimeout(() => {
      Promise.all(
        needed.map(async (source) => {
          try {
            if (source === 'steam') return await fetchSteamFieldData(title, (language as Language) || 'es');
            if (source === 'igdb') return await fetchIgdbFieldData(title);
            if (source === 'rawg') return await fetchRawgFieldData(title);
            return await fetchPsnFieldData(title, language);
          } catch {
            return null;
          }
        }),
      ).then((results) => {
        if (cancelled) return;
        const next = { steam: null, igdb: null, rawg: null, psn: null } as Record<SourceKey, SourceFieldData | null>;
        needed.forEach((source, idx) => {
          next[source] = results[idx];
        });
        setSourceData(next);
        setLoading(false);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, language, psnEligible, sources.description, sources.rating, sources.publisher, sources.genres, sources.releaseDate]);

  const pick = (key: 'description' | 'rating' | 'publisher' | 'genres' | 'releaseDate') =>
    sourceData?.[effSources[key] as SourceKey] || null;

  const description = pick('description')?.description || item?.description;
  const publisher = pick('publisher')?.publisher || null;
  const releaseDate = formatReleaseDate(pick('releaseDate')?.releaseDate || item?.releaseDate || null);
  const genresList = pick('genres')?.genres || [];
  const itemGenres = Array.isArray(item?.genres)
    ? item.genres
    : (typeof item?.genres === 'string' ? [item.genres] : []);
  const genres = genresList.length > 0 ? genresList.join(', ') : (itemGenres.length > 0 ? itemGenres.join(', ') : null);
  const classification = sourceData?.psn?.classification || null;
  const platform = item?.platform
    ? (item.platform === 'Retro' && item.retroSystem ? item.retroSystem : item.platform)
    : null;

  const scoreOutOf5 = pick('rating')?.rating ?? (typeof item?.rating === 'number' ? item.rating : null);
  const scoreOutOf100 = effSources.rating === 'psn' && scoreOutOf5 != null ? Math.round(scoreOutOf5 * 20) : null;
  const filledStars = scoreOutOf5 != null ? Math.round(Math.min(Math.max(scoreOutOf5, 0), 5)) : 0;

  const hasContent = description || publisher || releaseDate || genres || classification || platform || scoreOutOf5 != null;
  if (!loading && !hasContent) {
    return null;
  }

  return (
    <View style={[styles.sectionWrapper, { width: windowWidth, marginTop: s(30) }]}>
      <Text style={[styles.sectionTitle, { fontSize: s(18), marginBottom: s(16), paddingLeft: s(50) }]}>
        {t('game.metadataTitle')}
      </Text>

      {loading && !hasContent ? (
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
