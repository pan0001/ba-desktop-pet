@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
if exist "%~dp0dist\releases\v1.9.0\win-unpacked\BA-Desktop-Pet.exe" (
  start "" "%~dp0dist\releases\v1.9.0\win-unpacked\BA-Desktop-Pet.exe"
) else if exist "%~dp0dist\v1.9\win-unpacked\BA-Desktop-Pet.exe" (
  start "" "%~dp0dist\v1.9\win-unpacked\BA-Desktop-Pet.exe"
) else (
  echo The app has not been built. Run npm install and npm run pack first.
  pause
)
