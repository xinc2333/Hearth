; Included by electron-builder's NSIS installer (resources/ is its build resources folder).

; Always install for the current user: no administrator prompt, now or for later updates,
; so the "install for all users / only for me" page is skipped.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
