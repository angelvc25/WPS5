import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  useWindowDimensions,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { soundService } from '@/services/soundService';
import { StoreOffer } from '@/services/storeService';
import { UserProfile } from '@/components/UserSelectScreen';
import { useTranslation } from '@/contexts/LanguageContext';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import SpinningBorderSearch from './SpinningBorderSearch';

export interface SearchGameItem {
  id: string;
  title: string;
  time?: string;
  image?: any;
  path?: string;
  platform?: string;
  type?: 'game' | 'media' | 'web';
}

export type SearchTab = 'games' | 'media' | 'players';

interface SearchEntry {
  id: string;
  title: string;
  subtitle: string;
  image: any;
  platformLabel?: string;
  kind: 'library' | 'store' | 'media' | 'player' | 'subscription';
  item?: SearchGameItem;
  offer?: StoreOffer;
  user?: UserProfile;
  url?: string;
}

interface SearchViewProps {
  visible: boolean;
  onClose: () => void;
  libraryGames: SearchGameItem[];
  mediaItems: SearchGameItem[];
  storeOffers: StoreOffer[];
  users: UserProfile[];
  onOpenGameDetail: (item: SearchGameItem) => void;
}

const TABS: { id: SearchTab; labelKey: any }[] = [
  { id: 'games', labelKey: 'search.games' },
  { id: 'media', labelKey: 'search.media' },
  { id: 'players', labelKey: 'search.players' },
];

const SUBSCRIPTIONS = [
  {
    id: 'sub-psplus',
    title: 'PlayStation Plus',
    subtitleKey: 'search.subscription',
    image: require('@/assets/images/psplus.png'),
    kind: 'subscription' as const,
    url: 'https://www.playstation.com/ps-plus/',
  },
  {
    id: 'sub-eaplay',
    title: 'EA Play',
    subtitleKey: 'search.subscription',
    image: null,
    kind: 'subscription' as const,
    url: 'https://www.ea.com/ea-play',
  },
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesQuery(title: string, query: string) {
  const q = normalizeText(query.trim());
  if (!q) return true;
  return normalizeText(title).includes(q);
}

function platformBadge(item: SearchGameItem) {
  if (item.platform) return item.platform;
  if (item.id.startsWith('steam_')) return 'Steam';
  return 'PC';
}

interface ResultTileProps {
  entry: SearchEntry;
  isFocused: boolean;
  cardSize: number;
  focusPad: number;
  onPress: () => void;
}

const ResultTile = React.memo<ResultTileProps>(({ entry, isFocused, cardSize, focusPad, onPress }) => (
  <View
    style={[
      styles.tileOuter,
      {
        width: cardSize + focusPad * 2,
        height: cardSize + focusPad * 2,
        padding: focusPad - 3,
      },
    ]}
  >
    {isFocused && <SpinningBorderSearch size={cardSize} spread={4} borderRadius={0} />}
    <TouchableOpacity
      style={[styles.resultTile, { width: cardSize, height: cardSize }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={styles.coverWrap}>
        {entry.image ? (
          <Image source={entry.image} style={styles.coverImage} contentFit="cover" transition={120} />
        ) : (
          <View style={styles.coverFallback}>
            <Ionicons name="game-controller-outline" size={32} color="rgba(255,255,255,0.35)" />
          </View>
        )}

        {Platform.OS === 'web' ? (
          // @ts-ignore — degradado inferior estilo PS5
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '62%',
              background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.72) 38%, rgba(0,0,0,0.2) 68%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <View style={styles.coverGradientFallback} pointerEvents="none" />
        )}

        <View style={styles.coverMeta}>
          {entry.platformLabel ? (
            <View style={styles.platformBadge}>
              <Text style={styles.platformBadgeText}>{entry.platformLabel}</Text>
            </View>
          ) : null}
          <Text style={styles.resultTitle} numberOfLines={2}>{entry.title}</Text>
          <Text style={styles.resultSubtitle} numberOfLines={1}>{entry.subtitle}</Text>
        </View>
      </View>
    </TouchableOpacity>
  </View>
));

ResultTile.displayName = 'ResultTile';

const SearchView: React.FC<SearchViewProps> = ({
  visible,
  onClose,
  libraryGames,
  mediaItems,
  storeOffers,
  users,
  onOpenGameDetail,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SearchTab>('games');
  const [query, setQuery] = useState('');
  const [focusArea, setFocusArea] = useState<'tabs' | 'search' | 'results' | 'subscriptions'>('search');
  const [tabFocusIndex, setTabFocusIndex] = useState(0);
  const [resultFocusIndex, setResultFocusIndex] = useState(0);
  const [subscriptionFocusIndex, setSubscriptionFocusIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const resultsScrollRef = useRef<ScrollView>(null);
  const focusAreaRef = useRef(focusArea);
  const tabFocusIndexRef = useRef(tabFocusIndex);
  const resultFocusIndexRef = useRef(resultFocusIndex);
  const subscriptionFocusIndexRef = useRef(subscriptionFocusIndex);
  const resultsRef = useRef<SearchEntry[]>([]);

  const scale = useMemo(() => Math.min(windowWidth / 1920, windowHeight / 1080), [windowWidth, windowHeight]);
  const s = (v: number) => Math.round(v * scale);
  const cardSize = s(250);
  const cardFocusPad = s(5);
  const cardGap = s(10);
  const cardOuterSize = cardSize + cardFocusPad * 2;

  focusAreaRef.current = focusArea;
  tabFocusIndexRef.current = tabFocusIndex;
  resultFocusIndexRef.current = resultFocusIndex;
  subscriptionFocusIndexRef.current = subscriptionFocusIndex;

  const libraryByTitle = useMemo(() => {
    const map = new Map<string, SearchGameItem>();
    libraryGames.forEach(g => map.set(normalizeText(g.title), g));
    return map;
  }, [libraryGames]);

  const trendingEntries = useMemo((): SearchEntry[] => {
    if (activeTab === 'games') {
      return storeOffers.map(offer => {
        const inLibrary = libraryByTitle.has(normalizeText(offer.title))
          || Array.from(libraryByTitle.values()).some(g => normalizeText(g.title).includes(normalizeText(offer.title.split(' ')[0] ?? '')));
        return {
          id: `store-${offer.id}`,
          title: offer.title,
          subtitle: inLibrary ? t('search.inLibrary') : offer.price,
          image: { uri: offer.image },
          platformLabel: 'PS5',
          kind: 'store' as const,
          offer,
          url: offer.url,
        };
      });
    }
    if (activeTab === 'media') {
      return mediaItems.map(item => ({
        id: item.id,
        title: item.title,
        subtitle: item.time || t('search.media'),
        image: item.image,
        platformLabel: item.platform,
        kind: 'media' as const,
        item,
      }));
    }
    return users.map(user => ({
      id: user.id,
      title: user.name,
      subtitle: t('search.player'),
      image: user.avatarBase64 ? { uri: user.avatarBase64 } : (user.avatar?.startsWith('http') || user.avatar?.startsWith('local-file')
        ? { uri: user.avatar }
        : require('@/assets/images/ProfilePicture.png')),
      kind: 'player' as const,
      user,
    }));
  }, [activeTab, storeOffers, libraryByTitle, mediaItems, users]);

  const searchResults = useMemo((): SearchEntry[] => {
    const q = query.trim();
    if (!q) return trendingEntries;

    if (activeTab === 'games') {
      const results: SearchEntry[] = [];
      const seen = new Set<string>();

      libraryGames
        .filter(g => matchesQuery(g.title, q))
        .forEach(item => {
          const key = normalizeText(item.title);
          if (seen.has(key)) return;
          seen.add(key);
          results.push({
            id: item.id,
            title: item.title,
            subtitle: t('search.inLibrary'),
            image: item.image,
            platformLabel: platformBadge(item),
            kind: 'library',
            item,
          });
        });

      storeOffers
        .filter(o => matchesQuery(o.title, q))
        .forEach(offer => {
          const key = normalizeText(offer.title);
          if (seen.has(key)) return;
          seen.add(key);
          const inLibrary = libraryGames.some(g => normalizeText(g.title).includes(normalizeText(offer.title.split(' ')[0] ?? '')));
          results.push({
            id: `store-${offer.id}`,
            title: offer.title,
            subtitle: inLibrary ? t('search.inLibrary') : offer.price,
            image: { uri: offer.image },
            platformLabel: 'PS5',
            kind: 'store',
            offer,
            url: offer.url,
          });
        });

      return results;
    }

    if (activeTab === 'media') {
      return mediaItems
        .filter(item => matchesQuery(item.title, q))
        .map(item => ({
          id: item.id,
          title: item.title,
          subtitle: item.time || t('search.media'),
          image: item.image,
          platformLabel: item.platform,
          kind: 'media' as const,
          item,
        }));
    }

    return users
      .filter(user => matchesQuery(user.name, q))
      .map(user => ({
        id: user.id,
        title: user.name,
        subtitle: t('search.player'),
        image: user.avatarBase64 ? { uri: user.avatarBase64 } : (user.avatar?.startsWith('http') || user.avatar?.startsWith('local-file')
          ? { uri: user.avatar }
          : require('@/assets/images/ProfilePicture.png')),
        kind: 'player' as const,
        user,
      }));
  }, [query, activeTab, trendingEntries, libraryGames, storeOffers, mediaItems, users]);

  resultsRef.current = searchResults;

  useEffect(() => {
    setResultFocusIndex(0);
    resultFocusIndexRef.current = 0;
  }, [query, activeTab, searchResults.length]);

  useEffect(() => {
    if (!query.trim()) {
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => setIsSearching(false), 280);
    return () => clearTimeout(timer);
  }, [query, activeTab]);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setActiveTab('games');
      setTabFocusIndex(0);
      setResultFocusIndex(0);
      setFocusArea('search');
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible]);

  const handleSelectEntry = useCallback((entry: SearchEntry) => {
    if (entry.kind === 'library' || entry.kind === 'media') {
      if (entry.item) {
        onClose();
        onOpenGameDetail(entry.item);
      }
      return;
    }
    if (entry.kind === 'store' || entry.kind === 'subscription') {
      const url = entry.url || entry.offer?.url;
      if (url) Linking.openURL(url);
      return;
    }
  }, [onClose, onOpenGameDetail]);

  const switchTab = useCallback((direction: -1 | 1) => {
    const currentIdx = TABS.findIndex(t => t.id === activeTab);
    const nextIdx = Math.max(0, Math.min(TABS.length - 1, currentIdx + direction));
    if (nextIdx !== currentIdx) {
      setActiveTab(TABS[nextIdx].id);
      setTabFocusIndex(nextIdx);
      setFocusArea('tabs');
      soundService.playTab();
    }
  }, [activeTab]);

  const scrollResultIntoView = useCallback((index: number) => {
    const x = Math.max(0, index * (cardOuterSize + cardGap) - s(24));
    resultsScrollRef.current?.scrollTo({ x, animated: false });
  }, [cardOuterSize, cardGap, s]);

  useEffect(() => {
    if (!visible || focusArea !== 'results') return;
    scrollResultIntoView(resultFocusIndex);
  }, [visible, focusArea, resultFocusIndex, scrollResultIntoView]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const typingInSearch = inInput || focusAreaRef.current === 'search';

      // Modo escritura: dejar pasar letras (q, e, b, x…) al campo de búsqueda
      if (typingInSearch) {
        if (e.key === 'Escape') {
          if (query.length > 0) {
            setQuery('');
            e.preventDefault();
            return;
          }
          soundService.playBack();
          onClose();
          return;
        }
        if (e.key === 'ArrowDown' && searchResults.length > 0) {
          e.preventDefault();
          setFocusArea('results');
          inputRef.current?.blur();
          soundService.playNavigation();
          return;
        }
        return;
      }

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        soundService.playBack();
        onClose();
        return;
      }

      if (e.key === 'PageUp' || e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        switchTab(-1);
        return;
      }
      if (e.key === 'PageDown' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        switchTab(1);
        return;
      }

      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }

      const area = focusAreaRef.current;
      const results = resultsRef.current;

      if (area === 'tabs') {
        if (e.key === 'ArrowRight') {
          soundService.playNavigation();
          const next = Math.min(tabFocusIndexRef.current + 1, TABS.length - 1);
          tabFocusIndexRef.current = next;
          setTabFocusIndex(next);
          setActiveTab(TABS[next].id);
        } else if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          const next = Math.max(tabFocusIndexRef.current - 1, 0);
          tabFocusIndexRef.current = next;
          setTabFocusIndex(next);
          setActiveTab(TABS[next].id);
        } else if (e.key === 'ArrowDown') {
          soundService.playNavigation();
          setFocusArea('search');
          inputRef.current?.focus();
        } else if (e.key === 'Enter') {
          setFocusArea('search');
          inputRef.current?.focus();
        }
        return;
      }

      if (area === 'search') {
        if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          setFocusArea('tabs');
        } else if (e.key === 'ArrowDown') {
          if (results.length > 0) {
            soundService.playNavigation();
            setFocusArea('results');
          } else if (!query.trim() && activeTab === 'games') {
            setFocusArea('subscriptions');
          }
        }
        return;
      }

      if (area === 'results') {
        if (results.length === 0) {
          if (e.key === 'ArrowUp') {
            setFocusArea('search');
            inputRef.current?.focus();
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          soundService.playNavigation();
          setResultFocusIndex(prev => {
            const next = Math.min(prev + 1, results.length - 1);
            resultFocusIndexRef.current = next;
            return next;
          });
        } else if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          setResultFocusIndex(prev => {
            const next = Math.max(prev - 1, 0);
            resultFocusIndexRef.current = next;
            return next;
          });
        } else if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          setFocusArea('search');
          inputRef.current?.focus();
        } else if (e.key === 'ArrowDown') {
          if (!query.trim() && activeTab === 'games') {
            soundService.playNavigation();
            setFocusArea('subscriptions');
          }
        } else if (e.key === 'Enter' || e.key === ' ') {
          soundService.playActivation();
          const entry = results[resultFocusIndexRef.current];
          if (entry) handleSelectEntry(entry);
        }
        return;
      }

      if (area === 'subscriptions') {
        if (e.key === 'ArrowRight') {
          soundService.playNavigation();
          setSubscriptionFocusIndex(prev => Math.min(prev + 1, SUBSCRIPTIONS.length - 1));
        } else if (e.key === 'ArrowLeft') {
          soundService.playNavigation();
          setSubscriptionFocusIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'ArrowUp') {
          soundService.playNavigation();
          if (results.length > 0) setFocusArea('results');
          else setFocusArea('search');
        } else if (e.key === 'Enter' || e.key === ' ') {
          const entry = SUBSCRIPTIONS[subscriptionFocusIndexRef.current];
          if (entry?.url) Linking.openURL(entry.url);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, query, activeTab, searchResults.length, onClose, switchTab, handleSelectEntry]);

  const ui = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0b0c10' },
    spotlight: {
      position: 'absolute',
      top: -windowHeight * 0.15,
      left: -windowWidth * 0.1,
      width: windowWidth * 0.7,
      height: windowHeight * 0.55,
      borderRadius: windowWidth,
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    content: {
      flex: 1,
      paddingTop: s(42),
      paddingHorizontal: s(100),
    },
    tabsRow: {
      flexDirection: 'row',
      gap: s(28),
      marginBottom: s(22),
    },
    tab: {
      paddingBottom: s(6),
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: '#ffffff' },
    tabFocused: { borderBottomColor: 'rgba(255,255,255,0.65)' },
    tabText: { color: 'rgba(255,255,255,0.45)', fontSize: s(20), fontFamily: 'SSTLight' },
    tabTextActive: { color: '#FFF' },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(14),
      marginBottom: s(28),
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: s(4),
      paddingHorizontal: s(16),
      height: s(56),
      borderWidth: 2,
      borderColor: 'transparent',
    },
    //searchBarFocused: { borderColor: 'rgba(255,255,255,0.35)' },
    searchSpinnerWrap: {
      width: s(28),
      height: s(28),
      alignItems: 'center',
      justifyContent: 'center',
    },
    micButton: {
      width: s(44),
      height: s(44),
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchInput: {
      flex: 1,
      color: '#ffffffff',
      fontSize: s(20),
      fontFamily: 'SSTLight',
      marginLeft: s(12),
      marginRight: s(12),
      outlineStyle: 'none',
    } as any,
    sectionTitle: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: s(16),
      fontFamily: 'SSTLight',
      marginBottom: s(14),
    },
    subsTitle: {
      color: 'rgba(255, 255, 255, 0.71)',
      fontSize: s(16),
      fontFamily: 'SSTLight',
      marginTop: s(28),
      marginBottom: s(14),
    },
    subsRow: { flexDirection: 'row', gap: s(14) },
    subTile: {
      width: s(320),
      height: s(112),
      borderRadius: s(0),
      backgroundColor: 'rgba(255,255,255,0.06)',
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(14),
      gap: s(12),
      borderWidth: 2,
      borderColor: 'transparent',
    },
    subTileFocused: { borderColor: '#FFF', backgroundColor: 'rgba(255,255,255,0.1)' },
    subIcon: { width: s(58), height: s(58), resizeMode: 'contain' },
    subTitle: { color: '#ffffffb6', fontSize: s(17), fontFamily: 'SSTLight' },
    emptyWrap: { paddingTop: s(40), alignItems: 'center' },
    emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: s(15), fontFamily: 'SSTLight' },
    footer: {
      position: 'absolute',
      bottom: s(24),
      right: s(72),
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
    },
    footerKey: { color: 'rgba(255,255,255,0.85)', fontSize: s(13), fontFamily: 'SSTLight' },
    footerText: { color: 'rgba(255,255,255,0.55)', fontSize: s(13), fontFamily: 'SSTLight' },
  }), [s, windowWidth, windowHeight]);

  if (!visible) return null;

  const sectionLabel = query.trim()
    ? (searchResults.length > 0 ? t('search.results') : t('search.noResults'))
    : activeTab === 'games'
      ? t('search.trendingGames')
      : activeTab === 'media'
        ? t('search.mediaApps')
        : t('search.players');

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={ui.root} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
        <Video
          source={require('@/assets/video/particles.mp4')}
          style={StyleSheet.absoluteFillObject}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay
          isMuted
          useNativeControls={false}
        />
        {/* <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11, 12, 16, 0.85)' }} pointerEvents="none" />
        <View style={ui.spotlight} pointerEvents="none" /> */}

        <View style={ui.content}>
          <View style={ui.tabsRow}>
            {TABS.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              const isFocused = focusArea === 'tabs' && tabFocusIndex === idx;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[ui.tab, isActive && ui.tabActive, isFocused && ui.tabFocused]}
                  onPress={() => {
                    setActiveTab(tab.id);
                    setTabFocusIndex(idx);
                    setFocusArea('tabs');
                  }}
                >
                  <Text style={[ui.tabText, isActive && ui.tabTextActive]}>{t(tab.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={ui.searchRow}>
            <View style={[ui.searchBar, focusArea === 'search' && ui.searchBarFocused]}>
              {focusArea === 'search' && <SpinningBorderSearch size={s(56)} spread={3} borderRadius={s(4) + 3} />}
              <Ionicons name="search" size={s(20)} color="rgba(255, 255, 255, 0.6)" />
              <TextInput
                ref={inputRef}
                style={ui.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('search.placeholder')}
                placeholderTextColor="rgba(255, 255, 255, 0.6)"
                onFocus={() => setFocusArea('search')}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              <View style={ui.searchSpinnerWrap}>
                {isSearching ? (
                  <ActivityIndicator size="small" color="rgba(255, 255, 255, 0.6)" />
                ) : (
                  <View style={{ width: s(20), height: s(20), borderRadius: s(10), borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }} />
                )}
              </View>
            </View>
            <TouchableOpacity style={ui.micButton} activeOpacity={0.7}>
              <Ionicons name="mic-outline" size={s(22)} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          </View>

          <Text style={ui.sectionTitle}>{sectionLabel}</Text>

          {searchResults.length > 0 ? (
            <View style={{ minHeight: cardOuterSize + s(24), overflow: 'visible' }}>
              <ScrollView
                ref={resultsScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ overflow: 'visible' } as any}
                contentContainerStyle={{
                  gap: cardGap,
                  paddingVertical: s(14),
                  paddingHorizontal: s(0),
                  paddingBottom: s(20),
                  paddingRight: s(12),
                }}
                keyboardShouldPersistTaps="handled"
              >
                {searchResults.map((entry, idx) => (
                  <ResultTile
                    key={entry.id}
                    entry={entry}
                    isFocused={focusArea === 'results' && resultFocusIndex === idx}
                    cardSize={cardSize}
                    focusPad={cardFocusPad}
                    onPress={() => handleSelectEntry(entry)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={ui.emptyWrap}>
              <Text style={ui.emptyText}>
                {query.trim() ? t('search.noMatches') : t('search.empty')}
              </Text>
            </View>
          )}

          {!query.trim() && activeTab === 'games' ? (
            <>
              <Text style={ui.subsTitle}>{t('search.subscriptionsTitle')}</Text>
              <View style={ui.subsRow}>
                {SUBSCRIPTIONS.map((sub, idx) => {
                  const isSubFocused = focusArea === 'subscriptions' && subscriptionFocusIndex === idx;
                  return (
                    <TouchableOpacity
                      key={sub.id}
                      style={[ui.subTile, isSubFocused && ui.subTileFocused]}
                      onPress={() => sub.url && Linking.openURL(sub.url)}
                    >
                      {isSubFocused && <SpinningBorderSearch size={s(112)} spread={3} borderRadius={3} />}
                      {sub.image ? (
                        <Image source={sub.image} style={ui.subIcon} contentFit="contain" />
                      ) : (
                        <View style={[ui.subIcon, { alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="play-circle-outline" size={s(55)} color="#FFF" />
                        </View>
                      )}
                      <Text style={ui.subTitle}>{sub.title}</Text>
                      <Text style={[ui.subTitle, { fontSize: s(13), opacity: 0.6, marginTop: -s(2) }]}>{t(sub.subtitleKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}
        </View>

        <View style={ui.footer}>
          <PSIcon
            char={PSIcons.r1}
            size={26}
            color={'#fff'}
          />
          <Text style={ui.footerText}>/</Text>
          <PSIcon
            char={PSIcons.l1}
            size={26}
            color={'#fff'}
          />
          <Text style={ui.footerText}>{t('search.changeTabs')}</Text>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  tileOuter: {
    borderRadius: 6,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'visible',
  },
  tileOuterFocused: {
    borderColor: '#919191ff',
  },
  resultTile: {
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  coverWrap: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradientFallback: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  coverMeta: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 28,
    gap: 4,
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  platformBadgeText: {
    color: '#111',
    fontSize: 10,
    fontFamily: 'SSTBadge',
  },
  resultTitle: {
    color: '#ffffffaf',
    fontSize: 14,
    fontFamily: 'SSTLight',
    fontWeight: '200',
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  resultSubtitle: {
    color: 'rgba(255, 255, 255, 1)',
    fontSize: 12,
    fontFamily: 'SSTMedium',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
});

export default SearchView;