import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    FadeIn,
    FadeOut,
    Easing,
} from 'react-native-reanimated';
import RadarFocusWrapper from '@/components/RadarFocusWrapper';
import PSIcon from '@/components/PSIcon';
import { PSIcons } from '@/constants/psIcons';
import { soundService } from '@/services/soundService';
import { useTranslation } from '@/contexts/LanguageContext';
import { useGamepadInput } from '@/hooks/useGamepadInput';

interface ActiveGameInfo {
    id: string;
    title: string;
    image?: string | null;
    installDir?: string | null;
    source?: 'steam' | 'epic' | 'native';
}

type OverlayAction = 'resume' | 'switch' | 'close' | 'quit';

interface OverlayItem {
    id: OverlayAction;
    icon: keyof typeof Ionicons.glyphMap;
    labelKey: 'overlay.resume' | 'overlay.switch' | 'overlay.close' | 'overlay.quit';
    danger?: boolean;
}

const ITEMS: OverlayItem[] = [
    { id: 'resume', icon: 'play', labelKey: 'overlay.resume' },
    { id: 'switch', icon: 'swap-horizontal', labelKey: 'overlay.switch' },
    { id: 'close', icon: 'close-circle-outline', labelKey: 'overlay.close', danger: true },
    { id: 'quit', icon: 'power', labelKey: 'overlay.quit', danger: true },
];

export default function OverlayScreen() {
    const { t } = useTranslation();
    const [activeGame, setActiveGame] = useState<ActiveGameInfo | null>(null);
    const [focusIndex, setFocusIndex] = useState(0);
    const [confirmingClose, setConfirmingClose] = useState(false);
    const [isBusy, setIsBusy] = useState(false);

    useGamepadInput({
        onInputModeChange: () => {},
        onGamepadChange: () => {},
        onConnected: () => {},
    });

    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.97);

    const refreshActiveGame = useCallback(async () => {
        if (Platform.OS !== 'web' || !(window as any).electronAPI?.getActiveGameInfo) return;
        try {
            const info = await (window as any).electronAPI.getActiveGameInfo();
            setActiveGame(info || null);
        } catch (err) {
            console.warn('[Overlay] getActiveGameInfo failed:', err);
            setActiveGame(null);
        }
    }, []);

    // Entrada animada + refresco de datos cada vez que el main muestra la ventana
    useEffect(() => {
        opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
        scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
        setFocusIndex(0);
        setConfirmingClose(false);
        refreshActiveGame();

        let unsubscribe: (() => void) | undefined;
        if (Platform.OS === 'web' && (window as any).electronAPI?.onOverlayShown) {
            unsubscribe = (window as any).electronAPI.onOverlayShown(() => {
                opacity.value = 0;
                scale.value = 0.97;
                opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
                scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
                setFocusIndex(0);
                setConfirmingClose(false);
                refreshActiveGame();
            });
        }
        return () => unsubscribe?.();
    }, [refreshActiveGame]);

    const containerStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ scale: scale.value }],
    }));

    const hideOverlay = useCallback(() => {
        soundService.playBack?.();
        if (Platform.OS === 'web' && (window as any).electronAPI?.hideOverlay) {
            (window as any).electronAPI.hideOverlay();
        }
    }, []);

    const handleSwitchGame = useCallback(() => {
        soundService.playActivation?.();
        if (Platform.OS === 'web' && (window as any).electronAPI?.showMainWindowToSwitchGame) {
            (window as any).electronAPI.showMainWindowToSwitchGame();
        }
    }, []);

    const handleQuitToDesktop = useCallback(() => {
        soundService.playActivation?.();
        if (Platform.OS === 'web' && (window as any).electronAPI?.quitToDesktop) {
            (window as any).electronAPI.quitToDesktop();
        }
    }, []);

    const handleCloseGame = useCallback(async () => {
        if (!activeGame) return;
        setIsBusy(true);
        soundService.playActivation?.();
        try {
            const result = await (window as any).electronAPI?.closeCurrentGame?.(
                activeGame.installDir ?? activeGame.id
            );
            if (result?.success) {
                // El main detecta el cierre real vía su watcher existente y
                // restaurará mainWindow + emitirá game-closed; aquí solo
                // ocultamos el overlay para no dejarlo tapando un escritorio vacío.
                hideOverlay();
            } else {
                console.warn('[Overlay] closeCurrentGame no tuvo éxito:', result);
            }
        } finally {
            setIsBusy(false);
            setConfirmingClose(false);
        }
    }, [activeGame, hideOverlay]);

    const activateItem = useCallback(
        (action: OverlayAction) => {
            if (isBusy) return;
            if (action === 'resume') {
                hideOverlay();
            } else if (action === 'switch') {
                handleSwitchGame();
            } else if (action === 'close') {
                if (confirmingClose) {
                    void handleCloseGame();
                } else {
                    soundService.playNavigation();
                    setConfirmingClose(true);
                }
            } else if (action === 'quit') {
                handleQuitToDesktop();
            }
        },
        [isBusy, confirmingClose, hideOverlay, handleSwitchGame, handleCloseGame, handleQuitToDesktop]
    );

    // Navegación por teclado / mando (el mando ya se traduce a eventos de
    // teclado por useGamepadInput en la ventana principal; aquí replicamos
    // el mismo listener liviano, propio de esta ventana).
    useEffect(() => {
        if (Platform.OS !== 'web') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (['ArrowRight', 'ArrowLeft', 'Enter', ' ', 'Escape'].includes(e.key)) {
                e.preventDefault();
            }

            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
                if (confirmingClose) {
                    soundService.playBack?.();
                    setConfirmingClose(false);
                } else {
                    hideOverlay();
                }
                return;
            }

            if (e.key === 'ArrowRight') {
                soundService.playNavigation();
                setFocusIndex((prev) => Math.min(prev + 1, ITEMS.length - 1));
                setConfirmingClose(false);
            } else if (e.key === 'ArrowLeft') {
                soundService.playNavigation();
                setFocusIndex((prev) => Math.max(prev - 1, 0));
                setConfirmingClose(false);
            } else if (e.key === 'Enter' || e.key === ' ') {
                activateItem(ITEMS[focusIndex].id);
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [focusIndex, confirmingClose, activateItem, hideOverlay]);

    // Asegurar transparencia en el DOM web
    useEffect(() => {
        if (Platform.OS === 'web') {
            document.documentElement.style.backgroundColor = 'transparent';
            document.documentElement.style.background = 'transparent';
            document.body.style.backgroundColor = 'transparent';
            document.body.style.background = 'transparent';
            const root = document.getElementById('root');
            if (root) {
                root.style.backgroundColor = 'transparent';
                root.style.background = 'transparent';
            }
        }
    }, []);

    return (
        <View style={styles.root}>
                {/* Fondo: la ventana Electron ya es transparente, aquí solo añadimos
              una viñeta sutil para que el menú se lea sobre cualquier juego */}
                {Platform.OS === 'web' && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                                'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0) 100%)',
                            pointerEvents: 'none',
                        }}
                    />
                )}

            <Animated.View style={[styles.centerWrap, containerStyle]}>
                {/* Cabecera con el juego activo */}
                <Animated.View style={styles.gameHeader} entering={FadeIn.duration(300).delay(80)}>
                    <View style={styles.gameCover}>
                        {activeGame?.image ? (
                            <Image source={{ uri: activeGame.image }} style={styles.gameCoverImg} contentFit="cover" />
                        ) : (
                            <View style={[styles.gameCoverImg, styles.gameCoverFallback]}>
                                <Ionicons name="game-controller" size={26} color="rgba(255,255,255,0.5)" />
                            </View>
                        )}
                    </View>
                    <View>
                        <Text style={styles.gameTitle} numberOfLines={1}>
                            {activeGame?.title || t('overlay.unknownGame')}
                        </Text>
                        <Text style={styles.gameSubtitle}>{t('overlay.subtitle')}</Text>
                    </View>
                </Animated.View>

                {/* Pill de acciones estilo FloatingSystemNav */}
                <View style={styles.pillContainer}>
                    {ITEMS.map((item, index) => {
                        const isFocused = focusIndex === index;
                        const isConfirmStep = item.id === 'close' && confirmingClose && isFocused;
                        return (
                            <TouchableOpacity
                                key={item.id}
                                activeOpacity={0.75}
                                disabled={isBusy}
                                onPress={() => {
                                    setFocusIndex(index);
                                    activateItem(item.id);
                                }}
                                style={styles.iconButton}
                            >
                                {isFocused ? (
                                    <RadarFocusWrapper id={`overlay-${item.id}`} isFocused size={58} innerSize={0}>
                                        <View
                                            style={[
                                                styles.iconWrapperFocused,
                                                item.danger && styles.iconWrapperDanger,
                                                isConfirmStep && styles.iconWrapperConfirm,
                                            ]}
                                        >
                                            <Ionicons
                                                name={item.icon}
                                                size={22}
                                                color={item.danger ? '#FFF' : '#000'}
                                            />
                                        </View>
                                    </RadarFocusWrapper>
                                ) : (
                                    <View style={styles.iconWrapper}>
                                        <Ionicons name={item.icon} size={22} color="rgba(255,255,255,0.85)" />
                                    </View>
                                )}

                                {isFocused && (
                                    <View style={styles.tooltip}>
                                        <Text style={styles.tooltipText}>
                                            {isConfirmStep ? t('overlay.confirmClose') : t(item.labelKey)}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Hints inferiores */}
                <View style={styles.hintsRow}>
                    <View style={styles.hintItem}>
                        <PSIcon char={PSIcons.dpadLeft} size={16} color="rgba(255,255,255,0.7)" />
                        <PSIcon char={PSIcons.dpadRight} size={16} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.hintText}>{t('common.navigate')}</Text>
                    </View>
                    <View style={styles.hintItem}>
                        <PSIcon char={PSIcons.cross} size={16} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.hintText}>{t('common.select')}</Text>
                    </View>
                    <View style={styles.hintItem}>
                        <PSIcon char={PSIcons.circle} size={16} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.hintText}>{t('overlay.resume')}</Text>
                    </View>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    centerWrap: {
        position: 'absolute',
        bottom: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    gameHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: 'rgba(15, 16, 22, 0.65)',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 14,
        marginBottom: 22,
    },
    gameCover: {
        width: 44,
        height: 44,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    gameCoverImg: {
        width: '100%',
        height: '100%',
    },
    gameCoverFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    gameTitle: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: 'SSTMedium',
        maxWidth: 260,
    },
    gameSubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontFamily: 'SSTLight',
        marginTop: 2,
    },
    pillContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 16, 22, 0.55)',
        borderRadius: 30,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 6,
    },
    iconButton: {
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 6,
        width: 44,
        height: 44,
        position: 'relative',
    },
    iconWrapper: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconWrapperFocused: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconWrapperDanger: {
        backgroundColor: '#FF3B30',
    },
    iconWrapperConfirm: {
        backgroundColor: '#B52A22',
    },
    tooltip: {
        position: 'absolute',
        top: -34,
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        minWidth: 90,
        alignItems: 'center',
    },
    tooltipText: {
        color: '#FFF',
        fontSize: 12,
        fontFamily: 'SSTMedium',
        whiteSpace: 'nowrap',
    } as any,
    hintsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginTop: 18,
    },
    hintItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    hintText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontFamily: 'SSTMedium',
    },
});