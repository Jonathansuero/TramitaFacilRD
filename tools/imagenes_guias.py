"""
Genera la imagen para compartir de una guía: assets/img/guias/<slug>.jpg (1200x630).

    python3 tools/imagenes_guias.py <slug> "Título en\\ndos líneas" "Dato 1|valor" "Dato 2|valor"
Solo se pone una cifra si se puede verificar en una fuente citada en la guía.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SALIDA = BASE / "assets" / "img" / "guias"

PLANTILLA = """<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ width:1200px; height:630px; font-family:"Inter","DejaVu Sans",sans-serif; color:#fff; position:relative; overflow:hidden;
         background:linear-gradient(135deg,#001B3B 0%,#002D62 55%,#003C80 100%); }}
  .rejilla {{ position:absolute; inset:0; background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
              linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px); background-size:60px 60px; }}
  .brillo {{ position:absolute; width:620px; height:620px; right:-180px; top:-200px; border-radius:50%;
            background:radial-gradient(circle,rgba(255,200,60,.22) 0%,rgba(0,45,98,0) 70%); }}
  .cuerpo {{ position:relative; padding:0 70px; height:100%; display:flex; flex-direction:column; justify-content:center; }}
  .pill {{ align-self:flex-start; border:1px solid rgba(212,168,67,.6); color:#D4A843; border-radius:99px; padding:9px 18px;
          font-size:17px; font-weight:800; letter-spacing:.16em; }}
  h1 {{ font-size:68px; line-height:1.1; font-weight:800; margin-top:26px; letter-spacing:-.02em; }}
  .chips {{ display:flex; gap:14px; margin-top:32px; }}
  .chip {{ background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.2); border-radius:14px; padding:12px 20px;
          font-size:22px; font-weight:700; }}
  .chip b {{ color:#6EE7B7; }}
  .pie {{ position:absolute; left:70px; right:70px; bottom:44px; display:flex; align-items:center; gap:18px;
         border-top:1px solid rgba(255,255,255,.16); padding-top:30px; }}
  .logo {{ width:52px; height:52px; border-radius:14px; background:#fff; display:flex; align-items:center; justify-content:center;
          font-weight:800; font-size:22px; color:#002D62; position:relative; overflow:hidden; }}
  .logo i {{ position:absolute; bottom:0; left:0; right:0; height:8px; background:#CE1126; }}
  .marca {{ font-size:27px; font-weight:800; }} .marca b {{ color:#FF4D5E; }}
  .dominio {{ margin-left:auto; font-size:23px; color:#9FC0E8; font-weight:600; }}
</style></head><body><div class="rejilla"></div><div class="brillo"></div>
<div class="cuerpo"><div class="pill">GUÍA · 2026</div><h1>{titulo}</h1><div class="chips">{chips}</div></div>
<div class="pie"><div class="logo">TF<i></i></div><div class="marca">TramitaFácil<b>RD</b></div><div class="dominio">tramitafacilrd.com/guias</div></div>
</body></html>"""


def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def generar(slug: str, titulo: str, datos: list[str]) -> None:
    from playwright.async_api import async_playwright
    chips = "".join(f'<div class="chip">{esc(a)} <b>{esc(b)}</b></div>' for a, b in (d.split("|", 1) for d in datos))
    html = PLANTILLA.format(titulo=esc(titulo).replace("\\n", "<br>"), chips=chips)
    SALIDA.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        nav = await pw.chromium.launch()
        pag = await nav.new_page(viewport={"width": 1200, "height": 630})
        await pag.set_content(html)
        await pag.wait_for_timeout(80)
        await pag.screenshot(path=str(SALIDA / f"{slug}.jpg"), type="jpeg", quality=84)
        await nav.close()
    print("✓", f"assets/img/guias/{slug}.jpg")


if __name__ == "__main__":
    asyncio.run(generar(sys.argv[1], sys.argv[2], sys.argv[3:]))
