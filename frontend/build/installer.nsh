; ===========================================================================
;  Instalador NSIS de WPS5 (electron-builder)
;
;  Requisitos cubiertos:
;   1) Nombre visible "WPS5"; la carpeta de datos de usuario en AppData se
;      mantiene como "FifhtStation" (definida en electron/main.js), por lo que
;      los juegos, perfiles y configuracion de los usuarios existentes no se
;      pierden al cambiar el productName.
;   2) Actualizacion sobre instalaciones previas (FifthStation UI o WPS5):
;      customInit elige una $INSTDIR que contenga "WPS5" (evita anidar
;      "...\FifthStation UI\WPS5"), customInstall borra accesos y ejecutables
;      heredados de FifthStation UI, y customCheckAppRunning cierra la app
;      vieja si sigue abierta. AppData se conserva (deleteAppDataOnUninstall
;      = false en package.json).
;   3) Aspecto mejorado: tema oscuro coordinado, BrandingText de cabecera y
;      paginas de bienvenida y finalizacion con marca, usando los bitmaps de
;      cabecera/lateral ya configurados en package.json.
; ===========================================================================

; ── Tema MUI (definir antes de las paginas del instalador) ──────────────────
!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "120E18"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "FFFFFF"
!endif
!ifndef MUI_INSTFILESPAGE_COLORS
  !define MUI_INSTFILESPAGE_COLORS "FFFFFF 120E18"
!endif
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TITLE_3LINES

; ── Cierre forzado de WPS5 y sus procesos auxiliares ───────────────────────
; Causa del error "No se puede cerrar WPS5":
;  - El filtro anterior '/FI "USERNAME eq %USERNAME%"' de taskkill exige el
;    formato DOMINIO\usuario; con solo el nombre no coincide con ningun
;    proceso, asi que NO mataba nada (y el 2>NUL ocultaba el mensaje).
;  - Faltaba /T: los procesos hijos (backend de la tienda, GPU/renderer,
;    etc.) quedaban vivos.
;  - xinput-watcher.exe y windows-media-sessions-backend.exe son procesos
;    auxiliares que bloquean archivos de la carpeta de instalacion si la app
;    se cierra de forma abrupta.
; Se hacen dos pasadas con espera para cubrir procesos que tardan en morir.
!macro WPS5KillAppProcesses
  nsExec::Exec 'taskkill /F /T /IM "WPS5.exe"'
  Pop $R1
  nsExec::Exec 'taskkill /F /T /IM "FifthStation UI.exe"'
  Pop $R1
  nsExec::Exec 'taskkill /F /IM "xinput-watcher.exe"'
  Pop $R1
  nsExec::Exec 'taskkill /F /IM "windows-media-sessions-backend.exe"'
  Pop $R1
  Sleep 1500
  nsExec::Exec 'taskkill /F /T /IM "WPS5.exe"'
  Pop $R1
  nsExec::Exec 'taskkill /F /T /IM "FifthStation UI.exe"'
  Pop $R1
  Sleep 1000
!macroend

; ── Limpieza propia de la version anterior ─────────────────────────────────
; Por que: el mensaje "No se puede cerrar WPS5 ... Reintentar" de
; electron-builder tambien sale cuando el DESINSTALADOR DE LA VERSION VIEJA
; termina con un codigo distinto de 0 (se ejecuta en modo silencioso /S), aunque
; no haya ningun proceso abierto. Ese desinstalador ya esta en el equipo del
; usuario y no se puede modificar. Para no depender de el, antes de que
; electron-builder lo busque:
;   1) se borra la carpeta de la instalacion previa (solo si contiene
;      WPS5.exe o FifthStation UI.exe, para no tocar carpetas ajenas), y
;   2) se elimina su entrada de desinstalacion del registro, de modo que
;      electron-builder no lo invoque.
; Los datos de usuario (AppData\FifhtStation) no se tocan. Esto se hace aqui
; (inicio de la instalacion real) y no en customInit para no borrar nada si el
; usuario cancela el asistente antes de instalar.
; Solo se declara en el instalador: en la pasada del desinstalador no se usa y
; NSIS lanzaria "warning 6001" (que electron-builder trata como error).
!ifndef BUILD_UNINSTALLER
  Var WPS5OldInstDir
!endif

!macro WPS5PreCleanOldInstall
  ${If} $WPS5OldInstDir != ""
    ${If} ${FileExists} "$WPS5OldInstDir\WPS5.exe"
    ${OrIf} ${FileExists} "$WPS5OldInstDir\FifthStation UI.exe"
      RMDir /r "$WPS5OldInstDir"
    ${EndIf}
  ${EndIf}

  ${If} $INSTDIR != "$WPS5OldInstDir"
    ${If} ${FileExists} "$INSTDIR\WPS5.exe"
    ${OrIf} ${FileExists} "$INSTDIR\FifthStation UI.exe"
      RMDir /r "$INSTDIR"
    ${EndIf}
  ${EndIf}

  DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
  DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY_2}"
    DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  ClearErrors
!macroend

; ── Marca de cabecera ──────────────────────────────────────────────────────
; Sobreescribe el BrandingText por defecto de electron-builder
; ("${PRODUCT_NAME} ${VERSION}") mostrando solo "WPS5".
!macro customHeader
  BrandingText "WPS5"
!macroend

; ── Pagina de bienvenida (instalador) ──────────────────────────────────────
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenido a WPS5"
  !define MUI_WELCOMEPAGE_TEXT "Este asistente instalara o actualizara WPS5 en tu equipo.$\r$\n$\r$\nSi ya tienes FifthStation UI u otra version anterior, se actualizara encima de ella (se desinstala la copia vieja y se instala esta). Tus juegos, perfiles y configuracion en AppData se conservan.$\r$\n$\r$\nHaz clic en Siguiente para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; ── Pagina de bienvenida (desinstalador) ───────────────────────────────────
!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Desinstalar WPS5"
  !define MUI_WELCOMEPAGE_TEXT "Este asistente desinstalara WPS5 de tu equipo.$\r$\n$\r$\nTus datos de usuario en AppData no se eliminan, para que puedas reinstalar mas adelante sin perder la biblioteca ni la configuracion.$\r$\n$\r$\nHaz clic en Siguiente para continuar."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; ── Pagina de finalizacion con marca y opcion de iniciar la app ────────────
!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "WPS5 esta listo"
  !define MUI_FINISHPAGE_TEXT "La instalacion o actualizacion se completo correctamente.$\r$\n$\r$\nTus datos en AppData no se han modificado."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Iniciar WPS5 ahora"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
  !insertmacro MUI_PAGE_FINISH
!macroend

; ── Deteccion de instalacion previa y ajuste de $INSTDIR ───────────────────
; Si ya hay una instalacion previa (mismo appId) reutiliza su ubicacion. Si el
; nombre de carpeta antiguo no contiene "WPS5", usa la carpeta hermana WPS5:
; asi electron-builder no anida "...\FifthStation UI\WPS5" al comprobar
; APP_FILENAME. La copia vieja se desinstala por GUID/appId; los datos de
; AppData se conservan.
!macro customInit
  StrCpy $R9 ""

  ${If} $perUserInstallationFolder != ""
    StrCpy $R9 "$perUserInstallationFolder"
  ${ElseIf} $perMachineInstallationFolder != ""
    StrCpy $R9 "$perMachineInstallationFolder"
  ${EndIf}

  ${If} $R9 == ""
    ${If} ${FileExists} "$LOCALAPPDATA\Programs\WPS5\WPS5.exe"
      StrCpy $R9 "$LOCALAPPDATA\Programs\WPS5"
    ${ElseIf} ${FileExists} "$LOCALAPPDATA\Programs\FifthStation UI\FifthStation UI.exe"
      StrCpy $R9 "$LOCALAPPDATA\Programs\FifthStation UI"
    ${ElseIf} ${FileExists} "$LOCALAPPDATA\Programs\FifthStationUI\FifthStation UI.exe"
      StrCpy $R9 "$LOCALAPPDATA\Programs\FifthStationUI"
    ${ElseIf} ${FileExists} "$PROGRAMFILES\FifthStation UI\FifthStation UI.exe"
      StrCpy $R9 "$PROGRAMFILES\FifthStation UI"
    ${ElseIf} ${FileExists} "$PROGRAMFILES64\FifthStation UI\FifthStation UI.exe"
      StrCpy $R9 "$PROGRAMFILES64\FifthStation UI"
    ${ElseIf} ${FileExists} "$PROGRAMFILES\WPS5\WPS5.exe"
      StrCpy $R9 "$PROGRAMFILES\WPS5"
    ${ElseIf} ${FileExists} "$PROGRAMFILES64\WPS5\WPS5.exe"
      StrCpy $R9 "$PROGRAMFILES64\WPS5"
    ${EndIf}
  ${EndIf}

  ${If} $R9 != ""
    Push $R9
    Push "WPS5"
    Call WPS5StrContains
    Pop $R8
    ${If} $R8 != ""
      StrCpy $INSTDIR "$R9"
    ${Else}
      Push $R9
      Call WPS5GetParent
      Pop $R7
      ${If} $R7 != ""
        StrCpy $INSTDIR "$R7\WPS5"
      ${Else}
        StrCpy $INSTDIR "$R9"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; ── Cerrar procesos previos antes de instalar (customInit) ────────────────
  ; Se ejecuta SIEMPRE (sin depender de que exista el .exe en $INSTDIR) y
  ; antes de que corra el desinstalador de la version vieja, para que ese
  ; desinstalador no encuentre WPS5.exe abierto y muestre
  ; "No se puede cerrar WPS5".
  !insertmacro WPS5KillAppProcesses

  ; Recordar la carpeta de la instalacion previa para la limpieza posterior
  ; (WPS5PreCleanOldInstall); $R9 se pisa mas adelante, la variable no.
  StrCpy $WPS5OldInstDir "$R9"
!macroend

; ── Cierre en el desinstalador ─────────────────────────────────────────────
!macro customUnInit
  !insertmacro WPS5KillAppProcesses
!macroend

; ── Limpieza de restos heredados de FifthStation UI ────────────────────────
!macro customInstall
  Delete "$DESKTOP\FifthStation UI.lnk"
  Delete "$SMPROGRAMS\FifthStation UI.lnk"
  Delete "$INSTDIR\FifthStation UI.exe"
  Delete "$INSTDIR\Uninstall FifthStation UI.exe"
!macroend

; ── Cierre automático de la app si sigue en ejecucion ──────────────────────
; Al actualizar sobre una version previa, si WPS5.exe (o el legado
; FifthStation UI.exe) sigue abierto, el instalador lo termina automaticamente
; para poder sobrescribir los archivos. Usa taskkill directo (sin verificar
; primero con tasklist) para evitar dependencias de $CmdPath/$FindPath que a
; veces no estan definidas en el contexto del instalador. Si el proceso no
; existe, taskkill falla silenciosamente y se continúa igual.
; El instalador (WPS5-Setup-*.exe) no coincide con IMAGENAME eq WPS5.exe,
; por lo que nunca se auto-detecta ni se mata a si mismo.
!macro customCheckAppRunning
  ; customInit ya intento cerrar todo; aqui se reintenta por si la app
  ; (o un proceso auxiliar) fue relanzada entre medias.
  !insertmacro WPS5KillAppProcesses

  ; Solo en el instalador (no en el desinstalador): eliminar la version
  ; anterior nosotros mismos para no depender de su desinstalador.
  !ifndef BUILD_UNINSTALLER
    !insertmacro WPS5PreCleanOldInstall
  !endif
!macroend

; ── Funciones auxiliares (solo instalador) ─────────────────────────────────
; WPS5GetParent / WPS5StrContains las usa customInit. En el desinstalador no
; se invocan (customInit no se inserta), por eso se guardan con
; !ifndef BUILD_UNINSTALLER.
!ifndef BUILD_UNINSTALLER
Function WPS5GetParent
  Exch $R0
  Push $R1
  Push $R2
  StrLen $R1 $R0
  IntOp $R1 $R1 - 1
  WPS5GetParentLoop:
    IntCmp $R1 0 WPS5GetParentNotFound
    StrCpy $R2 $R0 1 $R1
    StrCmp $R2 "\" WPS5GetParentFound
    IntOp $R1 $R1 - 1
    Goto WPS5GetParentLoop
  WPS5GetParentFound:
    StrCpy $R0 $R0 $R1
    Goto WPS5GetParentDone
  WPS5GetParentNotFound:
    StrCpy $R0 ""
  WPS5GetParentDone:
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd

Function WPS5StrContains
  Exch $R0
  Exch
  Exch $R1
  Push $R2
  Push $R3
  Push $R4
  StrLen $R2 $R0
  StrCpy $R3 0
  loop:
    StrCpy $R4 $R1 $R2 $R3
    StrCmp $R4 "" notfound
    StrCmp $R4 $R0 found
    IntOp $R3 $R3 + 1
    Goto loop
  found:
    StrCpy $R0 $R4
    Goto done
  notfound:
    StrCpy $R0 ""
  done:
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
FunctionEnd
!endif
