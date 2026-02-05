; Inno Setup — install LawTrack Agent from PyInstaller ONDIR (folder) build.
; Use this if the onefile build fails with setuptools/Lorem ipsum errors.
; Build: pyinstaller lawtrack_agent_onedir.spec
; Then: iscc installer_onedir.iss

#define MyAppName "LawTrack Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "LawTrack"
#define MyAppExeName "LawTrackAgent.exe"
#define MyAppSourceDir "dist\LawTrackAgent"
#define MyAppIcon "lawtrack.ico"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\LawTrack Agent
DefaultGroupName=LawTrack
DisableProgramGroupPage=yes
OutputDir=installer_output
OutputBaseFilename=LawTrackAgent-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile={#MyAppIcon}
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startup"; Description: "Run LawTrack Agent when I sign in"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "{#MyAppSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Start time tracking for LawTrack"
Name: "{autostartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup; Comment: "LawTrack time tracking"

; Register lawtrack:// so the website "Open LawTrack Desktop" link works (lawtrack://open, etc.).
; Browser passes full URL as %1 to the exe. HKCU = per-user, no admin needed for registration.
[Registry]
Root: HKCU; Subkey: "Software\Classes\lawtrack"; ValueType: string; ValueName: ""; ValueData: "URL:LawTrack Agent Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\lawtrack\URL Protocol"; ValueType: string; ValueName: ""; ValueData: ""; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\lawtrack\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletekey

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  EnvPath: string;
  EnvContent: string;
begin
  if CurStep = ssPostInstall then
  begin
    EnvPath := ExpandConstant('{app}') + '\.env';
    if not FileExists(EnvPath) then
    begin
      EnvContent := '# LawTrack Agent config' + #13#10 +
        'LAWTRACK_API_URL=https://lawtrack-production.up.railway.app' + #13#10 +
        'LAWTRACK_API_KEY=' + #13#10 +
        'LAWTRACK_MIN_SECONDS=60' + #13#10;
      SaveStringToFile(EnvPath, EnvContent, False);
    end;
  end;
end;
