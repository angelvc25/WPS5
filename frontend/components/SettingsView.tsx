import React, { useState, useEffect, useRef } from 'react';
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
    if (accessibilityLeftIndex === 0) {
      // Auto-play video toggle, Invert transition toggle
      return 1;
    }
    if (accessibilityLeftIndex === 1) {
      const hasWallpaperPath = !!activeUser?.settings?.wallpaperPath;
      const hasCapturePath = !!activeUser?.settings?.capturePath;
      // Choose wallpaper, select wallpaper folder, (restore wallpaper), select capture folder, (restore capture)
      const count = 2 + (hasWallpaperPath ? 1 : 0) + 1 + (hasCapturePath ? 1 : 0);
      return Math.max(0, count - 1);
    }
    if (accessibilityLeftIndex === 2) {
      // Choose avatar, select avatar folder, (restore avatar folder)
      const hasAvatarPath = !!activeUser?.settings?.avatarPath;
      const count = 2 + (hasAvatarPath ? 1 : 0);
      return Math.max(0, count - 1);
    }
    if (accessibilityLeftIndex === 3) {
      // 4 sync preference rows
      return 3;
    }
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
            setAccessibilityLeftIndex((prev) => Math.min(prev + 1, 3));
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
                        size={26}
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
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.subScreenHeaderTitle}>{t('settings.userGuide')}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
          {/* Apoyo al Proyecto */}
          <View style={styles.supportMessageContainer}>
            <Ionicons
              name="heart-circle-sharp"
              size={64}
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
              <Ionicons name="logo-octocat" size={22} color="#FF4500" />
              <Text style={styles.supportLinkBtnText}>Patreon</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://github.com/angelvc25/WPS5')}
            >
              <Ionicons name="logo-github" size={22} color="#FFF" />
              <Text style={styles.supportLinkBtnText}>GitHub</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportLinkBtn}
              onPress={() => Linking.openURL('https://youtube.com')}
            >
              <Ionicons name="logo-youtube" size={22} color="#FF0000" />
              <Text style={styles.supportLinkBtnText}>YouTube</Text>
            </TouchableOpacity>
          </View>

          {/* Patrons list */}
          <View style={styles.patronsSection}>
            <Text style={styles.sectionLabel}>{t('settings.patrons')}</Text>
            <View style={styles.patronsListGrid}>
              {['angelvc25', 'Crizz_Vc', 'WPS5 Community'].map((name, idx) => (
                <View key={idx} style={styles.patronCard}>
                  <Ionicons name="star" size={14} color="#FFCC00" />
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
      { id: 'sync', title: t('settings.smartSync') },
    ];

    return (
      <View style={styles.contentWrapper}>
        <View style={styles.subScreenHeader}>
          <TouchableOpacity style={styles.backButtonInline} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
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
                      <Ionicons name="image-outline" size={20} color="#FFF" />
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
                        <Ionicons name="folder-open-outline" size={20} color="#FFF" />
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
                          <Ionicons name="trash-outline" size={18} color="#FF5566" />
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
                        <Ionicons name="folder-open-outline" size={20} color="#FFF" />
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
                          <Ionicons name="trash-outline" size={18} color="#FF5566" />
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
                      <Ionicons name="person-circle-outline" size={20} color="#FFF" />
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
                        <Ionicons name="folder-open-outline" size={20} color="#FFF" />
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
                          <Ionicons name="trash-outline" size={18} color="#FF5566" />
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

            {accessibilityLeftIndex === 3 && (
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
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Profile Header Info */}
        <View style={styles.profileHeaderContent}>
          <View style={styles.profileAvatarWrapper}>
            <View style={[styles.profileAvatarCircle, { borderColor: userColor }]}>
              {userAvatarUri ? (
                <Image source={resolveImageSource(userAvatarUri)} style={styles.profileAvatarImg} />
              ) : (
                <Ionicons name="person" size={54} color="rgba(255,255,255,0.6)" />
              )}
              {/* Online indicator dot */}
              <View style={styles.profileOnlineDot} />
            </View>

            <View style={styles.profileInfoDetails}>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileDisplayName}>{activeUser?.name || 'Player'}</Text>
                <View style={styles.profilePlusBadge}>
                  <Ionicons name="add" size={14} color="#000" />
                </View>
              </View>
              <View style={styles.profileHandleRow}>
                <Text style={styles.profileHandleText}>
                  {activeUser?.onlineId || activeUser?.name?.toLowerCase().replace(/\s+/g, '_') || 'player_1'}
                </Text>
                <Text style={styles.profileHandleSep}>|</Text>
                <Ionicons name="game-controller" size={14} color="rgba(255,255,255,0.6)" />
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
              <Ionicons name="pencil" size={20} color="#FFF" />
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
                <Ionicons name="people-outline" size={20} color="#FFF" />
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
                  <Ionicons name="game-controller-outline" size={28} color="#00D4FF" />
                  <Text style={styles.statNumber}>{libraryGames.length || 12}</Text>
                  <Text style={styles.statLabel}>{t('profile.gamesCount')}</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="time-outline" size={28} color="#FFCC00" />
                  <Text style={styles.statNumber}>148h</Text>
                  <Text style={styles.statLabel}>{t('profile.totalPlaytime')}</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="heart-outline" size={28} color="#FF3B30" />
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
            <Ionicons name="arrow-back" size={24} color="#FFF" />
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
            <Ionicons name="arrow-back" size={24} color="#FFF" />
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
                      <Ionicons name="person" size={32} color="#FFF" />
                    )}
                    <View style={styles.avatarEditOverlay}>
                      <Ionicons name="camera" size={16} color="#FFF" />
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
                      <Ionicons name="person-circle-outline" size={18} color="#FFF" />
                      <Text style={styles.actionBtnSecondaryText}>{t('settings.chooseAvatar')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtnSecondary, styles.actionBtnStretch]} onPress={handleSelectAvatar}>
                      <Ionicons name="image-outline" size={18} color="#FFF" />
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
                    <Ionicons name="image-outline" size={18} color="#FFF" />
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
                      <Ionicons name="trash-outline" size={18} color="#FF5566" />
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
            <Ionicons name="arrow-back" size={24} color="#FFF" />
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
                <Text style={styles.rightSectionTitle}>{t('settings.systemSoftware')}</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>WPS5 Console OS</Text>
                  <Text style={styles.infoRowValue}>Version 2.4.0 (Build 2026.8)</Text>
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
                          <Ionicons name="checkmark-circle" size={22} color="#00D4FF" />
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
      <Video
        source={require('@/assets/video/waves_ajustes.mp4')}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
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
            size={26}
            color={'#fff'}
          />
          <Text style={styles.bottomBarText}>{t('common.select')}</Text>
          <PSIcon
            char={PSIcons.circle}
            size={26}
            color={'#fff'}
          />
          <Text style={styles.bottomBarText}>{t('common.back')}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
    padding: 2,
    //bottom: 60,
    left: 15,
    //right: 72,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

  },
  bottomBarText: {
    color: '#FFF',
    fontSize: 20,
    paddingHorizontal: 10,
    fontFamily: 'SSTMedium'
  },
  bottomControlBarContainer: {
    //width: 340,
    minWidth: 270,

    height: 37,
    //maxWidth: 340,
    position: 'fixed',
    right: 20,
    bottom: 20,
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    gap: 20,
    display: 'flex',
    justifyContent: 'center',
  },
  settingsBody: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 72,
    paddingBottom: 60,
  },
  contentWrapper: {
    flex: 1,
  },
  mainHeaderTitle: {
    color: '#FFF',
    fontSize: 32,
    fontFamily: 'SSTLight',
    marginBottom: 28,
    letterSpacing: 0.4,
  },
  subScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    gap: 16,
  },
  backButtonInline: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  subScreenHeaderTitle: {
    color: '#FFF',
    fontSize: 26,
    fontFamily: 'SSTLight',
  },

  // Main Vertical List (PS5 style: centered, elongated)
  elongatedListWrap: {
    flex: 1,
    alignItems: 'center',
  },
  psMenuList: {
    width: '88%',
    maxWidth: 1100,
    borderRightColor: 'rgba(255, 255, 255, 0.16)',
  },
  psMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 26,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 0,
  },
  psMenuRowFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    //borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  psMenuRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  mainMenuItemIcon: {
    width: 32,
    textAlign: 'center',
  },
  mainMenuUserAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  psMenuRowText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'SSTLight',
    letterSpacing: 0.25,
  },
  psMenuRowTextFocused: {
    color: '#FFF',
    fontFamily: 'SSTLight',
  },

  // Scroll body for sub screens
  scrollBody: {
    paddingBottom: 60,
  },

  // Section Cards & Controls
  cardSection: {
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionLabel: {
    color: '#9c9b96ff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'SSTMedium',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  pathDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontFamily: 'SSTLight',
    lineHeight: 20,
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignSelf: 'flex-start',
  },
  actionBtnSecondaryText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTLight',
    //fontWeight: '600',
  },

  // Toggle rows
  toggleRowSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleRowTitle: {
    color: '#FFF',
    fontSize: 17,
    fontFamily: 'SSTLight',
    marginBottom: 4,
  },
  toggleRowDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontFamily: 'SSTLight',
    lineHeight: 18,
  },
  psSwitch: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 3,
    justifyContent: 'center',
  },
  psSwitchActive: {
    backgroundColor: '#8d8d8dff',
  },
  psSwitchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#969696ff',
  },
  psSwitchThumbActive: {
    transform: [{ translateX: 22 }],
    backgroundColor: '#ffffffff',
  },

  // Platform/Sync buttons
  syncItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  syncItemLabel: {
    color: '#E0E0FF',
    fontSize: 15,
    fontFamily: 'SSTLight',
  },
  platformBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  platformBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  platformBtnText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
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
    borderRadius: 16,
    padding: 28,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  supportTextMain: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'SSTLight',
    //fontWeight: '300',
    textAlign: 'center',
    marginBottom: 10,
  },
  supportTextSub: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 15,
    fontFamily: 'SSTLight',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 600,
  },
  supportLinksRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 35,
  },
  supportLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  supportLinkBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
    //fontWeight: '600',
  },
  patronsSection: {
    marginTop: 10,
  },
  patronsListGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  patronCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  patronName: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontFamily: 'SSTMedium',
    //fontWeight: '500',
  },

  // Profile View (Image 2)
  profileBannerContainer: {
    width: '100%',
    height: 380,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: -45,
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
    top: 16,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 25,
  },
  profileAvatarWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
  },
  profileAvatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
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
    borderRadius: 45,
  },
  profileOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4CD964',
    borderWidth: 3,
    borderColor: '#0D0D12',
  },
  profileInfoDetails: {
    marginBottom: 6,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileDisplayName: {
    color: '#FFF',
    fontSize: 24,
    fontFamily: 'SSTBold',
  },
  profilePlusBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  profileHandleText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    fontFamily: 'SSTLight',
  },
  profileHandleSep: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 14,
    fontFamily: 'SSTLight',
  },
  profileHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  profileActionButtonRound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  profileActionButtonRoundSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 14,
    fontFamily: 'SSTMedium',
  },
  profileTabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  profileTabItem: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  profileTabItemActive: {
    borderBottomColor: '#FFFFFF',
  },
  profileTabText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    fontFamily: 'SSTLight',
  },
  profileTabTextActive: {
    color: '#FFF',
    fontFamily: 'SSTMedium',
  },
  profileTabScrollBody: {
    paddingBottom: 40,
  },
  overviewContainer: {
    gap: 20,
  },
  overviewStatsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  statNumber: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'SSTBold',
    //fontWeight: 'bold',
    marginVertical: 4,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 15,
    fontFamily: 'SSTLight',
    //textTransform: 'uppercase',
  },
  aboutCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  aboutCardTitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontFamily: 'SSTBold',
    //fontWeight: '700',
    //textTransform: 'uppercase',
    marginBottom: 8,
  },
  aboutCardText: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTLight',
  },
  gamesGridList: {
    gap: 12,
  },
  gameListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  gameListThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameListInfo: {
    flex: 1,
    marginLeft: 16,
  },
  gameListTitle: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'SSTMedium',
    marginBottom: 4,
  },
  gameListSub: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontFamily: 'SSTLight',
  },
  friendsListContainer: {
    gap: 12,
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  friendName: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'SSTMedium',
  },
  friendStatus: {
    color: '#4CD964',
    fontSize: 12,
    fontFamily: 'SSTLight',
    marginTop: 2,
  },
  sharedContainer: {
    minHeight: 180,
  },
  emptyShared: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptySharedText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 15,
    fontFamily: 'SSTLight',
    marginTop: 12,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  mediaCard: {
    width: 180,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  mediaThumb: {
    width: '100%',
    height: 100,
  },
  mediaTitle: {
    color: '#FFF',
    fontSize: 13,
    padding: 8,
    fontFamily: 'SSTLight',
  },

  // Edit Profile Screen
  editListItem: {
    marginBottom: 24,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  editListLabel: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'SSTMedium',
    //fontWeight: '500',
    marginBottom: 12,
  },
  editInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    color: '#FFF',
    padding: 14,
    borderRadius: 10,
    fontSize: 15,
    fontFamily: 'SSTLight',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  editInputWide: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    color: '#FFF',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 10,
    fontSize: 16,
    fontFamily: 'SSTLight',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    width: '100%',
  },
  editInputMultiline: {
    height: 140,
    textAlignVertical: 'top',
  },
  profileDetailBody: {
    width: '88%',
    maxWidth: 1100,
  },
  profileDetailBlock: {
    width: '100%',
  },
  profilePictureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  coverActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  languagePillsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionBtnStretch: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  avatarPickerThumb: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingVertical: 2,
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: 14,
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    gap: 50,
  },
  systemLeftColumn: {
    width: 240,
  },
  systemLeftItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 6,
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
    fontSize: 16,
    fontFamily: 'SSTLight',
  },
  systemLeftItemTextActive: {
    color: '#FFF',
    //fontWeight: '600',
    fontFamily: 'SSTMedium',
  },
  systemRightColumn: {
    flex: 1,
    paddingLeft: 20,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.06)',
  },
  rightSectionTitle: {
    color: '#FFF',
    fontSize: 20,
    fontFamily: 'SSTBold',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoRowLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 15,
    fontFamily: 'SSTLight',
  },
  infoRowValue: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'SSTMedium',
  },
  languageSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  languageSelectRowActive: {
    borderColor: '#00D4FF',
    backgroundColor: 'rgba(0, 212, 255, 0.08)',
  },
  languageSelectText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontFamily: 'SSTMedium',
  },
  languageSelectTextActive: {
    color: '#FFF',
    fontFamily: 'SSTBold',
  },
});