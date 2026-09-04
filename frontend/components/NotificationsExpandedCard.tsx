import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Pressable,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    runOnJS,
} from 'react-native-reanimated';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import { soundService } from '@/services/soundService';
import { toastService, ToastHistoryItem } from '@/services/toastService';
import { SpinningBorderSearch } from './SpinningBorderSearch';
import { useTranslation } from '@/contexts/LanguageContext';

export interface AppNotification {
    id: string;
    appName: string;
    appIcon?: any;
    appCoverImage?: any;
    title: string;
    message: string;
    time: string;
    unread?: boolean;
    isWarning?: boolean;
}

interface NotificationsExpandedCardProps {
    isOpen: boolean;
    onClose: () => void;
    notifications?: AppNotification[];
    onOpenNotification?: (notification: AppNotification) => void;
    /** Coordenadas en ventana del icono de campana (top-y y centro-x), para anclar la card justo encima. */
    anchorLeft?: number;
    anchorTop?: number;
}

const DEFAULT_NOTIFICATIONS: AppNotification[] = [
    // {
    //     id: 'n1',
    //     appName: 'Until Dawn™',
    //     title: 'Until Dawn™',
    //     message: 'No se pudieron sincronizar tus datos guardados debido a un error de conexión.',
    //     time: '1 min',
    //     unread: true,
    //     isWarning: true,
    // },
    // {
    //     id: 'n2',
    //     appName: 'Trofeos',
    //     title: 'Castigador',
    //     message: '¡Ganaste un trofeo!',
    //     time: '2 h',
    //     unread: true,
    // },
];

const SOURCE_LABELS: Record<string, string> = {
    steam: 'Steam',
    epic: 'Epic Games',
    system: 'WPS5',
};

function formatRelativeTime(timestamp: number): string {
    const diffMin = Math.floor((Date.now() - timestamp) / 60000);
    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD} día${diffD > 1 ? 's' : ''}`;
}

export default function NotificationsExpandedCard({
    isOpen,
    onClose,
    notifications: notificationsProp,
    onOpenNotification,
    anchorLeft = 0,
    anchorTop = 0,
}: NotificationsExpandedCardProps) {
    const { width: winW, height: winH } = useWindowDimensions();
    const { t } = useTranslation();

    const [notifications, setNotifications] = useState<AppNotification[]>(
        notificationsProp ?? DEFAULT_NOTIFICATIONS,
    );
    const [toastHistory, setToastHistory] = useState<ToastHistoryItem[]>(() => toastService.getHistory());
    const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
    const [doNotDisturb, setDoNotDisturb] = useState(false);
    const [focusedRow, setFocusedRow] = useState(0); // 0 = "No molestar"

    const scrollRef = useRef<ScrollView>(null);

    const CARD_W = Math.round(Math.min(Math.max(winW * 0.24, 380), 480));
    const CARD_MAX_H = Math.round(Math.min(Math.max(winH * 0.62, 380), 760));

    const backdropOpacity = useSharedValue(0);
    const cardOpacity = useSharedValue(0);
    const cardTranslateY = useSharedValue(16);
    const cardScale = useSharedValue(0.96);
    const [shouldRender, setShouldRender] = useState(isOpen);

    // Se suscribe al historial de toasts en vivo (amigo jugando, instalación completa, etc.)
    // useEffect(() => {
    //     toastService.subscribeHistory(setToastHistory);
    // }, []);
    useEffect(() => toastService.subscribeHistory(setToastHistory), []);

    useEffect(() => {
        if (notificationsProp) setNotifications(notificationsProp);
    }, [notificationsProp]);

    useEffect(() => {
        if (isOpen) setShouldRender(true);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            backdropOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
            cardOpacity.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
            cardTranslateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
            cardScale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
            setFocusedRow(0);
        } else {
            backdropOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.cubic) });
            cardOpacity.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.cubic) });
            cardTranslateY.value = withTiming(16, { duration: 180, easing: Easing.in(Easing.cubic) });
            cardScale.value = withTiming(0.97, { duration: 180, easing: Easing.in(Easing.cubic) }, (finished) => {
                if (finished) runOnJS(setShouldRender)(false);
            });
        }
    }, [isOpen]);

    const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
    const cardAnimStyle = useAnimatedStyle(() => ({
        opacity: cardOpacity.value,
        transform: [{ translateY: cardTranslateY.value }, { scale: cardScale.value }],
    }));

    // Combina notificaciones "de app" con el historial de toasts del sistema (amigos, instalaciones, ofertas...)
    const combinedNotifications = useMemo((): AppNotification[] => {
        const fromToasts: AppNotification[] = toastHistory.map((t) => ({
            id: t.id,
            appName: t.source ? SOURCE_LABELS[t.source] ?? t.source : 'Sistema',
            title: t.source ? SOURCE_LABELS[t.source] ?? t.source : 'WPS5',
            message: t.message,
            time: formatRelativeTime(t.timestamp),
            unread: true,
            appIcon: t.icon,
            appCoverImage: t.coverImage,
        }));
        return [...fromToasts, ...notifications];
    }, [toastHistory, notifications]);

    const visibleNotifications = useMemo(
        () => combinedNotifications.filter((n) => !dismissedIds.has(n.id)),
        [combinedNotifications, dismissedIds],
    );

    const totalRows = visibleNotifications.length + 1;

    useEffect(() => {
        if (focusedRow > totalRows - 1) setFocusedRow(Math.max(0, totalRows - 1));
    }, [totalRows, focusedRow]);

    useEffect(() => {
        if (!isOpen) return;
        const rowH = 92;
        const idx = Math.max(0, focusedRow - 1);
        scrollRef.current?.scrollTo({ y: idx * rowH, animated: true });
    }, [focusedRow, isOpen]);

    const deleteFocusedNotification = () => {
        if (focusedRow === 0) return;
        const notif = visibleNotifications[focusedRow - 1];
        if (!notif) return;
        const existsInLocal = notifications.some((n) => n.id === notif.id);
        if (existsInLocal) {
            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
        } else {
            setDismissedIds((prev) => new Set(prev).add(notif.id));
        }
        soundService.playNavigation();
    };

    const activateFocusedRow = () => {
        if (focusedRow === 0) {
            setDoNotDisturb((prev) => !prev);
            soundService.playActivation?.();
            return;
        }
        const notif = visibleNotifications[focusedRow - 1];
        if (notif) {
            setNotifications((prev) =>
                prev.map((n) => (n.id === notif.id ? { ...n, unread: false } : n)),
            );
            onOpenNotification?.(notif);
            soundService.playActivation?.();
        }
    };

    useEffect(() => {
        if (!isOpen || Platform.OS !== 'web') return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
                e.preventDefault(); e.stopPropagation();
                soundService.playBack?.();
                onClose();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault(); e.stopPropagation();
                setFocusedRow((prev) => Math.min(prev + 1, totalRows - 1));
                soundService.playNavigation();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault(); e.stopPropagation();
                setFocusedRow((prev) => Math.max(prev - 1, 0));
                soundService.playNavigation();
            } else if (e.key === 'Enter') {
                e.preventDefault(); e.stopPropagation();
                activateFocusedRow();
            } else if (e.key === 'x' || e.key === 'X') {
                e.preventDefault(); e.stopPropagation();
                deleteFocusedNotification();
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen, totalRows, focusedRow, visibleNotifications, notifications]);

    const unreadCount = useMemo(
        () => visibleNotifications.filter((n) => n.unread).length,
        [visibleNotifications],
    );

    if (!shouldRender) return null;

    const clampedLeft = Math.min(Math.max(anchorLeft - CARD_W / 2, 20), winW - CARD_W - 20);
    const bottomOffset = Math.max(20, winH - anchorTop + 16);

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={isOpen ? 'auto' : 'none'}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }, backdropStyle]} />
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

            <View
                style={[styles.anchorWrap, { left: clampedLeft, bottom: bottomOffset }]}
                pointerEvents="box-none"
            >
                <Animated.View
                    style={[
                        styles.card,
                        {
                            width: CARD_W,
                            maxHeight: CARD_MAX_H,
                            // @ts-ignore web shadow
                            boxShadow: '0 24px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                        },
                        cardAnimStyle,
                    ]}
                >
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>
                            Notificaciones{unreadCount > 0 ? ` (${unreadCount})` : ''}
                        </Text>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => { setFocusedRow(0); setDoNotDisturb((p) => !p); }}
                        style={[styles.dndRow, focusedRow === 0 && styles.rowFocused]}
                    >
                        {focusedRow === 0 && <SpinningBorderSearch size={50} spread={1} borderRadius={2} />}
                        <Text style={styles.dndLabel}>{t('notifications.doNotDisturb')}</Text>
                        <View style={[styles.toggleTrack, doNotDisturb && styles.toggleTrackActive]}>
                            <View style={[styles.toggleThumb, doNotDisturb && styles.toggleThumbActive]} />
                        </View>
                    </TouchableOpacity>

                    {visibleNotifications.length === 0 ? (
                        <View style={styles.emptyWrap}>
                            <Ionicons name="notifications-off-outline" size={30} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.emptyText}>{t('notifications.noNotifications')}</Text>
                        </View>
                    ) : (
                        <ScrollView
                            ref={scrollRef}
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingBottom: 6 }}
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                        >
                            {visibleNotifications.map((notif, idx) => {
                                const rowIndex = idx + 1;
                                const isFocused = focusedRow === rowIndex;
                                return (
                                    <TouchableOpacity
                                        key={notif.id}
                                        activeOpacity={0.85}
                                        onPress={() => { setFocusedRow(rowIndex); activateFocusedRow(); }}
                                        style={[styles.notifCard, isFocused && styles.notifCardFocused]}
                                    >
                                        {isFocused && <SpinningBorderSearch size={50} spread={1} borderRadius={2} />}
                                        <View style={styles.notifIconWrap}>
                                            {(notif.appCoverImage || notif.appIcon) ? (
                                                <Image
                                                    source={notif.appCoverImage || notif.appIcon}
                                                    style={styles.notifIcon}
                                                    contentFit={notif.appCoverImage ? 'cover' : 'contain'}
                                                />
                                            ) : (
                                                <View style={[styles.notifIcon, styles.notifIconFallback]}>
                                                    <Ionicons name="game-controller" size={18} color="rgba(255,255,255,0.6)" />
                                                </View>
                                            )}
                                        </View>

                                        <View style={{ flex: 1 }}>
                                            <View style={styles.notifTopRow}>
                                                <Text style={styles.notifTitle} numberOfLines={1}>{notif.title}</Text>
                                                <View style={styles.notifTimeRow}>
                                                    <Text style={styles.notifTime}>{notif.time}</Text>
                                                    {notif.unread && <View style={styles.unreadDot} />}
                                                </View>
                                            </View>
                                            <View style={styles.notifMessageRow}>
                                                {notif.isWarning && (
                                                    <Ionicons name="alert-circle" size={14} color="#FF3B30" style={{ marginRight: 4, marginTop: 2 }} />
                                                )}
                                                <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}

                    <View style={styles.footerHints}>
                        <TouchableOpacity style={styles.hintItem} activeOpacity={0.7} onPress={deleteFocusedNotification}>
                            <PSIcon char={PSIcons.square} size={16} color="rgba(255,255,255,0.9)" />
                            <Text style={styles.hintText}>{t('context.delete')}</Text>
                        </TouchableOpacity>
                        <View style={styles.hintItem}>
                            <Ionicons name="menu" size={15} color="rgba(255,255,255,0.9)" />
                            <Text style={styles.hintText}>{t('cc.options')}</Text>
                        </View>
                    </View>
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    anchorWrap: { position: 'absolute' },
    card: {
        backgroundColor: 'rgba(18, 21, 26, 1)',
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 0,
        paddingTop: 18,
        paddingHorizontal: 15,
        paddingBottom: 14,
    } as any,
    header: { marginBottom: 14 },
    headerTitle: { color: '#ffffffb9', fontSize: 18, fontFamily: 'SSTLight', letterSpacing: 0.2 },
    dndRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 12, paddingHorizontal: 4, borderRadius: 4, marginBottom: 14,
    },
    rowFocused: { backgroundColor: 'rgba(255, 255, 255, 0)' },
    dndLabel: { color: '#fff', fontSize: 17, fontFamily: 'SSTLight', right: -7 },
    toggleTrack: { width: 46, height: 26, borderRadius: 13, backgroundColor: 'rgba(48, 49, 54, 1)', padding: 3, justifyContent: 'center', left: -7 },
    toggleTrackActive: { backgroundColor: 'rgba(71, 73, 80, 1)' },
    toggleThumb: { width: 20, height: 20, borderWidth: 2, borderColor: 'rgba(94, 100, 105, 1)', borderRadius: 10, backgroundColor: 'rgba(48, 49, 54, 1)' },
    toggleThumbActive: { transform: [{ translateX: 20 }], backgroundColor: '#ffffffff', borderColor: 'rgba(255, 255, 255, 1)' },
    notifCard: {
        flexDirection: 'row', gap: 12, backgroundColor: 'rgba(255, 255, 255, 0)',
        borderRadius: 0, borderBottomWidth: 1, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginLeft: 1, marginRight: 1, padding: 17, marginBottom: 10,
    },
    notifCardFocused: { borderColor: 'rgba(255, 255, 255, 0)', backgroundColor: 'rgba(255, 255, 255, 0.02)' },
    notifIconWrap: { width: 44, height: 44, borderRadius: 2, overflow: 'hidden', left: -10 },
    notifIcon: { width: '100%', height: '100%' },
    notifIconFallback: { backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
    notifTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    notifTitle: { color: '#ffffffce', fontSize: 15, fontFamily: 'SSTLight', flex: 1, marginRight: 8, left: -10 },
    notifTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    notifTime: { color: 'rgba(255, 255, 255, 0.67)', fontSize: 13, fontFamily: 'SSTLight', right: -10 },
    unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4FA8FF', right: -10 },
    notifMessageRow: { flexDirection: 'row', alignItems: 'flex-start' },
    notifMessage: { color: 'rgba(255, 255, 255, 0.86)', fontSize: 15, fontFamily: 'SSTRg', lineHeight: 18, flex: 1, left: -10 },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
    emptyText: { color: 'rgba(255, 255, 255, 0.86)', fontSize: 15, fontFamily: 'SSTRg' },
    footerHints: {
        flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 12, marginTop: 4,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    },
    hintItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    hintText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontFamily: 'SSTMedium' },
});