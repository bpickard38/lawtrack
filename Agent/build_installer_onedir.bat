@echo off
REM Build LawTrack Agent as a FOLDER (onedir) to avoid setuptools/Lorem ipsum errors.
REM Then build the installer that installs that folder.
set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    echo Inno Setup not found. Edit path in this script or add ISCC to PATH.
    exit /b 1
)
echo Building onedir (folder) exe...
pyinstaller --clean lawtrack_agent_onedir.spec
if %ERRORLEVEL% neq 0 exit /b 1
echo Building installer...
"%ISCC%" installer_onedir.iss
if %ERRORLEVEL% equ 0 (
    echo Done. Installer: installer_output\LawTrackAgent-Setup.exe
) else (
    exit /b 1
)
