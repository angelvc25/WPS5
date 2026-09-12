import React, { useEffect, useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    FadeIn,
    FadeOut,
} from 'react-native-reanimated';
import RadarFocusWrapper from '@/components/RadarFocusWrapper';
import PSIcon from '@/components/PSIcon';
import { PSIcons } from '@/constants/psIcons';
import { soundService } from '@/services/soundService';
import { useTranslation } from '@/contexts/LanguageContext';
import { useGamepadInput } from '@/hooks/useGamepadInput';
import MusicExpandedCard from '@/components/MusicExpandedCard';

interface ActiveGameInfo {
    id: string;
    title: string;
    image?: string | null;
    installDir?: string | null;
    source?: 'steam' | 'epic' | 'native';
}

type GameMenuAction = 'switch' | 'close';

// ── Nav items that mirror FloatingSystemNav exactly ──────────────────────────
// Index 0 = Home, Index 1 = Game icon (switcher slot), Index 2..N = rest
const NAV_ICON_ITEMS: Array<{ icon: keyof typeof Ionicons.glyphMap; labelKey: string }> = [
    { icon: 'home', labelKey: 'nav.home' },
    // index 1 → replaced by active-game icon (GAME_ICON_INDEX)
    { icon: 'notifications', labelKey: 'nav.notifications' },
    { icon: 'people', labelKey: 'nav.gameBase' },
    { icon: 'musical-notes', labelKey: 'nav.music' },
    { icon: 'download', labelKey: 'nav.downloads' },
    { icon: 'volume-high', labelKey: 'nav.sound' },
    { icon: 'mic', labelKey: 'nav.mic' },
    { icon: 'game-controller', labelKey: 'nav.accessories' },
    { icon: 'person-circle', labelKey: 'nav.profile' },
    { icon: 'power', labelKey: 'nav.power' },
];

// Total number of items in the nav (home + game-icon + 9 others)
const NAV_TOTAL = 1 + 1 + (NAV_ICON_ITEMS.length - 1); // 12
const GAME_ICON_INDEX = 1; // position of the game thumbnail in the nav

export default function OverlayScreen() {
    const { t } = useTranslation();
    const [activeGame, setActiveGame] = useState<ActiveGameInfo | null>(null);
    const [isBusy, setIsBusy] = useState(false);
    const [gameMenuOpen, setGameMenuOpen] = useState(false);
    const [confirmingClose, setConfirmingClose] = useState(false);
    const [focusedNavIndex, setFocusedNavIndex] = useState(GAME_ICON_INDEX);
    const [focusedPopupIndex, setFocusedPopupIndex] = useState(0);
    const [isMusicOpen, setIsMusicOpen] = useState(false);

    useGamepadInput({
        onInputModeChange: () => {},
        onGamepadChange: () => {},
        onConnected: () => {},
    });

    // ── Animation ──────────────────────────────────────────────────────────
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(50);

    const refreshActiveGame = useCallback(async () => {
        if (Platform.OS !== 'web' || !(window as any).electronAPI?.getActiveGameInfo) return;
        try {
            const info = await (window as any).electronAPI.getActiveGameInfo();
            setActiveGame(info || null);
        } catch {
            setActiveGame(null);
        }
    }, []);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) });
        translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) });
        setGameMenuOpen(false);
        setConfirmingClose(false);
        setFocusedNavIndex(GAME_ICON_INDEX);
        setIsMusicOpen(false);
        refreshActiveGame();

        let unsubscribe: (() => void) | undefined;
        if (Platform.OS === 'web' && (window as any).electronAPI?.onOverlayShown) {
            unsubscribe = (window as any).electronAPI.onOverlayShown(() => {
                opacity.value = 0;
                translateY.value = 50;
                opacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) });
                translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) });
                setGameMenuOpen(false);
                setConfirmingClose(false);
                setFocusedNavIndex(GAME_ICON_INDEX);
                setIsMusicOpen(false);
                refreshActiveGame();
            });
        }
        return () => unsubscribe?.();
    }, [refreshActiveGame]);

    const menuStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    // ── Actions ────────────────────────────────────────────────────────────
    const hideOverlay = useCallback(() => {
        soundService.playBack?.();
        if (Platform.OS === 'web' && (window as any).electronAPI?.hideOverlay) {
            (window as any).electronAPI.hideOverlay();
        }
    }, []);

    const handleCloseMusic = useCallback(() => {
        soundService.playBack?.();
        setIsMusicOpen(false);
    }, []);

    const handleSwitchGame = useCallback(async () => {
        setIsBusy(true);
        soundService.playActivation?.();
        try {
            if (Platform.OS === 'web' && (window as any).electronAPI?.showMainWindowToSwitchGame) {
                await (window as any).electronAPI.showMainWindowToSwitchGame();
            }
        } finally {
            setIsBusy(false);
            setGameMenuOpen(false);
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
                hideOverlay();
            }
        } finally {
            setIsBusy(false);
            setConfirmingClose(false);
            setGameMenuOpen(false);
        }
    }, [activeGame, hideOverlay]);

    const handleGameIconPress = useCallback(() => {
        soundService.playActivation?.();
        setConfirmingClose(false);
        setFocusedPopupIndex(0);
        setGameMenuOpen(prev => !prev);
    }, []);

    const handleMenuAction = useCallback((action: GameMenuAction) => {
        if (isBusy) return;
        if (action === 'switch') {
            void handleSwitchGame();
        } else if (action === 'close') {
            if (confirmingClose) {
                void handleCloseGame();
            } else {
                soundService.playNavigation();
                setConfirmingClose(true);
            }
        }
    }, [isBusy, confirmingClose, handleSwitchGame, handleCloseGame]);

    // ── Keyboard / gamepad navigation ──────────────────────────────────────
    useEffect(() => {
        if (Platform.OS !== 'web') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'].includes(e.key)) {
                e.preventDefault();
            }

            if (isMusicOpen) {
                if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    soundService.playBack?.();
                    setIsMusicOpen(false);
                } else if (['Escape', 'b', 'B'].includes(e.key)) {
                    // Let MusicExpandedCard handle this and call onClose (handleCloseMusic)
                    return;
                } else {
                    // Let MusicExpandedCard handle Up/Down/Enter
                    return;
                }
            }

            // Escape / Circle — close popup or hide overlay
            if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
                if (gameMenuOpen) {
                    soundService.playBack?.();
                    setGameMenuOpen(false);
                    setConfirmingClose(false);
                } else {
                    hideOverlay();
                }
                return;
            }

            // When popup is open: ArrowUp/Down navigate menu items; Enter confirms
            if (gameMenuOpen) {
                // Any left/right closes the popup and navigates the nav bar instead
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    soundService.playBack?.();
                    setGameMenuOpen(false);
                    setConfirmingClose(false);
                    setFocusedNavIndex((prev: number) =>
                        e.key === 'ArrowLeft'
                            ? Math.max(0, prev - 1)
                            : Math.min(NAV_TOTAL - 1, prev + 1)
                    );
                } else if (e.key === 'ArrowUp') {
                    soundService.playNavigation();
                    setFocusedPopupIndex(prev => Math.max(0, prev - 1));
                    setConfirmingClose(false);
                } else if (e.key === 'ArrowDown') {
                    soundService.playNavigation();
                    setFocusedPopupIndex(prev => Math.min(1, prev + 1));
                    setConfirmingClose(false);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    if (focusedPopupIndex === 0) {
                        handleMenuAction('switch');
                    } else if (focusedPopupIndex === 1) {
                        handleMenuAction('close');
                    }
                }
                return;
            }

            // Navigate the nav bar left / right
            if (e.key === 'ArrowLeft') {
                soundService.playNavigation();
                setFocusedNavIndex((prev: number) => Math.max(0, prev - 1));
            } else if (e.key === 'ArrowRight') {
                soundService.playNavigation();
                setFocusedNavIndex((prev: number) => Math.min(NAV_TOTAL - 1, prev + 1));
            } else if (e.key === 'Enter' || e.key === ' ') {
                // Activate the focused nav item
                if (focusedNavIndex === 0) {
                    hideOverlay();
                } else if (focusedNavIndex === GAME_ICON_INDEX) {
                    handleGameIconPress();
                } else if (focusedNavIndex === 4) {
                    soundService.playActivation?.();
                    setIsMusicOpen(true);
                }
                // Other items are visual-only in the overlay context
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [gameMenuOpen, hideOverlay, focusedNavIndex, focusedPopupIndex, isMusicOpen, handleGameIconPress, handleMenuAction]);

    // ── Transparent background ─────────────────────────────────────────────
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

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <View style={styles.root}>
            {/* Bottom gradient identical to FloatingSystemNav */}
            {Platform.OS === 'web' && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                            'linear-gradient(to top, rgba(0,0,0,1) 10%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.15) 100%)',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Backdrop to close game-menu popup */}
            {gameMenuOpen && (
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                        soundService.playBack?.();
                        setGameMenuOpen(false);
                        setConfirmingClose(false);
                    }}
                />
            )}

            <MusicExpandedCard isOpen={isMusicOpen} onClose={handleCloseMusic} />

            {/* The nav bar — matches FloatingSystemNav exactly */}
            <Animated.View style={[styles.menuContainer, menuStyle]}>
                {/* ── Game actions popup: anchored inside menuContainer, above the icon ── */}
                {gameMenuOpen && (
                    <Animated.View
                        entering={FadeIn.duration(180)}
                        exiting={FadeOut.duration(140)}
                        style={styles.gameMenuPopup}
                    >
                        {/* Switch game */}
                        <TouchableOpacity
                            activeOpacity={0.75}
                            disabled={isBusy}
                            onPress={() => handleMenuAction('switch')}
                            style={[styles.gameMenuRow, focusedPopupIndex === 0 && styles.gameMenuRowFocused]}
                        >
                            <View style={styles.gameMenuIconWrap}>
                                <Ionicons name="swap-horizontal" size={18} color="#FFF" />
                            </View>
                            <Text style={styles.gameMenuLabel}>{t('overlay.switch')}</Text>
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.gameMenuDivider} />

                        {/* Close game */}
                        <TouchableOpacity
                            activeOpacity={0.75}
                            disabled={isBusy}
                            onPress={() => handleMenuAction('close')}
                            style={[styles.gameMenuRow, focusedPopupIndex === 1 && styles.gameMenuRowFocused]}
                        >
                            <View style={[styles.gameMenuIconWrap, styles.gameMenuIconDanger]}>
                                <Ionicons name="close-circle-outline" size={18} color="#FFF" />
                            </View>
                            <Text style={[styles.gameMenuLabel, styles.gameMenuLabelDanger]}>
                                {confirmingClose ? t('overlay.confirmClose') : t('overlay.close')}
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                )}

                <BlurView intensity={0} tint="dark" style={styles.pillContainer}>
                    {/* Home button — index 0 */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.iconButton}
                        onPress={hideOverlay}
                    >
                        {focusedNavIndex === 0 ? (
                            <RadarFocusWrapper id="overlay-home" isFocused size={58} innerSize={0}>
                                <Ionicons
                                    name="home"
                                    size={24}
                                    color="#000"
                                    style={styles.iconFocusedBg as any}
                                />
                            </RadarFocusWrapper>
                        ) : (
                            <View style={styles.iconWrapper}>
                                <Ionicons name="home" size={24} color="rgba(255,255,255,1)" />
                            </View>
                        )}
                        {focusedNavIndex === 0 && (
                            <View style={styles.tooltip}>
                                <Text style={styles.tooltipText}>{t('overlay.resume')}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* ── SWITCHER SLOT: active game icon — index 1 ── */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.iconButton}
                        onPress={handleGameIconPress}
                    >
                        <RadarFocusWrapper
                            id="overlay-game-icon"
                            isFocused={gameMenuOpen || focusedNavIndex === GAME_ICON_INDEX}
                            size={58}
                            innerSize={0}
                        >
                            <View style={[
                                styles.gameIconCircle,
                                (gameMenuOpen || focusedNavIndex === GAME_ICON_INDEX) && styles.gameIconCircleFocused,
                            ]}>
                                {activeGame?.image ? (
                                    <Image
                                        source={{ uri: activeGame.image }}
                                        style={styles.gameIconImg}
                                        contentFit="cover"
                                    />
                                ) : (
                                    <Ionicons
                                        name="game-controller"
                                        size={20}
                                        color={(gameMenuOpen || focusedNavIndex === GAME_ICON_INDEX) ? '#000' : 'rgba(255,255,255,0.9)'}
                                    />
                                )}
                            </View>
                        </RadarFocusWrapper>
                        {/* Game title tooltip — always shown so popup renders above it */}
                        <View style={styles.tooltip}>
                            <Text style={styles.tooltipText} numberOfLines={1}>
                                {activeGame?.title ?? t('overlay.unknownGame')}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {/* Remaining nav items — visual only (except music at index 4), respond to focus ring */}
                    {NAV_ICON_ITEMS.slice(1).map((item, i) => {
                        const navIdx = i + 2; // home=0, game=1, rest start at 2
                        const isFocused = focusedNavIndex === navIdx;
                        // For music, it's index 4. Show focus ring also if the card is open
                        const isActive = isFocused || (navIdx === 4 && isMusicOpen);
                        return (
                            <TouchableOpacity
                                key={i}
                                activeOpacity={0.7}
                                style={styles.iconButton}
                                onPress={() => {
                                    setFocusedNavIndex(navIdx);
                                    if (navIdx === 4) {
                                        soundService.playActivation?.();
                                        setIsMusicOpen(true);
                                    }
                                }}
                            >
                                {isActive ? (
                                    <RadarFocusWrapper id={`overlay-nav-${navIdx}`} isFocused size={58} innerSize={0}>
                                        <Ionicons
                                            name={item.icon}
                                            size={24}
                                            color="#000"
                                            style={styles.iconFocusedBg as any}
                                        />
                                    </RadarFocusWrapper>
                                ) : (
                                    <View style={styles.iconWrapper}>
                                        <Ionicons name={item.icon} size={24} color="rgba(255,255,255,1)" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </BlurView>

                {/* PS hints */}
                <View style={styles.hintsRow}>
                    <View style={styles.hintItem}>
                        <PSIcon char={PSIcons.dpadLeft} size={14} color="rgba(255,255,255,0.7)" />
                        <PSIcon char={PSIcons.dpadRight} size={14} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.hintText}>{t('common.navigate')}</Text>
                    </View>
                    <View style={styles.hintItem}>
                        <PSIcon char={PSIcons.cross} size={14} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.hintText}>{t('common.select')}</Text>
                    </View>
                    <View style={styles.hintItem}>
                        <PSIcon char={PSIcons.circle} size={14} color="rgba(255,255,255,0.7)" />
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
    // ── Nav bar ──
    menuContainer: {
        position: 'absolute',
        bottom: 20,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    pillContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        overflow: 'visible',
    } as any,
    iconButton: {
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
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
        backgroundColor: 'transparent',
    },
    // ── Game icon (switcher slot) ──
    gameIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 29,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.55)',
    },
    gameIconCircleFocused: {
        backgroundColor: '#FFFFFF',
        borderColor: '#FFFFFF',
    },
    gameIconImg: {
        width: '100%',
        height: '100%',
    },
    tooltip: {
        position: 'absolute',
        top: -34,
        backgroundColor: 'rgba(0,0,0,0)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        zIndex: 100,
        minWidth: 80,
        alignItems: 'center',
        pointerEvents: 'none',
    } as any,
    tooltipText: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: 'SSTMedium',
        letterSpacing: 0.5,
        whiteSpace: 'nowrap',
    } as any,
    iconFocusedBg: {
        backgroundColor: '#FFF',
        width: 40,
        height: 40,
        borderRadius: 29,
        padding: 7,
        paddingLeft: 8,
    },
    // ── Hints row ──
    hintsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginTop: 8,
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
    // ── Game actions popup: rendered inside menuContainer, floats ABOVE the nav ──
    gameMenuPopup: {
        position: 'absolute',
        bottom: '100%',     // anchor to top of menuContainer (above the pill)
        marginBottom: 10,
        alignSelf: 'center',
        backgroundColor: 'rgba(18, 18, 28, 0.95)',
        borderRadius: 14,
        paddingVertical: 6,
        paddingHorizontal: 4,
        minWidth: 220,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.55,
        shadowRadius: 22,
        zIndex: 50,
    } as any,
    gameMenuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderRadius: 10,
    },
    gameMenuRowFocused: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    gameMenuIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    gameMenuIconDanger: {
        backgroundColor: 'rgba(255,59,48,0.25)',
    },
    gameMenuLabel: {
        color: '#FFF',
        fontSize: 15,
        fontFamily: 'SSTMedium',
    },
    gameMenuLabelDanger: {
        color: '#FF6B6B',
    },
    gameMenuDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: 12,
    },
});