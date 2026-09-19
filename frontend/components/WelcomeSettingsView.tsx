import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import SpinningBorderSearch from './SpinningBorderSearch';
import { useTranslation } from '@/contexts/LanguageContext';
import { soundService } from '@/services/soundService';

interface WelcomeSettingsViewProps {
  visible: boolean;
  onClose: () => void;
  presentationEnabled: boolean;
  inactivityTime: string;
  onSettingsChange: (enabled: boolean, time: string) => void;
  selectedAlbumName: string | null;
  onOpenAlbumPicker: () => void;
  onSlidesSettingsChange: (settings: { albumName: string | null; duration: string; transition: string }) => void;
  isAlbumPickerOpen: boolean;
}

type SubView = 'main' | 'presentation' | 'slides';

export default function WelcomeSettingsView({ visible, onClose, presentationEnabled, inactivityTime, onSettingsChange, selectedAlbumName, onOpenAlbumPicker, onSlidesSettingsChange, isAlbumPickerOpen }: WelcomeSettingsViewProps) {
  const { t } = useTranslation();

  const INACTIVITY_OPTIONS = useMemo(() => [
    { label: `15 ${t('welcome.config.seconds')}`, value: '15s' },
    { label: `30 ${t('welcome.config.seconds')}`, value: '30s' },
    { label: `1 ${t('welcome.config.minute')}`, value: '60s' },
    { label: `5 ${t('welcome.config.minutes')}`, value: '300s' },
  ], [t]);

  const SLIDE_DURATION_OPTIONS = useMemo(() => [
    { label: `5 ${t('welcome.config.seconds')}`, value: '5s' },
    { label: `10 ${t('welcome.config.seconds')}`, value: '10s' },
    { label: `15 ${t('welcome.config.seconds')}`, value: '15s' },
    { label: `30 ${t('welcome.config.seconds')}`, value: '30s' },
  ], [t]);

  const TRANSITION_OPTIONS = useMemo(() => [
    { label: t('welcome.config.left'), value: 'left' },
    { label: t('welcome.config.right'), value: 'right' },
  ], [t]);

  const MAIN_MENU_ITEMS = useMemo(() => [
    {
      id: 'presentation',
      title: t('welcome.config.presentationTitle'),
      description: t('welcome.config.presentationDesc'),
    },
    {
      id: 'slides',
      title: t('welcome.config.slidesTitle'),
      description: t('welcome.config.slidesDesc'),
    },
  ], [t]);
  // ─── Navigation state ─────────────────────────────────────
  const [currentView, setCurrentView] = useState<SubView>('main');
  const [menuFocusIndex, setMenuFocusIndex] = useState(0);

  // ─── Presentation mode settings ───────────────────────────
  const [presentationFocusIndex, setPresentationFocusIndex] = useState(0);
  const [showInactivityDropdown, setShowInactivityDropdown] = useState(false);
  const [inactivityDropdownIndex, setInactivityDropdownIndex] = useState(0);

  // ─── Slides settings ──────────────────────────────────────
  const [slideDuration, setSlideDuration] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('slideshow_duration') || '10s';
    return '10s';
  });
  const [transitionStyle, setTransitionStyle] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('slideshow_transition') || 'left';
    return 'left';
  });
  const [slidesFocusIndex, setSlidesFocusIndex] = useState(0);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const [durationDropdownIndex, setDurationDropdownIndex] = useState(1);
  const [showTransitionDropdown, setShowTransitionDropdown] = useState(false);
  const [transitionDropdownIndex, setTransitionDropdownIndex] = useState(0);

  // ─── Reset state on close ─────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setCurrentView('main');
      setMenuFocusIndex(0);
      setShowInactivityDropdown(false);
      setShowDurationDropdown(false);
      setShowTransitionDropdown(false);
    }
  }, [visible]);

  // ─── Keyboard / gamepad handler ───────────────────────────
  useEffect(() => {
    if (!visible || isAlbumPickerOpen || Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Always block parent navigation
      e.preventDefault();
      e.stopPropagation();

      const key = e.key;

      // ─── Dropdowns intercept all keys when open ───
      if (showInactivityDropdown) {
        if (key === 'ArrowDown') setInactivityDropdownIndex((p) => Math.min(p + 1, INACTIVITY_OPTIONS.length - 1));
        else if (key === 'ArrowUp') setInactivityDropdownIndex((p) => Math.max(p - 1, 0));
        else if (key === 'Enter' || key === ' ') {
          onSettingsChange(presentationEnabled, INACTIVITY_OPTIONS[inactivityDropdownIndex].value);
          setShowInactivityDropdown(false);
        } else if (key === 'Escape' || key === 'b' || key === 'B') {
          setShowInactivityDropdown(false);
        }
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        soundService.playNavigation(); // O el nombre del sonido de movimiento que tengas
      }

      // Sonido de confirmación / Enter
      if (e.key === 'Enter' || e.key === ' ') {
        soundService.playActivation();
      }

      // Sonido de regreso / Escape / Back
      if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
        soundService.playBack();
      }

      if (showDurationDropdown) {
        if (key === 'ArrowDown') setDurationDropdownIndex((p) => Math.min(p + 1, SLIDE_DURATION_OPTIONS.length - 1));
        else if (key === 'ArrowUp') setDurationDropdownIndex((p) => Math.max(p - 1, 0));
        else if (key === 'Enter' || key === ' ') {
          const val = SLIDE_DURATION_OPTIONS[durationDropdownIndex].value;
          setSlideDuration(val);
          setShowDurationDropdown(false);
          if (typeof window !== 'undefined') localStorage.setItem('slideshow_duration', val);
          onSlidesSettingsChange({ albumName: selectedAlbumName, duration: val, transition: transitionStyle });
        } else if (key === 'Escape' || key === 'b' || key === 'B') {
          setShowDurationDropdown(false);
        }
        return;
      }

      if (showTransitionDropdown) {
        if (key === 'ArrowDown') setTransitionDropdownIndex((p) => Math.min(p + 1, TRANSITION_OPTIONS.length - 1));
        else if (key === 'ArrowUp') setTransitionDropdownIndex((p) => Math.max(p - 1, 0));
        else if (key === 'Enter' || key === ' ') {
          const val = TRANSITION_OPTIONS[transitionDropdownIndex].value;
          setTransitionStyle(val);
          setShowTransitionDropdown(false);
          if (typeof window !== 'undefined') localStorage.setItem('slideshow_transition', val);
          onSlidesSettingsChange({ albumName: selectedAlbumName, duration: slideDuration, transition: val });
        } else if (key === 'Escape' || key === 'b' || key === 'B') {
          setShowTransitionDropdown(false);
        }
        return;
      }

      // ─── Main menu navigation ───
      if (currentView === 'main') {
        if (key === 'ArrowDown') {
          setMenuFocusIndex((p) => Math.min(p + 1, MAIN_MENU_ITEMS.length - 1));
        } else if (key === 'ArrowUp') {
          setMenuFocusIndex((p) => Math.max(p - 1, 0));
        } else if (key === 'Enter' || key === ' ') {
          const item = MAIN_MENU_ITEMS[menuFocusIndex];
          if (item.id === 'presentation') setCurrentView('presentation');
          else if (item.id === 'slides') setCurrentView('slides');
        } else if (key === 'Escape' || key === 'b' || key === 'B') {
          onClose();
        }
        return;
      }

      // ─── Presentation sub-view ───
      if (currentView === 'presentation') {
        if (key === 'ArrowDown') {
          setPresentationFocusIndex((p) => Math.min(p + 1, 1));
        } else if (key === 'ArrowUp') {
          setPresentationFocusIndex((p) => Math.max(p - 1, 0));
        } else if (key === 'Enter' || key === ' ') {
          if (presentationFocusIndex === 0) {
            onSettingsChange(!presentationEnabled, inactivityTime);
          } else {
            setShowInactivityDropdown(true);
            setInactivityDropdownIndex(INACTIVITY_OPTIONS.findIndex((o) => o.value === inactivityTime));
          }
        } else if (key === 'Escape' || key === 'b' || key === 'B') {
          setCurrentView('main');
        }
        return;
      }

      // ─── Slides sub-view ───
      if (currentView === 'slides') {
        if (key === 'ArrowDown') {
          setSlidesFocusIndex((p) => Math.min(p + 1, 2));
        } else if (key === 'ArrowUp') {
          setSlidesFocusIndex((p) => Math.max(p - 1, 0));
        } else if (key === 'Enter' || key === ' ') {
          if (slidesFocusIndex === 0) {
            onOpenAlbumPicker();
          } else if (slidesFocusIndex === 1) {
            setShowDurationDropdown(true);
            setDurationDropdownIndex(SLIDE_DURATION_OPTIONS.findIndex((o) => o.value === slideDuration));
          } else if (slidesFocusIndex === 2) {
            setShowTransitionDropdown(true);
            setTransitionDropdownIndex(TRANSITION_OPTIONS.findIndex((o) => o.value === transitionStyle));
          }
        } else if (key === 'Escape' || key === 'b' || key === 'B') {
          setCurrentView('main');
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    visible, currentView, menuFocusIndex, presentationFocusIndex, slidesFocusIndex,
    presentationEnabled, inactivityTime, slideDuration, transitionStyle, selectedAlbumName,
    showInactivityDropdown, showDurationDropdown, showTransitionDropdown,
    inactivityDropdownIndex, durationDropdownIndex, transitionDropdownIndex,
    onClose, onOpenAlbumPicker, onSlidesSettingsChange, INACTIVITY_OPTIONS, SLIDE_DURATION_OPTIONS, TRANSITION_OPTIONS, MAIN_MENU_ITEMS,
  ]);

  // ─── Helpers ────────────────────────────────────────────────
  const getInactivityLabel = () =>
    INACTIVITY_OPTIONS.find((o) => o.value === inactivityTime)?.label || inactivityTime;

  const getSlideDurationLabel = () =>
    SLIDE_DURATION_OPTIONS.find((o) => o.value === slideDuration)?.label || slideDuration;

  const getTransitionLabel = () =>
    TRANSITION_OPTIONS.find((o) => o.value === transitionStyle)?.label || transitionStyle;

  // ─── Toggle component ──────────────────────────────────────
  const Toggle = ({ value, onToggle }: { value: boolean; onToggle: () => void }) => (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7} style={[styles.toggle, value && styles.toggleOn]}>
      <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
    </TouchableOpacity>
  );

  // ─── Dropdown component ────────────────────────────────────
  const Dropdown = ({
    options,
    selectedIndex,
    onSelect,
    visible: dropdownVisible,
  }: {
    options: { label: string; value: string }[];
    selectedIndex: number;
    onSelect: (value: string) => void;
    visible: boolean;
  }) => {
    if (!dropdownVisible) return null;
    return (
      <View style={styles.dropdown}>
        {options.map((opt, idx) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.dropdownItem, idx === selectedIndex && styles.dropdownItemFocused]}
            onPress={() => onSelect(opt.value)}
            activeOpacity={0.7}
          >
            {idx === selectedIndex && <SpinningBorderSearch size={180} spread={0} borderRadius={4} />}
            {idx === selectedIndex && (
              <Ionicons name="checkmark" size={18} color="#FFF" style={styles.dropdownCheck} />
            )}
            <Text style={[styles.dropdownText, idx === selectedIndex && styles.dropdownTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // ─── Render: Main menu ─────────────────────────────────────
  const renderMainMenu = () => (
    <>
      <Text style={styles.viewTitle}>{t('welcome.config.title')}</Text>
      <View style={styles.menuContainer}>
        {MAIN_MENU_ITEMS.map((item, idx) => {
          const isFocused = menuFocusIndex === idx;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.menuItem, isFocused && styles.menuItemFocused]}
              activeOpacity={0.8}
              onPress={() => {
                setMenuFocusIndex(idx);
                if (item.id === 'presentation') setCurrentView('presentation');
                else if (item.id === 'slides') setCurrentView('slides');
              }}
            >
              {isFocused && <SpinningBorderSearch size={180} spread={4} borderRadius={0} />}
              <Text style={styles.menuItemTitle}>{item.title}</Text>
              {isFocused && <Text style={styles.menuItemDescription}>{item.description}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );

  // ─── Render: Presentation sub-view ─────────────────────────
  const renderPresentationView = () => (
    <>
      <Text style={styles.viewTitle}>{t('welcome.config.presentationTitle')}</Text>
      <View style={styles.menuContainer}>
        {/* Activar */}
        <TouchableOpacity
          style={[styles.menuItem, presentationFocusIndex === 0 && styles.menuItemFocused]}
          activeOpacity={0.8}
          onPress={() => onSettingsChange(!presentationEnabled, inactivityTime)}
        >
          {presentationFocusIndex === 0 && <SpinningBorderSearch size={180} spread={4} borderRadius={0} />}
          <View style={styles.menuItemRow}>
            <Text style={styles.menuItemTitle}>{t('welcome.config.activateTitle')}</Text>
            <Toggle value={presentationEnabled} onToggle={() => onSettingsChange(!presentationEnabled, inactivityTime)} />
          </View>
          {presentationFocusIndex === 0 && (
            <Text style={styles.menuItemDescription}>
              {t('welcome.config.presentationDesc')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Iniciar tras inactividad */}
        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            style={[styles.menuItem, presentationFocusIndex === 1 && styles.menuItemFocused]}
            activeOpacity={0.8}
            onPress={() => {
              setShowInactivityDropdown(true);
              setInactivityDropdownIndex(INACTIVITY_OPTIONS.findIndex((o) => o.value === inactivityTime));
            }}
          >
            {presentationFocusIndex === 1 && <SpinningBorderSearch size={180} spread={4} borderRadius={0} />}
            <Text style={styles.menuItemTitle}>{t('welcome.config.inactivityTitle')}</Text>
            <Text style={styles.menuItemValue}>{getInactivityLabel()}</Text>
          </TouchableOpacity>
          <Dropdown
            options={INACTIVITY_OPTIONS}
            selectedIndex={inactivityDropdownIndex}
            visible={showInactivityDropdown}
            onSelect={(val) => {
              onSettingsChange(presentationEnabled, val);
              setShowInactivityDropdown(false);
            }}
          />
        </View>
      </View>
    </>
  );

  // ─── Render: Slides sub-view ───────────────────────────────
  const renderSlidesView = () => (
    <>
      <Text style={styles.viewTitle}>{t('welcome.config.slidesTitle')}</Text>
      <View style={styles.menuContainer}>
        {/* Álbum seleccionado */}
        <TouchableOpacity
          style={[styles.menuItem, slidesFocusIndex === 0 && styles.menuItemFocused]}
          activeOpacity={0.8}
          onPress={() => {
            onOpenAlbumPicker();
          }}
        >
          {slidesFocusIndex === 0 && <SpinningBorderSearch size={180} spread={4} borderRadius={0} />}
          <View style={styles.menuItemRow}>
            <Text style={styles.menuItemTitle}>{t('welcome.config.album')}</Text>
            <Text style={styles.menuItemValue}>
              {selectedAlbumName || t('welcome.config.noAlbum')}
            </Text>
          </View>
          {slidesFocusIndex === 0 && (
            <Text style={styles.menuItemDescription}>
              {t('welcome.config.albumDesc')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Duración de diapositiva */}
        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            style={[styles.menuItem, slidesFocusIndex === 1 && styles.menuItemFocused]}
            activeOpacity={0.8}
            onPress={() => {
              setShowDurationDropdown(true);
              setDurationDropdownIndex(SLIDE_DURATION_OPTIONS.findIndex((o) => o.value === slideDuration));
            }}
          >
            {slidesFocusIndex === 1 && <SpinningBorderSearch size={180} spread={4} borderRadius={0} />}
            <Text style={styles.menuItemTitle}>{t('welcome.config.durationTitle')}</Text>
            <Text style={styles.menuItemValue}>{getSlideDurationLabel()}</Text>
          </TouchableOpacity>
          <Dropdown
            options={SLIDE_DURATION_OPTIONS}
            selectedIndex={durationDropdownIndex}
            visible={showDurationDropdown}
            onSelect={(val) => {
              setSlideDuration(val);
              setShowDurationDropdown(false);
              if (typeof window !== 'undefined') localStorage.setItem('slideshow_duration', val);
              onSlidesSettingsChange({ albumName: selectedAlbumName, duration: val, transition: transitionStyle });
            }}
          />
        </View>

        {/* Estilo de transición */}
        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            style={[styles.menuItem, slidesFocusIndex === 2 && styles.menuItemFocused]}
            activeOpacity={0.8}
            onPress={() => {
              setShowTransitionDropdown(true);
              setTransitionDropdownIndex(TRANSITION_OPTIONS.findIndex((o) => o.value === transitionStyle));
            }}
          >
            {slidesFocusIndex === 2 && <SpinningBorderSearch size={180} spread={4} borderRadius={0} />}
            <Text style={styles.menuItemTitle}>{t('welcome.config.transitionTitle')}</Text>
            <Text style={styles.menuItemValue}>{getTransitionLabel()}</Text>
          </TouchableOpacity>
          <Dropdown
            options={TRANSITION_OPTIONS}
            selectedIndex={transitionDropdownIndex}
            visible={showTransitionDropdown}
            onSelect={(val) => {
              setTransitionStyle(val);
              setShowTransitionDropdown(false);
              if (typeof window !== 'undefined') localStorage.setItem('slideshow_transition', val);
              onSlidesSettingsChange({ albumName: selectedAlbumName, duration: slideDuration, transition: val });
            }}
          />
        </View>
      </View>
    </>
  );

  // ─── Main render ───────────────────────────────────────────
  return (
    <Modal
      visible={visible && !isAlbumPickerOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <Animated.View style={[styles.root, isAlbumPickerOpen && { backgroundColor: 'transparent' }]} entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)}>
        {!isAlbumPickerOpen && <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />}
        <View style={styles.content}>
          {currentView === 'main' && renderMainMenu()}
          {currentView === 'presentation' && renderPresentationView()}
          {currentView === 'slides' && renderSlidesView()}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(7, 8, 12, 0.5)',
  },
  content: {
    flex: 1,
    paddingTop: 60,
    paddingLeft: 50,
    paddingRight: 80,
  },
  viewTitle: {
    color: '#FFF',
    fontSize: 32,
    fontFamily: 'SSTLight',
    marginBottom: 50,
    letterSpacing: 0.5,
  },
  menuContainer: {
    gap: 0,
    marginLeft: 100,
    marginRight: 100,
  },
  menuItem: {
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  menuItemFocused: {
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0)',
    borderBottomColor: 'transparent',
  },
  menuItemTitle: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'SSTLight',
  },
  menuItemDescription: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 15,
    fontFamily: 'SSTLight',
    marginTop: 8,
    width: '100%',
    lineHeight: 20,
  },
  menuItemValue: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 18,
    fontFamily: 'SSTLight',
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#424242ff',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: 'rgba(122, 122, 122, 0.8)',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3a3a3aff',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignSelf: 'flex-start',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 1)',
  },
  dropdown: {
    position: 'absolute',
    right: 16,
    top: '100%',
    backgroundColor: 'rgba(22, 24, 26, 0.95)',
    borderRadius: 4,
    minWidth: 220,
    zIndex: 10,
    borderWidth: 1,
    //borderColor: 'rgba(255, 255, 255, 0.15)',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      } as any,
      default: {
        elevation: 8,
      },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownItemFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0)',
  },
  dropdownCheck: {
    marginRight: 10,
  },
  dropdownText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 17,
    fontFamily: 'SSTLight',
  },
  dropdownTextSelected: {
    color: '#FFF',
  },
});
