import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import SpinningBorderSearch from './SpinningBorderSearch';
import { useTranslation } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';

// ─── Definitions ─────────────────────────────────────────────────────────────
export interface WidgetDef {
  id: string;
  /** Clave de traducción del título */
  labelKey: TranslationKey;
  /** Clave de traducción de la descripción */
  descriptionKey?: TranslationKey;
  iconName: string;
  iconLib: 'ion' | 'mci';
}

export type WidgetVisibility = Record<string, boolean>;

const STORAGE_KEY = 'welcome_widget_visibility';
const ORDER_STORAGE_KEY = 'welcome_widget_order';

/** Tamaño de un widget: 0 = normal, 1 = ampliado (1ª vez), 2 = ampliado (2ª vez, máximo). */
export type WidgetSize = 0 | 1 | 2;
export type WidgetSizes = Record<string, WidgetSize>;

const SIZE_STORAGE_KEY = 'welcome_widget_sizes';

/**
 * Tamaño máximo permitido por widget. Los que no aparecen aquí NO se pueden ampliar (0).
 * Sube el número (máx. 2) a medida que diseñes el layout ampliado de cada widget.
 */
export const WIDGET_MAX_SIZE: Record<string, WidgetSize> = {
  trophies: 2,
  store: 2,
  news: 2,
  recently_played: 2,
  controller: 2,
  storage: 2,
  friends: 2,
};
export const getWidgetMaxSize = (id: string): WidgetSize => WIDGET_MAX_SIZE[id] ?? 0;
export const clampWidgetSize = (id: string, value: number): WidgetSize =>
  Math.max(0, Math.min(getWidgetMaxSize(id), Math.round(value))) as WidgetSize;

/** Cada columna del grid admite 3 "espacios": 3 widgets normales, o 1 normal + 1 de 2 espacios, o 1 de 3. */
export const WIDGET_COLUMN_CAPACITY = 3;

export interface WidgetLayoutItem {
  id: string;
  /** Slot original (0-4 fila 1, 5-9 fila 2). Se usa para foco y modo mover. */
  slot: number;
  /** Espacios que ocupa: tamaño + 1 (1, 2 o 3). */
  rows: number;
}

/**
 * Reparte los widgets visibles en columnas de capacidad 3.
 *
 * Punto de partida: el n-ésimo widget visible de la fila 1 queda sobre el n-ésimo de la fila 2
 * (igual que antes). Si una columna se pasa de 3 espacios, se queda el widget más grande y los
 * demás "ruedan" a la columna de la derecha (arriba del todo), pudiendo encadenarse.
 * Dentro de cada columna el orden es de arriba hacia abajo.
 */
export function computeWidgetColumns(
  order: string[],
  isVisible: (id: string) => boolean,
  sizeOf: (id: string) => number,
  capacity: number = WIDGET_COLUMN_CAPACITY
): WidgetLayoutItem[][] {
  const toItem = (id: string, slot: number): WidgetLayoutItem => ({ id, slot, rows: Math.min(capacity, sizeOf(id) + 1) });
  const row1 = order.slice(0, 5).map((id, i) => toItem(id, i)).filter((x) => isVisible(x.id));
  const row2 = order.slice(5, 10).map((id, i) => toItem(id, 5 + i)).filter((x) => isVisible(x.id));
  const n = Math.max(row1.length, row2.length);

  const columns: WidgetLayoutItem[][] = [];
  let carry: WidgetLayoutItem[] = [];
  let k = 0;
  while (k < n || carry.length > 0) {
    const incoming = [...carry, row1[k], row2[k]].filter(Boolean) as WidgetLayoutItem[];
    carry = [];
    const total = incoming.reduce((sum, x) => sum + x.rows, 0);
    if (total <= capacity) {
      columns.push(incoming);
    } else {
      // Se queda el más grande (a igualdad, el que ya venía desplazado / el de arriba)
      let anchor = incoming[0];
      for (const x of incoming) if (x.rows > anchor.rows) anchor = x;
      const kept = new Set<WidgetLayoutItem>([anchor]);
      let used = anchor.rows;
      for (const x of incoming) {
        if (kept.has(x)) continue;
        if (used + x.rows <= capacity) { kept.add(x); used += x.rows; }
        else carry.push(x);
      }
      columns.push(incoming.filter((x) => kept.has(x)));
    }
    k++;
  }
  return columns;
}

export const DEFAULT_WIDGET_IDS = [
  'controller', 'trophies', 'store', 'news', 'add_game',
  'recently_played', 'friends', 'storage', 'random_pick', 'change_bg',
];

// ─── Persistence ──────────────────────────────────────────────────────────────
export function loadWidgetVisibility(): WidgetVisibility {
  const defaults: WidgetVisibility = {};
  DEFAULT_WIDGET_IDS.forEach((id) => (defaults[id] = true));
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) || {};
    return { ...defaults, ...parsed };
  } catch { return defaults; }
}

export function saveWidgetVisibility(v: WidgetVisibility) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* noop */ }
}

export function loadWidgetSizes(): WidgetSizes {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) || {};
    const out: WidgetSizes = {};
    DEFAULT_WIDGET_IDS.forEach((id) => {
      if (typeof parsed[id] === 'number') out[id] = clampWidgetSize(id, parsed[id]);
    });
    return out;
  } catch { return {}; }
}

export function saveWidgetSizes(v: WidgetSizes) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(v)); } catch { /* noop */ }
}

export function loadWidgetOrder(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_WIDGET_IDS];
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return [...DEFAULT_WIDGET_IDS];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === DEFAULT_WIDGET_IDS.length) {
      const allPresent = DEFAULT_WIDGET_IDS.every(id => parsed.includes(id));
      if (allPresent) return parsed;
    }
    return [...DEFAULT_WIDGET_IDS];
  } catch {
    return [...DEFAULT_WIDGET_IDS];
  }
}

export function saveWidgetOrder(order: string[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order)); } catch { /* noop */ }
}

// ─── Widget definitions ───────────────────────────────────────────────────────
export const PANEL_WIDGETS: WidgetDef[] = [
  { id: 'controller', labelKey: 'widgetEdit.battery.label', descriptionKey: 'widgetEdit.battery.desc', iconName: 'battery-full', iconLib: 'ion' },
  { id: 'recently_played', labelKey: 'widgetEdit.recentlyPlayed.label', descriptionKey: 'widgetEdit.recentlyPlayed.desc', iconName: 'time', iconLib: 'ion' },
  { id: 'trophies', labelKey: 'widgetEdit.trophies.label', descriptionKey: 'widgetEdit.trophies.desc', iconName: 'trophy', iconLib: 'mci' },
  { id: 'friends', labelKey: 'widgetEdit.friends.label', descriptionKey: 'widgetEdit.friends.desc', iconName: 'people', iconLib: 'ion' },
  { id: 'store', labelKey: 'widgetEdit.store.label', descriptionKey: 'widgetEdit.store.desc', iconName: 'bag-handle', iconLib: 'ion' },
  { id: 'storage', labelKey: 'widgetEdit.storage.label', descriptionKey: 'widgetEdit.storage.desc', iconName: 'harddisk', iconLib: 'mci' },
  { id: 'news', labelKey: 'widgetEdit.news.label', descriptionKey: 'widgetEdit.news.desc', iconName: 'newspaper', iconLib: 'ion' },
  { id: 'add_game', labelKey: 'widgetEdit.addGame.label', descriptionKey: 'widgetEdit.addGame.desc', iconName: 'add-circle', iconLib: 'ion' },
  { id: 'random_pick', labelKey: 'widgetEdit.randomPick.label', descriptionKey: 'widgetEdit.randomPick.desc', iconName: 'shuffle', iconLib: 'ion' },
  { id: 'change_bg', labelKey: 'widgetEdit.changeBg.label', descriptionKey: 'widgetEdit.changeBg.desc', iconName: 'image', iconLib: 'ion' },
];

// ─── WidgetIcon helper ────────────────────────────────────────────────────────
const WidgetIcon: React.FC<{ def: WidgetDef }> = ({ def }) =>
  def.iconLib === 'mci'
    ? <MaterialCommunityIcons name={def.iconName as any} size={20} color="#FFF" />
    : <Ionicons name={def.iconName as any} size={20} color="#FFF" />;

// ─── Single row ───────────────────────────────────────────────────────────────
interface WidgetRowProps {
  widget: WidgetDef;
  enabled: boolean;
  isFocused: boolean;
  size: WidgetSize;
  onToggle: () => void;
}

const WidgetRow: React.FC<WidgetRowProps> = ({ widget, enabled, isFocused, size, onToggle }) => {
  const maxSize = getWidgetMaxSize(widget.id);
  const { t } = useTranslation();
  const focusAnim = useRef(new RNAnimated.Value(isFocused ? 1 : 0)).current;
  useEffect(() => {
    RNAnimated.timing(focusAnim, { toValue: isFocused ? 1 : 0, duration: 180, useNativeDriver: false }).start();
  }, [isFocused]);

  const rowOpacity = focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0.38, 1] });

  return (
    <RNAnimated.View style={{ opacity: rowOpacity }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggle}
        style={[rowStyles.row, isFocused && rowStyles.rowFocused]}
      >
        {/* Borde giratorio: solo en la fila enfocada, superpuesto a toda la fila */}
        {isFocused && (
          <View style={rowStyles.spinningOverlay} pointerEvents="none">
            <SpinningBorderSearch size={50} spread={4} borderRadius={2} />
          </View>
        )}
        <View style={rowStyles.iconWrap}>
          <WidgetIcon def={widget} />
        </View>
        <View style={rowStyles.textWrap}>
          <Text style={[rowStyles.label, !enabled && rowStyles.labelDisabled]}>
            {t(widget.labelKey)}
          </Text>
          {isFocused && widget.descriptionKey ? (
            <Text style={rowStyles.description} numberOfLines={2}>
              {t(widget.descriptionKey)}
            </Text>
          ) : null}
          {/* Indicador de tamaño (solo widgets ampliables) */}
          {isFocused && maxSize > 0 ? (
            <View style={rowStyles.sizePips}>
              {Array.from({ length: maxSize + 1 }).map((_, i) => (
                <View key={i} style={[rowStyles.pip, i <= size && rowStyles.pipActive]} />
              ))}
            </View>
          ) : null}
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: '#363636ff', true: '#363636ff' }}
          thumbColor={enabled ? '#ffffffff' : '#5c5c5cff'}
          ios_backgroundColor="rgba(255,255,255,0.2)"
        />
      </TouchableOpacity>
    </RNAnimated.View>
  );
};

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 8,
    marginVertical: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  } as any,
  rowFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0)',
    //borderColor: 'rgba(255,255,255,0.7)',
  },
  spinningOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
    zIndex: 0,
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: { flex: 1, paddingRight: 10 },
  label: { color: '#FFFFFF', fontSize: 15, fontFamily: 'SSTLight', fontWeight: '500' },
  labelDisabled: { color: 'rgba(255,255,255,0.5)' },
  description: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'SSTRg', marginTop: 8, lineHeight: 15 },
  sizePips: { flexDirection: 'row', gap: 5, marginTop: 8 },
  pip: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  pipActive: { backgroundColor: '#FFFFFF' },
});

// ─── Main Panel ───────────────────────────────────────────────────────────────
export interface WidgetEditPanelProps {
  visible: boolean;
  /** Index inside PANEL_WIDGETS with keyboard/gamepad focus. -1 = none */
  focusedWidgetIndex: number;
  visibility: WidgetVisibility;
  /** Tamaño actual de cada widget (faltante = 0). */
  sizes?: WidgetSizes;
  onToggle: (id: string) => void;
  /** delta: +1 = ampliar (R1), -1 = reducir (L1) */
  onResize?: (widgetId: string, delta: 1 | -1) => void;
  onClose: () => void;
  onStartMove?: (widgetId: string) => void;
  windowHeight: number;
}

const WidgetEditPanel: React.FC<WidgetEditPanelProps> = ({
  visible,
  focusedWidgetIndex,
  visibility,
  sizes,
  onToggle,
  onResize,
  onClose,
  onStartMove,
  windowHeight,
}) => {
  const { t } = useTranslation();
  const slideAnim = useRef(new RNAnimated.Value(-420)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(slideAnim, { toValue: visible ? 0 : -420, duration: 280, useNativeDriver: Platform.OS !== 'web' }),
      RNAnimated.timing(opacityAnim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [visible]);

  useEffect(() => {
    if (!visible || focusedWidgetIndex < 0) return;
    const ROW_H = 60;
    const PANEL_H = Math.min(windowHeight * 0.72, 540);
    scrollRef.current?.scrollTo({ y: Math.max(0, focusedWidgetIndex * ROW_H - PANEL_H / 2 + ROW_H / 2), animated: true });
  }, [focusedWidgetIndex, visible, windowHeight]);

  return (
    <RNAnimated.View
      style={[
        panelStyles.container,
        {
          height: Math.min(windowHeight * 0.78, 650),
          transform: [{ translateX: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {Platform.OS === 'web' && (
        // @ts-ignore
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, borderRadius: 16,
          background: 'linear-gradient(150deg, rgba(12, 12, 14, 0.68) 0%, rgba(0, 0, 0, 0.67) 100%)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }} />
      )}

      <View style={panelStyles.header}>
        <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.65)" style={{ marginRight: 8 }} />
        <Text style={panelStyles.headerTitle}>{t('widgetEdit.title')}</Text>
        <TouchableOpacity
          onPress={onClose}
          style={panelStyles.closeBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
      <View style={panelStyles.divider} />

      <ScrollView
        ref={scrollRef}
        style={panelStyles.list}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {PANEL_WIDGETS.map((w, idx) => (
          <WidgetRow
            key={w.id}
            widget={w}
            enabled={visibility[w.id] !== false}
            isFocused={idx === focusedWidgetIndex}
            size={sizes?.[w.id] ?? 0}
            onToggle={() => onToggle(w.id)}
          />
        ))}
        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={panelStyles.footerHints}>
        <View style={panelStyles.hintItem}>
          <PSIcon char={PSIcons.cross} size={20} style={panelStyles.hintBadge} color="#d3d3d3ff" />
          <Text style={panelStyles.hintLabel}>{t('widgetEdit.hintToggle')}</Text>
        </View>
        <View style={panelStyles.hintItem}>
          <PSIcon char={PSIcons.circle} size={20} style={panelStyles.hintBadge} color="#d3d3d3ff" />
          <Text style={panelStyles.hintLabel}>{t('widgetEdit.hintExit')}</Text>
        </View>
        <TouchableOpacity
          style={panelStyles.hintItem}
          activeOpacity={0.7}
          onPress={() => {
            const currentWidget = PANEL_WIDGETS[focusedWidgetIndex];
            if (currentWidget && onStartMove) onStartMove(currentWidget.id);
          }}
        >
          <PSIcon char={PSIcons.square} size={20} style={panelStyles.hintBadge} color="#d3d3d3ff" />
          <Text style={panelStyles.hintLabel}>{t('widgetEdit.hintMove')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={panelStyles.hintItem}
          activeOpacity={0.7}
          onPress={() => {
            const w = PANEL_WIDGETS[focusedWidgetIndex];
            if (w) onResize?.(w.id, -1);
          }}
        >
          <PSIcon char={PSIcons.r1} size={20} style={panelStyles.hintBadge} color="#d3d3d3ff" />
          <Text style={panelStyles.hintLabel}>{t('widgetEdit.hintShrink')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={panelStyles.hintItem}
          activeOpacity={0.7}
          onPress={() => {
            const w = PANEL_WIDGETS[focusedWidgetIndex];
            if (w) onResize?.(w.id, 1);
          }}
        >
          <PSIcon char={PSIcons.l1} size={20} style={panelStyles.hintBadge} color="#d3d3d3ff" />
          <Text style={panelStyles.hintLabel}>{t('widgetEdit.hintExpand')}</Text>
        </TouchableOpacity>
      </View>
    </RNAnimated.View>
  );
};

const panelStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 48,
    top: 105,
    width: 465,
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 20,
  } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    zIndex: 1,
  },
  headerTitle: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontFamily: 'SSTBold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 16,
    zIndex: 1,
  },
  list: { zIndex: 1, flex: 1 },
  footerHints: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    zIndex: 1,
    gap: 16,
    rowGap: 8,
    flexWrap: 'wrap',
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintBadge: {
    //backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  keyBadge: {
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#d3d3d3ff',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  hintBadgeText: {
    color: '#d3d3d3ff',
    fontSize: 12.5,
    fontFamily: 'SSTMedium',
  },
  hintLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontFamily: 'SSTRg',
  },
});

export default WidgetEditPanel;