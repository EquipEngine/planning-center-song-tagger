@echo off
rem Double-click this file to open the Horizontal-Vertical Song Tagger.
cd /d "%~dp0"
title Horizontal-Vertical Song Tagger
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 hv_tagger.py
  goto done
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
if %errorlevel%==0 (
  python hv_tagger.py
  goto done
)
echo.
echo   This tool needs Python 3, which isn't installed on this computer yet.
echo.
echo   1. Download Python from https://www.python.org/downloads/
echo   2. When the installer opens, check the box "Add python.exe to PATH".
echo   3. Click Install Now, then double-click Start Tagger again.
:done
echo.
pause
