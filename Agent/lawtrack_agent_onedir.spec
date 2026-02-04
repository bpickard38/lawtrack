# PyInstaller spec for LawTrack Agent — FOLDER (onedir) build
# Avoids onefile temp extraction issues (e.g. setuptools Lorem ipsum / base_library).
# Build: pyinstaller lawtrack_agent_onedir.spec
# Output: dist/LawTrackAgent/LawTrackAgent.exe (and folder of deps)
# Then run build_installer_onedir.bat to build an installer that uses this folder.

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
    [],
    exclude_binaries=True,  # onedir: exe and deps in folder
    name='LawTrackAgent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon='lawtrack.ico',
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='LawTrackAgent',
)
