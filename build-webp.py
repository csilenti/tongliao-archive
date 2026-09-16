# -*- coding: utf-8 -*-
# 封面图压缩：photo/**/*.png → photo_webp/*.webp（960w 详情图）+ photo_webp/thumb/*.webp（480w 缩略图）
# 不动原图，输出到新目录
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
PHOTO = os.path.join(ROOT, 'photo')
OUT = os.path.join(ROOT, 'photo_webp')
THUMB = os.path.join(OUT, 'thumb')

os.makedirs(OUT, exist_ok=True)
os.makedirs(THUMB, exist_ok=True)

total_src = 0
total_out = 0
count = 0

for dirpath, _, files in os.walk(PHOTO):
    rel = os.path.relpath(dirpath, PHOTO)
    for f in files:
        if not f.lower().endswith('.png'):
            continue
        src = os.path.join(dirpath, f)
        total_src += os.path.getsize(src)
        img = Image.open(src).convert('RGB')
        w, h = img.size

        # 详情图：960w 等比
        if w > 960:
            img_big = img.resize((960, round(h * 960 / w)), Image.LANCZOS)
        else:
            img_big = img
        # 缩略图：480w 等比
        tw = min(480, w)
        img_thumb = img.resize((tw, round(h * tw / w)), Image.LANCZOS)

        # 输出路径：保持相对结构
        if rel == '.':
            big_path = os.path.join(OUT, f[:-4] + '.webp')
            th_path = os.path.join(THUMB, f[:-4] + '.webp')
        else:
            d1, d2 = os.path.join(OUT, rel), os.path.join(THUMB, rel)
            os.makedirs(d1, exist_ok=True); os.makedirs(d2, exist_ok=True)
            big_path = os.path.join(d1, f[:-4] + '.webp')
            th_path = os.path.join(d2, f[:-4] + '.webp')

        img_big.save(big_path, 'WEBP', quality=82, method=6)
        img_thumb.save(th_path, 'WEBP', quality=78, method=6)

        total_out += os.path.getsize(big_path) + os.path.getsize(th_path)
        count += 1
        print(f'{rel}/{f}: {w}x{h} -> {img_big.size[0]}x{img_big.size[1]}')

print(f'\nDone. {count} images')
print(f'src:  {total_src/1048576:.1f} MB (png)')
print(f'out:  {total_out/1048576:.1f} MB (webp big+thumb)')
