# PyInstaller spec for LawTrack Agent (tray app, single .exe)
# Build: pyinstaller lawtrack_agent.spec
# Output: dist/LawTrackAgent.exe

# When running as onefile, .env should sit next to the .exe in the same folder.

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'pystray',
        'PIL',
        'PIL._tkinter_finder',
        'win32gui',
        'win32process',
        'win32api',
        'win32con',
        'pywintypes',
        'pythoncom',
        'psutil',
        'requests',
        'dotenv',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Exclude setuptools/pkg_resources to avoid pyi_rth_pkgres and missing Lorem ipsum.txt
    excludes=[
        'matplotlib', 'numpy', 'pandas', 'scipy', 'IPython', 'jupyter',
        'pkg_resources', 'setuptools', 'setuptools_scm',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='LawTrackAgent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # No console window when double-clicking (tray only)
    onefile=True,   # Single .exe for easy install
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Optional: add icon='lawtrack.ico' if you have one
)
