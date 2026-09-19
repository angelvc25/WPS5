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

// ─── Definitions ─────────────────────────────────────────────────────────────
export interface WidgetDef {
  id: string;
  label: string;
  description?: string;
  iconName: string;
  iconLib: 'ion' | 'mci';
}

export type WidgetVisibility = Record<string, boolean>;

const STORAGE_KEY = 'welcome_widget_visibility';
const ORDER_STORAGE_KEY = 'welcome_widget_order';

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
  { id: 'controller',      label: 'Carga de la batería',       description: 'Muestra el estado de la batería de tus accesorios.', iconName: 'game-controller-outline', iconLib: 'ion' },
  { id: 'recently_played', label: 'Jugados recientemente',      description: 'Muestra el último juego al que has jugado.', iconName: 'time-outline',         iconLib: 'ion' },
  { id: 'trophies',        label: 'Trofeos',                    description: 'Resumen y estadísticas de tus trofeos obtenidos.', iconName: 'trophy-outline',       iconLib: 'mci' },
  { id: 'friends',         label: 'Amigos en línea',            description: 'Amigos conectados y su actividad de juego actual.', iconName: 'people-outline',       iconLib: 'ion' },
  { id: 'store',           label: 'PlayStation Store',          description: 'Ofertas destacadas y promociones de la tienda.', iconName: 'bag-handle-outline',   iconLib: 'ion' },
  { id: 'storage',         label: 'Resumen del almacenamiento', description: 'Espacio libre y estado del disco de almacenamiento.', iconName: 'harddisk',             iconLib: 'mci' },
  { id: 'news',            label: 'Noticias',                   description: 'Últimas novedades y actualizaciones de tus juegos.', iconName: 'newspaper-outline',    iconLib: 'ion' },
  { id: 'add_game',        label: 'Agregar juego',              description: 'Acceso directo para agregar nuevos juegos.', iconName: 'add-circle-outline',   iconLib: 'ion' },
  { id: 'random_pick',     label: 'Juego aleatorio',            description: 'Elige un juego aleatorio de tu colección.', iconName: 'shuffle-outline',      iconLib: 'ion' },
  { id: 'change_bg',       label: 'Cambiar fondo',              description: 'Personaliza el fondo de pantalla de tu consola.', iconName: 'image-outline',        iconLib: 'ion' },
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
  onToggle: () => void;
}

const WidgetRow: React.FC<WidgetRowProps> = ({ widget, enabled, isFocused, onToggle }) => {
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
        <View style={rowStyles.iconWrap}>
          <WidgetIcon def={widget} />
        </View>
        <View style={rowStyles.textWrap}>
          <Text style={[rowStyles.label, !enabled && rowStyles.labelDisabled]}>
            {widget.label}
          </Text>
          {isFocused && widget.description ? (
            <Text style={rowStyles.description} numberOfLines={2}>
              {widget.description}
            </Text>
          ) : null}
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#FFFFFF' }}
          thumbColor={enabled ? '#121624' : '#777788'}
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textWrap: { flex: 1, paddingRight: 10 },
  label: { color: '#FFFFFF', fontSize: 14, fontFamily: 'SSTMedium', fontWeight: '500' },
  labelDisabled: { color: 'rgba(255,255,255,0.5)' },
  description: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontFamily: 'SSTRg', marginTop: 3, lineHeight: 15 },
});

// ─── Main Panel ───────────────────────────────────────────────────────────────
export interface WidgetEditPanelProps {
  visible: boolean;
  /** Index inside PANEL_WIDGETS with keyboard/gamepad focus. -1 = none */
  focusedWidgetIndex: number;
  visibility: WidgetVisibility;
  onToggle: (id: string) => void;
  onClose: () => void;
  onStartMove?: (widgetId: string) => void;
  windowHeight: number;
}

const WidgetEditPanel: React.FC<WidgetEditPanelProps> = ({
  visible,
  focusedWidgetIndex,
  visibility,
  onToggle,
  onClose,
  onStartMove,
  windowHeight,
}) => {
  const slideAnim = useRef(new RNAnimated.Value(-420)).current;
  const opacityAnim = useRef(new RNAnimated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(slideAnim, { toValue: visible ? 0 : -420, duration: 280, useNativeDriver: true }),
      RNAnimated.timing(opacityAnim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }),
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
          height: Math.min(windowHeight * 0.78, 580),
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
          background: 'linear-gradient(150deg, rgba(16,20,36,0.95) 0%, rgba(8,12,22,0.98) 100%)',
          backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }} />
      )}

      <View style={panelStyles.header}>
        <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.65)" style={{ marginRight: 8 }} />
        <Text style={panelStyles.headerTitle}>Personalizar widgets</Text>
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
            onToggle={() => onToggle(w.id)}
          />
        ))}
        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={panelStyles.footerHints}>
        <View style={panelStyles.hintItem}>
          <View style={panelStyles.hintBadge}><Text style={panelStyles.hintBadgeText}>✕</Text></View>
          <Text style={panelStyles.hintLabel}>Alternar</Text>
        </View>
        <View style={panelStyles.hintItem}>
          <View style={panelStyles.hintBadge}><Text style={panelStyles.hintBadgeText}>○</Text></View>
          <Text style={panelStyles.hintLabel}>Salir</Text>
        </View>
        <TouchableOpacity
          style={panelStyles.hintItem}
          activeOpacity={0.7}
          onPress={() => {
            const currentWidget = PANEL_WIDGETS[focusedWidgetIndex];
            if (currentWidget && onStartMove) onStartMove(currentWidget.id);
          }}
        >
          <View style={panelStyles.hintBadge}><Text style={panelStyles.hintBadgeText}>□</Text></View>
          <Text style={panelStyles.hintLabel}>Mover</Text>
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
    width: 350,
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 8 },
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
    fontSize: 13,
    fontFamily: 'SSTMedium',
    fontWeight: '600',
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
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hintBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  hintBadgeText: {
    color: '#FFF',
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'SSTMedium',
  },
  hintLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11.5,
    fontFamily: 'SSTRg',
  },
});

export default WidgetEditPanel;
