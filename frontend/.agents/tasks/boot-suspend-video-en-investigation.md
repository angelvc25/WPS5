# Boot/Suspend Video Assignment – English Language Bug Investigation

## Summary

The bug is a **stale closure in `changeLanguage`** that overwrites `bootVideoPath` and `suspendVideoPath` with an outdated snapshot of `activeUser?.settings` whenever the user switches to (or sets up with) English. There is no language-specific conditional anywhere in the video-loading path itself — the root cause is an architectural flaw in how `updateUser` is called with a settings spread captured from the render scope rather than from the previous state.

---

## 1. Where Boot and Suspend Videos Are Assigned and Loaded

### Assignment (writing the path)

**File:** `components/SettingsView.tsx`, function `handleSetSplashVideo` (~line 582)

```
const handleSetSplashVideo = async (post, target: 'boot' | 'suspend') => {
    const res = await electronAPI.downloadSplashVideo(post.downloadUrl, target);
    if (res?.success && res.path) {
        updateUser({
            settings: {
                ...activeUser?.settings,          // ← snapshot from closure
                [target === 'boot' ? 'bootVideoPath' : 'suspendVideoPath']: res.path,
            } as any,
        });
    }
};
```

The Electron IPC handler (`electron/main.js`, `ipcMain.handle('download-splash-video', …)`, ~line 5120) downloads the `.webm` from SteamDeckRepo to `userData/WConsole/splash/{boot|suspend}.webm` and returns `{ success: true, path: destPath }`. The absolute path is stored in `user.settings.bootVideoPath` or `user.settings.suspendVideoPath`.

### Loading at Boot (boot video)

**File:** `app/_layout.tsx`, function `getLastBootVideoUri` (~line 84)

Reads `bootVideoPath` from the last-used user's `settings` in `localStorage('console_users')` and converts it to a `local-file:///` URI. This runs synchronously on the first render, before any user is selected. No language involvement.

### Loading at Shutdown (suspend video)

**File:** `app/(tabs)/index.tsx`, ~line 286

```
const suspendVideoPath = (activeUser?.settings as any)?.suspendVideoPath;
const suspendCustomActive = !!suspendVideoPath && !suspendCustomFailed;
const suspendVideoSource = suspendCustomActive
    ? { uri: toLocalFileUri(suspendVideoPath) }
    : require('@/assets/splash/suspend.webm');
```

Again, no language involvement.

---

## 2. Language Selection Logic

### Language Context

**File:** `contexts/LanguageContext.tsx`

- `loadLanguage()` reads from `localStorage('wps5_language')` and defaults to `'en'` when nothing is stored.
- `persistLanguage(lang)` writes to localStorage and also calls `electronAPI.setAppLanguage(lang)` (which is wired only to the trophy notification system in `preload.js`).

### Language Change Entry Point

**File:** `app/(tabs)/index.tsx`, ~line 275

```js
const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    updateUser({ settings: { ...activeUser?.settings, language: lang } });
};
```

This is passed as a prop to `SettingsView`. The `SettingsView` language picker calls `changeLanguage(opt.id)` on press.

### On User Login

**File:** `app/_layout.tsx`, `handleUserSelected`, ~line 544

```js
if (isLanguage(user.settings?.language)) {
    setLanguage(user.settings.language);
}
```

`updateUser` is **not** called here — only the LanguageContext is updated.

---

## 3. Why Video Selection Fails Specifically for English

### Root Cause: Stale Closure in `changeLanguage`

`updateUser` in `_layout.tsx` uses a functional setter pattern:

```js
const updateUser = useCallback(async (updates: Partial<UserProfile>) => {
    setActiveUser(prevUser => {
        const newUser = { ...prevUser, ...updates };  // ← shallow merge at TOP level only
        // saves newUser to localStorage and electronAPI.saveUsers(...)
        return newUser;
    });
}, []);
```

The merge `{ ...prevUser, ...updates }` is **shallow**. When `updates = { settings: { ...snapshot, language: 'en' } }`, it **replaces** `prevUser.settings` entirely with the snapshot. The `prevUser.settings` values (including `bootVideoPath` and `suspendVideoPath`) are discarded in favour of the snapshot.

**Scenario that causes the bug:**

1. User has `settings = { language: 'es', bootVideoPath: 'C:\\...\\boot.webm' }`.
2. User switches to English. `changeLanguage('en')` is called.
3. `activeUser?.settings` at the moment of the call is `{ language: 'es', bootVideoPath: 'C:\\...\\boot.webm' }`.
4. `updateUser({ settings: { language: 'es', bootVideoPath: '...', language: 'en' } })` is called → `bootVideoPath` is preserved. ✓ — this case is safe.

**The case that fails (and is specific to English as the first/default language):**

1. Fresh install or first run: `loadLanguage()` returns `'en'` as default. No `wps5_language` in localStorage.
2. User is selected. `handleUserSelected` calls `setLanguage(user.settings.language)`. If `user.settings.language` is not set (new profile), language stays `'en'` from default.
3. User downloads a video → `bootVideoPath` is stored: `settings = { bootVideoPath: '...' }`.
4. User then opens Settings → System → Language and **selects English** (re-selecting the current language). `changeLanguage('en')` runs.
5. Inside `changeLanguage`: `activeUser?.settings` is `{ bootVideoPath: '...' }` — but due to React's batched rendering, if the `updateUser` call from step 3 (video assignment) has not yet flushed, `activeUser` in the render scope may **still reflect the pre-video state** `{}`.
6. `updateUser({ settings: { language: 'en' } })` is called with an empty snapshot — **`bootVideoPath` is lost**.

**More common scenario (the main bug vector):**

The same stale-closure race applies any time the user:
- Changes language while a video assignment is in flight (async download is happening)
- Or when React has not yet committed the latest `setActiveUser` from a prior `updateUser` call before `changeLanguage` captures the value

Since English is the **default language** (`loadLanguage()` returns `'en'`), users who never explicitly changed language will have `settings.language` as `undefined`. When they go to Settings and click English to confirm it, `changeLanguage('en')` runs and writes `{ settings: { language: 'en' } }` with an empty or stale spread — dropping `bootVideoPath` and `suspendVideoPath`.

Spanish and Portuguese users are **less affected** because:
- They had to explicitly switch once, which at that point correctly merged the settings.
- They rarely re-select their language after already being in it.
- If their language was set at the same session as the video was downloaded, the state was already committed before they re-entered the language screen.

### Secondary Issue: `UserSettings` Type Does Not Declare `bootVideoPath`/`suspendVideoPath`

**File:** `components/UserSelectScreen.tsx`, `UserSettings` interface (~line 46)

`bootVideoPath` and `suspendVideoPath` are not declared in `UserSettings`. They are accessed everywhere via `(settings as any)?.bootVideoPath`. This makes them invisible to TypeScript refactors and means any `updateUser({ settings: { ...someSnapshot } as any })` call that doesn't include them silently drops them.

### Hardcoded Spanish Strings (Minor, Unrelated to the Core Bug)

In `SettingsView.tsx` there are two hardcoded Spanish strings in the splash section that should use `t()`:
- Line 585: `toastService.show('La descarga de splash requiere la app de escritorio.')`
- Line 2880: `` `Usado en ${... === 'boot' ? 'Boot' : 'Suspend'}` ``

These do not affect functionality — they are display-only issues.

---

## 4. Evidence with File/Symbol Citations

| File | Location | Relevant Code |
|------|----------|---------------|
| `app/(tabs)/index.tsx` | ~line 275 | `changeLanguage` captures `activeUser?.settings` from closure, passes to `updateUser` |
| `app/_layout.tsx` | ~line 494 | `updateUser` does `{ ...prevUser, ...updates }` — shallow merge, replaces `settings` entirely |
| `app/_layout.tsx` | ~line 84 | `getLastBootVideoUri` reads `bootVideoPath` from localStorage, no language involvement |
| `components/SettingsView.tsx` | ~line 582 | `handleSetSplashVideo` stores path via `updateUser({ settings: { ...activeUser?.settings, bootVideoPath: res.path } as any })` |
| `components/UserSelectScreen.tsx` | ~line 46 | `UserSettings` interface — missing `bootVideoPath` and `suspendVideoPath` fields |
| `contexts/LanguageContext.tsx` | ~line 22 | `loadLanguage()` defaults to `'en'` when nothing in localStorage |
| `electron/main.js` | ~line 5120 | `download-splash-video` IPC handler — no language logic, always writes to `{target}.webm` |
| `services/steamDeckRepoService.ts` | entire file | No language filtering anywhere in search or fetch logic |

---

## 5. Conclusions

1. **There is no language-keyed conditional in any video-loading or video-assignment code path.** The `steamDeckRepoService`, the `download-splash-video` IPC handler, `getLastBootVideoUri`, and the suspend video path in `index.tsx` are all language-agnostic.

2. **The bug is a shallow-merge + stale-closure problem in `changeLanguage`.** `updateUser` replaces the entire `settings` object with a snapshot taken at call time. When English is the active or default language and the user interacts with the language picker, `bootVideoPath`/`suspendVideoPath` can be silently dropped from the saved settings.

3. **English is uniquely affected** because it is the default language (`loadLanguage()` returns `'en'`). Users in English are more likely to trigger the stale-closure condition: their settings start without an explicit `language` key, so the first time they click English in Settings, `changeLanguage('en')` runs and writes whatever was in `activeUser?.settings` at that render — which may predate a video-path assignment.

4. **`bootVideoPath` and `suspendVideoPath` are untyped.** Any `updateUser` call that spreads a stale `settings` object will silently drop them, with no TypeScript warning.

---

## 6. Recommended Fixes

### Fix 1 (Critical): Deep-merge `settings` inside `updateUser`

**File:** `app/_layout.tsx`, `updateUser` callback (~line 490)

Change the shallow merge to deep-merge the `settings` subobject:

```js
// Before:
const newUser = { ...prevUser, ...updates };

// After:
const newUser = {
    ...prevUser,
    ...updates,
    settings: updates.settings
        ? { ...prevUser?.settings, ...updates.settings }
        : prevUser?.settings,
};
```

This ensures that any `updateUser({ settings: { language: 'en' } })` call merges onto the existing settings rather than replacing them. `bootVideoPath`, `suspendVideoPath`, and all other dynamic settings fields are preserved regardless of which fields the caller chose to update.

### Fix 2 (Supporting): Type `bootVideoPath` and `suspendVideoPath` in `UserSettings`

**File:** `components/UserSelectScreen.tsx`, `UserSettings` interface

Add the missing fields so TypeScript enforces them:

```ts
export interface UserSettings {
  // ... existing fields ...
  bootVideoPath?: string;
  suspendVideoPath?: string;
}
```

Then remove the `as any` casts in:
- `components/SettingsView.tsx` lines 594, 2597, 2598
- `app/_layout.tsx` line 96
- `app/(tabs)/index.tsx` line 286

### Fix 3 (Minor): Use `t()` for hardcoded Spanish strings in `SettingsView.tsx`

**File:** `components/SettingsView.tsx`

- Line 585: replace `'La descarga de splash requiere la app de escritorio.'` with `t('settings.desktopOnly')`
- Line 2880: replace the hardcoded `` `Usado en ${...}` `` with `` `${t('settings.videoUpdate')}${... === 'boot' ? t('settings.videoUpdateBoot') : t('settings.videoUpdateSuspend')}` ``

---

## Verification After Fix

After applying Fix 1, the following scenario should work:

1. Set language to English (or start fresh — English is the default).
2. Go to Settings → Accessibility → Splash Videos.
3. Assign a boot video and a suspend video.
4. Reopen Settings → System → Language and re-select English.
5. Restart the app.

Expected: boot video plays. Expected on shutdown: suspend video plays.

Before Fix 1: step 4 would wipe `bootVideoPath`/`suspendVideoPath` from localStorage because `changeLanguage('en')` calls `updateUser` with a stale snapshot. After Fix 1, the deep merge preserves both paths.
