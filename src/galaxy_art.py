#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「时光待办」专属的『时光银河 (Time Galaxy)』高清矢量星空背景与图标"""
import random
from pathlib import Path

BASE = Path(__file__).resolve().parent


def build_galaxy_svg(dark_mode: bool) -> str:
    rng = random.Random(20261124 if not dark_mode else 20261199)
    if not dark_mode:
        # 暮光星河：上下边缘同色闭环 (#2b1e54)，中段绽放梦幻紫粉星云，彻底消除手机顶栏/底栏分界线
        sky_stops = [
            ("0%", "#2b1e54"),
            ("26%", "#55337d"),
            ("56%", "#964f8a"),
            ("80%", "#683a7a"),
            ("100%", "#2b1e54"),
        ]
        nebula_1, nebula_2, nebula_3 = ("#ff8ec6", 0.44), ("#93c5fd", 0.34), ("#fde68a", 0.28)
        orbit_alpha = 0.20
    else:
        # 深空银河：上下边缘同色闭环 (#0b091e)，静谧午夜深蓝紫宇宙
        sky_stops = [
            ("0%", "#0b091e"),
            ("30%", "#1b153e"),
            ("58%", "#311b4f"),
            ("82%", "#191c42"),
            ("100%", "#0b091e"),
        ]
        nebula_1, nebula_2, nebula_3 = ("#ec4899", 0.30), ("#6366f1", 0.30), ("#38bdf8", 0.22)
        orbit_alpha = 0.15

    stops_xml = "\n      ".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in sky_stops)

    # 生成 170 颗不同色温与大小的繁星
    star_colors = ["#ffffff", "#fef3c7", "#fbcfe8", "#dbeafe", "#e9d5ff"]
    stars_xml = []
    for _ in range(170):
        x = rng.randint(12, 1588)
        y = rng.randint(12, 988)
        # 让对角线银河带附近星星更密集
        if rng.random() < 0.48:
            t = rng.random()
            x = int((t * 1550 + rng.gauss(0, 170)) % 1600)
            y = int(((1 - t * 0.78) * 920 + rng.gauss(0, 145)) % 1000)
        r = round(rng.uniform(0.7, 2.3), 2)
        op = round(rng.uniform(0.28, 0.92), 2)
        col = rng.choice(star_colors)
        stars_xml.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{col}" opacity="{op}"/>')

    # 生成 14 颗十字星芒 (4-point sparkles)
    sparkles_xml = []
    for _ in range(14):
        sx = rng.randint(80, 1520)
        sy = rng.randint(60, 900)
        sc = rng.uniform(5.5, 11.5)
        op = round(rng.uniform(0.55, 0.95), 2)
        d = (
            f"M{sx},{sy - sc:.1f} Q{sx},{sy} {sx + sc:.1f},{sy} "
            f"Q{sx},{sy} {sx},{sy + sc:.1f} Q{sx},{sy} {sx - sc:.1f},{sy} Q{sx},{sy} {sx},{sy - sc:.1f}Z"
        )
        sparkles_xml.append(
            f'<circle cx="{sx}" cy="{sy}" r="{sc * 1.4:.1f}" fill="#ffffff" opacity="{op * 0.18:.2f}"/>'
            f'<path d="{d}" fill="#ffffff" opacity="{op}"/>'
        )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      {stops_xml}
    </linearGradient>
    <radialGradient id="neb1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{nebula_1[0]}" stop-opacity="{nebula_1[1]}"/>
      <stop offset="55%" stop-color="{nebula_1[0]}" stop-opacity="{nebula_1[1] * 0.35:.2f}"/>
      <stop offset="100%" stop-color="{nebula_1[0]}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="neb2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{nebula_2[0]}" stop-opacity="{nebula_2[1]}"/>
      <stop offset="55%" stop-color="{nebula_2[0]}" stop-opacity="{nebula_2[1] * 0.35:.2f}"/>
      <stop offset="100%" stop-color="{nebula_2[0]}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="neb3" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{nebula_3[0]}" stop-opacity="{nebula_3[1]}"/>
      <stop offset="50%" stop-color="{nebula_3[0]}" stop-opacity="{nebula_3[1] * 0.3:.2f}"/>
      <stop offset="100%" stop-color="{nebula_3[0]}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="meteor" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.88"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="1000" fill="url(#sky)"/>

  <!-- 倾斜贯通天际的银河星云光带 -->
  <g transform="rotate(-24 800 500)">
    <ellipse cx="820" cy="470" rx="920" ry="230" fill="url(#neb1)"/>
    <ellipse cx="520" cy="520" rx="680" ry="180" fill="url(#neb2)"/>
    <ellipse cx="1080" cy="430" rx="560" ry="165" fill="url(#neb3)"/>
  </g>

  <!-- 时光星盘与星轨同心弧（呼应「时光待办」） -->
  <g fill="none" stroke="#ffffff" stroke-opacity="{orbit_alpha}">
    <circle cx="1380" cy="160" r="290" stroke-width="1"/>
    <circle cx="1380" cy="160" r="410" stroke-width="1" stroke-dasharray="6 10"/>
    <circle cx="1380" cy="160" r="540" stroke-width="0.8" stroke-opacity="{orbit_alpha * 0.65:.2f}"/>
    <circle cx="180" cy="890" r="340" stroke-width="1" stroke-dasharray="4 9"/>
  </g>

  <!-- 漫天繁星与十字星芒 -->
  <g>{"".join(stars_xml)}</g>
  <g>{"".join(sparkles_xml)}</g>

  <!-- 划过天际的双流星 -->
  <g transform="rotate(-26 420 210)">
    <rect x="280" y="209" width="165" height="2" rx="1" fill="url(#meteor)"/>
    <circle cx="445" cy="210" r="2.5" fill="#ffffff"/>
  </g>
  <g transform="rotate(-26 1160 640)" opacity="0.72">
    <rect x="1050" y="639" width="125" height="1.6" rx="0.8" fill="url(#meteor)"/>
    <circle cx="1175" cy="640" r="2" fill="#fde68a"/>
  </g>
</svg>'''


def build_galaxy_icon_svg() -> str:
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6D5DFB"/>
      <stop offset="52%" stop-color="#EC4899"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="20%" r="55%">
      <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.72"/>
      <stop offset="55%" stop-color="#F472B6" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#F472B6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6D4AFF"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="496" height="496" rx="112" fill="url(#bgGrad)" stroke="#FFFFFF" stroke-opacity="0.88" stroke-width="14"/>
  <rect x="15" y="15" width="482" height="482" rx="106" fill="url(#glow)"/>
  <circle cx="108" cy="102" r="6" fill="#FFFFFF" opacity="0.95"/>
  <circle cx="418" cy="96" r="5" fill="#FEF9C3" opacity="0.95"/>
  <circle cx="84" cy="396" r="4.5" fill="#FFFFFF" opacity="0.85"/>
  <circle cx="390" cy="132" r="106" fill="none" stroke="#FFFFFF" stroke-opacity="0.32" stroke-width="3" stroke-dasharray="8 10"/>
  <rect x="96" y="118" width="320" height="292" rx="54" fill="#FFFFFF" fill-opacity="0.96"/>
  <circle cx="176" cy="214" r="26" fill="url(#accentGrad)"/>
  <path d="M164 214l9 9 17-18" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="224" y="198" width="136" height="16" rx="8" fill="#1E1638"/>
  <rect x="224" y="224" width="92" height="10" rx="5" fill="#10B981"/>
  <circle cx="176" cy="312" r="24" fill="none" stroke="#6D4AFF" stroke-width="6"/>
  <path d="M176 299v14l9 6" fill="none" stroke="#EC4899" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="224" y="296" width="120" height="16" rx="8" fill="#4B4066"/>
  <rect x="224" y="322" width="78" height="10" rx="5" fill="#3B82F6"/>
</svg>'''


if __name__ == "__main__":
    (BASE / "galaxy-light.svg").write_text(build_galaxy_svg(False), encoding="utf-8")
    (BASE / "galaxy-dark.svg").write_text(build_galaxy_svg(True), encoding="utf-8")
    (BASE / "icon.svg").write_text(build_galaxy_icon_svg(), encoding="utf-8")
    print("Generated galaxy-light.svg, galaxy-dark.svg, icon.svg")
