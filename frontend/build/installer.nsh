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

; ── Dependencias de customCheckAppRunning ──────────────────────────────────
; customCheckAppRunning reutiliza las macros IS_POWERSHELL_AVAILABLE y
; _CHECK_APP_RUNNING que provee electron-builder
; (allowOnlyOneInstallerInstance.nsh). Esas macros usan getProcessInfo.nsh y
; la variable global $pid, pero electron-builder solo las incluye/declara de
; forma automatica cuando NO se define customCheckAppRunning. Como aqui si la
; definimos, las proveemos nosotros. Es necesario en ambos builds: el
; instalador y el desinstalador llaman a CHECK_APP_RUNNING.
!include "getProcessInfo.nsh"
Var pid

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
!macroend

; ── Limpieza de restos heredados de FifthStation UI ────────────────────────
!macro customInstall
  Delete "$DESKTOP\FifthStation UI.lnk"
  Delete "$SMPROGRAMS\FifthStation UI.lnk"
  Delete "$INSTDIR\FifthStation UI.exe"
  Delete "$INSTDIR\Uninstall FifthStation UI.exe"
!macroend

; ── Cierre de la app si sigue en ejecucion ─────────────────────────────────
; Reutiliza los helpers de electron-builder para WPS5.exe y anade el cierre de
; la app heredada FifthStation UI.exe, que _CHECK_APP_RUNNING no detecta (solo
; busca APP_EXECUTABLE_FILENAME = WPS5.exe).
!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING

  nsExec::Exec `"$CmdPath" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq FifthStation UI.exe" /FO CSV | "$FindPath" "FifthStation UI.exe"`
  Pop $R0
  ${If} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "FifthStation UI sigue en ejecucion. Cieralo para continuar la actualizacion." /SD IDOK IDOK wps5StopLegacy
    Quit
    wps5StopLegacy:
    nsExec::Exec `"$CmdPath" /C taskkill /IM "FifthStation UI.exe" /FI "USERNAME eq %USERNAME%"`
    Pop $R0
    Sleep 800
  ${EndIf}
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
