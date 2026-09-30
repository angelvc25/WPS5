import React, { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ACCENTS } from '@/constants/themes';
import { soundService } from '@/services/soundService';
import AudioPackBrowser from './AudioPackBrowser';

type ScaleFn = (px: number) => number;

export default function ThemeSettingsView({
  focused,
  subFocusIndex,
}: {
  focused: boolean;
  subFocusIndex: number;
}) {
  const { t } = useTranslation();
  const { accent, accentId, setAccent } = useTheme();
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

  // Orden de navegación con mando: 0=acentos, 1=packs DeckThemes.
  // La sección 1 gestiona su propio teclado/mando en capture (ver AudioPackBrowser).
  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {/* Acentos */}
      <View style={[styles.section, focused && subFocusIndex === 0 && styles.sectionFocused]}>
        <Text style={styles.sectionTitle}>{t('settings.accent')}</Text>
        <Text style={styles.sectionDesc}>{t('settings.accentDesc')}</Text>
        <Text style={styles.affectsNote}>{t('settings.accentAffects')}</Text>
        {/* Preview del acento activo */}
        <View style={[styles.previewBar, { backgroundColor: accent.soft, borderColor: accent.color }]}>
          <View style={[styles.previewDot, { backgroundColor: accent.color }]} />
          <Text style={styles.previewLabel}>{accent.label}</Text>
          <View style={[styles.previewRing, { borderColor: accent.color }]} />
        </View>
        <View style={styles.accentGrid}>
          {ACCENTS.map((a) => {
            const selected = a.id === accentId;
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.accentBtn, { borderColor: selected ? a.color : 'rgba(255,255,255,0.15)' }]}
                onPress={() => {
                  setAccent(a.id);
                  soundService.playActivation?.().catch(() => {});
                }}
                {...(Platform.OS === 'web' ? { onMouseEnter: () => soundService.playNavigation?.().catch(() => {}) } : {}) as any}
              >
                <View style={[styles.accentDot, { backgroundColor: a.color }]} />
                <Text style={[styles.accentLabel, selected && styles.accentLabelSelected]} numberOfLines={1}>
                  {a.label}
                </Text>
                {selected && <Ionicons name="checkmark-circle" size={s(18)} color={a.color} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Packs de DeckThemes: efectos + música ambiente */}
      <View style={[styles.section, focused && subFocusIndex === 1 && styles.sectionFocused]}>
        <Text style={styles.sectionTitle}>{t('settings.audioPacks')}</Text>
        <Text style={styles.sectionDesc}>{t('settings.audioPacksDesc')}</Text>
        <AudioPackBrowser active={focused && subFocusIndex === 1} />
      </View>
    </ScrollView>
  );
}

function createStyles(s: ScaleFn) {
  return StyleSheet.create({
    body: { paddingBottom: s(40), gap: s(24) },
    section: {
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderRadius: s(8),
      padding: s(20),
      borderWidth: 2,
      borderColor: 'transparent',
    },
    sectionFocused: { borderColor: 'rgba(255,255,255,0.35)' },
    sectionTitle: { color: '#FFF', fontSize: s(20), fontFamily: 'SSTMedium', marginBottom: s(4) },
    sectionDesc: { color: 'rgba(255,255,255,0.55)', fontSize: s(14), fontFamily: 'SSTLight', marginBottom: s(8) },
    affectsNote: { color: 'rgba(255,255,255,0.4)', fontSize: s(12), fontFamily: 'SSTLight', marginBottom: s(12), fontStyle: 'italic' },
    previewBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(10),
      borderWidth: 2,
      borderRadius: s(8),
      paddingHorizontal: s(12),
      paddingVertical: s(10),
      marginBottom: s(14),
    },
    previewDot: { width: s(20), height: s(20), borderRadius: s(10) },
    previewLabel: { color: '#FFF', fontSize: s(14), fontFamily: 'SSTMedium', flex: 1 },
    previewRing: { width: s(34), height: s(34), borderRadius: s(17), borderWidth: 3 },
    accentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: s(10) },
    accentBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(8),
      paddingHorizontal: s(12),
      paddingVertical: s(10),
      borderRadius: s(20),
      borderWidth: 2,
      backgroundColor: 'rgba(255,255,255,0.06)',
      minWidth: s(150),
    },
    accentDot: { width: s(18), height: s(18), borderRadius: s(9) },
    accentLabel: { color: 'rgba(255,255,255,0.7)', fontSize: s(13), fontFamily: 'SSTMedium', flex: 1 },
    accentLabelSelected: { color: '#FFF' },
  });
}
