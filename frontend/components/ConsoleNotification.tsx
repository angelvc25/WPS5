import React, {
    useCallback, useEffect, useRef, useState,
} from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from 'react-native-reanimated';
import { soundService } from '@/services/soundService';
import { useTranslation } from '@/contexts/LanguageContext';
import { TranslationKey } from '@/i18n/translations';

export type ConsoleNotificationType =
    | 'friend-playing'
    | 'download-completed'
    | 'game-updated'
    | 'achievement-unlocked'
    | 'system';

export interface ConsoleNotification {
    id: string;
    type: ConsoleNotificationType;
    title: string;
    message: string;
    /** Imagen (avatar del amigo, portada del juego, ícono de trofeo, etc.) */
    icon?: any;
    /** Nombre del glyph de Ionicons cuando no hay imagen */
    glyphName?: string;
    /** Color de acento del tipo (borde izquierdo / fondo del ícono) */
    accentColor?: string;
    /** Tiempo de vida en ms antes de auto-descartarse */
    durationMs?: number;
    onPress?: () => void;
    /** Datos extra (appId, steamid, etc.) */
    data?: any;
    timestamp?: number;
}

/** Colores de acento por tipo de notificación (estilo consola). */
const TYPE_ACCENT: Record<ConsoleNotificationType, string> = {
    'friend-playing': '#4FA8FF',      // azul Steam
    'download-completed': '#2E7DFF',  // azul más fuerte
    'game-updated': '#FFB300',        // ámbar
    'achievement-unlocked': '#FFD700', // dorado
    system: '#FFFFFF',
};

const TYPE_GLYPH: Record<ConsoleNotificationType, string> = {
    'friend-playing': 'person',
    'download-completed': 'download',
    'game-updated': 'refresh',
    'achievement-unlocked': 'trophy',
    system: 'information-circle',
};

const TYPE_TITLE_KEY: Record<ConsoleNotificationType, string> = {
    'friend-playing': 'consoleNotif.friendPlayingTitle',
    'download-completed': 'consoleNotif.downloadCompletedTitle',
    'game-updated': 'consoleNotif.gameUpdatedTitle',
    'achievement-unlocked': 'consoleNotif.achievementUnlockedTitle',
    system: 'consoleNotif.systemTitle',
};

interface ConsoleNotificationProps {
    notification: ConsoleNotification;
    onDismiss: (id: string) => void;
    index: number; // posición en la pila (para el stagger de entrada)
}

export default function ConsoleNotification({
    notification,
    onDismiss,
    index = 0,
}: ConsoleNotificationProps) {
    const { t } = useTranslation();
    const { width: winW } = useWindowDimensions();
    const [dismissed, setDismissed] = useState(false);

    const type = notification.type;
    const accent = notification.accentColor ?? TYPE_ACCENT[type];
    const glyph = notification.glyphName ?? TYPE_GLYPH[type];
    const defaultTitle = t(TYPE_TITLE_KEY[type] as TranslationKey);
    const title = notification.title || defaultTitle;

    const opacity = useSharedValue(0);
    const translateX = useSharedValue(winW * 0.35); // entra desde la derecha
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const dismiss = useCallback(() => {
        if (dismissed) return;
        setDismissed(true);
        opacity.value = withTiming(0, { duration: 220 });
        translateX.value = withTiming(24, { duration: 220 }, (finished) => {
            if (finished) runOnJS(onDismiss)(notification.id);
        });
    }, [dismissed, notification.id, onDismiss, opacity, translateX]);

    const autoDismiss = useCallback(() => {
        const ms = notification.durationMs ?? 6000;
        timerRef.current = setTimeout(dismiss, ms);
    }, [dismiss, notification.durationMs]);

    useEffect(() => {
        // Entrada animada con stagger según el índice en la pila.
        const enterDelay = index * 90;
        timerRef.current = setTimeout(() => {
            opacity.value = withTiming(1, { duration: 300 });
            translateX.value = withTiming(0, { duration: 350 });
        }, enterDelay);
        autoDismiss();
        if (type === 'achievement-unlocked') {
            soundService.playTrophy?.(notification.data?.rarity).catch(() => { });
        } else {
            soundService.playNotification?.().catch(() => { });
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [autoDismiss, index, opacity, translateX, type, notification.data?.rarity]);

    if (dismissed) return null;

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: translateX.value }],
    }));

    const handlePress = useCallback(() => {
        if (notification.onPress) notification.onPress();
        dismiss();
    }, [notification, dismiss]);

    const hasImage = !!notification.icon;

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={handlePress}
            style={styles.container}
        >
            <Animated.View style={[styles.wrapper, animatedStyle]}>
                <View style={styles.root}>
                    {/* Barra de acento izquierda */}
                    <View style={[styles.accentBar, { backgroundColor: accent }]} />

                    {/* Contenido */}
                    <View style={styles.content}>
                        {/* Ícono */}
                        <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
                            {hasImage ? (
                                <Image
                                    source={notification.icon}
                                    style={styles.iconImage}
                                    contentFit="cover"
                                />
                            ) : (
                                <Ionicons
                                    name={glyph as keyof typeof Ionicons.glyphMap}
                                    size={20}
                                    color={accent}
                                    style={styles.iconGlyph}
                                />
                            )}
                        </View>

                        {/* Textos */}
                        <View style={styles.texts}>
                            <Text style={[styles.title, { color: '#FFF' }]} numberOfLines={1}>
                                {title}
                            </Text>
                            <Text style={styles.message} numberOfLines={2}>
                                {notification.message}
                            </Text>
                        </View>
                    </View>

                    {/* Logo de trofeo PS5 si es un logro */}
                    {type === 'achievement-unlocked' && (
                        <View style={styles.ps5TrophyBadge}>
                            <Image
                                source={require('@/assets/trophies/logo-trophy.png')}
                                style={styles.ps5TrophyLogo}
                                contentFit="contain"
                            />
                        </View>
                    )}

                    {/* Botón cerrar (X) */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={dismiss}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                        <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        // Margen para no tocar los bordes de pantalla
        marginHorizontal: 16,
        marginTop: 16,
    },
    wrapper: {
        overflow: 'hidden',
    },
    root: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(18, 21, 26, 0.92)',
        borderRadius: 10,
        //borderWidth: 1,
        //borderColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 12,
        paddingVertical: 12,
        minHeight: 64,
        // Sombra tipo consola
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 16,
        elevation: 8,
    },
    accentBar: {
        width: 4,
        borderRadius: 2,
        height: '100%',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        marginLeft: 10,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        overflow: 'hidden',
    },
    iconImage: {
        width: 36,
        height: 36,
    },
    iconGlyph: {},
    texts: {
        flex: 1,
    },
    title: {
        fontSize: 15,
        fontFamily: 'SSTMedium',
        color: '#FFFFFF',
        letterSpacing: 0.2,
        marginBottom: 2,
    },
    message: {
        fontSize: 13,
        fontFamily: 'SSTRg',
        color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: 17,
        flex: 1,
    },
    ps5TrophyBadge: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    ps5TrophyLogo: {
        width: 24,
        height: 24,
    },
});
