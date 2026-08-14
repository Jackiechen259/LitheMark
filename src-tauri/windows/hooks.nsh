; LitheMark Windows shell integration hooks.
;
; Tauri's NSIS installer includes this file and calls the NSIS_HOOK_* macros:
;   - NSIS_HOOK_POSTINSTALL   after files are copied and Tauri's own file
;                             associations are registered
;   - NSIS_HOOK_PREUNINSTALL  before files and registry entries are removed
;
; These hooks only add and remove LitheMark's own "Open with LitheMark" verb
; under the per-extension SystemFileAssociations keys.
;
; Why SystemFileAssociations: verbs registered there appear on the context
; menu of every .md / .markdown file regardless of which app is the default
; handler, and they never touch the user's chosen default app or UserChoice.
; The `fileAssociations` entry in tauri.conf.json separately registers
; LitheMark's ProgID for .md / .markdown; this verb is a dedicated,
; always-visible entry on top of that.
;
; The keys are written to both HKLM (per-machine installs run elevated) and
; HKCU (per-user installs), and uninstall deletes exactly these keys — never
; the .md / .markdown type trees, never another app's associations. The
; executable name must match the Cargo package name (lithemark.exe), which is
; also the name Tauri gives the bundled main binary.
;
; Writes are idempotent, so reinstalls and upgrades never stack duplicate
; entries, and the uninstaller removes everything LitheMark added.

!macro registerLitheMarkOpenVerb
  ; .md — machine-wide
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open" "" "Open with LitheMark"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open" "MUIVerb" "Open with LitheMark"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open" "Icon" "$INSTDIR\lithemark.exe,0"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open\command" "" '"$INSTDIR\lithemark.exe" "%1"'
  ; .markdown — machine-wide
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open" "" "Open with LitheMark"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open" "MUIVerb" "Open with LitheMark"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open" "Icon" "$INSTDIR\lithemark.exe,0"
  WriteRegStr HKLM "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open\command" "" '"$INSTDIR\lithemark.exe" "%1"'
  ; .md — current user (per-user Classes merge over the machine hive)
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open" "" "Open with LitheMark"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open" "MUIVerb" "Open with LitheMark"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open" "Icon" "$INSTDIR\lithemark.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open\command" "" '"$INSTDIR\lithemark.exe" "%1"'
  ; .markdown — current user
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open" "" "Open with LitheMark"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open" "MUIVerb" "Open with LitheMark"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open" "Icon" "$INSTDIR\lithemark.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open\command" "" '"$INSTDIR\lithemark.exe" "%1"'
  ; Tell Explorer that the file-type menus changed.
  !insertmacro UPDATEFILEASSOC
!macroend

!macro unregisterLitheMarkOpenVerb
  ; Delete only the LitheMark-owned verb keys; the .md / .markdown type trees
  ; and every other app's associations stay untouched.
  DeleteRegKey HKLM "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open"
  DeleteRegKey HKLM "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.md\shell\LitheMark.Open"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\LitheMark.Open"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro registerLitheMarkOpenVerb
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro unregisterLitheMarkOpenVerb
!macroend
