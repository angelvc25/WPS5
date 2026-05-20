import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Platform, TextInput, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { ConsoleItem } from '../app/(tabs)/index';
import YoutubePlayer from './YoutubePlayer';
import ControlPrompt from './ControlPrompt';

interface GameDetailViewProps {
  isVisible: boolean;
  item: ConsoleItem | null;
  onClose: () => void;
  onLaunch?: (id: string, path: string) => void;
  onRefresh?: () => void;
  isLaunching?: boolean;
  inputMode: 'keyboard' | 'gamepad';
}

const GameDetailView: React.FC<GameDetailViewProps> = ({ isVisible, item, onClose, onLaunch, onRefresh, isLaunching, inputMode }) => {
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [editData, setEditData] = useState<Partial<ConsoleItem>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0); // 0: Inicio, 1: Editar, 2: Favorito
  const [editModalFocusIndex, setEditModalFocusIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'basic' | 'path' | 'art'>('basic');

  const { width } = useWindowDimensions();
  const isSmallScreen = width < 1100; // Handheld PC threshold

  const editTitleRef = React.useRef<TextInput>(null);
  const editDescRef = React.useRef<TextInput>(null);
  const editPathInputRef = React.useRef<TextInput>(null);


  useEffect(() => {
    if (item) {
      setFocusIndex(0); // Reset focus when opening
      const initialData: any = {
        id: item.id,
        title: item.title,
        description: item.description,
        rating: item.rating,
        image: item.image?.uri?.startsWith('local-file://') ? item.image.uri.replace('local-file://', '') : (item.image?.uri?.startsWith('http') ? item.image.uri : undefined),
        logo: item.logo?.uri?.startsWith('local-file://') ? item.logo.uri.replace('local-file://', '') : (item.logo?.uri?.startsWith('http') ? item.logo.uri : undefined),
        backgroundImage: item.backgroundImage?.uri?.startsWith('local-file://') ? item.backgroundImage.uri.replace('local-file://', '') : (item.backgroundImage?.uri?.startsWith('http') ? item.backgroundImage.uri : undefined),
        video: item.video?.uri?.startsWith('local-file://') ? item.video.uri.replace('local-file://', '') : (item.video?.uri?.startsWith('http') ? item.video.uri : undefined),
        youtubeId: item.youtubeId,
        platform: item.platform,
        path: item.path,
        type: item.type,
      };

      setEditData(initialData);
    }
  }, [item, isVisible]);

  useEffect(() => {
    if (isEditModalVisible) {
      setEditModalFocusIndex(20);
      setActiveTab('basic');
    }
  }, [isEditModalVisible]);

  useEffect(() => {
    if (isEditModalVisible) {
      if (editModalFocusIndex === 20) setActiveTab('basic');
      else if (editModalFocusIndex === 21) setActiveTab('path');
      else if (editModalFocusIndex === 22) setActiveTab('art');
    }
  }, [editModalFocusIndex, isEditModalVisible]);

  // Keyboard navigation within Detail View
  useEffect(() => {
    if (isVisible && !isLaunching) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
        }

        if (isEditModalVisible) {
          const isGame = (editData.type || item?.type) !== 'media' && (editData.type || item?.type) !== 'web';
          
          if (e.key === 'ArrowDown') {
            if (editModalFocusIndex === 20) setEditModalFocusIndex(21);
            else if (editModalFocusIndex === 21) setEditModalFocusIndex(22);
            else if (editModalFocusIndex === 22) {} // Tab end
            
            // Tab 1: basic
            else if (editModalFocusIndex === 2) setEditModalFocusIndex(isGame ? 3 : 10);
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) setEditModalFocusIndex(10);
            else if (editModalFocusIndex === 10) setEditModalFocusIndex(16); // to Cancel
            
            // Tab 2: path
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(16); // to Cancel
            
            // Tab 3: art
            else if (editModalFocusIndex === 0) setEditModalFocusIndex(11);
            else if (editModalFocusIndex === 1) setEditModalFocusIndex(12);
            else if (editModalFocusIndex === 11) setEditModalFocusIndex(13);
            else if (editModalFocusIndex === 12) setEditModalFocusIndex(14);
            else if (editModalFocusIndex === 13) setEditModalFocusIndex(16); // to Cancel
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(17); // to Save
            
            // Actions
            else if (editModalFocusIndex >= 15 && editModalFocusIndex <= 17) {}
          } 
          
          else if (e.key === 'ArrowUp') {
            if (editModalFocusIndex === 22) setEditModalFocusIndex(21);
            else if (editModalFocusIndex === 21) setEditModalFocusIndex(20);
            else if (editModalFocusIndex === 20) {} // Tab start
            
            // Tab 1: basic
            else if (editModalFocusIndex === 2) setEditModalFocusIndex(20); // Back to sidebar basic tab
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) setEditModalFocusIndex(2);
            else if (editModalFocusIndex === 10) setEditModalFocusIndex(isGame ? 3 : 2);
            
            // Tab 2: path
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(21); // Back to sidebar path tab
            
            // Tab 3: art
            else if (editModalFocusIndex === 0 || editModalFocusIndex === 1) setEditModalFocusIndex(22); // Back to sidebar art tab
            else if (editModalFocusIndex === 11) setEditModalFocusIndex(0);
            else if (editModalFocusIndex === 12) setEditModalFocusIndex(1);
            else if (editModalFocusIndex === 13) setEditModalFocusIndex(11);
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(12);
            
            // Actions
            else if (editModalFocusIndex >= 15 && editModalFocusIndex <= 17) {
              if (activeTab === 'basic') setEditModalFocusIndex(10);
              else if (activeTab === 'path') setEditModalFocusIndex(18);
              else if (activeTab === 'art') setEditModalFocusIndex(editModalFocusIndex === 17 ? 14 : 13);
            }
          } 
          
          else if (e.key === 'ArrowRight') {
            // From tabs to content area
            if (editModalFocusIndex === 20) setEditModalFocusIndex(2); // Basic -> Title
            else if (editModalFocusIndex === 21) setEditModalFocusIndex(18); // Path -> Path selection
            else if (editModalFocusIndex === 22) setEditModalFocusIndex(0); // Art -> IGDB sync
            
            // Within content elements
            else if (editModalFocusIndex >= 3 && editModalFocusIndex < 9) setEditModalFocusIndex(prev => prev + 1);
            else if (editModalFocusIndex === 0) setEditModalFocusIndex(1);
            else if (editModalFocusIndex === 11) setEditModalFocusIndex(12);
            else if (editModalFocusIndex === 13) setEditModalFocusIndex(14);
            
            // Actions
            else if (editModalFocusIndex >= 15 && editModalFocusIndex < 17) setEditModalFocusIndex(prev => prev + 1);
          } 
          
          else if (e.key === 'ArrowLeft') {
            // From content area to tabs sidebar
            if (editModalFocusIndex === 2) setEditModalFocusIndex(20);
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) setEditModalFocusIndex(20);
            else if (editModalFocusIndex === 10) setEditModalFocusIndex(20);
            
            else if (editModalFocusIndex === 18) setEditModalFocusIndex(21);
            
            else if (editModalFocusIndex === 0 || editModalFocusIndex === 1) setEditModalFocusIndex(22);
            else if (editModalFocusIndex === 11 || editModalFocusIndex === 13) setEditModalFocusIndex(22);
            else if (editModalFocusIndex === 12) setEditModalFocusIndex(11);
            else if (editModalFocusIndex === 14) setEditModalFocusIndex(13);
            
            // Actions
            else if (editModalFocusIndex > 15 && editModalFocusIndex <= 17) setEditModalFocusIndex(prev => prev - 1);
          } 
          
          else if (e.key === 'Enter') {
            if (editModalFocusIndex === 20) setActiveTab('basic');
            else if (editModalFocusIndex === 21) setActiveTab('path');
            else if (editModalFocusIndex === 22) setActiveTab('art');
            else if (editModalFocusIndex === 0) handleSyncIGDB();
            else if (editModalFocusIndex === 1) handleSyncSteamGrid();
            else if (editModalFocusIndex === 2) editTitleRef.current?.focus();
            else if (editModalFocusIndex === 18) {
              if ((editData.type || item?.type) === 'web') editPathInputRef.current?.focus();
              else handleSelectPath();
            }
            else if (editModalFocusIndex >= 3 && editModalFocusIndex <= 9) {
               const platforms = ['PC', 'PS5', 'Xbox', 'Switch', 'Steam', 'EA', 'Epic'];
               setEditData({ ...editData, platform: platforms[editModalFocusIndex - 3] });
            }
            else if (editModalFocusIndex === 10) editDescRef.current?.focus();
            else if (editModalFocusIndex === 11) handleSelectImage('image');
            else if (editModalFocusIndex === 12) handleSelectImage('logo');
            else if (editModalFocusIndex === 13) handleSelectImage('backgroundImage');
            else if (editModalFocusIndex === 14) handleSelectVideo();
            else if (editModalFocusIndex === 15) handleDeleteApp();
            else if (editModalFocusIndex === 16) setEditModalVisible(false);
            else if (editModalFocusIndex === 17) handleSaveEdit();
          } 
          
          else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
            setEditModalVisible(false);
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          setFocusIndex((prev) => Math.min(prev + 1, 2));
        } else if (e.key === 'ArrowLeft') {
          setFocusIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          if (focusIndex === 0) {
            // Launch app
            if (item?.path) {
              if (onLaunch) onLaunch(item.id, item.path);
              else if ((window as any).electronAPI) (window as any).electronAPI.launchApp(item.id, item.path);
            }
          } else if (focusIndex === 1) {
            setEditModalVisible(true);
          } else if (focusIndex === 2) {
            handleToggleFavorite();
          }
        } else if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, isEditModalVisible, focusIndex, editModalFocusIndex, item, onLaunch, onClose, editData]);

  if (!item) return null;

  const handleSelectPath = async () => {
    if ((window as any).electronAPI) {
      const p = await (window as any).electronAPI.selectFile();
      if (p) setEditData({ ...editData, path: p });
    }
  };

  const handleSelectImage = async (field: 'image' | 'backgroundImage' | 'logo') => {
    if ((window as any).electronAPI) {
      const img = await (window as any).electronAPI.selectImage();
      if (img) setEditData({ ...editData, [field]: img });
    }
  };

  const handleSelectVideo = async () => {
    if ((window as any).electronAPI) {
      const vid = await (window as any).electronAPI.selectVideo();
      if (vid) setEditData({ ...editData, video: vid });
    }
  };

  const handleSaveEdit = async () => {
    if ((window as any).electronAPI && editData.id) {
      // Limpiamos los campos vacíos o undefined para no sobrescribir con valores nulos en la DB
      const cleanData = Object.fromEntries(
        Object.entries(editData).filter(([_, v]) => v !== '' && v !== null && v !== undefined)
      );

      const result = await (window as any).electronAPI.updateApp(cleanData);
      if (result.success) {
        setEditModalVisible(false);
        if (onRefresh) onRefresh();
      } else {
        alert('Error al actualizar: ' + result.error);
      }
    }
  };

  const handleSyncIGDB = async () => {
    if ((window as any).electronAPI && editData.title) {
      setIsSyncing(true);
      const result = await (window as any).electronAPI.fetchGameData(editData.title);
      setIsSyncing(false);
      
      if (result.success) {
        const game = result.data;
        const newEditData: any = {
          ...editData,
          rating: game.rating ? game.rating / 20 : (game.aggregated_rating ? game.aggregated_rating / 20 : 5.0),
          description: game.summary || editData.description,
          youtubeId: game.videos && game.videos.length > 0 ? game.videos[0].video_id : editData.youtubeId
        };

        // Si IGDB devuelve una carátula, la usamos (convertimos a alta resolución)
        if (game.cover && game.cover.url) {
          const coverUrl = 'https:' + game.cover.url.replace('t_thumb', 't_cover_big');
          newEditData.image = coverUrl;
        }

        // Si IGDB devuelve capturas o arte, usamos la primera como fondo (1080p)
        if (game.screenshots && game.screenshots.length > 0) {
          newEditData.backgroundImage = 'https:' + game.screenshots[0].url.replace('t_thumb', 't_1080p');
        } else if (game.artworks && game.artworks.length > 0) {
          newEditData.backgroundImage = 'https:' + game.artworks[0].url.replace('t_thumb', 't_1080p');
        }

        setEditData(newEditData);

      } else {

        alert('No se encontró información en IGDB. Revisa el nombre del juego.');
      }
    }
  };


  const handleToggleFavorite = async () => {
    console.log('Toggling favorite for:', item.id);
    if ((window as any).electronAPI && item.id) {
      const newStatus = !item.isFavorite;
      const result = await (window as any).electronAPI.updateApp({ id: item.id, isFavorite: newStatus });
      console.log('Update result:', result);
      if (result.success) {
        if (onRefresh) onRefresh();
      } else {
        alert('No se pudo marcar como favorito: ' + result.error);
      }
    } else {
      console.log('Missing electronAPI or item.id');
    }
  };

  const handleDeleteApp = async () => {
    if ((window as any).electronAPI && item.id) {
      const confirmed = window.confirm(`¿Estás seguro de que quieres eliminar "${item.title}"? Esta acción no se puede deshacer.`);
      if (confirmed) {
        const result = await (window as any).electronAPI.deleteApp(item.id);
        if (result.success) {
          onClose();
          if (onRefresh) onRefresh();
        } else {
          alert('Error al eliminar: ' + result.error);
        }
      }
    }
  };


  const handleSyncSteamGrid = async () => {
    if ((window as any).electronAPI && editData.title) {
      setIsSyncing(true);
      const result = await (window as any).electronAPI.fetchSteamGridData(editData.title);
      setIsSyncing(false);
      
      if (result.success) {
        const assets = result.data;
        setEditData({
          ...editData,
          image: assets.grid || editData.image,
          backgroundImage: assets.hero || editData.backgroundImage,
          logo: assets.logo || editData.logo
        });
      } else {
        alert('SteamGridDB: ' + result.error);
      }
    }
  };


  return (
    <Modal visible={isVisible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <View style={styles.detailContainer}>
        {/* FULLSCREEN BACKGROUND */}
        {(editData.backgroundImage || item.backgroundImage) ? (
          <Image 
            source={editData.backgroundImage ? (editData.backgroundImage.startsWith('http') ? { uri: editData.backgroundImage } : { uri: `local-file:///${editData.backgroundImage}` }) : item.backgroundImage} 
            style={styles.detailBg} 
          />
        ) : (
          (editData.image || item.image) && (
            <Image 
              source={editData.image ? (editData.image.startsWith('http') ? { uri: editData.image } : { uri: `local-file:///${editData.image}` }) : item.image} 
              style={styles.detailBg} 
            />
          )
        )}

        <View style={styles.detailOverlay}>
          {/* NAVIGATION BUTTONS */}
          <TouchableOpacity 
            style={styles.detailBack} 
            onPress={onClose}
            accessible={false}
          >
            <ControlPrompt btn="Back" label="" inputMode={inputMode} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.favoriteButton, 
              item.isFavorite && styles.favoriteButtonActive,
              focusIndex === 2 && styles.buttonFocused,
              isSmallScreen && { right: '43%' }
            ]}
            onPress={() => {
              setFocusIndex(2);
              handleToggleFavorite();
            }}
          >
            <Ionicons name={item.isFavorite ? "heart" : "heart-outline"} size={26} color={item.isFavorite ? "#FF2D55" : "#FFF"} />
          </TouchableOpacity>

          <View style={styles.detailContent}>
            {!isSmallScreen && (
              <View style={styles.detailLeft}>
                {(editData.logo || item.logo) ? (
                  <Image 
                    source={editData.logo ? (editData.logo.startsWith('http') ? { uri: editData.logo } : { uri: `local-file:///${editData.logo}` }) : item.logo} 
                    style={styles.detailLogo} 
                  />
                ) : (
                  (editData.image || item.image) && (
                    <Image 
                      source={editData.image ? (editData.image.startsWith('http') ? { uri: editData.image } : { uri: `local-file:///${editData.image}` }) : item.image} 
                      style={styles.detailCover} 
                    />
                  )
                )}
              </View>
            )}

            {/* RIGHT: BLURRED INFO PANEL */}
            <View style={styles.detailRight}>
              <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
              
              <View style={styles.infoPanel}>
                {(editData.logo || item.logo) ? (
  <Image 
    source={editData.logo ? (editData.logo.startsWith('http') ? { uri: editData.logo } : { uri: `local-file:///${editData.logo}` }) : item.logo} 
    style={[styles.detailLogo, { width: '100%', height: 120, marginBottom: 20 }]} 
  />
) : (
  <Text style={styles.detailTitle} numberOfLines={2}>{item.title}</Text>
)}

{(item.platform) && (() => {
  const platformIcons: Record<string, string> = {
    'PC': 'microsoft-windows',
    'PS5': 'sony-playstation',
    'Xbox': 'microsoft-xbox',
    'Switch': 'nintendo-switch',
    'Steam': 'steam',
    'EA': 'alpha-e-box',
    'Epic': 'alpha-e-circle',
  };
  const iconName = item.platform ? platformIcons[item.platform] : undefined;
  return (
    <View style={styles.platformBadge}>
      {iconName && <MaterialCommunityIcons name={iconName as any} size={14} color="#00FFFF" style={{ marginRight: 6 }} />}
      <Text style={styles.platformText}>{item.platform}</Text>
    </View>
  );
})()}
                
                <View style={styles.ratingContainer}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons 
                      key={s} 
                      name={s <= (item.rating ?? 5) ? "star" : "star-outline"} 
                      size={18} 
                      color="#FFD700" 
                      style={{ marginRight: 4 }}
                    />
                  ))}
                  <Text style={styles.ratingText}>{item.rating?.toFixed(1) ?? '5.0'}</Text>
                </View>

                <View style={styles.detailActions}>
                  <TouchableOpacity
                    style={[
                      styles.playButton, 
                      focusIndex === 0 && styles.buttonFocused
                    ]}
                    onPress={() => {
                      setFocusIndex(0);
                      if (item.path) {
                        if (onLaunch) {
                          onLaunch(item.id, item.path);
                        } else if (Platform.OS === 'web' && (window as any).electronAPI) {
                          (window as any).electronAPI.launchApp(item.id, item.path);
                        }
                      }
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="play" size={24} color="#FFF" />
                      <Text style={[styles.playButtonText, { marginLeft: 10 }]}>JUGAR</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.optionsButton, 
                      focusIndex === 1 && styles.buttonFocused
                    ]}
                    onPress={() => {
                      setFocusIndex(1);
                      setEditModalVisible(true);
                    }}
                  >
                    <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>

                <ScrollView 
                  style={styles.detailScrollView} 
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                >
                  <Text style={styles.detailDescription}>
                    {item.description ?? 'Disfruta de esta increíble experiencia de juego en tu WConsole.'}
                  </Text>

                  <View style={styles.mediaContainer}>
                    {item.youtubeId ? (
                      <YoutubePlayer
                        height={200}
                        play={isVisible}
                        videoId={item.youtubeId}
                      />
                    ) : item.video ? (
                      <View style={styles.videoWrapper}>
                        <video
                          key={item.video.uri}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="auto"
                        >
                          <source src={item.video.uri} />
                        </video>
                      </View>
                    ) : (
                      item.image && <Image source={item.image} style={styles.detailScreenshot} />
                    )}
                  </View>
                </ScrollView>
              </View>
            </View>
          </View>
        </View>


        {isLaunching && (
          <BlurView intensity={90} tint="dark" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
            <View style={styles.launchingOverlay}>
              <MaterialCommunityIcons name="controller-classic" size={100} color="#00FFFF" />
              <Text style={styles.launchingText}>Ejecutándose...</Text>
            </View>
          </BlurView>
        )}
      </View>

      {/* EDIT MODAL */}
      <Modal visible={isEditModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.modalContentExpanded]}>
            <View style={styles.modalBodyRow}>
              {/* SIDEBAR TABS */}
              <View style={styles.sidebar}>
                <Text style={styles.sidebarTitle}>Ajustes</Text>
                
                {[
                  { id: 'basic', label: 'Datos Básicos', icon: 'information-circle-outline', index: 20 },
                  { id: 'path', label: 'Ruta del Juego', icon: 'folder-open-outline', index: 21 },
                  { id: 'art', label: 'Arte y Multimedia', icon: 'image-outline', index: 22 },
                ].map((tab) => {
                  const isTabActive = activeTab === tab.id;
                  const isTabFocused = editModalFocusIndex === tab.index;
                  
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.tabButton,
                        isTabActive && styles.tabButtonActive,
                        isTabFocused && styles.buttonFocused
                      ]}
                      onPress={() => {
                        setEditModalFocusIndex(tab.index);
                        setActiveTab(tab.id as any);
                      }}
                    >
                      <Ionicons 
                        name={tab.icon as any} 
                        size={20} 
                        color={isTabActive ? '#00FFFF' : '#8E8E93'} 
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[
                        styles.tabButtonText, 
                        isTabActive && styles.tabButtonTextActive
                      ]}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* RIGHT CONTENT AREA */}
              <View style={styles.contentArea}>
                <View style={{ flex: 1 }}>
                  {activeTab === 'basic' && (
                    <>
                      <Text style={styles.sectionTitle}>Datos Básicos</Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.label}>Título</Text>
                        <TextInput
                          ref={editTitleRef}
                          style={[styles.input, editModalFocusIndex === 2 && styles.inputFocused]}
                          value={editData.title}
                          onChangeText={(text) => setEditData({ ...editData, title: text })}
                        />

                        {((editData.type || item?.type) !== 'media' && (editData.type || item?.type) !== 'web') && (
                          <>
                            <Text style={styles.label}>Plataforma</Text>
                            <View style={{ marginBottom: 20 }}>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformScrollContent}>
                                {[
                                  { id: 'PC', icon: 'microsoft-windows' },
                                  { id: 'PS5', icon: 'sony-playstation' },
                                  { id: 'Xbox', icon: 'microsoft-xbox' },
                                  { id: 'Switch', icon: 'nintendo-switch' },
                                  { id: 'Steam', icon: 'steam' },
                                  { id: 'EA', icon: 'alpha-e-box' },
                                  { id: 'Epic', icon: 'alpha-e-circle' }
                                ].map((plat, idx) => {
                                   const focusIdx = 3 + idx;
                                   return (
                                    <TouchableOpacity
                                      key={plat.id}
                                      style={[
                                        styles.platformBtn,
                                        editData.platform === plat.id && styles.platformBtnActive,
                                        editModalFocusIndex === focusIdx && styles.buttonFocused
                                      ]}
                                      onPress={() => setEditData({ ...editData, platform: plat.id })}
                                    >
                                      <MaterialCommunityIcons name={plat.icon as any} size={20} color={editData.platform === plat.id ? '#000' : '#FFF'} />
                                      <Text style={[styles.platformBtnText, editData.platform === plat.id && styles.platformBtnTextActive]}>{plat.id}</Text>
                                    </TouchableOpacity>
                                   );
                                })}
                              </ScrollView>
                            </View>
                          </>
                        )}

                        <Text style={styles.label}>Descripción</Text>
                        <TextInput
                          ref={editDescRef}
                          style={[styles.input, { height: 120, textAlignVertical: 'top' }, editModalFocusIndex === 10 && styles.inputFocused]}
                          multiline
                          value={editData.description}
                          onChangeText={(text) => setEditData({ ...editData, description: text })}
                        />
                      </ScrollView>
                    </>
                  )}

                  {activeTab === 'path' && (
                    <>
                      <Text style={styles.sectionTitle}>Ruta del Juego</Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.label}>Ubicación del ejecutable o enlace</Text>
                        {((editData.type || item?.type) === 'web') ? (
                          <TextInput
                            ref={editPathInputRef}
                            style={[styles.input, editModalFocusIndex === 18 && styles.inputFocused]}
                            placeholder="URL (https://...)"
                            placeholderTextColor="#888"
                            value={editData.path}
                            onChangeText={(text) => setEditData({ ...editData, path: text })}
                          />
                        ) : (
                          <>
                            <TouchableOpacity
                              style={[styles.fileBtn, { marginBottom: 15 }, editModalFocusIndex === 18 && styles.buttonFocused]}
                              onPress={handleSelectPath}
                            >
                              <Ionicons name="folder-open" size={20} color="#FFF" />
                              <Text style={styles.fileBtnText}>Seleccionar nuevo ejecutable (.exe)</Text>
                            </TouchableOpacity>
                            <View style={styles.pathDisplayBox}>
                              <Text style={styles.pathDisplayTextHeader}>Ruta actual del juego:</Text>
                              <Text style={styles.pathDisplayText}>{editData.path || 'No seleccionada'}</Text>
                            </View>
                          </>
                        )}
                      </ScrollView>
                    </>
                  )}

                  {activeTab === 'art' && (
                    <>
                      <Text style={styles.sectionTitle}>Arte y Multimedia</Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={styles.label}>Sincronización Inteligente</Text>
                        <View style={styles.syncRow}>
                          <TouchableOpacity 
                            style={[styles.syncBtnCompact, isSyncing && { opacity: 0.7 }, editModalFocusIndex === 0 && styles.buttonFocused]} 
                            onPress={handleSyncIGDB}
                            disabled={isSyncing}
                          >
                            <Ionicons name="sync" size={16} color="#000" />
                            <Text style={styles.syncBtnTextCompact}>IGDB (Resumen/Stars)</Text>
                          </TouchableOpacity>

                          <TouchableOpacity 
                            style={[styles.syncBtnCompact, { backgroundColor: '#171a21' }, isSyncing && { opacity: 0.7 }, editModalFocusIndex === 1 && styles.buttonFocused]} 
                            onPress={handleSyncSteamGrid}
                            disabled={isSyncing}
                          >
                            <Ionicons name="images" size={16} color="#FFF" />
                            <Text style={[styles.syncBtnTextCompact, { color: '#FFF' }]}>SteamGrid (Arte)</Text>
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>Archivos Locales</Text>
                        <View style={styles.artGrid}>
                          <TouchableOpacity 
                            style={[styles.artFileBtn, editModalFocusIndex === 11 && styles.buttonFocused]} 
                            onPress={() => handleSelectImage('image')}
                          >
                            <Ionicons name="image" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Portada</Text>
                            <Text style={styles.artFileBtnSub}>Imagen vertical</Text>
                          </TouchableOpacity>

                          <TouchableOpacity 
                            style={[styles.artFileBtn, editModalFocusIndex === 12 && styles.buttonFocused]} 
                            onPress={() => handleSelectImage('logo')}
                          >
                            <Ionicons name="color-palette" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Logo PNG</Text>
                            <Text style={styles.artFileBtnSub}>Transparente</Text>
                          </TouchableOpacity>

                          <TouchableOpacity 
                            style={[styles.artFileBtn, editModalFocusIndex === 13 && styles.buttonFocused]} 
                            onPress={() => handleSelectImage('backgroundImage')}
                          >
                            <Ionicons name="images" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Fondo</Text>
                            <Text style={styles.artFileBtnSub}>Horizontal</Text>
                          </TouchableOpacity>

                          <TouchableOpacity 
                            style={[styles.artFileBtn, editModalFocusIndex === 14 && styles.buttonFocused]} 
                            onPress={handleSelectVideo}
                          >
                            <Ionicons name="videocam" size={22} color="#00FFFF" style={{ marginBottom: 4 }} />
                            <Text style={styles.artFileBtnTitle}>Video</Text>
                            <Text style={styles.artFileBtnSub}>Trailer/Gameplay</Text>
                          </TouchableOpacity>
                        </View>
                      </ScrollView>
                    </>
                  )}
                </View>

                {/* MODAL ACTIONS FOOTER */}
                <View style={styles.modalDivider} />
                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={[styles.deleteBtn, editModalFocusIndex === 15 && styles.buttonFocused]} 
                    onPress={handleDeleteApp}
                  >
                    <Ionicons name="trash-outline" size={20} color="#FF2D55" />
                  </TouchableOpacity>
                  
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity 
                      style={[styles.cancelBtn, editModalFocusIndex === 16 && styles.buttonFocused]} 
                      onPress={() => setEditModalVisible(false)}
                    >
                      <Text style={styles.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.saveBtn, editModalFocusIndex === 17 && styles.buttonFocused]} 
                      onPress={handleSaveEdit}
                    >
                      <Text style={styles.saveBtnText}>Guardar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  detailContainer: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  detailBg: { 
    position: 'absolute', 
    width: '100%', 
    height: '100%', 
    resizeMode: 'cover',
    opacity: 0.6 
  },
  detailOverlay: { 
    flex: 1, 
    flexDirection: 'row' 
  },
  detailBack: { 
    position: 'absolute', 
    top: 40, 
    left: 40, 
    zIndex: 30, 
    width: 50, 
    height: 50, 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  favoriteButton: { 
    position: 'absolute', 
    top: 40, 
    right: 520, // Adjusted to be outside the info panel or inside it? Let's put it inside info panel or top right of the whole screen.
    zIndex: 30, 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  favoriteButtonActive: { 
    backgroundColor: 'rgba(255, 45, 85, 0.2)', 
    borderColor: 'rgba(255, 45, 85, 0.5)' 
  },
  detailContent: { 
    flex: 1, 
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  detailLeft: { 
    flex: 1, 
    justifyContent: 'flex-end', 
    paddingLeft: 80, 
    paddingBottom: 100 
  },
  detailLogo: { 
    width: 450, 
    height: 220, 
    resizeMode: 'contain' 
  },
  detailCover: { 
    width: 320, 
    height: 190, 
    borderRadius: 18, 
    resizeMode: 'cover', 
    borderWidth: 3, 
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  detailRight: { 
    width: '40%', // Fixed width usually better, but let's make it responsive
    maxWidth: 480,
    minWidth: 380,
    height: '100%',
    overflow: 'hidden',
  },
  infoPanel: {
    flex: 1,
    padding: 50,
    paddingTop: 120,
  },
  detailTitle: { 
    color: '#FFF', 
    fontSize: 34, 
    fontWeight: '800', 
    marginBottom: 8, 
    letterSpacing: 0.5 
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  platformText: {
    color: '#00FFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  ratingContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 30 
  },
  ratingText: { 
    color: '#FFD700', 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginLeft: 8 
  },
  detailActions: { 
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40 
  },
  playButton: { 
    flex: 1,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#00BD10', 
    paddingHorizontal: 30, 
    paddingVertical: 15, 
    borderRadius: 14, 
    marginRight: 12,
    shadowColor: '#00BD10',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  playButtonText: { 
    color: '#FFF', 
    fontSize: 16, 
    fontWeight: '800', 
    letterSpacing: 1 
  },
  optionsButton: { 
    width: 54,
    height: 54,
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', 
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)'
  },
  detailScrollView: { 
    flex: 1 
  },
  detailDescription: { 
    color: 'rgba(255,255,255,0.75)', 
    fontSize: 15, 
    lineHeight: 24, 
    marginBottom: 30,
    fontWeight: '400'
  },
  mediaContainer: { 
    width: '100%', 
    height: 200, 
    borderRadius: 16, 
    overflow: 'hidden', 
    backgroundColor: '#000', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  videoWrapper: { width: '100%', height: '100%' },
  detailScreenshot: { width: '100%', height: '100%', resizeMode: 'cover' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: 480, backgroundColor: '#1C1C1E', borderRadius: 24, padding: 35, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalContentExpanded: { width: 850, height: 600, padding: 0, overflow: 'hidden' },
  modalBodyRow: { flexDirection: 'row', width: '100%', height: '100%' },
  sidebar: { width: 240, backgroundColor: '#141416', padding: 24, borderRightWidth: 1, borderRightColor: 'rgba(255, 255, 255, 0.08)' },
  sidebarTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 25, letterSpacing: 0.5 },
  tabButton: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  tabButtonActive: { backgroundColor: 'rgba(0, 255, 255, 0.08)', borderColor: 'rgba(0, 255, 255, 0.15)' },
  tabButtonText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },
  tabButtonTextActive: { color: '#00FFFF', fontWeight: 'bold' },
  contentArea: { flex: 1, padding: 30, justifyContent: 'space-between', backgroundColor: '#1C1C1E' },
  sectionTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  pathDisplayBox: { backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 10 },
  pathDisplayTextHeader: { color: '#8E8E93', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  pathDisplayText: { color: '#FFF', fontSize: 14 },
  syncRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  syncBtnCompact: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD700', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  syncBtnTextCompact: { color: '#000', fontWeight: '800', marginLeft: 6, fontSize: 12 },
  artGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  artFileBtn: { width: '47%', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  artFileBtnTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold', marginTop: 6 },
  artFileBtnSub: { color: '#8E8E93', fontSize: 11, marginTop: 2 },
  modalDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', marginVertical: 15, width: '100%' },
  modalTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 25, textAlign: 'center' },
  label: { color: '#8E8E93', fontSize: 13, marginBottom: 8, marginLeft: 5, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: '#000', color: '#FFF', padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#333', fontSize: 16 },
  inputFocused: {
    borderColor: '#00FFFF',
    backgroundColor: '#0A0A0A',
  },
  platformScrollContent: { gap: 10, paddingVertical: 5 },
  platformBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  platformBtnActive: { borderColor: '#00FFFF', backgroundColor: '#00FFFF' },
  platformBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 6, fontSize: 12 },
  platformBtnTextActive: { color: '#000' },
  fileBtn: { backgroundColor: '#2C2C2E', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  fileBtnText: { color: '#FFF', marginLeft: 12, fontSize: 15, fontWeight: '500' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  cancelBtn: { flex: 1, padding: 16, backgroundColor: '#3A3A3C', borderRadius: 12, marginRight: 10, alignItems: 'center' },
  cancelBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  saveBtn: { flex: 1, padding: 16, backgroundColor: '#00FFFF', borderRadius: 12, marginLeft: 10, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  deleteBtn: {
    width: 54,
    height: 54,
    backgroundColor: 'rgba(255, 45, 85, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 45, 85, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD700', padding: 16, borderRadius: 12, marginBottom: 20 },
  syncBtnText: { color: '#000', fontWeight: '800', marginLeft: 10, fontSize: 15 },
  buttonFocused: {
    borderColor: '#FFF',
    borderWidth: 3,
    transform: [{ scale: 1.04 }],
    zIndex: 10,
  },
  launchingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchingText: {
    color: '#00FFFF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 25,
    letterSpacing: 6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 255, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },

});


export default GameDetailView;
