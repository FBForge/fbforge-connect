; Remove only legacy-named shortcuts that still point to this exact application.
; Installation/profile/upgrade registry identities are stable in installer.nsi.
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro IsShortcutTarget "$SMPROGRAMS\FIT-Connect Test-Client.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "$SMPROGRAMS\FIT-Connect Test-Client.lnk"
    Delete "$SMPROGRAMS\FIT-Connect Test-Client.lnk"
  ${EndIf}
  !insertmacro IsShortcutTarget "$DESKTOP\FIT-Connect Test-Client.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "$DESKTOP\FIT-Connect Test-Client.lnk"
    Delete "$DESKTOP\FIT-Connect Test-Client.lnk"
  ${EndIf}
!macroend
