; Assisted installer with directory selection, restricted to the current user.
; The upstream installer otherwise exposes an all-users installation page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  ; Do not permit a command-line override to turn this into a machine install.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/allusers" $R1
  ${IfNot} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"
  !insertmacro setInstallModePerUser
!macroend

!macro customUnInit
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"
  !insertmacro setInstallModePerUser
!macroend
