import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserProfile } from './UserSelectScreen';

// ─── Shimmer que barre todo el menú (igual que en GameContextMenu) ────────────
function ShimmerOverlay() {
  if (Platform.OS !== 'web') return null;

  return (
    <>
      <style>{`
        @keyframes wc-profile-shimmer {
          0% {
            transform: translate(-160%, -50%) rotate(-48deg);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          70% {
            transform: translate(130%, -50%) rotate(48deg);
            opacity: 0;
          }
          100% {
            transform: translate(130%, -50%) rotate(48deg);
            opacity: 0;
          }
        }

        .wc-profile-shimmer-line {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 140%;
          height: 420%;
          background: linear-gradient(
            to right,
            transparent 0%,
            rgba(255, 255, 255, 0.01) 20%,
            rgba(255, 255, 255, 0.12) 50%,
            rgba(255, 255, 255, 0.01) 80%,
            transparent 100%
          );
          animation: wc-profile-shimmer 6s cubic-bezier(0.42, 0, 0.58, 1) infinite;
          pointer-events: none;
          z-index: 20;
        }
      `}</style>
      <div className="wc-profile-shimmer-line" />
    </>
  );
}

interface ProfileDropdownMenuProps {
  focusedIndex: number;
  onPressItem: (index: number) => void;
  activeUser: UserProfile | null;
  isOnline: boolean;
}

export default function ProfileDropdownMenu({
  focusedIndex,
  onPressItem,
  activeUser,
  isOnline,
}: ProfileDropdownMenuProps) {
  const options = [
    {
      label: 'Estado online',
      icon: 'person-outline' as const,
      rightComponent: (
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? '#4CD964' : '#8E8E93' }]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Invisible'}</Text>
        </View>
      ),
    },
    {
      label: 'Perfil',
      icon: 'happy-outline' as const,
    },
    {
      label: 'Trofeos',
      icon: 'trophy-outline' as const,
      rightComponent: (
        <View style={styles.trophyBadge}>
          <Ionicons name="trophy" size={10} color="#FFF" style={{ marginRight: 3 }} />
          <Text style={styles.trophyBadgeText}>128</Text>
        </View>
      ),
    },
    {
      label: 'Cambiar usuario',
      icon: 'people-outline' as const,
    },
    {
      label: 'Salir',
      icon: 'log-out-outline' as const,
    },
  ];

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(
                45deg,
                rgba(232, 249, 255, 0.08) 0%,
                rgba(120,220,255,0.03) 25%,
                rgba(255,255,255,0.01) 50%,
                rgba(0,0,0,0.00) 100%
              )
            `,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* SHIMMER OVERLAY */}
      <ShimmerOverlay />

      {/* USER HEADER */}
      <View style={styles.header}>
        <Text style={styles.usernameText} numberOfLines={1}>
          {activeUser?.name || 'Invitado'}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* OPTIONS LIST */}
      <View style={styles.optionsList}>
        {options.map((opt, idx) => {
          const isFocused = idx === focusedIndex;

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.8}
              onPress={() => onPressItem(idx)}
              style={[
                styles.item,
                isFocused && styles.itemFocused,
              ]}
            >
              {/* Glow focus border/background */}
              {isFocused && (
                <View style={styles.focusGlow} pointerEvents="none" />
              )}

              <View style={styles.itemLeft}>
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={isFocused ? '#e8ffff' : '#cacaca'}
                  style={{ marginRight: 12 }}
                />
                <Text
                  style={[
                    styles.label,
                    isFocused && styles.labelFocused,
                  ]}
                >
                  {opt.label}
                </Text>
              </View>

              {opt.rightComponent && (
                <View style={styles.itemRight}>
                  {opt.rightComponent}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 320,
    backgroundColor: 'rgba(23, 23, 30, 0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    position: 'relative',
    padding: 6,

    // Sombra premium
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  usernameText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 8,
    marginBottom: 4,
  },
  optionsList: {
    paddingVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 1,
    height: 48,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  itemFocused: {
    backgroundColor: 'rgba(120,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(120,255,255,0.3)',
  },
  focusGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(180,255,255,0.45)',
    backgroundColor: 'rgba(180,255,255,0.02)',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    color: '#cacacaff',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  labelFocused: {
    color: '#e8ffff',
    fontWeight: '600',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  trophyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  trophyBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
