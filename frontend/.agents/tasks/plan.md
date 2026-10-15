# Implementation Plan — Refactoring `index.tsx` into Custom Hooks

## Inventario completo de estados y funciones en `index.tsx`

### Estados (useState)

| Estado | Tipo | Destino |
|---|---|---|
| `activeTab` | `string` | queda en index.tsx (coordinación global UI) |
| `currentRenderedTab` | `string` | queda en index.tsx |
| `activeIndex` | `number` | `useFocusNavigation` |
| `carouselKey` | `number` | queda en index.tsx |
| `focusArea` | `FocusArea` | `useFocusNavigation` |
| `focusIndex` | `number` | `useFocusNavigation` |
| `gamePanelFocusIndex` | `number` | `useFocusNavigation` |
| `steamNews` | `SteamNewsItem[]` | queda en index.tsx (efecto de datos de panel) |
| `newsLoading` | `boolean` | queda en index.tsx |
| `storeOffers` | `StoreOffer[]` | queda en index.tsx |
| `storeLoading` | `boolean` | queda en index.tsx |
| `steamMedia` | `SteamMediaItem[]` | queda en index.tsx |
| `gameVideos` | `GameVideoResult[]` | queda en index.tsx |
| `mediaLoading` | `boolean` | queda en index.tsx |
| `selectedMediaIndex` | `number \| null` | queda en index.tsx |
| `achievementCount` | `number` | queda en index.tsx |
| `isShuttingDown` | `boolean` | queda en index.tsx |
| `suspendCustomFailed` | `boolean` | queda en index.tsx |
| `suspendDefaultFailed` | `boolean` | queda en index.tsx |
| `currentTime` | `string` | queda en index.tsx (reloj UI) |
| `gamepadInfo` | `{ connected, name, battery }` | queda en index.tsx |
| `storageInfo` | `{ percent, freeGB, disks }` | queda en index.tsx |
| `isAddModalVisible` | `boolean` | queda en index.tsx |
| `newApp` | objeto | queda en index.tsx |
| `isSaving` | `boolean` | queda en index.tsx |
| `selectedItem` | `ConsoleItem \| null` | queda en index.tsx |
| `isUserModalVisible` | `boolean` | queda en index.tsx |
| `modalSelectedIndex` | `number` | queda en index.tsx |
| `isHomeBgModalVisible` | `boolean` | queda en index.tsx |
| `isAvatarModalVisible` | `boolean` | queda en index.tsx |
| `isSearchVisible` | `boolean` | queda en index.tsx |
| `onlineProfileUsername` | `string \| null` | queda en index.tsx |
| `toolbarFocusIndex` | `number` | `useFocusNavigation` |
| `addModalFocusIndex` | `number` | queda en index.tsx |
| `settingsFocusArea` | `'sidebar' \| 'content'` | queda en index.tsx |
| `settingsFocusIndex` | `number` | queda en index.tsx |
| `isFavoritesVisible` | `boolean` | queda en index.tsx |
| `isSettingsVisible` | `boolean` | queda en index.tsx |
| `isWelcomeSettingsVisible` | `boolean` | queda en index.tsx |
| `isWidgetEditOpen` | `boolean` | `useFocusNavigation` |
| `widgetEditFocusIndex` | `number` | `useFocusNavigation` |
| `widgetVisibility` | `WidgetVisibility` | queda en index.tsx (widget config) |
| `widgetOrder` | `string[]` | queda en index.tsx |
| `widgetSizes` | `WidgetSizes` | queda en index.tsx |
| `isWidgetMoveMode` | `boolean` | `useFocusNavigation` |
| `movingWidgetId` | `string \| null` | `useFocusNavigation` |
| `preMoveOrderBackup` | `string[]` | `useFocusNavigation` |
| `isMediaGalleryVisible` | `boolean` | queda en index.tsx |
| `isSlidesModalVisible` | `boolean` | queda en index.tsx |
| `presentationEnabled` | `boolean` | `usePresentationMode` |
| `inactivityTime` | `string` | `usePresentationMode` |
| `isPresentationMode` | `boolean` | `usePresentationMode` |
| `slideshowAlbumName` | `string \| null` | `usePresentationMode` |
| `slideshowDuration` | `string` | `usePresentationMode` |
| `slideshowTransition` | `string` | `usePresentationMode` |
| `slideshowImages` | `string[]` | `usePresentationMode` |
| `currentSlideIndex` | `number` | `usePresentationMode` |
| `settingsInitialScreen` | `SettingsScreenType` | queda en index.tsx |
| `settingsTab` | `string` | queda en index.tsx |
| `homeBackground` | `any` | queda en index.tsx |
| `isLaunching` | `boolean` | queda en index.tsx (lanzamiento de apps) |
| `launchingItem` | `ConsoleItem \| null` | queda en index.tsx |
| `isRandomSelectorVisible` | `boolean` | queda en index.tsx |
| `isLibraryFocused` | `boolean` | `useFocusNavigation` |
| `libraryGridFocusIndex` | `number` | `useFocusNavigation` |
| `visibleLibraryGames` | `ConsoleItem[]` | `useFocusNavigation` |
| `libraryTab` | `'installed' \| 'collection'` | `useLibrary` |
| `libraryTabsFocused` | `boolean` | `useFocusNavigation` |
| `libraryFilterFocused` | `boolean` | `useFocusNavigation` |
| `libraryFilterFromTabs` | `boolean` | `useFocusNavigation` |
| `isLibraryFilterPanelOpen` | `boolean` | `useFocusNavigation` |
| `games` | `ConsoleItem[]` | `useLibrary` |
| `media` | `ConsoleItem[]` | `useLibrary` |
| `lastPlayedGame` | `ConsoleItem \| null` | `useLibrary` |
| `steamGames` | `ConsoleItem[]` | `useSteamSync` |
| `installedSteamAppIds` | `Set<string> \| null` | `useSteamSync` |
| `loadingSteam` | `boolean` | `useSteamSync` |
| `epicGames` | `ConsoleItem[]` | `useSteamSync` |
| `loadingEpic` | `boolean` | `useSteamSync` |
| `xboxGames` | `ConsoleItem[]` | `useSteamSync` |
| `loadingXbox` | `boolean` | `useSteamSync` |
| `uiReady` | `boolean` | queda en index.tsx |
| `appsLoaded` | `boolean` | queda en index.tsx |
| `wishlistDeals` | `WishlistDeal[]` | `useSteamSync` |
| `bgA / bgB / activeLayer` | múltiples | queda en index.tsx (background crossfade) |
| `showTrailer` | `boolean` | queda en index.tsx |
| `inputMode` | `'keyboard' \| 'gamepad'` | queda en index.tsx |
| `isContextMenuOpen` | `boolean` | queda en index.tsx |
| `contextMenuFocusIndex` | `number` | queda en index.tsx |
| `contextMenuCoords` | `{ top, left }` | queda en index.tsx |
| `isDetailVisible` | `boolean` | queda en index.tsx |
| `deleteConfirmItem` | `ConsoleItem \| null` | queda en index.tsx |
| `isLibraryDetailVisible` | `boolean` | queda en index.tsx |
| `isOnline` | `boolean` | queda en index.tsx |
| `isProfileMenuOpen` | `boolean` | queda en index.tsx |
| `profileMenuFocusIndex` | `number` | queda en index.tsx |
| `systemNavLevel / systemNavCardIndex / systemNavMaxCardIndex` | múltiples | queda en index.tsx |
| `isFriendsCardOpen / isNotificationsCardOpen / isMusicCardOpen / isDownloadsCardOpen` | múltiples | queda en index.tsx |
| `isSystemNavCardExpanded` | `boolean` | queda en index.tsx |

### Refs que cambian de lugar

| Ref | Destino |
|---|---|
| `gamesRef` | `useLibrary` (espejo sincrónico de `games`) |
| `steamGamesRef` | `useSteamSync` |
| `epicGamesRef` | `useSteamSync` |
| `xboxGamesRef` | `useSteamSync` |
| `lastInteractionRef` | `usePresentationMode` |
| `slideshowTimerRef` | `usePresentationMode` |
| `lastNavTime` | `useFocusNavigation` |
| `knownWishlistDealIdsRef` | `useSteamSync` |
| `launchStartTimeRef / sessionPlaytimeRef / initialUnlockedRef / realtimeTrophiesNotifiedRef` | queda en index.tsx |
| `focusAudioDelayRef / focusAudioSoundRef / focusAudioRequestRef` | queda en index.tsx |
| `isLaunchingRef` | queda en index.tsx |
| `scrollRef / mainScrollRef / newsScrollRef / mediaScrollRef / widgetScrollRef` | queda en index.tsx |

---

## Asignación definitiva por hook

### `useLibrary`
**Estado:**
- `games`, `media`, `lastPlayedGame` (y su `gamesRef`)
- `libraryTab`
- `nonSteamGames`, `savedGames`, `playedSteamGames`, `pinnedSteamGames` (memos)
- `currentData`, `displayedLibraryGames`, `searchableLibraryGames`, `searchableMedia` (memos)

**Funciones:**
- `loadApps()` — carga desde Electron IPC
- `mergeGameIntoState()` — parche optimista de un juego en todos los estados
- `syncGamePlaytime()` — actualiza tiempo de juego tras cierre
- `markGameAsLastPlayed()` — actualiza `lastPlayedGame` y `games`
- `handleConfirmDeleteGame()` — borra de la DB y de los estados

**Parámetros de entrada:** `activeUser`, `epicGamesRef`, `xboxGamesRef`, `t`, `language`

**Retorna:**
```ts
{
  games, setGames,
  media, setMedia,
  lastPlayedGame, setLastPlayedGame,
  libraryTab, setLibraryTab,
  currentData,
  displayedLibraryGames,
  searchableLibraryGames,
  searchableMedia,
  nonSteamGames, savedGames,
  loadApps,
  mergeGameIntoState,
  syncGamePlaytime,
  markGameAsLastPlayed,
  handleConfirmDeleteGame,
  appsLoaded,
  gamesRef,
}
```

**Dependencias cruzadas:** Necesita `steamGames` (de `useSteamSync`) como argumento para construir `displayedLibraryGames` y `currentData`. Se resuelve pasando `steamGames`, `epicGames`, `xboxGames`, `downloadsByAppId` como parámetros al hook.

---

### `useSteamSync`
**Estado:**
- `steamGames` (+ `steamGamesRef`)
- `installedSteamAppIds`
- `loadingSteam`
- `epicGames` (+ `epicGamesRef`)
- `loadingEpic`
- `xboxGames` (+ `xboxGamesRef`)
- `loadingXbox`
- `wishlistDeals`
- `knownWishlistDealIdsRef`
- El hook existente `useSteamDownloads` se consume aquí

**Funciones:**
- Carga inicial de Steam owned games + metadata SteamGrid
- Refresco silencioso de playtimes
- Detección de juegos instalados (SetInstalledAppIds)
- Detección de juegos Epic + Xbox instalados
- Detección de orphan installs (`getSteamInstalledAppsDetailed`)
- `isSteamTrackedGame()` — utilidad pura (se puede exportar directamente)
- `getEffectiveSteamGames()` — acceso a la caché aunque `steamGames` esté vacío
- `handleToggleFavorite()` y `handleTogglePin()` necesitan acceso a múltiples arrays de fuente: se pasan como parámetros o se devuelve un setter unificado

**Parámetros de entrada:** `activeUser`, `games` (para sobreescrituras de DB), `t`, `language`

**Retorna:**
```ts
{
  steamGames, setSteamGames, steamGamesRef,
  epicGames, setEpicGames, epicGamesRef,
  xboxGames, setXboxGames, xboxGamesRef,
  installedSteamAppIds,
  loadingSteam, loadingEpic, loadingXbox,
  wishlistDeals,
  steamDownloads, downloadsByAppId,
  downloadingSteamGames,
  isSteamTrackedGame,
  getEffectiveSteamGames,
}
```

**Dependencias cruzadas:** `handleToggleFavorite`/`handleTogglePin` modifican tanto `games` como `steamGames`. Se resuelve: `useSteamSync` devuelve un `updateFavoritePin(id, field, value, setGames)` que recibe `setGames` como argumento y los hooks se coordinan en `index.tsx`.

---

### `useFocusNavigation`
**Estado:**
- `focusArea`, `focusIndex`
- `activeIndex`
- `gamePanelFocusIndex`
- `toolbarFocusIndex`
- `isLibraryFocused`
- `libraryGridFocusIndex`
- `visibleLibraryGames`
- `libraryTabsFocused`, `libraryFilterFocused`, `libraryFilterFromTabs`
- `isLibraryFilterPanelOpen`
- `isWidgetEditOpen`, `widgetEditFocusIndex`
- `isWidgetMoveMode`, `movingWidgetId`, `preMoveOrderBackup`
- `lastNavTime` (ref de throttle)

**Funciones:**
- `handleKeyDown` — toda la lógica de teclas (el bloque gigante)
- Auto-scroll effects (carousel, media, news, widgets)
- `startWidgetMove()`, `getWidgetNeighbor()`
- Efectos de foco que ajustan `focusIndex` cuando `widgetVisibility` cambia

**Parámetros de entrada:** todos los estados y callbacks que `handleKeyDown` lee en el momento actual se pasan como objeto de opciones (similar a `useGamepadInput`). El patrón clave: igual que `useGamepadInput` usa un `callbacksRef` interno para evitar añadir/quitar el listener en cada render, `useFocusNavigation` también mantendrá el listener con una ref estable.

**Retorna:**
```ts
{
  focusArea, setFocusArea,
  focusIndex, setFocusIndex,
  activeIndex, setActiveIndex,
  gamePanelFocusIndex, setGamePanelFocusIndex,
  toolbarFocusIndex, setToolbarFocusIndex,
  isLibraryFocused,
  libraryGridFocusIndex, setLibraryGridFocusIndex,
  visibleLibraryGames, setVisibleLibraryGames,
  libraryTabsFocused, setLibraryTabsFocused,
  libraryFilterFocused, setLibraryFilterFocused,
  libraryFilterFromTabs, setLibraryFilterFromTabs,
  isLibraryFilterPanelOpen, setIsLibraryFilterPanelOpen,
  isWidgetEditOpen, setIsWidgetEditOpen,
  widgetEditFocusIndex, setWidgetEditFocusIndex,
  isWidgetMoveMode, setIsWidgetMoveMode,
  movingWidgetId, setMovingWidgetId,
  preMoveOrderBackup, setPreMoveOrderBackup,
  startWidgetMove,
  getWidgetNeighbor,
}
```

**Dependencias cruzadas:** `handleKeyDown` necesita acceso a: `currentData`, `storeOffers`, `steamMedia`, `steamNews`, `achievementCount`, `lastPlayedGame`, `isLaunching`, `isSettingsVisible`, etc. Todos estos se pasan como parámetros de opciones en un objeto que se lee vía ref interna (patrón de `useGamepadInput`), garantizando que el listener es estable y siempre ve el estado actual.

---

### `usePresentationMode`
**Estado:**
- `presentationEnabled`
- `inactivityTime`
- `isPresentationMode`
- `lastInteractionRef`
- `presentationAnim` (shared value de Reanimated)
- `slideshowAlbumName`, `slideshowDuration`, `slideshowTransition`
- `slideshowImages`, `currentSlideIndex`
- `slideshowTimerRef`

**Funciones:**
- `handlePresentationSettingsChange(enabled, time)`
- `handleSlidesSettingsChange(settings)`
- Efecto de inactividad (intervalo que activa el modo)
- Efecto de animación `presentationAnim`
- Efecto de slideshow (ciclo de imágenes)
- Reset en mouse/touch
- Carga del álbum guardado al arrancar

**Parámetros de entrada:** `isLaunching` (para pausar el timer mientras hay un juego activo)

**Retorna:**
```ts
{
  presentationEnabled,
  inactivityTime,
  isPresentationMode, setIsPresentationMode,
  presentationAnim,
  slideshowAlbumName,
  slideshowDuration,
  slideshowTransition,
  slideshowImages,
  currentSlideIndex,
  slideshowActive,   // computed: !isThemeActive && images.length > 0 && (isWelcomeCard || isPresentationMode)
  handlePresentationSettingsChange,
  handleSlidesSettingsChange,
  resetInteraction,  // para que handleKeyDown actualice lastInteractionRef
}
```

---

## Código que queda en `index.tsx`

- Toda la lógica de UI/render (JSX)
- Background crossfade (`bgA`, `bgB`, `activeLayer`, `fade`, `animatedStyleA/B`, prefetch de imagen)
- `isShuttingDown`, `requestAppShutdown`, `finishShutdown` (shutdown con video de suspensión)
- Reloj (`currentTime`)
- `gamepadInfo`, `storageInfo`
- Modal Add App (`isAddModalVisible`, `newApp`, `isSaving`, handlers)
- `selectedItem`, `isDetailVisible`, `isLibraryDetailVisible`, `deleteConfirmItem`
- `isSettingsVisible`, `isWelcomeSettingsVisible`, `isHomeBgModalVisible`, `isAvatarModalVisible`, `isSearchVisible`
- `isContextMenuOpen`, `contextMenuFocusIndex`, `contextMenuCoords`
- `isOnline`, `isProfileMenuOpen`, `profileMenuFocusIndex`
- `systemNavLevel`, `systemNavCardIndex`, etc.
- `isLaunching`, `launchingItem`, `handleLaunchApp`
- `widgetVisibility`, `widgetOrder`, `widgetSizes` y sus helpers (`resizeWidget`)
- Shared values de animación: `gamePanelFocusAnim`, `lowerSectionFocusAnim`, `welcomeWidgetsFocusAnim`, `tabFade`, `spinRotation`, etc.
- `storeOffers`, `storeLoading` y su effect
- `steamNews`, `newsLoading` y su effect
- `steamMedia`, `gameVideos`, `mediaLoading` y su effect
- `uiReady`, `appsLoaded`, `readySentRef`
- Focus audio (`focusAudioDelayRef`, `stopFocusAudio`, su effect)
- Electron event listeners (trophy, suspend, app-updated, game-closed)
- `openContextMenu`, `handleContextMenuAction`, `handleSystemNavAction`, `handleProfileMenuAction`
- `handleToggleFavorite`, `handleTogglePin` (coordinan `games` + `steamGames`)
- `handleAppPress`
- Handlers de modal/file (add app, avatar, home bg, wallpaper folder…)
- `CheckUpdates`
- `fetchSteamAvatar`

---

## Dependencias cruzadas y cómo resolverlas

| Dependencia | Solución |
|---|---|
| `useSteamSync` necesita `setGames` para `handleToggleFavorite`/`handleTogglePin` | Mantener `handleToggleFavorite`/`handleTogglePin` en `index.tsx`; `useSteamSync` devuelve setters individuales |
| `useLibrary.currentData` necesita `steamGames`, `epicGames`, `xboxGames` | Pasar como parámetros a `useLibrary` |
| `useFocusNavigation.handleKeyDown` necesita todo el estado actual | Pasar objeto de opciones leído via ref interna (patrón de `useGamepadInput`) |
| `usePresentationMode` necesita saber si hay juego activo | Pasar `isLaunching` como parámetro |
| `loadApps` (en `useLibrary`) necesita `epicGamesRef` y `xboxGamesRef` de `useSteamSync` | Pasar las refs como argumento al hook o al llamar `loadApps` |

---

## Orden de implementación recomendado

1. **`usePresentationMode`** — sin dependencias en otros hooks nuevos; autocontenido.
2. **`useSteamSync`** — sus retornos alimentan a `useLibrary` y `useFocusNavigation`.
3. **`useLibrary`** — depende de los retornos de `useSteamSync`.
4. **`useFocusNavigation`** — depende de `useLibrary.currentData` y de valores de `useSteamSync`.
5. **Integración en `index.tsx`** — reemplazar los estados/funciones extraídos por las llamadas a los hooks, verificar que la app compila y funciona.

---

## Implementation Plan

- [ ] 1. Crear `hooks/usePresentationMode.ts`
      Extraer: `presentationEnabled`, `inactivityTime`, `isPresentationMode`, `lastInteractionRef`, `presentationAnim`, estados y timer del slideshow, `handlePresentationSettingsChange`, `handleSlidesSettingsChange`, efecto de inactividad, efecto de animación, efecto slideshow, reset en mouse/touch.
      Firma de retorno documentada arriba.
      Files: `hooks/usePresentationMode.ts`
      Verify: `npx expo lint` sin errores en el archivo nuevo; TypeScript compila (`npx tsc --noEmit`).

- [ ] 2. Crear `hooks/useSteamSync.ts`
      Extraer: `steamGames/steamGamesRef`, `epicGames/epicGamesRef`, `xboxGames/xboxGamesRef`, `installedSteamAppIds`, `loadingSteam/Epic/Xbox`, `wishlistDeals`, todos los useEffect de carga/refresco de Steam/Epic/Xbox, `isSteamTrackedGame`, `getEffectiveSteamGames`. Mantener `useSteamDownloads` consumido internamente.
      Files: `hooks/useSteamSync.ts`
      Verify: `npx tsc --noEmit` sin errores.

- [ ] 3. Crear `hooks/useLibrary.ts`
      Extraer: `games/gamesRef`, `media`, `lastPlayedGame`, `libraryTab`, todos los memos derivados (`currentData`, `displayedLibraryGames`, etc.), `loadApps`, `mergeGameIntoState`, `syncGamePlaytime`, `markGameAsLastPlayed`, `handleConfirmDeleteGame`, `appsLoaded`.
      Parámetros de entrada: `activeUser`, `steamGames`, `epicGames`, `xboxGames`, `downloadsByAppId`, `t`, `language`.
      Files: `hooks/useLibrary.ts`
      Verify: `npx tsc --noEmit` sin errores.

- [ ] 4. Crear `hooks/useFocusNavigation.ts`
      Extraer: todos los estados de foco listados arriba, `handleKeyDown` (el bloque grande), auto-scroll effects, `startWidgetMove`, `getWidgetNeighbor`.
      Usar patrón ref-stable idéntico a `useGamepadInput`: el listener de `keydown` se registra una sola vez en `useEffect([], [])` y lee el estado actual siempre desde refs.
      Files: `hooks/useFocusNavigation.ts`
      Verify: `npx tsc --noEmit` sin errores.

- [ ] 5. Integrar los 4 hooks en `index.tsx`
      Eliminar todos los estados/funciones extraídos, reemplazarlos por desestructuración de los hooks. Mantener el código de render y los estados documentados como "queda en index.tsx". El archivo debe reducirse de ~3000+ a ~1500–1800 líneas aproximadamente.
      Files: `app/(tabs)/index.tsx`
      Verify: `npx expo start --web` arranca sin errores de TypeScript; la navegación por teclado/mando funciona; el modo presentación se activa tras inactividad; Steam sync carga juegos correctamente.
