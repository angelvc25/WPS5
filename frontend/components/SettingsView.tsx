import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Linking,
  Dimensions,
  Alert,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useTranslation } from '@/contexts/LanguageContext';
import { LANGUAGE_OPTIONS, Language } from '@/i18n/translations';
import { UserProfile } from './UserSelectScreen';
import { soundService } from '@/services/soundService';
import ControlPrompt from './ControlPrompt';
import PSIcon from './PSIcon';
import { PSIcons } from '@/constants/psIcons';
import BackgroundVideo from './BackgroundVideo';
import { toastService } from '../services/toastService';

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const aNum = aParts[i] || 0;
    const bNum = bParts[i] || 0;
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }
  return 0;
}

export type SettingsScreenType =
  | 'main'
  | 'guide'
  | 'accessibility'
  | 'users_and_accounts'
  | 'profile_edit'
  | 'profile_edit_detail'
  | 'system';

type ProfileEditSection =
  | 'name'
  | 'onlineId'
  | 'picture'
  | 'avatar'
  | 'cover'
  | 'about'
  | 'languages';

const PROFILE_EDIT_SECTIONS: ProfileEditSection[] = [
  'name',
  'onlineId',
  'picture',
  'avatar',
  'cover',
  'about',
  'languages',
];

export function resolveImageSource(img: any) {
  if (!img) return undefined;
  if (typeof img === 'string') return { uri: img };
  if (typeof img === 'object' && img.uri) return img;
  return img;
}

interface SettingsViewProps {
  visible: boolean;
  onClose: () => void;
  activeUser: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  allUsers?: UserProfile[];
  onSwitchUser?: (user: UserProfile) => void;
  libraryGames?: any[];
  media?: any[];
  language: Language;
  changeLanguage: (lang: Language) => void;
  onOpenBgModal: () => void;
  onSelectWallpaperFolder: () => void;
  onSelectCaptureFolder: () => void;
  onOpenAvatarModal?: () => void;
  onSelectAvatarFolder?: () => void;
  initialScreen?: SettingsScreenType;
}

export default function SettingsView({
  visible,
  onClose,
  activeUser,
  updateUser,
  allUsers = [],
  onSwitchUser,
  libraryGames = [],
  media = [],
  language,
  changeLanguage,
  onOpenBgModal,
  onSelectWallpaperFolder,
  onSelectCaptureFolder,
  onOpenAvatarModal,
  onSelectAvatarFolder,
  initialScreen = 'main',
}: SettingsViewProps) {
  const { t } = useTranslation();

  // Escala de UI en función de la resolución real de la ventana.
  // Usa el eje MAS grande (no el mas chico) respecto a 1920x1080, para que
  // ventanas ultra-wide (mucho ancho, alto normal) no encojan todo el panel.
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

  const [currentScreen, setCurrentScreen] = useState<SettingsScreenType>(initialScreen);
  const [screenHistory, setScreenHistory] = useState<SettingsScreenType[]>([]);

  // Focus navigation state
  const [mainFocusIndex, setMainFocusIndex] = useState(0);
  const [subFocusIndex, setSubFocusIndex] = useState(0);
  const [accessibilityLeftIndex, setAccessibilityLeftIndex] = useState(0);
  const [accessibilityFocusArea, setAccessibilityFocusArea] = useState<'left' | 'right'>('left');
  const [systemLeftIndex, setSystemLeftIndex] = useState(0);
  const [systemFocusArea, setSystemFocusArea] = useState<'left' | 'right'>('left');
  const [profileActiveTab, setProfileActiveTab] = useState<'overview' | 'friends'>('overview');
  const [profileFocusArea, setProfileFocusArea] = useState<'header_actions' | 'tabs' | 'content'>('header_actions');
  const [profileActionIndex, setProfileActionIndex] = useState(0);
  const [profileEditSection, setProfileEditSection] = useState<ProfileEditSection>('name');

  // Profile edit fields
  const [editName, setEditName] = useState(activeUser?.name || '');
  const [editOnlineId, setEditOnlineId] = useState(activeUser?.onlineId || '');
  const [editAbout, setEditAbout] = useState(activeUser?.about || '');
  const [editCoverImage, setEditCoverImage] = useState(activeUser?.coverImage || '');

  // HDMI toggles state for System sub-screen
  const [hdmiDeviceLink, setHdmiDeviceLink] = useState(true);
  const [hdmiHdcp, setHdmiHdcp] = useState(false);

  const nameInputRef = useRef<TextInput>(null);
  const onlineIdInputRef = useRef<TextInput>(null);
  const aboutInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setCurrentScreen(initialScreen);
      setScreenHistory([]);
      setMainFocusIndex(0);
      setSubFocusIndex(0);
      setAccessibilityLeftIndex(0);
      setAccessibilityFocusArea('left');
      setSystemLeftIndex(0);
      setSystemFocusArea('left');
      setProfileActiveTab('overview');
      setProfileEditSection('name');
    }
  }, [visible, initialScreen]);

  useEffect(() => {
    if (activeUser) {
      setEditName(activeUser.name || '');
      setEditOnlineId(activeUser.onlineId || '');
      setEditAbout(activeUser.about || '');
      setEditCoverImage(activeUser.coverImage || '');
    }
  }, [activeUser]);



  const navigateToScreen = (screen: SettingsScreenType) => {
    soundService.playActivation?.();
    setScreenHistory((prev) => [...prev, currentScreen]);
    setCurrentScreen(screen);
    setSubFocusIndex(0);
    if (screen === 'system') {
      setSystemFocusArea('left');
      setSystemLeftIndex(0);
    } else if (screen === 'accessibility') {
      setAccessibilityFocusArea('left');
      setAccessibilityLeftIndex(0);
    } else if (screen === 'users_and_accounts') {
      setProfileFocusArea('header_actions');
      setProfileActionIndex(0);
      setProfileActiveTab('overview');
    }
  };

  const handleBack = () => {
    soundService.playBack?.();
    if (screenHistory.length > 0) {
      const prevScreen = screenHistory[screenHistory.length - 1];
      setScreenHistory((prev) => prev.slice(0, -1));
      setCurrentScreen(prevScreen);
    } else {
      onClose();
    }
  };

  // Avatar selection handler
  const handleSelectAvatar = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            updateUser({
              avatar: base64,
              avatarBase64: base64,
              settings: { ...activeUser?.settings, useSteamAvatar: false } as any,
            });
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  const handleSteamLogin = async () => {
    if (Platform.OS === 'web' && (window as any).electronAPI) {
      const res = await (window as any).electronAPI.steamLogin();
      if (res.success && res.steamId) {
        updateUser({ settings: { ...activeUser?.settings, steamId: res.steamId } as any });
      } else if (res.error && res.error !== 'Ventana de inicio de sesión cerrada') {
        alert('Error al iniciar sesión en Steam: ' + res.error);
      }
    } else {
      alert('Esta función solo está disponible en la versión de escritorio.');
    }
  };

  // Cover image selection handler
  const handleSelectCover = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setEditCoverImage(base64);
            updateUser({ coverImage: base64 });
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    }
  };

  // ── Accessibility screen: right-column focus helpers ─────────────────────
  const getAccessibilityRightMaxIndex = () => {
    if (accessibilityLeftIndex === 0) return 1;
    if (accessibilityLeftIndex === 1) {
      const hasWallpaperPath = !!activeUser?.settings?.wallpaperPath;
      const hasCapturePath = !!activeUser?.settings?.capturePath;
      const count = 2 + (hasWallpaperPath ? 1 : 0) + 1 + (hasCapturePath ? 1 : 0);
      return Math.max(0, count - 1);
    }
    if (accessibilityLeftIndex === 2) {
      const hasAvatarPath = !!activeUser?.settings?.avatarPath;
      const count = 2 + (hasAvatarPath ? 1 : 0);
      return Math.max(0, count - 1);
    }
    if (accessibilityLeftIndex === 3) return 0; // 👈 Steam: solo 1 botón (conectar/desvincular)
    if (accessibilityLeftIndex === 4) return 3; // sync (antes era 3)
    return 0;
  };

  const activateAccessibilityRightItem = () => {
    if (accessibilityLeftIndex === 0) {
      if (subFocusIndex === 0) {
        updateUser({
          settings: {
            ...activeUser?.settings,
            autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false),
          },
        });
      } else if (subFocusIndex === 1) {
        updateUser({
          settings: {
            ...activeUser?.settings,
            invertTransitionDirection: !activeUser?.settings?.invertTransitionDirection,
          },
        });
      }
      return;
    }

    if (accessibilityLeftIndex === 1) {
      const hasWallpaperPath = !!activeUser?.settings?.wallpaperPath;
      const hasCapturePath = !!activeUser?.settings?.capturePath;
      let idx = 0;

      if (subFocusIndex === idx) {
        onClose();
        onOpenBgModal();
        return;
      }
      idx++;

      if (subFocusIndex === idx) {
        onSelectWallpaperFolder();
        return;
      }
      idx++;

      if (hasWallpaperPath) {
        if (subFocusIndex === idx) {
          updateUser({ settings: { ...activeUser?.settings, wallpaperPath: '' } as any });
          return;
        }
        idx++;
      }

      if (subFocusIndex === idx) {
        onSelectCaptureFolder();
        return;
      }
      idx++;

      if (hasCapturePath) {
        if (subFocusIndex === idx) {
          updateUser({ settings: { ...activeUser?.settings, capturePath: '' } as any });
          return;
        }
        idx++;
      }
      return;
    }

    if (accessibilityLeftIndex === 2) {
      const hasAvatarPath = !!activeUser?.settings?.avatarPath;
      let idx = 0;

      if (subFocusIndex === idx) {
        onClose();
        onOpenAvatarModal?.();
        return;
      }
      idx++;

      if (subFocusIndex === idx) {
        onSelectAvatarFolder?.();
        return;
      }
      idx++;

      if (hasAvatarPath) {
        if (subFocusIndex === idx) {
          updateUser({ settings: { ...activeUser?.settings, avatarPath: '' } as any });
          return;
        }
        idx++;
      }
      return;
    }

    if (accessibilityLeftIndex === 3) {
      // Steam
      if (activeUser?.settings?.steamId) {
        updateUser({ settings: { ...activeUser?.settings, steamId: '' } as any });
      } else {
        handleSteamLogin();
      }
      return;
    }

    if (accessibilityLeftIndex === 4) {
      const prefs: { key: 'ratingAndSummary' | 'cover' | 'background' | 'logo'; options: string[] }[] = [
        { key: 'ratingAndSummary', options: ['igdb', 'none'] },
        { key: 'cover', options: ['steamgrid', 'igdb', 'none'] },
        { key: 'background', options: ['steamgrid', 'igdb', 'none'] },
        { key: 'logo', options: ['steamgrid', 'none'] },
      ];
      const pref = prefs[subFocusIndex];
      if (pref) {
        const currentSync = activeUser?.settings?.syncPreferences || {
          ratingAndSummary: 'igdb',
          cover: 'steamgrid',
          background: 'steamgrid',
          logo: 'steamgrid',
        };
        const currentValue = (currentSync as any)[pref.key];
        const curIdx = pref.options.indexOf(currentValue);
        const nextValue = pref.options[(curIdx + 1) % pref.options.length];
        updateUser({
          settings: {
            ...activeUser?.settings,
            syncPreferences: { ...currentSync, [pref.key]: nextValue } as any,
          },
        });
      }
    }
  };

  // ── System screen: right-column focus helpers ────────────────────────────
  const getSystemRightMaxIndex = () => {
    if (systemLeftIndex === 1) return 1; // HDMI toggles
    if (systemLeftIndex === 2) return Math.max(0, LANGUAGE_OPTIONS.length - 1);
    return 0;
  };

  const activateSystemRightItem = () => {
    if (systemLeftIndex === 1) {
      if (subFocusIndex === 0) setHdmiDeviceLink((prev) => !prev);
      else if (subFocusIndex === 1) setHdmiHdcp((prev) => !prev);
    } else if (systemLeftIndex === 2) {
      const opt = LANGUAGE_OPTIONS[subFocusIndex];
      if (opt) changeLanguage(opt.id);
    }
  };

  // Keyboard navigation handler
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        if (!isInput) {
          e.preventDefault();
          handleBack();
        }
        return;
      }

      if (isInput) return;

      if (currentScreen === 'main') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMainFocusIndex((prev) => Math.min(prev + 1, 3));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMainFocusIndex((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (mainFocusIndex === 0) navigateToScreen('guide');
          else if (mainFocusIndex === 1) navigateToScreen('accessibility');
          else if (mainFocusIndex === 2) navigateToScreen('users_and_accounts');
          else if (mainFocusIndex === 3) navigateToScreen('system');
        }
      } else if (currentScreen === 'accessibility') {
        if (accessibilityFocusArea === 'left') {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAccessibilityLeftIndex((prev) => Math.min(prev + 1, 4));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAccessibilityLeftIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
            e.preventDefault();
            setAccessibilityFocusArea('right');
            setSubFocusIndex(0);
            soundService.playNavigation();
          }
        } else {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setAccessibilityFocusArea('left');
            soundService.playNavigation();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const maxIdx = getAccessibilityRightMaxIndex();
            setSubFocusIndex((prev) => Math.min(prev + 1, maxIdx));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSubFocusIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            activateAccessibilityRightItem();
            soundService.playActivation?.();
          }
        }
      } else if (currentScreen === 'system') {
        if (systemFocusArea === 'left') {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSystemLeftIndex((prev) => Math.min(prev + 1, 3));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSystemLeftIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
            e.preventDefault();
            setSystemFocusArea('right');
            setSubFocusIndex(0);
            soundService.playNavigation();
          }
        } else {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setSystemFocusArea('left');
            soundService.playNavigation();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const maxIdx = getSystemRightMaxIndex();
            setSubFocusIndex((prev) => Math.min(prev + 1, maxIdx));
            soundService.playNavigation();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSubFocusIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            activateSystemRightItem();
            soundService.playActivation?.();
          }
        }
      } else if (currentScreen === 'profile_edit') {
        const lastIndex = PROFILE_EDIT_SECTIONS.length - 1;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSubFocusIndex((prev) => Math.min(prev + 1, lastIndex));
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSubFocusIndex((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
          e.preventDefault();
          const section = PROFILE_EDIT_SECTIONS[subFocusIndex];
          if (section) {
            setProfileEditSection(section);
            navigateToScreen('profile_edit_detail');
          }
        }
      } else if (currentScreen === 'users_and_accounts') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (profileFocusArea === 'header_actions') setProfileFocusArea('tabs');
          else if (profileFocusArea === 'tabs') setProfileFocusArea('content');
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (profileFocusArea === 'content') setProfileFocusArea('tabs');
          else if (profileFocusArea === 'tabs') setProfileFocusArea('header_actions');
          soundService.playNavigation();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (profileFocusArea === 'tabs') {
            const tabs: ('overview' | 'friends')[] = ['overview', 'friends'];
            const nextIdx = (tabs.indexOf(profileActiveTab) + 1) % tabs.length;
            setProfileActiveTab(tabs[nextIdx]);
            soundService.playTab();
          } else if (profileFocusArea === 'header_actions') {
            setProfileActionIndex((prev) => Math.min(prev + 1, 1));
            soundService.playNavigation();
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (profileFocusArea === 'tabs') {
            const tabs: ('overview' | 'friends')[] = ['overview', 'friends'];
            const prevIdx = (tabs.indexOf(profileActiveTab) - 1 + tabs.length) % tabs.length;
            setProfileActiveTab(tabs[prevIdx]);
            soundService.playTab();
          } else if (profileFocusArea === 'header_actions') {
            setProfileActionIndex((prev) => Math.max(prev - 1, 0));
            soundService.playNavigation();
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (profileFocusArea === 'header_actions') {
            if (profileActionIndex === 0) {
              navigateToScreen('profile_edit');
            }
          }
        }
      } else {
        // Other sub-screens
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSubFocusIndex((prev) => prev + 1);
          soundService.playNavigation();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSubFocusIndex((prev) => Math.max(prev - 1, 0));
          soundService.playNavigation();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    visible,
    currentScreen,
    mainFocusIndex,
    subFocusIndex,
    accessibilityLeftIndex,
    accessibilityFocusArea,
    systemLeftIndex,
    systemFocusArea,
    profileActiveTab,
    profileFocusArea,
    profileActionIndex,
    profileEditSection,
    screenHistory,
    activeUser,
    hdmiDeviceLink,
    hdmiHdcp,
    updateUser,
    changeLanguage,
    onOpenBgModal,
    onSelectWallpaperFolder,
    onSelectCaptureFolder,
    onOpenAvatarModal,
    onSelectAvatarFolder,
    onClose,
  ]);

  if (!visible) return null;

  // Active user avatar URL
  const userAvatarUri =
    activeUser?.settings?.useSteamAvatar && activeUser?.steamAvatarUrl
      ? activeUser.steamAvatarUrl
      : (activeUser as any)?.avatarBase64 || activeUser?.avatar || null;

  // ==========================================
  // SCREEN: MAIN (Vertical PS5 Settings List)
  // ==========================================
  const renderMainScreen = () => {
    const mainMenuItems = [
      {
        id: 'guide',
        title: t('settings.userGuideShort'),
        icon: 'information-circle-outline' as const,
        onPress: () => navigateToScreen('guide'),
      },
      {
        id: 'accessibility',
        title: t('settings.accessibility'),
        icon: 'accessibility' as const,
        onPress: () => navigateToScreen('accessibility'),
      },
      {
        id: 'users_and_accounts',
        title: t('settings.usersAndAccounts'),
        icon: 'person-circle-outline' as const,
        onPress: () => navigateToScreen('users_and_accounts'),
      },
      {
        id: 'system',
        title: t('settings.system'),
        icon: 'cube-outline' as const,
        onPress: () => navigateToScreen('system'),
      },
    ];

    return (
      <View style={styles.contentWrapper}>
        <Text style={styles.mainHeaderTitle}>{t('settings.title')}</Text>

        <View style={styles.elongatedListWrap}>
          <View style={styles.psMenuList}>
            {mainMenuItems.map((item, index) => {
              const isFocused = mainFocusIndex === index;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.psMenuRow, isFocused && styles.psMenuRowFocused]}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { onMouseEnter: () => setMainFocusIndex(index) } : {}) as any}
                  onPress={item.onPress}
                >
                  <View style={styles.psMenuRowLeft}>
                    {item.id === 'users_and_accounts' && userAvatarUri ? (
                      <Image
                        source={resolveImageSource(userAvatarUri)}
                        style={styles.mainMenuUserAvatar}
                      />
                    ) : (
                      <Ionicons
                        name={item.icon}
                        size={s(26)}
                        color="#FFFFFF"
                        style={styles.mainMenuItemIcon}
                      />
                    )}
                    <Text style={[styles.psMenuRowText, isFocused && styles.psMenuRowTextFocused]}>
                      {item.title}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // ==========================================
  // SCREEN: GUIDE (User's guide & Other info)
  // ==========================================
  const renderGuideScreen = () => {
    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.userGuide')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {/* Apoyo al Proyecto */}
          <View style={styles.supportMessageContainer}>
            <Ionicons
              name="heart-circle-sharp"
              size={s(64)}
              color="#FF3B30"
              style={{ marginBottom: 16, alignSelf: 'center' }}
            />
            <Text style={styles.supportTextMain}>{t('settings.thanks')}</Text>
            <Text style={styles.supportTextSub}>{t('settings.supportBody')}</Text>
          </View>

          {/* Social Links */}
          <View style={styles.supportLinksRow}>
            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://patreon.com/WPS5')}
            >
              <Ionicons name="logo-octocat" size={s(22)} color="#FF4500" />
              <Text style={styles.supportLinkBtnText}>Patreon</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://github.com/angelvc25/WPS5')}
            >
              <Ionicons name="logo-github" size={s(22)} color="#FFF" />
              <Text style={styles.supportLinkBtnText}>GitHub</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://www.youtube.com/@Re-Devs')}
            >
              <Ionicons name="logo-youtube" size={s(22)} color="#FF0000" />
              <Text style={styles.supportLinkBtnText}>YouTube</Text>
            </TouchableOpacity>
          </View>

          {/* Patrons list */}
          <View style={styles.patronsSection}>
            <Text style={styles.sectionLabel}>{t('settings.patrons')}</Text>
            <View style={styles.patronsListGrid}>
              {['angelvc25', 'Crizz_Vc', 'WPS5 Community'].map((name, idx) => (
                <View key={idx} style={styles.patronCard}>
                  <Ionicons name="star" size={s(14)} color="#FFCC00" />
                  <Text style={styles.patronName}>{name}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  // ==========================================
  // SCREEN: ACCESSIBILITY (Two Columns: Visual & Animations, Wallpapers & Captures, Smart Sync)
  // ==========================================
  const renderAccessibilityScreen = () => {
    const accessibilitySections = [
      { id: 'visual', title: t('settings.accVisual') },
      { id: 'wallpapers', title: t('settings.accWallpapers') },
      { id: 'avatars', title: t('settings.avatars') },
      { id: 'steam', title: 'Steam' },
      { id: 'sync', title: t('settings.smartSync') },
    ];

    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.accessibility')}</Text>
        </View>

        <View style={styles.twoColumnContainer}>
          {/* Left Column (Submenu items) */}
          <View style={styles.systemLeftColumn}>
            {accessibilitySections.map((sec, idx) => {
              const isSelected = accessibilityLeftIndex === idx;
              const isFocused = accessibilityFocusArea === 'left' && accessibilityLeftIndex === idx;
              return (
                <TouchableOpacity
                  key={sec.id}
                  style={[
                    styles.systemLeftItem,
                    isSelected && styles.systemLeftItemActive,
                    isFocused && styles.systemLeftItemFocused,
                  ]}
                  onPress={() => {
                    setAccessibilityLeftIndex(idx);
                    soundService.playNavigation();
                  }}
                >
                  <Text
                    style={[
                      styles.systemLeftItemText,
                      isSelected && styles.systemLeftItemTextActive,
                    ]}
                  >
                    {sec.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Right Column (Submenu Content) */}
          <View style={styles.systemRightColumn}>
            {accessibilityLeftIndex === 0 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.accVisual')}</Text>

                {/* Auto Play Video Toggle */}
                <View
                  style={[
                    styles.toggleRowSection,
                    accessibilityFocusArea === 'right' && subFocusIndex === 0 && styles.rightItemFocused,
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 20 }}>
                    <Text style={styles.toggleRowTitle}>{t('settings.autoPlayVideo')}</Text>
                    <Text style={styles.toggleRowDesc}>{t('settings.autoPlayVideoDesc')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.psSwitch,
                      activeUser?.settings?.autoPlayVideo !== false && styles.psSwitchActive,
                    ]}
                    onPress={() =>
                      updateUser({
                        settings: {
                          ...activeUser?.settings,
                          autoPlayVideo: !(activeUser?.settings?.autoPlayVideo !== false),
                        },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.psSwitchThumb,
                        activeUser?.settings?.autoPlayVideo !== false && styles.psSwitchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>

                {/* Invert Transition Toggle */}
                <View
                  style={[
                    styles.toggleRowSection,
                    accessibilityFocusArea === 'right' && subFocusIndex === 1 && styles.rightItemFocused,
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 20 }}>
                    <Text style={styles.toggleRowTitle}>{t('settings.invertTransition')}</Text>
                    <Text style={styles.toggleRowDesc}>{t('settings.invertTransitionDesc')}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.psSwitch,
                      activeUser?.settings?.invertTransitionDirection === true && styles.psSwitchActive,
                    ]}
                    onPress={() =>
                      updateUser({
                        settings: {
                          ...activeUser?.settings,
                          invertTransitionDirection: !activeUser?.settings?.invertTransitionDirection,
                        },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.psSwitchThumb,
                        activeUser?.settings?.invertTransitionDirection === true && styles.psSwitchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {accessibilityLeftIndex === 1 && (() => {
              const hasWallpaperPath = !!activeUser?.settings?.wallpaperPath;
              const hasCapturePath = !!activeUser?.settings?.capturePath;
              let wpIdx = 0;
              const chooseWallpaperIdx = wpIdx++;
              const selectWallpaperFolderIdx = wpIdx++;
              const restoreWallpaperIdx = hasWallpaperPath ? wpIdx++ : -1;
              const selectCaptureFolderIdx = wpIdx++;
              const restoreCaptureIdx = hasCapturePath ? wpIdx++ : -1;
              const isRightFocused = accessibilityFocusArea === 'right';

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>{t('settings.accWallpapers')}</Text>

                  {/* Wallpaper Selection */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.wallpaper')}</Text>
                    <TouchableOpacity
                      style={[
                        styles.actionBtnSecondary,
                        isRightFocused && subFocusIndex === chooseWallpaperIdx && styles.rightItemFocused,
                      ]}
                      onPress={() => {
                        onClose();
                        onOpenBgModal();
                      }}
                    >
                      <Ionicons name="image-outline" size={s(20)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.chooseWallpaper')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Wallpaper Folder */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.wallpaperFolder')}</Text>
                    <Text style={styles.pathDesc}>
                      {t('settings.currentPath', {
                        path: activeUser?.settings?.wallpaperPath || t('settings.defaultWallpapers'),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === selectWallpaperFolderIdx && styles.rightItemFocused,
                        ]}
                        onPress={onSelectWallpaperFolder}
                      >
                        <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {hasWallpaperPath ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            { backgroundColor: '#3D1E24', borderColor: '#772233' },
                            isRightFocused && subFocusIndex === restoreWallpaperIdx && styles.rightItemFocused,
                          ]}
                          onPress={() =>
                            updateUser({
                              settings: { ...activeUser?.settings, wallpaperPath: '' } as any,
                            })
                          }
                        >
                          <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                          <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                            {t('settings.restoreDefault')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Captures Folder */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.capturesFolder')}</Text>
                    <Text style={styles.pathDesc}>
                      {t('settings.currentPath', {
                        path: activeUser?.settings?.capturePath || t('settings.defaultCaptures'),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === selectCaptureFolderIdx && styles.rightItemFocused,
                        ]}
                        onPress={onSelectCaptureFolder}
                      >
                        <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {hasCapturePath ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            { backgroundColor: '#3D1E24', borderColor: '#772233' },
                            isRightFocused && subFocusIndex === restoreCaptureIdx && styles.rightItemFocused,
                          ]}
                          onPress={() =>
                            updateUser({
                              settings: { ...activeUser?.settings, capturePath: '' } as any,
                            })
                          }
                        >
                          <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                          <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                            {t('settings.restoreDefault')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 2 && (() => {
              const hasAvatarPath = !!activeUser?.settings?.avatarPath;
              let idx = 0;
              const chooseAvatarIdx = idx++;
              const selectAvatarFolderIdx = idx++;
              const restoreAvatarIdx = hasAvatarPath ? idx++ : -1;
              const isRightFocused = accessibilityFocusArea === 'right';

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>{t('settings.avatars')}</Text>

                  <Text style={styles.pathDesc}>
                    {t('settings.pickAvatarDesc')}
                  </Text>

                  {/* Avatar Selection */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.pickAvatar')}</Text>
                    <TouchableOpacity
                      style={[
                        styles.actionBtnSecondary,
                        isRightFocused && subFocusIndex === chooseAvatarIdx && styles.rightItemFocused,
                      ]}
                      onPress={() => {
                        onClose();
                        onOpenAvatarModal?.();
                      }}
                    >
                      <Ionicons name="person-circle-outline" size={s(20)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.chooseAvatar')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Avatar Folder */}
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>{t('settings.avatarFolder')}</Text>
                    <Text style={styles.pathDesc}>
                      {t('settings.currentPath', {
                        path: activeUser?.settings?.avatarPath || t('settings.defaultAvatars'),
                      })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === selectAvatarFolderIdx && styles.rightItemFocused,
                        ]}
                        onPress={onSelectAvatarFolder}
                      >
                        <Ionicons name="folder-open-outline" size={s(20)} color="#FFF" />
                        <Text style={styles.actionBtnSecondaryText}>{t('settings.selectFolder')}</Text>
                      </TouchableOpacity>
                      {hasAvatarPath ? (
                        <TouchableOpacity
                          style={[
                            styles.actionBtnSecondary,
                            { backgroundColor: '#3D1E24', borderColor: '#772233' },
                            isRightFocused && subFocusIndex === restoreAvatarIdx && styles.rightItemFocused,
                          ]}
                          onPress={() =>
                            updateUser({
                              settings: { ...activeUser?.settings, avatarPath: '' } as any,
                            })
                          }
                        >
                          <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                          <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                            {t('settings.restoreDefault')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 3 && (() => {
              const isRightFocused = accessibilityFocusArea === 'right';
              const isConnected = !!activeUser?.settings?.steamId;

              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.rightSectionTitle}>Steam</Text>
                  <Text style={[styles.pathDesc, { marginBottom: 16 }]}>
                    Vincula tu cuenta de Steam para sincronizar tu biblioteca de juegos.
                  </Text>

                  <View style={styles.cardSection}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="logo-steam" size={s(26)} color="#FFF" />
                        <View>
                          <Text style={styles.toggleRowTitle}>Steam</Text>
                          {isConnected && (
                            <Text style={styles.toggleRowDesc}>
                              Conectado (ID: {activeUser?.settings?.steamId})
                            </Text>
                          )}
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          isConnected
                            ? [styles.actionBtnSecondary, { backgroundColor: '#3D1E24', borderColor: '#772233' }]
                            : styles.actionBtnSecondary,
                          isRightFocused && subFocusIndex === 0 && styles.rightItemFocused,
                        ]}
                        onPress={() => {
                          if (isConnected) {
                            updateUser({ settings: { ...activeUser?.settings, steamId: '' } as any });
                          } else {
                            handleSteamLogin();
                          }
                        }}
                      >
                        {isConnected ? (
                          <>
                            <Ionicons name="unlink-outline" size={s(18)} color="#ffffffff" />
                            <Text style={[styles.actionBtnSecondaryText, { color: '#ffffffff' }]}>{t('settings.unlink')}</Text>
                          </>
                        ) : (
                          <>
                            <Ionicons name="log-in-outline" size={s(18)} color="#FFF" />
                            <Text style={styles.actionBtnSecondaryText}>{t('settings.steamLink')}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </ScrollView>
              );
            })()}

            {accessibilityLeftIndex === 4 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.smartSync')}</Text>
                <Text style={[styles.pathDesc, { marginBottom: 16 }]}>{t('settings.smartSyncDesc')}</Text>

                {[
                  {
                    key: 'ratingAndSummary',
                    label: t('settings.ratingAndSummary'),
                    options: [
                      { id: 'igdb', label: 'IGDB' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                  {
                    key: 'cover',
                    label: t('settings.cover'),
                    options: [
                      { id: 'steamgrid', label: 'SteamGrid' },
                      { id: 'igdb', label: 'IGDB' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                  {
                    key: 'background',
                    label: t('settings.background'),
                    options: [
                      { id: 'steamgrid', label: 'SteamGrid' },
                      { id: 'igdb', label: 'IGDB' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                  {
                    key: 'logo',
                    label: t('settings.logo'),
                    options: [
                      { id: 'steamgrid', label: 'SteamGrid' },
                      { id: 'none', label: t('settings.none') },
                    ],
                  },
                ].map((pref, prefIdx) => {
                  const currentSync = activeUser?.settings?.syncPreferences || {
                    ratingAndSummary: 'igdb',
                    cover: 'steamgrid',
                    background: 'steamgrid',
                    logo: 'steamgrid',
                  };
                  const currentValue = (currentSync as any)[pref.key];
                  const isRowFocused = accessibilityFocusArea === 'right' && subFocusIndex === prefIdx;
                  return (
                    <View
                      key={pref.key}
                      style={[styles.syncItemRow, isRowFocused && styles.rightItemFocused]}
                    >
                      <Text style={styles.syncItemLabel}>{pref.label}</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {pref.options.map((opt) => (
                          <TouchableOpacity
                            key={opt.id}
                            style={[
                              styles.platformBtn,
                              currentValue === opt.id && styles.platformBtnActive,
                            ]}
                            onPress={() =>
                              updateUser({
                                settings: {
                                  ...activeUser?.settings,
                                  syncPreferences: {
                                    ...currentSync,
                                    [pref.key]: opt.id,
                                  } as any,
                                },
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.platformBtnText,
                                currentValue === opt.id && styles.platformBtnTextActive,
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    );
  };

  // =========================================================================
  // SCREEN: USERS AND ACCOUNTS -> PROFILE SCREEN (Image 2 + Foto Portada)
  // =========================================================================
  const renderProfileViewScreen = () => {
    const coverUri = activeUser?.coverImage || null;
    const userColor = activeUser?.color || '#00D4FF';

    const tabs: ('overview' | 'friends')[] = [
      'overview',
      'friends',
    ];

    return (
      <View style={styles.contentWrapper}>
        {/* Cover Photo Banner (Foto Portada) */}
        <View style={styles.profileBannerContainer}>
          {coverUri ? (
            <Image source={resolveImageSource(coverUri)} style={styles.profileBannerImage} contentFit="cover" />
          ) : (
            <View
              style={[
                styles.profileBannerGradient,
                {
                  background: `linear-gradient(135deg, ${userColor}33 0%, rgba(20, 20, 30, 0.8) 100%)`,
                } as any,
              ]}
            >
              <View style={styles.profileBannerOverlay} />
            </View>
          )}

          {/* Back button in top-left */}
          <TouchableOpacity style={styles.profileBackButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(22)} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Profile Header Info */}
        <View style={styles.profileHeaderContent}>
          <View style={styles.profileAvatarWrapper}>
            <View style={[styles.profileAvatarCircle, { borderColor: userColor }]}>
              {userAvatarUri ? (
                <Image source={resolveImageSource(userAvatarUri)} style={styles.profileAvatarImg} />
              ) : (
                <Ionicons name="person" size={s(54)} color="rgba(255,255,255,0.6)" />
              )}
              {/* Online indicator dot */}
              <View style={styles.profileOnlineDot} />
            </View>

            <View style={styles.profileInfoDetails}>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileDisplayName}>{activeUser?.name || 'Player'}</Text>
                <View style={styles.profilePlusBadge}>
                  <Ionicons name="add" size={s(14)} color="#000" />
                </View>
              </View>
              <View style={styles.profileHandleRow}>
                <Text style={styles.profileHandleText}>
                  {activeUser?.onlineId || activeUser?.name?.toLowerCase().replace(/\s+/g, '_') || 'player_1'}
                </Text>
                <Text style={styles.profileHandleSep}>|</Text>
                <Ionicons name="game-controller" size={s(14)} color="rgba(255,255,255,0.6)" />
              </View>
            </View>
          </View>

          {/* Header Action Buttons on Right (Edit Profile, etc.) */}
          <View style={styles.profileHeaderActions}>
            <TouchableOpacity
              style={[
                styles.profileActionButtonRound,
                profileFocusArea === 'header_actions' && profileActionIndex === 0 && styles.profileActionButtonFocused,
              ]}
              onPress={() => navigateToScreen('profile_edit')}
            >
              <Ionicons name="pencil" size={s(20)} color="#FFF" />
              <Text style={styles.profileActionButtonLabel}>{t('profile.editProfile')}</Text>
            </TouchableOpacity>

            {allUsers.length > 1 && (
              <TouchableOpacity
                style={[
                  styles.profileActionButtonRoundSmall,
                  profileFocusArea === 'header_actions' && profileActionIndex === 1 && styles.profileActionButtonFocused,
                ]}
                onPress={() => {
                  const nextUser = allUsers.find((u) => u.id !== activeUser?.id);
                  if (nextUser && onSwitchUser) onSwitchUser(nextUser);
                }}
              >
                <Ionicons name="people-outline" size={s(20)} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Profile Tabs (Overview, Friends) */}
        <View style={styles.profileTabsBar}>
          {tabs.map((tabKey) => {
            const isActive = profileActiveTab === tabKey;
            return (
              <TouchableOpacity
                key={tabKey}
                style={[styles.profileTabItem, isActive && styles.profileTabItemActive]}
                onPress={() => {
                  setProfileActiveTab(tabKey);
                  soundService.playTab();
                }}
              >
                <Text style={[styles.profileTabText, isActive && styles.profileTabTextActive]}>
                  {t(`profile.${tabKey}` as any)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab Content */}
        <ScrollView contentContainerStyle={styles.profileTabScrollBody} showsVerticalScrollIndicator={false}>
          {profileActiveTab === 'overview' && (
            <View style={styles.overviewContainer}>
              <View style={styles.overviewStatsRow}>
                <View style={styles.statCard}>
                  <Ionicons name="game-controller-outline" size={s(28)} color="#00D4FF" />
                  <Text style={styles.statNumber}>{libraryGames.length || 12}</Text>
                  <Text style={styles.statLabel}>{t('profile.gamesCount')}</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="time-outline" size={s(28)} color="#FFCC00" />
                  <Text style={styles.statNumber}>148h</Text>
                  <Text style={styles.statLabel}>{t('profile.totalPlaytime')}</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="heart-outline" size={s(28)} color="#FF3B30" />
                  <Text style={styles.statNumber}>5</Text>
                  <Text style={styles.statLabel}>{t('profile.favoriteGames')}</Text>
                </View>
              </View>

              {activeUser?.about ? (
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutCardTitle}>{t('profile.about')}</Text>
                  <Text style={styles.aboutCardText}>{activeUser.about}</Text>
                </View>
              ) : null}
            </View>
          )}

          {profileActiveTab === 'friends' && (
            <View style={styles.friendsListContainer}>
              {(allUsers.length > 0 ? allUsers : [activeUser]).map((u, idx) => (
                <View key={u?.id || idx} style={styles.friendCard}>
                  <Image
                    source={resolveImageSource(u?.avatar || require('@/assets/images/userDefault.jpeg'))}
                    style={styles.friendAvatar}
                  />
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.friendName}>{u?.name || 'Player'}</Text>
                    <Text style={styles.friendStatus}>{t('common.online')}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  const profileEditLabels: Record<ProfileEditSection, string> = {
    name: t('profile.name'),
    onlineId: t('profile.onlineId'),
    picture: t('profile.profilePicture'),
    avatar: t('profile.avatar'),
    cover: t('profile.coverImage'),
    about: t('profile.about'),
    languages: t('profile.languages'),
  };

  const openProfileEditSection = (section: ProfileEditSection, index: number) => {
    setSubFocusIndex(index);
    setProfileEditSection(section);
    navigateToScreen('profile_edit_detail');
  };

  // =========================================================================
  // SCREEN: PROFILE EDIT (centered list of fields)
  // =========================================================================
  const renderProfileEditScreen = () => {
    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.profile')}</Text>
        </View>

        <View style={styles.elongatedListWrap}>
          <View style={styles.psMenuList}>
            {PROFILE_EDIT_SECTIONS.map((section, index) => {
              const isFocused = subFocusIndex === index;
              return (
                <TouchableOpacity
                  key={section}
                  style={[styles.psMenuRow, isFocused && styles.psMenuRowFocused]}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { onMouseEnter: () => setSubFocusIndex(index) } : {}) as any}
                  onPress={() => openProfileEditSection(section, index)}
                >
                  <Text style={[styles.psMenuRowText, isFocused && styles.psMenuRowTextFocused]}>
                    {profileEditLabels[section]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const renderProfileEditDetailScreen = () => {
    const title = profileEditLabels[profileEditSection];

    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{title}</Text>
        </View>

        <View style={styles.elongatedListWrap}>
          <View style={styles.profileDetailBody}>
            {profileEditSection === 'name' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.name')}</Text>
                <TextInput
                  ref={nameInputRef}
                  style={styles.editInputWide}
                  value={editName}
                  onChangeText={(text) => {
                    setEditName(text);
                    updateUser({ name: text });
                  }}
                  placeholder={t('settings.usernamePlaceholder')}
                  placeholderTextColor="#666"
                />
              </View>
            )}

            {profileEditSection === 'onlineId' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.onlineId')}</Text>
                <TextInput
                  ref={onlineIdInputRef}
                  style={styles.editInputWide}
                  value={editOnlineId}
                  onChangeText={(text) => {
                    setEditOnlineId(text);
                    updateUser({ onlineId: text });
                  }}
                  placeholder="e.g. splitz"
                  placeholderTextColor="#666"
                />
              </View>
            )}

            {profileEditSection === 'picture' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.profilePicture')}</Text>
                <View style={styles.profilePictureRow}>
                  <TouchableOpacity style={styles.avatarPickerThumb} onPress={handleSelectAvatar}>
                    {userAvatarUri ? (
                      <Image source={resolveImageSource(userAvatarUri)} style={styles.avatarPickerImg} />
                    ) : (
                      <Ionicons name="person" size={s(32)} color="#FFF" />
                    )}
                    <View style={styles.avatarEditOverlay}>
                      <Ionicons name="camera" size={s(16)} color="#FFF" />
                    </View>
                  </TouchableOpacity>
                  <View style={{ gap: 10, flex: 1 }}>
                    <TouchableOpacity
                      style={[styles.actionBtnSecondary, styles.actionBtnStretch]}
                      onPress={() => {
                        onClose();
                        onOpenAvatarModal?.();
                      }}
                    >
                      <Ionicons name="person-circle-outline" size={s(18)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.chooseAvatar')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtnSecondary, styles.actionBtnStretch]} onPress={handleSelectAvatar}>
                      <Ionicons name="image-outline" size={s(18)} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.profilePhoto')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {profileEditSection === 'avatar' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>
                  {t('profile.avatar')} & {t('settings.profileColor')}
                </Text>
                <View style={styles.colorPickerRow}>
                  {['#FF3B30', '#00D4FF', '#FFCC00', '#4CD964', '#AF52DE', '#FF9500'].map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: color },
                        activeUser?.color === color && styles.colorCircleActive,
                      ]}
                      onPress={() => updateUser({ color })}
                    />
                  ))}
                </View>
              </View>
            )}

            {profileEditSection === 'cover' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.coverImage')}</Text>
                <View style={styles.coverActionsRow}>
                  <TouchableOpacity style={[styles.actionBtnSecondary, styles.actionBtnStretch]} onPress={handleSelectCover}>
                    <Ionicons name="image-outline" size={s(18)} color="#FFF" />
                    <Text style={styles.actionBtnSecondaryText}>{t('profile.coverImage')}</Text>
                  </TouchableOpacity>
                  {activeUser?.coverImage ? (
                    <TouchableOpacity
                      style={[
                        styles.actionBtnSecondary,
                        styles.actionBtnStretch,
                        { backgroundColor: '#3D1E24', borderColor: '#772233' },
                      ]}
                      onPress={() => {
                        setEditCoverImage('');
                        updateUser({ coverImage: '' });
                      }}
                    >
                      <Ionicons name="trash-outline" size={s(18)} color="#FF5566" />
                      <Text style={[styles.actionBtnSecondaryText, { color: '#FF5566' }]}>
                        {t('settings.restoreDefault')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}

            {profileEditSection === 'about' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.about')}</Text>
                <TextInput
                  ref={aboutInputRef}
                  style={[styles.editInputWide, styles.editInputMultiline]}
                  value={editAbout}
                  multiline
                  onChangeText={(text) => {
                    setEditAbout(text);
                    updateUser({ about: text });
                  }}
                  placeholder={t('profile.aboutPlaceholder')}
                  placeholderTextColor="#666"
                />
              </View>
            )}

            {profileEditSection === 'languages' && (
              <View style={styles.profileDetailBlock}>
                <Text style={styles.editListLabel}>{t('profile.languages')}</Text>
                <View style={styles.languagePillsRow}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.platformBtn, language === option.id && styles.platformBtnActive]}
                      onPress={() => changeLanguage(option.id)}
                    >
                      <Text
                        style={[
                          styles.platformBtnText,
                          language === option.id && styles.platformBtnTextActive,
                        ]}
                      >
                        {option.nativeName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  // =========================================================================
  // SCREEN: SYSTEM (Image 3 - Two Columns: Software, HDMI, Language, Date)
  // =========================================================================
  const renderSystemScreen = () => {
    const systemSections = [
      { id: 'software', title: t('settings.systemSoftware') },
      { id: 'hdmi', title: t('settings.hdmi') },
      { id: 'language', title: t('settings.language') },
      { id: 'date_time', title: t('settings.dateAndTime') },
    ];

    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={s(24)} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.system')}</Text>
        </View>

        <View style={styles.twoColumnContainer}>
          {/* Left Column (Menu items) */}
          <View style={styles.systemLeftColumn}>
            {systemSections.map((sec, idx) => {
              const isSelected = systemLeftIndex === idx;
              const isFocused = systemFocusArea === 'left' && systemLeftIndex === idx;
              return (
                <TouchableOpacity
                  key={sec.id}
                  style={[
                    styles.systemLeftItem,
                    isSelected && styles.systemLeftItemActive,
                    isFocused && styles.systemLeftItemFocused,
                  ]}
                  onPress={() => {
                    setSystemLeftIndex(idx);
                    soundService.playNavigation();
                  }}
                >
                  <Text
                    style={[
                      styles.systemLeftItemText,
                      isSelected && styles.systemLeftItemTextActive,
                    ]}
                  >
                    {sec.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Right Column (Sub-options for selected item) */}
          <View style={styles.systemRightColumn}>
            {systemLeftIndex === 0 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* ── Banner WPS5 ── */}
                <View style={styles.systemBannerContainer}>
                  <Image
                    source={require('@/assets/banner/BannerWps5.png')}
                    style={styles.systemBannerImage}
                    contentFit="cover"
                  />
                  <Text style={styles.systemBannerTitle}>WPS5</Text>
                </View>

                <Text style={styles.rightSectionTitle}>{t('settings.systemSoftware')}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>WPS5 Console OS</Text>
                  <Text style={styles.infoRowValue}>Version 1.1.3 (Build 2026.9)</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Environment</Text>
                  <Text style={styles.infoRowValue}>{Platform.OS === 'web' ? 'Electron / Web' : Platform.OS}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Screen Resolution</Text>
                  <Text style={styles.infoRowValue}>
                    {Math.round(Dimensions.get('window').width)} x {Math.round(Dimensions.get('window').height)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Check for updates</Text>
                  <TouchableOpacity
                    style={styles.psButtonLarge}
                    onPress={async () => {
                      try {
                        const res = await fetch(
                          'https://angelvc25.github.io/WPS5-API/WPS5-API-V.json'
                        );
                        if (!res.ok) throw new Error('Network response was not ok');
                        const data = await res.json() as {
                          name: string;
                          tipe: string;
                          version: string;
                          link: string;
                        }[];
                        const latest = data[0];
                        console.log(latest.version, latest.tipe, latest.link);
                        console.log(data);
                        const currentVersion = '1.1.3';
                        const comparison = compareVersions(latest.version, currentVersion);
                        if (comparison > 0) {
                          toastService.show(`${t('settings.updateAvailable')}\n${latest.version}`, {
                            icon: require('@/assets/images/applogo_clean.png'),
                            source: 'steam',
                          });
                          setTimeout(() => {
                            Linking.openURL(latest.link);
                          }, 1500);
                        } else {
                          toastService.show(t('settings.youHaveTheLatestVersion'), {
                            icon: require('@/assets/images/applogo_clean.png'),
                            source: 'steam',
                          });
                        }
                      } catch (error) {
                        console.error('Error checking for updates:', error);
                        toastService.show(t('settings.updateCheckFailed'), {
                          icon: require('@/assets/images/applogo_clean.png'),
                          source: 'steam',
                        });
                      }
                    }}
                  >
                    <Text style={styles.psButtonLargeText}>Check</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {systemLeftIndex === 1 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.hdmi')}</Text>

                <View
                  style={[
                    styles.toggleRowSection,
                    systemFocusArea === 'right' && subFocusIndex === 0 && styles.rightItemFocused,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleRowTitle}>Enable HDMI Device Link</Text>
                    <Text style={styles.toggleRowDesc}>Control power state via connected HDMI displays.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.psSwitch, hdmiDeviceLink && styles.psSwitchActive]}
                    onPress={() => setHdmiDeviceLink(!hdmiDeviceLink)}
                  >
                    <View style={[styles.psSwitchThumb, hdmiDeviceLink && styles.psSwitchThumbActive]} />
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.toggleRowSection,
                    systemFocusArea === 'right' && subFocusIndex === 1 && styles.rightItemFocused,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleRowTitle}>Enable HDCP</Text>
                    <Text style={styles.toggleRowDesc}>High-bandwidth Digital Content Protection.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.psSwitch, hdmiHdcp && styles.psSwitchActive]}
                    onPress={() => setHdmiHdcp(!hdmiHdcp)}
                  >
                    <View style={[styles.psSwitchThumb, hdmiHdcp && styles.psSwitchThumbActive]} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {systemLeftIndex === 2 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.language')}</Text>
                <Text style={[styles.pathDesc, { marginBottom: 20 }]}>{t('settings.languageDesc')}</Text>

                <View style={{ gap: 12 }}>
                  {LANGUAGE_OPTIONS.map((opt, optIdx) => {
                    const isSelected = language === opt.id;
                    const isRowFocused = systemFocusArea === 'right' && subFocusIndex === optIdx;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.languageSelectRow,
                          isSelected && styles.languageSelectRowActive,
                          isRowFocused && styles.rightItemFocused,
                        ]}
                        onPress={() => changeLanguage(opt.id)}
                      >
                        <Text
                          style={[
                            styles.languageSelectText,
                            isSelected && styles.languageSelectTextActive,
                          ]}
                        >
                          {opt.nativeName}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={s(22)} color="#00D4FF" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {systemLeftIndex === 3 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rightSectionTitle}>{t('settings.dateAndTime')}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Current Time</Text>
                  <Text style={styles.infoRowValue}>{new Date().toLocaleTimeString()}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>Timezone</Text>
                  <Text style={styles.infoRowValue}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Animated.View
      style={styles.fullScreenContainer}
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
    >
      {/* Background Video */}
      <BackgroundVideo
        source={require('@/assets/video/waves_ajustes.mp4')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        shouldPlay
        isLooping
        muted
      />

      {/* Dark Ambient Overlay */}
      <View style={styles.darkOverlay} />

      {/* Main Container */}
      <View style={styles.settingsBody}>
        {currentScreen === 'main' && renderMainScreen()}
        {currentScreen === 'guide' && renderGuideScreen()}
        {currentScreen === 'accessibility' && renderAccessibilityScreen()}
        {currentScreen === 'users_and_accounts' && renderProfileViewScreen()}
        {currentScreen === 'profile_edit' && renderProfileEditScreen()}
        {currentScreen === 'profile_edit_detail' && renderProfileEditDetailScreen()}
        {currentScreen === 'system' && renderSystemScreen()}
      </View>

      {/* Control Prompt Bar at Bottom */}
      <View style={styles.bottomControlBarContainer}>
        <View style={[styles.bottomControlBar, {}]}>
          <PSIcon
            char={PSIcons.cross}
            size={s(26)}
            color={'#fff'}
          />
          <Text style={styles.bottomBarText}>{t('common.select')}</Text>
          <PSIcon
            char={PSIcons.circle}
            size={s(26)}
            color={'#fff'}
          />
          <Text style={styles.bottomBarText}>{t('common.back')}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

type ScaleFn = (px: number) => number;

const createStyles = (s: ScaleFn) => StyleSheet.create({
  fullScreenContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: '#0D0D12',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 16, 0.34)',
  },
  bottomControlBar: {
    position: 'absolute',
    padding: s(2),
    //bottom: 60,
    left: s(15),
    //right: 72,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

  },
  bottomBarText: {
    color: '#FFF',
    fontSize: s(20),
    paddingHorizontal: s(10),
    fontFamily: 'SSTMedium'
  },
  bottomControlBarContainer: {
    //width: 340,
    minWidth: s(270),

    height: s(37),
    //maxWidth: 340,
    position: 'fixed',
    right: s(20),
    bottom: s(20),
    paddingHorizontal: s(22),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    gap: s(20),
    display: 'flex',
    justifyContent: 'center',
  },
  settingsBody: {
    flex: 1,
    paddingTop: s(56),
    paddingHorizontal: s(72),
    paddingBottom: s(60),
  },
  contentWrapper: {
    flex: 1,
  },
  mainHeaderTitle: {
    color: '#FFF',
    fontSize: s(32),
    fontFamily: 'SSTLight',
    marginBottom: s(28),
    letterSpacing: 0.4,
  },
  subScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(30),
    gap: s(16),
  },
  backButtonInline: {
    padding: s(8),
    borderRadius: s(20),
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  subScreenHeaderTitle: {
    color: '#FFF',
    fontSize: s(26),
    fontFamily: 'SSTLight',
  },

  // Main Vertical List (PS5 style: centered, elongated)
  elongatedListWrap: {
    flex: 1,
    alignItems: 'center',
  },
  psMenuList: {
    width: '88%',
    maxWidth: s(1100),
    borderRightColor: 'rgba(255, 255, 255, 0.16)',
  },
  psMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: s(26),
    paddingHorizontal: s(16),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: s(0),
  },
  psMenuRowFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    //borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  psMenuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(18),
  },
  mainMenuItemIcon: {
    width: s(32),
    textAlign: 'center',
  },
  mainMenuUserAvatar: {
    width: s(32),
    height: s(32),
    borderRadius: s(16),
  },
  psMenuRowText: {
    color: '#FFFFFF',
    fontSize: s(20),
    fontFamily: 'SSTLight',
    letterSpacing: 0.25,
  },
  psMenuRowTextFocused: {
    color: '#FFF',
    fontFamily: 'SSTLight',
  },

  // Scroll body for sub screens
  scrollBody: {
    paddingBottom: s(60),
  },

  // Section Cards & Controls
  cardSection: {
    marginBottom: s(30),
    paddingBottom: s(20),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionLabel: {
    color: '#9c9b96ff',
    fontSize: s(13),
    fontWeight: '700',
    fontFamily: 'SSTMedium',
    letterSpacing: 1.2,
    marginBottom: s(10),
  },
  pathDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
    lineHeight: s(20),
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: s(12),
    paddingHorizontal: s(20),
    borderRadius: s(10),
    gap: s(10),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignSelf: 'flex-start',
  },
  actionBtnSecondaryText: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    //fontWeight: '600',
  },

  // Toggle rows
  toggleRowSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: s(18),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleRowTitle: {
    color: '#FFF',
    fontSize: s(17),
    fontFamily: 'SSTLight',
    marginBottom: s(4),
  },
  toggleRowDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: s(13),
    fontFamily: 'SSTLight',
    lineHeight: s(18),
  },
  psSwitch: {
    width: s(52),
    height: s(30),
    borderRadius: s(15),
    backgroundColor: 'rgba(48, 49, 54, 1)',
    padding: s(3),
    justifyContent: 'center',
  },
  psSwitchActive: {
    backgroundColor: 'rgba(71, 73, 80, 1)',
  },
  psSwitchThumb: {
    width: s(24),
    height: s(24),
    borderRadius: s(12),
    borderWidth: 2,
    borderColor: 'rgba(94, 100, 105, 1)',
    backgroundColor: 'rgba(48, 49, 54, 1)',
  },
  psSwitchThumbActive: {
    transform: [{ translateX: 22 }],
    backgroundColor: '#ffffffff',
    borderColor: 'rgba(255, 255, 255, 1)',
  },

  // Platform/Sync buttons
  syncItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: s(12),
  },
  syncItemLabel: {
    color: '#E0E0FF',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  platformBtn: {
    paddingVertical: s(8),
    paddingHorizontal: s(16),
    borderRadius: s(8),
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  platformBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  platformBtnText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: s(13),
    fontFamily: 'SSTMedium',
    //fontWeight: '600',
  },
  platformBtnTextActive: {
    color: '#000',
    fontWeight: 'bold',
  },

  // Support / Guide
  supportMessageContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: s(16),
    padding: s(28),
    marginBottom: s(30),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  supportTextMain: {
    color: '#FFF',
    fontSize: s(22),
    fontFamily: 'SSTLight',
    //fontWeight: '300',
    textAlign: 'center',
    marginBottom: s(10),
  },
  supportTextSub: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    textAlign: 'center',
    lineHeight: s(22),
    maxWidth: s(600),
  },
  supportLinksRow: {
    flexDirection: 'row',
    gap: s(16),
    marginBottom: s(35),
  },
  supportLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: s(12),
    paddingHorizontal: s(20),
    borderRadius: s(12),
    gap: s(10),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  supportLinkBtnText: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
    //fontWeight: '600',
  },
  patronsSection: {
    marginTop: s(10),
  },
  patronsListGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s(12),
    marginTop: s(12),
  },
  patronCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: s(8),
    paddingHorizontal: s(14),
    borderRadius: s(10),
    gap: s(8),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  patronName: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: s(14),
    fontFamily: 'SSTMedium',
    //fontWeight: '500',
  },

  // Profile View (Image 2)
  profileBannerContainer: {
    width: '100%',
    height: s(380),
    borderRadius: s(16),
    overflow: 'hidden',
    position: 'relative',
    marginBottom: s(-45),
  },
  profileBannerImage: {
    width: '100%',
    height: '100%',
  },
  profileBannerGradient: {
    width: '100%',
    height: '100%',
  },
  profileBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  profileBackButton: {
    position: 'absolute',
    top: s(16),
    left: s(16),
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: s(24),
    marginBottom: s(25),
  },
  profileAvatarWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: s(18),
  },
  profileAvatarCircle: {
    width: s(90),
    height: s(90),
    borderRadius: s(45),
    borderWidth: 3.5,
    backgroundColor: '#1E1E24',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: s(45),
  },
  profileOnlineDot: {
    position: 'absolute',
    bottom: s(2),
    right: s(2),
    width: s(18),
    height: s(18),
    borderRadius: s(9),
    backgroundColor: '#4CD964',
    borderWidth: 3,
    borderColor: '#0D0D12',
  },
  profileInfoDetails: {
    marginBottom: s(6),
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
  },
  profileDisplayName: {
    color: '#FFF',
    fontSize: s(24),
    fontFamily: 'SSTBold',
  },
  profilePlusBadge: {
    width: s(20),
    height: s(20),
    borderRadius: s(10),
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    marginTop: s(2),
  },
  profileHandleText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },
  profileHandleSep: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: s(14),
    fontFamily: 'SSTLight',
  },
  profileHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    marginBottom: s(8),
  },
  profileActionButtonRound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(8),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: s(10),
    paddingHorizontal: s(18),
    borderRadius: s(24),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  profileActionButtonRoundSmall: {
    width: s(44),
    height: s(44),
    borderRadius: s(22),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  profileActionButtonFocused: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  profileActionButtonLabel: {
    color: '#FFF',
    fontSize: s(14),
    fontFamily: 'SSTMedium',
  },
  profileTabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: s(20),
    paddingHorizontal: s(8),
  },
  profileTabItem: {
    paddingVertical: s(12),
    paddingHorizontal: s(22),
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  profileTabItemActive: {
    borderBottomColor: '#FFFFFF',
  },
  profileTabText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  profileTabTextActive: {
    color: '#FFF',
    fontFamily: 'SSTMedium',
  },
  profileTabScrollBody: {
    paddingBottom: s(40),
  },
  overviewContainer: {
    gap: s(20),
  },
  overviewStatsRow: {
    flexDirection: 'row',
    gap: s(16),
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: s(14),
    padding: s(18),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  statNumber: {
    color: '#FFF',
    fontSize: s(22),
    fontFamily: 'SSTBold',
    //fontWeight: 'bold',
    marginVertical: s(4),
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    //textTransform: 'uppercase',
  },
  aboutCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: s(14),
    padding: s(20),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  aboutCardTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: s(13),
    fontFamily: 'SSTBold',
    //fontWeight: '700',
    //textTransform: 'uppercase',
    marginBottom: s(8),
  },
  aboutCardText: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  gamesGridList: {
    gap: s(12),
  },
  gameListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: s(12),
    padding: s(12),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  gameListThumb: {
    width: s(60),
    height: s(60),
    borderRadius: s(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameListInfo: {
    flex: 1,
    marginLeft: s(16),
  },
  gameListTitle: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
    marginBottom: s(4),
  },
  gameListSub: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: s(13),
    fontFamily: 'SSTLight',
  },
  friendsListContainer: {
    gap: s(12),
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: s(12),
    padding: s(14),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  friendAvatar: {
    width: s(44),
    height: s(44),
    borderRadius: s(22),
  },
  friendName: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
  },
  friendStatus: {
    color: '#4CD964',
    fontSize: s(12),
    fontFamily: 'SSTLight',
    marginTop: s(2),
  },
  sharedContainer: {
    minHeight: s(180),
  },
  emptyShared: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: s(50),
  },
  emptySharedText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
    marginTop: s(12),
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s(14),
  },
  mediaCard: {
    width: s(180),
    borderRadius: s(10),
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  mediaThumb: {
    width: '100%',
    height: s(100),
  },
  mediaTitle: {
    color: '#FFF',
    fontSize: s(13),
    padding: s(8),
    fontFamily: 'SSTLight',
  },

  // Edit Profile Screen
  editListItem: {
    marginBottom: s(24),
    paddingBottom: s(18),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  editListLabel: {
    color: '#FFF',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
    //fontWeight: '500',
    marginBottom: s(12),
  },
  editInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    color: '#FFF',
    padding: s(14),
    borderRadius: s(10),
    fontSize: s(15),
    fontFamily: 'SSTLight',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  editInputWide: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    color: '#FFF',
    paddingVertical: s(16),
    paddingHorizontal: s(18),
    borderRadius: s(10),
    fontSize: s(16),
    fontFamily: 'SSTLight',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    width: '100%',
  },
  editInputMultiline: {
    height: s(140),
    textAlignVertical: 'top',
  },
  profileDetailBody: {
    width: '88%',
    maxWidth: s(1100),
  },
  profileDetailBlock: {
    width: '100%',
  },
  profilePictureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(16),
  },
  coverActionsRow: {
    flexDirection: 'row',
    gap: s(12),
  },
  languagePillsRow: {
    flexDirection: 'row',
    gap: s(10),
    flexWrap: 'wrap',
  },
  actionBtnStretch: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  avatarPickerThumb: {
    width: s(64),
    height: s(64),
    borderRadius: s(32),
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarPickerImg: {
    width: '100%',
    height: '100%',
  },
  avatarEditOverlay: {
    position: 'absolute',
    bottom: s(0),
    left: s(0),
    right: s(0),
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingVertical: s(2),
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: s(14),
  },
  colorCircle: {
    width: s(38),
    height: s(38),
    borderRadius: s(19),
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  colorCircleActive: {
    borderColor: '#FFF',
    transform: [{ scale: 1.15 }],
  },

  // System Screen (Image 3)
  twoColumnContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: s(50),
  },
  systemLeftColumn: {
    width: s(240),
  },
  systemLeftItem: {
    paddingVertical: s(14),
    paddingHorizontal: s(16),
    borderRadius: s(8),
    marginBottom: s(6),
    borderWidth: 1,
    borderColor: 'transparent',
  },
  systemLeftItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  systemLeftItemFocused: {
    borderColor: '#ffffff44',
  },
  rightItemFocused: {
    //borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    //borderWidth: 2,
    //borderRadius: 8,
  },
  systemLeftItemText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: s(16),
    fontFamily: 'SSTLight',
  },
  systemLeftItemTextActive: {
    color: '#FFF',
    //fontWeight: '600',
    fontFamily: 'SSTMedium',
  },
  systemRightColumn: {
    flex: 1,
    paddingLeft: s(20),
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
  },
  systemBannerContainer: {
    width: '100%',
    height: s(160),
    borderRadius: s(12),
    overflow: 'hidden',
    marginBottom: s(24),
    position: 'relative',
  },
  systemBannerImage: {
    width: '100%',
    height: '100%',
  },
  systemBannerTitle: {
    position: 'absolute',
    left: s(20),
    bottom: s(16),
    color: '#FFFFFF',
    fontFamily: 'SSTBadge',
    fontSize: s(22),
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  rightSectionTitle: {
    color: '#FFF',
    fontSize: s(20),
    fontFamily: 'SSTBold',
    fontWeight: 'bold',
    marginBottom: s(20),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: s(14),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoRowLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: s(15),
    fontFamily: 'SSTLight',
  },
  infoRowValue: {
    color: '#FFF',
    fontSize: s(15),
    fontFamily: 'SSTMedium',
  },
  languageSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: s(16),
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  languageSelectRowActive: {
    borderColor: '#00D4FF',
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
  },
  languageSelectText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: s(16),
    fontFamily: 'SSTMedium',
  },
  languageSelectTextActive: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },

  // PS Button Styles
  psButtonLarge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: s(5),
    paddingHorizontal: s(24),
    borderRadius: s(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  psButtonLargeFocused: {
    backgroundColor: 'rgba(255, 255, 255, 1)',
  },
  psButtonLargeText: {
    color: '#ffffffff',
    fontSize: s(16),
    fontFamily: 'SSTBold',
  },
  psButtonLargeTextFocused: {
    color: '#000000',
    fontFamily: 'SSTBold',
  },
});