@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
if exist "%~dp0dist\v1.8\win-unpacked\BA-Desktop-Pet.exe" (
  start "" "%~dp0dist\v1.8\win-unpacked\BA-Desktop-Pet.exe"
) else (
  echo The app has not been built. Run npm install and npm run pack first.
  pause
)
