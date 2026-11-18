; Included by electron-builder's NSIS installer (resources/ is its build resources folder).
; Saved as UTF-8 with a BOM so NSIS reads the Chinese text correctly.

; Always install for the current user: no administrator prompt, now or for later updates,
; so the "install for all users / only for me" page is skipped.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; A welcome page first, like most installers (the image on its left is installerSidebar.bmp).
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Finish page with two ticked boxes, like most installers: "运行 Hearth" and "创建桌面快捷方式".
; electron-builder creates the desktop shortcut while installing; unticking the box removes it.
; Updates keep whatever the user chose (electron-builder's KeepShortcuts), and uninstalling removes it.
!macro customFinishPage
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION HearthRunApp
  !define MUI_FINISHPAGE_SHOWREADME
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "创建桌面快捷方式"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION HearthKeepDesktopShortcut
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE HearthFinishLeave
  !insertmacro MUI_PAGE_FINISH

  Function HearthRunApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function HearthKeepDesktopShortcut
    ; Ticked: the shortcut made during installation stays.
  FunctionEnd

  Function HearthFinishLeave
    ${NSD_GetState} $mui.FinishPage.ShowReadme $0
    ${if} $0 <> ${BST_CHECKED}
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${endif}
  FunctionEnd
!macroend
