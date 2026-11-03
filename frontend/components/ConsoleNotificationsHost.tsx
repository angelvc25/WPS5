import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { toastService, ToastOptions } from '@/services/toastService';
import ConsoleNotification, { ConsoleNotificationType } from './ConsoleNotification';

/**
 * Payload que extiende ToastOptions para poder indicar que un toast
 * debe renderizarse como notificación de consola (estilo Steam/PS5 overlay).
 */
export interface ConsoleToastOptions extends ToastOptions {
    /** Tipo de notificación de consola. Si se omite, el toast se ignora en el overlay. */
    consoleType?: ConsoleNotificationType;
    /** Título mostrado en la notificación de consola (usa t() del hook llamante). */
    consoleTitle?: string;
    /** Ícono (avatar, portada, trofeo, etc.). */
    icon?: any;
    /** Nombre del glyph de Ionicons como fallback. */
    glyphName?: string;
    /** Color de acento. */
    accentColor?: string;
    /** Tiempo de vida en ms. */
    durationMs?: number;
    /** Datos extra (appId, steamid, etc.). */
    consoleData?: any;
}

interface QueuedNotification {
    id: string;
    type: ConsoleNotificationType;
    title: string;
    message: string;
    icon?: any;
    glyphName?: string;
    accentColor?: string;
    durationMs?: number;
    onPress?: () => void;
    data?: any;
    timestamp: number;
}

/** Máximo de notificaciones visibles simultáneamente en la pila. */
const MAX_VISIBLE = 4;
/** Separación vertical entre notificaciones apiladas. */
const STACK_GAP = 10;

export default function ConsoleNotificationsHost() {
    const [queue, setQueue] = useState<QueuedNotification[]>([]);

    /** Añade una notificación a la pila (desde el hook de detección o desde toastService). */
    const enqueue = useCallback((payload: {
        id: string;
        type: ConsoleNotificationType;
        title: string;
        message: string;
        icon?: any;
        glyphName?: string;
        accentColor?: string;
        durationMs?: number;
        onPress?: () => void;
        data?: any;
    }) => {
        setQueue((prev) => {
            const next = [...prev, { ...payload, timestamp: Date.now() } as QueuedNotification];
            return next.slice(-MAX_VISIBLE);
        });
    }, []);

    const dismiss = useCallback((id: string) => {
        setQueue((prev) => prev.filter((n) => n.id !== id));
    }, []);

    // Escucha los toasts del sistema (toastService.show) y, si tienen consoleType,
    // los renderiza como notificación de consola en el overlay.
    useEffect(() => {
        const unsubscribe = toastService.subscribe(({ message, options }) => {
            if (!options || !options.consoleType) return;
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            enqueue({
                id,
                type: options.consoleType,
                title: options.consoleTitle ?? '',
                message,
                icon: options.icon,
                glyphName: options.glyphName,
                accentColor: options.accentColor,
                durationMs: options.duration,
                data: options.consoleData,
            });
        });
        return unsubscribe;
    }, [enqueue]);

    // Ordena: las más recientes arriba (índice 0 = la más reciente, arriba visualmente).
    const ordered = [...queue].reverse();

    if (ordered.length === 0) return null;

    return (
        <View style={styles.container} pointerEvents="none">
            {ordered.map((notif, idx) => (
                <ConsoleNotification
                    key={notif.id}
                    notification={{
                        ...notif,
                        // Cada notificación sube un poco más cuanto más arriba esté en la pila.
                    }}
                    index={idx}
                    onDismiss={dismiss}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 16,
        right: 0,
        left: 0,
        alignItems: 'flex-end',
        zIndex: 120000,
        pointerEvents: 'box-none',
    },
});
