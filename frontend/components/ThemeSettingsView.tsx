import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ACCENTS, DEFAULT_VISUAL_THEME_ID, VISUAL_THEMES } from '@/constants/themes';
import { soundService } from '@/services/soundService';
import AudioPackBrowser from './AudioPackBrowser';

type ScaleFn = (px: number) => number;
type Rect = { x: number; y: number; w: number; h: number };

/**
 * Ajustes → Temas, en tres niveles:
 *  - 'menu'   : lista vertical (Tema visual · Color de acento · Packs de audio)
 *  - 'visual' : lista vertical pegada a la izquierda + preview grande a la derecha
 *  - 'accent' : grilla de colores de acento
 *  - 'audio'  : navegador de packs de audio (AudioPackBrowser)
 */
type ThemeView = 'menu' | 'visual' | 'accent' | 'audio';

const MENU_ORDER: Exclude<ThemeView, 'menu'>[] = ['visual', 'accent', 'audio'];

/** Preview de tema (fondo / personaje) con ajustes para que se vea nítida al reducirla. */
function ThemePreviewImage({ source, recyclingKey }: { source: any; recyclingKey: string }) {
  return (
    <Image
      source={source}
      recyclingKey={recyclingKey}
      style={[
        StyleSheet.absoluteFillObject,
        (Platform.OS === 'web' ? { imageRendering: 'auto' } : null) as any,
      ]}
      contentFit="cover"
      allowDownscaling
      cachePolicy="memory-disk"
      transition={150}
    />
  );
}

export default function ThemeSettingsView({
  focused,
  onExit,
  bleed,
}: {
  focused: boolean;
  /** Se llama al pulsar Atrás estando en el menú de Temas (vuelve a Ajustes). */
  onExit: () => void;
  /** Padding del contenedor padre (SettingsView). La vista de lista + preview lo usa para llegar a los bordes de la pantalla. */
  bleed?: { top: number; horizontal: number; bottom: number };
}) {
  const { t } = useTranslation();
  const {
    accent, accentId, setAccent, visualThemeId, setVisualTheme,
    foregroundOverWidgets, setForegroundOverWidgets,
    audioPackName, musicPackName,
  } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const s = useMemo<ScaleFn>(() => {
    const scaleW = windowWidth / 1920;
    const scaleH = windowHeight / 1080;
    const scale = Math.min(Math.max(Math.max(scaleW, scaleH), 0.6), 1.25);
    return (px: number) => {
      if (px === 0) return 0;
      const scaled = Math.round(px * scale);
      return scaled === 0 ? Math.sign(px) : scaled;
    };
  }, [windowWidth, windowHeight]);
  const styles = useMemo(() => createStyles(s), [s]);

  /** t() con texto de respaldo para claves nuevas que aún no estén en los archivos de idioma. */
  // const tr = useCallback((key: string, fallback: string) => {
  //   const v = t(key);
  //   return v && v !== key ? v : fallback;
  // }, [t]);

  const [view, setView] = useState<ThemeView>('menu');
  const [menuIndex, setMenuIndex] = useState(0);

  // ── Tema visual: índice 0 = "Ninguno", 1..n = VISUAL_THEMES. Si hay tema activo, el último elemento es el interruptor.
  const hasVisualTheme = visualThemeId !== DEFAULT_VISUAL_THEME_ID;
  const visualItems = useMemo(() => [DEFAULT_VISUAL_THEME_ID, ...VISUAL_THEMES.map((th) => th.id)], []);
  const itemCount = visualItems.length;
  const totalVisualRows = itemCount + (hasVisualTheme ? 1 : 0);
  const selectedVisualIndex = Math.max(0, visualItems.indexOf(visualThemeId));
  const [visualIndexRaw, setVisualIndex] = useState(selectedVisualIndex);
  const visualIndex = Math.min(visualIndexRaw, totalVisualRows - 1);
  const toggleFocused = hasVisualTheme && visualIndex === itemCount;

  // ── Acentos
  const selectedAccentIndex = Math.max(0, ACCENTS.findIndex((a) => a.id === accentId));
  const [accentIndex, setAccentIndex] = useState(selectedAccentIndex);
  const accentRects = useRef<Record<number, Rect>>({});

  const themeLabelOf = useCallback((id: string) => {
    if (id === DEFAULT_VISUAL_THEME_ID) return t('settings.visualThemeNone');
    return VISUAL_THEMES.find((th) => th.id === id)?.label ?? id;
  }, [t]);

  const goBack = useCallback(() => {
    if (view === 'menu') {
      onExit();
    } else {
      soundService.playBack?.();
      setView('menu');
    }
  }, [view, onExit]);

  const openView = useCallback((id: Exclude<ThemeView, 'menu'>) => {
    if (id === 'visual') setVisualIndex(selectedVisualIndex);
    if (id === 'accent') setAccentIndex(selectedAccentIndex);
    setView(id);
    soundService.playActivation?.().catch(() => { });
  }, [selectedVisualIndex, selectedAccentIndex]);

  const selectVisual = useCallback((id: string) => {
    setVisualTheme(id);
    soundService.playActivation?.().catch(() => { });
  }, [setVisualTheme]);

  const selectAccent = useCallback((id: string) => {
    setAccent(id);
    soundService.playActivation?.().catch(() => { });
  }, [setAccent]);

  const toggleForeground = useCallback(() => {
    setForegroundOverWidgets(!foregroundOverWidgets);
    soundService.playActivation?.().catch(() => { });
  }, [foregroundOverWidgets, setForegroundOverWidgets]);

  const moveSound = useCallback(() => { soundService.playNavigation?.().catch(() => { }); }, []);

  // Vecino en la grilla de acentos (dir: -1 fila anterior, +1 fila siguiente). null = no hay fila en esa dirección.
  const accentVerticalNeighbor = useCallback((from: number, dir: -1 | 1): number | null => {
    const cur = accentRects.current[from];
    if (!cur) return null;
    const tol = 4;
    let targetY: number | null = null;
    Object.values(accentRects.current).forEach((r) => {
      const inDir = dir === 1 ? r.y > cur.y + tol : r.y < cur.y - tol;
      if (!inDir) return;
      if (targetY === null || (dir === 1 ? r.y < targetY : r.y > targetY)) targetY = r.y;
    });
    if (targetY === null) return null;
    const cx = cur.x + cur.w / 2;
    let best: number | null = null;
    let bestDist = Infinity;
    Object.entries(accentRects.current).forEach(([k, r]) => {
      if (Math.abs(r.y - (targetY as number)) > tol) return;
      const dist = Math.abs(r.x + r.w / 2 - cx);
      if (dist < bestDist) { bestDist = dist; best = Number(k); }
    });
    return best;
  }, []);

  // ── Teclado / mando ─────────────────────────────────────────────────────────
  // SettingsView cede aquí todo el teclado de la pantalla "themes" (incluido Atrás).
  // En 'audio' AudioPackBrowser gestiona su propio teclado en captura: aquí solo se atiende Atrás, en burbuja
  // (así, si AudioPackBrowser consume la tecla, no se ejecuta).
  useEffect(() => {
    if (!focused || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      const consume = () => { e.preventDefault(); e.stopPropagation(); };
      const isBack = e.key === 'Escape' || e.key === 'b' || e.key === 'B';
      const isSelect = e.key === 'Enter' || e.key === ' ';

      if (isBack) { consume(); if (!e.repeat) goBack(); return; }
      if (view === 'audio') return;
      if (isSelect && e.repeat) { consume(); return; }

      if (view === 'menu') {
        if (e.key === 'ArrowDown') {
          consume();
          setMenuIndex((i) => { const n = Math.min(i + 1, MENU_ORDER.length - 1); if (n !== i) moveSound(); return n; });
        } else if (e.key === 'ArrowUp') {
          consume();
          setMenuIndex((i) => { const n = Math.max(i - 1, 0); if (n !== i) moveSound(); return n; });
        } else if (isSelect || e.key === 'ArrowRight') {
          consume();
          openView(MENU_ORDER[menuIndex]);
        }
      } else if (view === 'visual') {
        if (e.key === 'ArrowDown') {
          consume();
          setVisualIndex(Math.min(visualIndex + 1, totalVisualRows - 1));
          if (visualIndex < totalVisualRows - 1) moveSound();
        } else if (e.key === 'ArrowUp') {
          consume();
          setVisualIndex(Math.max(visualIndex - 1, 0));
          if (visualIndex > 0) moveSound();
        } else if (isSelect) {
          consume();
          if (toggleFocused) toggleForeground();
          else selectVisual(visualItems[visualIndex]);
        }
      } else if (view === 'accent') {
        if (e.key === 'ArrowRight') {
          consume();
          setAccentIndex((i) => { const n = Math.min(i + 1, ACCENTS.length - 1); if (n !== i) moveSound(); return n; });
        } else if (e.key === 'ArrowLeft') {
          consume();
          setAccentIndex((i) => { const n = Math.max(i - 1, 0); if (n !== i) moveSound(); return n; });
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          consume();
          const next = accentVerticalNeighbor(accentIndex, e.key === 'ArrowDown' ? 1 : -1);
          if (next !== null) { setAccentIndex(next); moveSound(); }
        } else if (isSelect) {
          consume();
          const a = ACCENTS[accentIndex];
          if (a) selectAccent(a.id);
        }
      }
    };

    const useCapture = view !== 'audio';
    window.addEventListener('keydown', handle, useCapture);
    return () => window.removeEventListener('keydown', handle, useCapture);
  }, [
    focused, view, menuIndex, visualIndex, totalVisualRows, toggleFocused, visualItems, accentIndex,
    goBack, openView, selectVisual, selectAccent, toggleForeground, accentVerticalNeighbor, moveSound,
  ]);

  // ── Lista de temas: mantiene el elemento enfocado centrado ─────────────────
  const ROW_H = s(64);
  const listScrollRef = useRef<ScrollView>(null);
  const listViewportH = useRef(0);
  useEffect(() => {
    if (view !== 'visual' || visualIndex >= itemCount) return;
    const target = visualIndex * ROW_H - (listViewportH.current - ROW_H) / 2;
    listScrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
  }, [view, visualIndex, itemCount, ROW_H]);

  // ── Preview grande: ocupa el máximo posible manteniendo 16:9 ───────────────
  const LIST_W = s(540);
  const PANE_PAD = s(56);
  const CAPTION_H = s(110);
  // visualRoot cubre toda la pantalla gracias al bleed
  const paneW = Math.max(0, windowWidth - LIST_W);
  const paneH = windowHeight;
  const availW = Math.max(0, paneW - PANE_PAD * 2);
  const availH = Math.max(0, paneH - PANE_PAD * 2 - CAPTION_H);
  const frameW = Math.min(availW, (availH * 16) / 9);
  const frameH = (frameW * 9) / 16;

  // ── Piezas comunes ──────────────────────────────────────────────────────────
  const renderHeader = (title: string) => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={goBack}>
        <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );

  const hoverProps = (onEnter: () => void) =>
    (Platform.OS === 'web' ? { onMouseEnter: onEnter } : {}) as any;

  // ═══ Nivel 2: lista a la izquierda + preview grande ═══════════════════════════
  if (view === 'visual') {
    const b = bleed ?? { top: 0, horizontal: 0, bottom: 0 };
    const padL = b.horizontal || s(40);
    const previewId = visualIndex < itemCount ? visualItems[visualIndex] : visualThemeId;
    const previewTheme = VISUAL_THEMES.find((th) => th.id === previewId) ?? null;
    const previewSelected = previewId === visualThemeId;

    return (
      <View
        style={[
          styles.visualRoot,
          { top: -b.top, left: -b.horizontal, right: -b.horizontal, bottom: -b.bottom },
        ]}
      >
        {/* Lista vertical pegada a la izquierda */}
        <View style={[styles.listPanel, { paddingTop: b.top, paddingBottom: b.bottom }]}>
          <View style={[styles.header, { paddingLeft: padL, marginBottom: s(24) }]}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{t('settings.visualTheme')}</Text>
          </View>

          <ScrollView
            ref={listScrollRef}
            style={styles.listScroll}
            showsVerticalScrollIndicator={false}
            onLayout={(e) => { listViewportH.current = e.nativeEvent.layout.height; }}
          >
            {visualItems.map((id, idx) => {
              const selected = id === visualThemeId;
              const isFocused = focused && visualIndex === idx;
              return (
                <TouchableOpacity
                  key={id}
                  activeOpacity={0.85}
                  style={[styles.listRow, { height: ROW_H, paddingLeft: padL }, isFocused && styles.listRowFocused]}
                  onPress={() => { setVisualIndex(idx); selectVisual(id); }}
                  {...hoverProps(() => { if (visualIndex !== idx) { setVisualIndex(idx); moveSound(); } })}
                >
                  <Text
                    style={[styles.listRowText, (selected || isFocused) && styles.listRowTextOn]}
                    numberOfLines={1}
                  >
                    {themeLabelOf(id)}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={s(22)} color={accent.color} style={styles.listRowCheck} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Ajuste: personaje sobre/bajo los widgets (solo con un tema visual activo) */}
          {hasVisualTheme && (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.toggleRow, { paddingLeft: padL }, focused && toggleFocused && styles.listRowFocused]}
              onPress={() => { setVisualIndex(itemCount); toggleForeground(); }}
              {...hoverProps(() => { if (visualIndex !== itemCount) { setVisualIndex(itemCount); moveSound(); } })}
            >
              <View style={styles.toggleTexts}>
                <Text style={styles.toggleLabel}>{t('settings.foregroundOverWidgets')}</Text>
                <Text style={styles.toggleDesc} numberOfLines={3}>{t('settings.foregroundOverWidgetsDesc')}</Text>
              </View>
              <View style={[styles.switchTrack, foregroundOverWidgets && { backgroundColor: accent.color }]}>
                <View style={[styles.switchThumb, foregroundOverWidgets && styles.switchThumbOn]} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Preview grande a la derecha */}
        <View
          style={styles.previewPane}
        >
          <View style={[styles.previewFrame, { width: frameW, height: frameH }]}>
            {previewTheme ? (
              <>
                <ThemePreviewImage source={previewTheme.background} recyclingKey={`${previewTheme.id}-bg-big`} />
                <ThemePreviewImage source={previewTheme.foreground} recyclingKey={`${previewTheme.id}-fg-big`} />
              </>
            ) : (
              <View style={styles.previewNone}>
                <Ionicons name="image-outline" size={s(72)} color="rgba(255,255,255,0.35)" />
              </View>
            )}
          </View>
          <View style={[styles.previewCaption, { width: frameW, height: CAPTION_H }]}>
            <Text style={styles.previewTitle} numberOfLines={1}>{themeLabelOf(previewId)}</Text>
            {previewSelected ? (
              <View style={styles.previewBadge}>
                <Ionicons name="checkmark-circle" size={s(18)} color={accent.color} />
                <Text style={styles.previewBadgeText}>{t('settings.visualThemeActive')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // ═══ Nivel 1: menú vertical ═══════════════════════════════════════════════════
  if (view === 'menu') {
    const audioLabel = [audioPackName, musicPackName].filter(Boolean).join(' · ');
    const entries: { id: Exclude<ThemeView, 'menu'>; icon: any; title: string; desc: string; value: string; dot?: string }[] = [
      { id: 'visual', icon: 'images-outline', title: t('settings.visualTheme'), desc: t('settings.visualThemeDesc'), value: themeLabelOf(visualThemeId) },
      { id: 'accent', icon: 'color-palette-outline', title: t('settings.accent'), desc: t('settings.accentDesc'), value: accent.label, dot: accent.color },
      { id: 'audio', icon: 'musical-notes-outline', title: t('settings.audioPacks'), desc: t('settings.audioPacksDesc'), value: audioLabel },
    ];
    return (
      <View style={styles.page}>
        {renderHeader(t('settings.themes'))}
        <View style={styles.menuList}>
          {entries.map((en, idx) => {
            const isFocused = focused && menuIndex === idx;
            return (
              <TouchableOpacity
                key={en.id}
                activeOpacity={0.85}
                style={[styles.menuRow, isFocused && [styles.menuRowFocused, { borderColor: accent.color }]]}
                onPress={() => { setMenuIndex(idx); openView(en.id); }}
                {...hoverProps(() => { if (menuIndex !== idx) { setMenuIndex(idx); moveSound(); } })}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={en.icon} size={s(26)} color="#FFF" />
                </View>
                <View style={styles.menuTexts}>
                  <Text style={styles.menuTitle}>{en.title}</Text>
                  <Text style={styles.menuDesc} numberOfLines={2}>{en.desc}</Text>
                </View>
                {en.dot ? <View style={[styles.menuDot, { backgroundColor: en.dot }]} /> : null}
                {en.value ? <Text style={styles.menuValue} numberOfLines={1}>{en.value}</Text> : null}
                <Ionicons name="chevron-forward" size={s(22)} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // ═══ Color de acento (grilla) ═════════════════════════════════════════════════
  if (view === 'accent') {
    return (
      <View style={styles.page}>
        {renderHeader(t('settings.accent'))}
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionDesc}>{t('settings.accentDesc')}</Text>
            <Text style={styles.affectsNote}>{t('settings.accentAffects')}</Text>
            <View style={[styles.previewBar, { backgroundColor: accent.soft, borderColor: accent.color }]}>
              <View style={[styles.previewDot, { backgroundColor: accent.color }]} />
              <Text style={styles.previewLabel}>{accent.label}</Text>
              <View style={[styles.previewRing, { borderColor: accent.color }]} />
            </View>
            <View style={styles.accentGrid}>
              {ACCENTS.map((a, idx) => {
                const selected = a.id === accentId;
                const isFocused = focused && accentIndex === idx;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.accentBtn,
                      { borderColor: selected ? a.color : 'rgba(255,255,255,0.15)' },
                      isFocused && [styles.accentBtnFocused, { borderColor: '#FFF' }],
                    ]}
                    onLayout={(e) => {
                      const { x, y, width, height } = e.nativeEvent.layout;
                      accentRects.current[idx] = { x, y, w: width, h: height };
                    }}
                    onPress={() => { setAccentIndex(idx); selectAccent(a.id); }}
                    {...hoverProps(() => { if (accentIndex !== idx) { setAccentIndex(idx); moveSound(); } })}
                  >
                    <View style={[styles.accentDot, { backgroundColor: a.color }]} />
                    <Text style={[styles.accentLabel, (selected || isFocused) && styles.accentLabelSelected]} numberOfLines={1}>
                      {a.label}
                    </Text>
                    {selected && <Ionicons name="checkmark-circle" size={s(18)} color={a.color} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ═══ Packs de audio (DeckThemes) ══════════════════════════════════════════════
  return (
    <View style={styles.page}>
      {renderHeader(t('settings.audioPacks'))}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionDesc}>{t('settings.audioPacksDesc')}</Text>
          <AudioPackBrowser active={focused} />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(s: ScaleFn) {
  return StyleSheet.create({
    page: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: s(16), marginBottom: s(30) },
    backBtn: {
      padding: s(8),
      borderRadius: s(20),
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    headerTitle: { color: '#FFF', fontSize: s(26), fontFamily: 'SSTLight', flexShrink: 1 },
    body: { paddingBottom: s(40), gap: s(24) },
    section: {
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderRadius: s(8),
      padding: s(20),
    },
    sectionDesc: { color: 'rgba(255,255,255,0.55)', fontSize: s(14), fontFamily: 'SSTLight', marginBottom: s(8) },
    affectsNote: { color: 'rgba(255,255,255,0.4)', fontSize: s(12), fontFamily: 'SSTLight', marginBottom: s(12), fontStyle: 'italic' },

    // ── Menú ──
    menuList: { gap: s(14), maxWidth: s(1100) },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(18),
      paddingHorizontal: s(22),
      paddingVertical: s(18),
      borderRadius: s(10),
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    menuRowFocused: { backgroundColor: 'rgba(255,255,255,0.14)' },
    menuIcon: {
      width: s(48),
      height: s(48),
      borderRadius: s(24),
      backgroundColor: 'rgba(255,255,255,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuTexts: { flex: 1 },
    menuTitle: { color: '#FFF', fontSize: s(22), fontFamily: 'SSTMedium', marginBottom: s(2) },
    menuDesc: { color: 'rgba(255,255,255,0.55)', fontSize: s(14), fontFamily: 'SSTLight' },
    menuDot: { width: s(18), height: s(18), borderRadius: s(9) },
    menuValue: { color: 'rgba(255,255,255,0.75)', fontSize: s(15), fontFamily: 'SSTMedium', maxWidth: s(260) },

    // ── Lista + preview ──
    visualRoot: { position: 'absolute', flexDirection: 'row' },
    listPanel: {
      width: s(540),
      flexShrink: 0,
      backgroundColor: 'rgba(16, 16, 17, 0.82)',
      borderRightWidth: 1,
      borderRightColor: 'rgba(255,255,255,0.08)',
    },
    listScroll: { flex: 1 },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: s(24),
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    listRowFocused: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderTopColor: 'rgba(255,255,255,0.55)',
      borderBottomColor: 'rgba(255,255,255,0.55)',
    },
    listRowText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: s(22), fontFamily: 'SSTLight' },
    listRowTextOn: { color: '#FFF' },
    listRowCheck: { marginLeft: s(12) },
    previewPane: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
    previewFrame: {
      borderRadius: s(12),
      overflow: 'hidden',
      backgroundColor: '#111',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
    },
    previewNone: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    previewCaption: { justifyContent: 'center', gap: s(8) },
    previewTitle: { color: '#FFF', fontSize: s(28), fontFamily: 'SSTLight' },
    previewBadge: { flexDirection: 'row', alignItems: 'center', gap: s(8) },
    previewBadgeText: { color: 'rgba(255,255,255,0.8)', fontSize: s(16), fontFamily: 'SSTMedium' },

    // ── Interruptor ──
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(16),
      paddingRight: s(24),
      paddingVertical: s(14),
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.12)',
      borderBottomColor: 'transparent',
    },
    toggleTexts: { flex: 1 },
    toggleLabel: { color: '#FFF', fontSize: s(16), fontFamily: 'SSTMedium', marginBottom: s(2) },
    toggleDesc: { color: 'rgba(255,255,255,0.5)', fontSize: s(12), fontFamily: 'SSTLight' },
    switchTrack: {
      width: s(44),
      height: s(24),
      borderRadius: s(12),
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      paddingHorizontal: s(3),
    },
    switchThumb: {
      width: s(18),
      height: s(18),
      borderRadius: s(9),
      backgroundColor: '#FFF',
      alignSelf: 'flex-start',
    },
    switchThumbOn: { alignSelf: 'flex-end' },

    // ── Acentos ──
    previewBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(10),
      borderWidth: 2,
      borderRadius: s(8),
      paddingHorizontal: s(12),
      paddingVertical: s(10),
      marginBottom: s(14),
    },
    previewDot: { width: s(20), height: s(20), borderRadius: s(10) },
    previewLabel: { color: '#FFF', fontSize: s(14), fontFamily: 'SSTMedium', flex: 1 },
    previewRing: { width: s(34), height: s(34), borderRadius: s(17), borderWidth: 3 },
    accentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: s(10) },
    accentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
      paddingHorizontal: s(12),
      paddingVertical: s(10),
      borderRadius: s(20),
      borderWidth: 2,
      backgroundColor: 'rgba(255,255,255,0.06)',
      minWidth: s(150),
    },
    accentBtnFocused: { backgroundColor: 'rgba(255,255,255,0.16)', transform: [{ scale: 1.04 }] },
    accentDot: { width: s(18), height: s(18), borderRadius: s(9) },
    accentLabel: { color: 'rgba(255,255,255,0.7)', fontSize: s(13), fontFamily: 'SSTMedium', flex: 1 },
    accentLabelSelected: { color: '#FFF' },
  });
}