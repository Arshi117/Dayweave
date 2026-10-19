@echo off
setlocal
set "DAYWEAVE_DIR=%~dp0"
if not exist "%DAYWEAVE_DIR%node_modules\electron\dist\electron.exe" (
  echo Dayweave needs its installed dependencies. Run npm install in this folder.
  pause
  exit /b 1
)
if not exist "%DAYWEAVE_DIR%out\main\index.js" (
  echo Dayweave needs a build. Run npm run build in this folder.
  pause
  exit /b 1
)
start "" /D "%DAYWEAVE_DIR%" "%DAYWEAVE_DIR%node_modules\electron\dist\electron.exe" .
