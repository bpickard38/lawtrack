"""
Generate lawtrack.ico (purple/indigo square with white L) for the app and installer.
Run from Agent folder: python build_icon.py
"""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Install Pillow: pip install Pillow")
    raise

# Match app.py tray icon: indigo background, white L
INDIGO = (99, 102, 241, 255)
WHITE = (255, 255, 255, 255)

def draw_l_on_image(img: Image.Image, margin_ratio: float = 0.2) -> None:
    """Draw white L on image. margin_ratio = fraction of size for padding."""
    w, h = img.size
    m = int(min(w, h) * margin_ratio)
    # Vertical bar of L
    bar_w = max(2, (w - 2 * m) // 6)
    bar_top = m
    bar_bottom = h - m
    # Horizontal foot
    foot_h = max(2, (h - 2 * m) // 6)
    foot_left = m
    foot_right = w - m
    d = ImageDraw.Draw(img)
    d.rectangle([m, bar_top, m + bar_w, bar_bottom], fill=WHITE)
    d.rectangle([m, bar_bottom - foot_h, foot_right, bar_bottom], fill=WHITE)

def main():
    # One large image; Pillow will generate smaller sizes for the .ico
    size = 256
    img = Image.new("RGBA", (size, size), INDIGO)
    draw_l_on_image(img)
    out = Path(__file__).resolve().parent / "lawtrack.ico"
    img.save(out, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (256, 256)])
    print("Wrote", out)

if __name__ == "__main__":
    main()
