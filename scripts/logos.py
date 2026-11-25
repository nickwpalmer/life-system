"""Builds the logo variants in public/logos from one N shape. Run: python3 scripts/logos.py"""
import subprocess, pathlib
N = 'M128 404 V108 H198 L314 290 V108 H384 V404 H314 L198 222 V404 Z'
SPARK = 'M432 52 C435 72 440 77 460 80 C440 83 435 88 432 108 C429 88 424 83 404 80 C424 77 429 72 432 52 Z'
HI = '<radialGradient id="h" cx=".22" cy=".14" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>'
def svg(defs, bg, n_fill, extra='', spark='#fff'):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>{defs}{HI}</defs>
{bg}<path d="{N}" fill="{n_fill}" stroke="{n_fill}" stroke-width="16" stroke-linejoin="round"/>{extra}
<path d="{SPARK}" fill="{spark}" opacity=".95"/></svg>'''
V = {
 'classic': svg('<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb35f"/><stop offset=".48" stop-color="#ff7cc0"/><stop offset="1" stop-color="#9b7bff"/></linearGradient>',
   '<rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#h)"/>', '#fff'),
 'rings': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241a38"/><stop offset="1" stop-color="#120d1c"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#b)"/><circle cx="256" cy="256" r="168" fill="none" stroke="#ffa463" stroke-opacity=".18" stroke-width="46"/><path d="M256.0 88.0 A168 168 0 1 1 91.0 224.5" fill="none" stroke="#ffa463" stroke-width="46" stroke-linecap="round"/><circle cx="256" cy="256" r="112" fill="none" stroke="#ff8cc8" stroke-opacity=".18" stroke-width="46"/><path d="M256.0 144.0 A112 112 0 1 1 179.3 337.6" fill="none" stroke="#ff8cc8" stroke-width="46" stroke-linecap="round"/><circle cx="256" cy="256" r="56" fill="none" stroke="#a98bff" stroke-opacity=".18" stroke-width="46"/><path d="M256.0 200.0 A56 56 0 1 1 212.9 220.3" fill="none" stroke="#a98bff" stroke-width="46" stroke-linecap="round"/>
<path d="M432 52 C435 72 440 77 460 80 C440 83 435 88 432 108 C429 88 424 83 404 80 C424 77 429 72 432 52 Z" fill="#ffd66b" opacity=".95"/></svg>''',
 'bloom': '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc08a"/><stop offset=".5" stop-color="#ff9fd0"/><stop offset="1" stop-color="#b9a2ff"/></linearGradient><radialGradient id="h" cx=".22" cy=".14" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#g)"/><rect width="512" height="512" fill="url(#h)"/><ellipse cx="256" cy="166" rx="54" ry="96" fill="#fff" fill-opacity=".34" transform="rotate(0 256 256)"/><ellipse cx="256" cy="166" rx="54" ry="96" fill="#fff" fill-opacity=".34" transform="rotate(60 256 256)"/><ellipse cx="256" cy="166" rx="54" ry="96" fill="#fff" fill-opacity=".34" transform="rotate(120 256 256)"/><ellipse cx="256" cy="166" rx="54" ry="96" fill="#fff" fill-opacity=".34" transform="rotate(180 256 256)"/><ellipse cx="256" cy="166" rx="54" ry="96" fill="#fff" fill-opacity=".34" transform="rotate(240 256 256)"/><ellipse cx="256" cy="166" rx="54" ry="96" fill="#fff" fill-opacity=".34" transform="rotate(300 256 256)"/><circle cx="256" cy="256" r="46" fill="#fff"/></svg>''',
 'mono': svg('', '<rect width="512" height="512" fill="#0b0b0b"/>', '#fff'),
 'glass': svg('<radialGradient id="o" cx=".2" cy=".2" r=".7"><stop offset="0" stop-color="#ffa463"/><stop offset="1" stop-color="#ffa463" stop-opacity="0"/></radialGradient><radialGradient id="p" cx=".85" cy=".85" r=".75"><stop offset="0" stop-color="#a98bff"/><stop offset="1" stop-color="#a98bff" stop-opacity="0"/></radialGradient><radialGradient id="k" cx=".8" cy=".15" r=".6"><stop offset="0" stop-color="#ff8cc8" stop-opacity=".9"/><stop offset="1" stop-color="#ff8cc8" stop-opacity="0"/></radialGradient><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient>',
   '<rect width="512" height="512" fill="#2a1d44"/><rect width="512" height="512" fill="url(#o)"/><rect width="512" height="512" fill="url(#p)"/><rect width="512" height="512" fill="url(#k)"/><rect x="40" y="40" width="432" height="432" rx="110" fill="url(#gl)" stroke="#fff" stroke-opacity=".55" stroke-width="5"/>',
   '#fff', extra='<path d="M128 108 H198 L208 124 H140 V404 H128 Z" fill="#fff" opacity=".0"/>'),
}
out = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'logos'
out.mkdir(exist_ok=True)
for k, s in V.items():
    p = out / f'{k}.svg'; p.write_text(s)
    # Rendered with @resvg/resvg-js (RESVG_DIR points at a folder where it's installed).
    for size in (180, 512):
        subprocess.run(['node', '-e', f"const {{Resvg}}=require(process.env.RESVG_DIR+'/node_modules/@resvg/resvg-js');const fs=require('fs');fs.writeFileSync('{out / f'{k}-{size}.png'}',new Resvg(fs.readFileSync('{p}'),{{fitTo:{{mode:'width',value:{size}}}}}).render().asPng())"], check=True)
print('ok')
