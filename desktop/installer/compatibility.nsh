; Keep profile and upgrade identities stable while renaming the executable.
!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$INSTDIR\fit-connect-integration-client.exe"
    !insertmacro CheckIfAppIsRunning "$INSTDIR\fit-connect-integration-client.exe" "${PRODUCTNAME}"
  ${EndIf}
!macroend

; Delete only legacy-named shortcuts targeting this installation, with either
; the previous or current executable name. Never remove unrelated shortcuts.
!macro RemoveLegacyShortcut PATH
  !insertmacro IsShortcutTarget "${PATH}" "$INSTDIR\fit-connect-integration-client.exe"
  Pop $0
  ${If} $0 != 1
    !insertmacro IsShortcutTarget "${PATH}" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
  ${EndIf}
  ${If} $0 = 1
    !insertmacro UnpinShortcut "${PATH}"
    Delete "${PATH}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro RemoveLegacyShortcut "$SMPROGRAMS\FIT-Connect Test-Client.lnk"
  !insertmacro RemoveLegacyShortcut "$DESKTOP\FIT-Connect Test-Client.lnk"
!macroend
