"""Set the banner PDFs to exactly 300 x 100 cm.

Chromium rounds the page size it is asked for (it writes 300.04 x 100.02 cm). This places each page, still
all vector, on a page of the exact size.

    pip install pymupdf
    python design/banner/src/exact_pdf.py      (after export.js)
"""
import os

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CM = 72 / 2.54                                   # PDF points per centimetre
W, H = 300 * CM, 100 * CM

for path in (os.path.join(ROOT, 'emese-banner-300x100cm.pdf'), os.path.join(ROOT, 'light', 'emese-banner-300x100cm.pdf')):
    src = pymupdf.open(path)
    out = pymupdf.open()
    page = out.new_page(width=W, height=H)
    page.show_pdf_page(page.rect, src, 0, keep_proportion=False)
    out.set_metadata({'title': 'ايميز لتجارة الملابس | EMESE banner 300 x 100 cm', 'creator': 'EMESE'})
    data = out.tobytes(garbage=3, deflate=True)
    src.close()
    out.close()
    with open(path, 'wb') as f:
        f.write(data)
    print(os.path.relpath(path, ROOT), f'{W / CM:.2f} x {H / CM:.2f} cm')
