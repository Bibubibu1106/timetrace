#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import base64
import math
import struct
import zipfile
import zlib
from pathlib import Path
import galaxy_art

BASE = Path(__file__).resolve().parent


def make_png(size: int) -> bytes:
    raw = bytearray()
    s = float(size)
    for y in range(size):
        raw.append(0)
        ny = y / s
        for x in range(size):
            nx = x / s
            # 1. 时光银河深邃星云紫 -> 玫瑰星尘渐变底色
            t = (nx * 0.52 + ny * 0.48)
            r = int(46 * (1 - t) + 217 * t)
            g = int(31 * (1 - t) + 114 * t)
            b = int(94 * (1 - t) + 158 * t)

            # 星云光带柔光
            dneb = abs((nx - 0.5) * 0.65 + (ny - 0.45) * 0.75)
            if dneb < 0.22:
                nk = (0.22 - dneb) / 0.22 * 0.28
                r = min(255, int(r + 120 * nk))
                g = min(255, int(g + 70 * nk))
                b = min(255, int(b + 110 * nk))

            # 角落星辰亮点
            for sx, sy, sr in ((0.22, 0.19, 0.022), (0.80, 0.17, 0.018), (0.16, 0.77, 0.016), (0.84, 0.75, 0.019)):
                if math.hypot(nx - sx, ny - sy) < sr:
                    r, g, b = 254, 243, 199

            # 磨砂白圆角清单卡片
            cx0, cx1, cy0, cy1, cr = 0.19, 0.81, 0.23, 0.80, 0.11
            if cx0 - cr <= nx <= cx1 + cr and cy0 - cr <= ny <= cy1 + cr:
                dx = max(abs(nx - 0.5) - (0.31 - cr), 0.0)
                dy = max(abs(ny - 0.515) - (0.285 - cr), 0.0)
                dist = math.hypot(dx, dy) - cr
                if dist < 0.008:
                    k = max(0.0, min(1.0, (0.008 - dist) / 0.012)) * 0.94
                    r = int(r * (1 - k) + 255 * k)
                    g = int(g * (1 - k) + 255 * k)
                    b = int(b * (1 - k) + 255 * k)

                    # 第一行：星云紫完成圆章 + 对勾 + 翡翠绿时间条
                    dc1 = math.hypot(nx - 0.34, ny - 0.42)
                    if dc1 < 0.062:
                        ck = max(0.0, min(1.0, (0.062 - dc1) / 0.01))
                        r = int(r * (1 - ck) + 124 * ck)
                        g = int(g * (1 - ck) + 92 * ck)
                        b = int(b * (1 - ck) + 250 * ck)
                        if (0.312 <= nx <= 0.335 and abs((ny - 0.42) - (nx - 0.312)) < 0.013) or (
                            0.333 <= nx <= 0.372 and abs((ny - 0.443) + (nx - 0.333) * 1.05) < 0.013
                        ):
                            r, g, b = 255, 255, 255
                    if 0.44 <= nx <= 0.72 and 0.392 <= ny <= 0.422:
                        r, g, b = 39, 30, 66
                    if 0.44 <= nx <= 0.62 and 0.442 <= ny <= 0.462:
                        r, g, b = 16, 185, 129

                    # 第二行：星轨粉紫时钟圆环 + 钴蓝时间条
                    dc2 = math.hypot(nx - 0.34, ny - 0.615)
                    if 0.044 <= dc2 <= 0.060:
                        r, g, b = 124, 92, 250
                    if (abs(nx - 0.34) < 0.009 and 0.58 <= ny <= 0.617) or (
                        0.34 <= nx <= 0.366 and abs((ny - 0.615) - (nx - 0.34) * 0.65) < 0.009
                    ):
                        r, g, b = 236, 72, 153
                    if 0.44 <= nx <= 0.69 and 0.587 <= ny <= 0.617:
                        r, g, b = 82, 70, 115
                    if 0.44 <= nx <= 0.59 and 0.637 <= ny <= 0.657:
                        r, g, b = 59, 130, 246

            raw.extend((r, g, b, 255))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack("!IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


light_svg = galaxy_art.build_galaxy_svg(False)
dark_svg = galaxy_art.build_galaxy_svg(True)
icon_svg = galaxy_art.build_galaxy_icon_svg()
(BASE / "galaxy-light.svg").write_text(light_svg, encoding="utf-8")
(BASE / "galaxy-dark.svg").write_text(dark_svg, encoding="utf-8")
(BASE / "icon.svg").write_text(icon_svg, encoding="utf-8")

png180 = make_png(180)
png192 = make_png(192)
(BASE / "apple-touch-icon.png").write_bytes(png180)
(BASE / "icon-192.png").write_bytes(png192)

html = (BASE / "template.html").read_text(encoding="utf-8")
css = (BASE / "styles.css").read_text(encoding="utf-8")
light_uri = "data:image/svg+xml;base64," + base64.b64encode(light_svg.encode("utf-8")).decode("ascii")
dark_uri = "data:image/svg+xml;base64," + base64.b64encode(dark_svg.encode("utf-8")).decode("ascii")
svg_b64 = "data:image/svg+xml;base64," + base64.b64encode(icon_svg.encode("utf-8")).decode("ascii")
png_uri = "data:image/png;base64," + base64.b64encode(png180).decode("ascii")

css = css.replace('url("./galaxy-light.svg")', f'url("{light_uri}")')
css = css.replace('url("./galaxy-dark.svg")', f'url("{dark_uri}")')

store_js = (BASE / "store.js").read_text(encoding="utf-8")
sync_js = (BASE / "sync.js").read_text(encoding="utf-8")
app_js = (BASE / "app.js").read_text(encoding="utf-8")

inlined = html.replace('<link rel="stylesheet" href="./styles.css" />', f"<style>\n{css}\n</style>")
inlined = inlined.replace('src="./icon.svg"', f'src="{svg_b64}"')
inlined = inlined.replace('<script src="./store.js"></script>', f"<script>\n{store_js}\n</script>")
inlined = inlined.replace('<script src="./sync.js"></script>', f"<script>\n{sync_js}\n</script>")
inlined = inlined.replace('<script src="./app.js"></script>', f"<script>\n{app_js}\n</script>")

(BASE / "index.html").write_text(inlined, encoding="utf-8")

standalone = inlined.replace('<link rel="manifest" href="./manifest.json" />\n  ', "")
standalone = standalone.replace('href="./icon.svg"', f'href="{svg_b64}"')
standalone = standalone.replace('href="./apple-touch-icon.png"', f'href="{png_uri}"')
out_html = BASE / "时光待办.html"
out_html.write_text(standalone, encoding="utf-8")

zip_path = BASE / "时光待办_网页部署包.zip"
web_files = ["index.html", "manifest.json", "sw.js", "icon.svg", "icon-192.png", "apple-touch-icon.png"]
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for fn in web_files:
        zf.write(BASE / fn, arcname=fn)

print("Bundled Time-Galaxy HTML:", out_html)
print("Packed Web Deploy ZIP:", zip_path, f"({zip_path.stat().st_size} bytes)")
