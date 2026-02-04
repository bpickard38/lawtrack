; Inno Setup script for LawTrack Agent
; Build: iscc installer.iss  (requires Inno Setup 6)
; Prerequisite: Build the .exe first with PyInstaller:
;   pip install pyinstaller
;   pyinstaller lawtrack_agent.spec
; Then run iscc from the Agent folder (or pass full path to dist\LawTrackAgent.exe).

#define MyAppName "LawTrack Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "LawTrack"
#define MyAppExeName "LawTrackAgent.exe"
; Path to the built exe (relative to this script)
#define MyAppSource "dist\LawTrackAgent.exe"

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

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startup"; Description: "Run LawTrack Agent when I sign in"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "{#MyAppSource}"; DestDir: "{app}"; Flags: ignoreversion
; Optional: ship a sample .env so user can edit (installer can create from template)
Source: ".env.example"; DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Start time tracking for LawTrack"
Name: "{autostartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup; Comment: "LawTrack time tracking"

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
      EnvContent := '# LawTrack Agent config - edit with your API URL and key' + #13#10 +
        'LAWTRACK_API_URL=https://lawtrack-production.up.railway.app' + #13#10 +
        'LAWTRACK_API_KEY=' + #13#10 +
        'LAWTRACK_MIN_SECONDS=60' + #13#10;
      SaveStringToFile(EnvPath, EnvContent, False);
    end;
  end;
end;
