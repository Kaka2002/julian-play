from pathlib import Path
import math

from PIL import Image, ImageDraw


render_dir = Path(r"D:\julian-play\outputs\apresentacao-julian-play-render")
files = sorted(render_dir.glob("slide-*.png"), key=lambda p: int(p.stem.split("-")[1]))
thumbs = []

for path in files:
    image = Image.open(path).convert("RGB")
    image.thumbnail((320, 180))
    canvas = Image.new("RGB", (320, 200), "white")
    canvas.paste(image, (0, 0))
    ImageDraw.Draw(canvas).text((8, 184), path.stem, fill=(0, 0, 0))
    thumbs.append(canvas)

columns = 4
rows = math.ceil(len(thumbs) / columns)
montage = Image.new("RGB", (columns * 320, rows * 200), "white")

for index, thumb in enumerate(thumbs):
    montage.paste(thumb, ((index % columns) * 320, (index // columns) * 200))

montage.save(render_dir / "montage-small.jpg", quality=85)
