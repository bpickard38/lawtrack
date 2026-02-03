@echo off
REM Build LawTrack installer using Inno Setup (no PATH needed)
set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    echo Inno Setup not found at "%ISCC%"
    echo Install from https://jrsoftware.org/isinfo.php or edit this path in build_installer.bat
    exit /b 1
)
"%ISCC%" installer.iss
if %ERRORLEVEL% equ 0 (
    echo.
    echo Done. Installer: installer_output\LawTrackAgent-Setup.exe
) else (
    exit /b 1
)
