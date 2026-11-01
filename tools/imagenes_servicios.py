"""
Genera una imagen propia por trámite: assets/img/servicios/<slug>.jpg (1200x630).

Se usa como vista previa al compartir el enlace (WhatsApp, Facebook, Google) y como
ilustración dentro de la ficha. No lleva precios, porque cambian desde el panel.

    python3 tools/imagenes_servicios.py          (todas)
    python3 tools/imagenes_servicios.py apostilla_documentos
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SALIDA = BASE / "assets" / "img" / "servicios"

PLANTILLA = """<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ width:1200px; height:630px; font-family:"Inter","DejaVu Sans",sans-serif;
         background:linear-gradient(135deg,#001B3B 0%,#002D62 55%,#003C80 100%); color:#fff;
         position:relative; overflow:hidden; }}
  .rejilla {{ position:absolute; inset:0;
      background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),
                       linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
      background-size:60px 60px; }}
  .brillo {{ position:absolute; width:620px; height:620px; right:-180px; top:-200px; border-radius:50%;
      background:radial-gradient(circle,rgba(0,122,255,.38) 0%,rgba(0,45,98,0) 70%); }}
  .cuerpo {{ position:relative; padding:68px 72px; height:100%; display:flex; flex-direction:column; }}
  .eyebrow {{ font-size:22px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#8FB6E8; }}
  h1 {{ font-size:{tam}px; line-height:1.12; font-weight:800; margin-top:20px; max-width:950px; letter-spacing:-.02em; }}
  .chips {{ display:flex; gap:12px; margin-top:28px; flex-wrap:wrap; }}
  .chip {{ border:1px solid rgba(255,255,255,.28); border-radius:999px; padding:9px 20px; font-size:21px; font-weight:700; color:#DCE9FB; }}
  .valor {{ margin-top:auto; display:flex; gap:36px; font-size:24px; color:#CFE0F5; font-weight:600; }}
  .valor span::before {{ content:"✓"; color:#2FCF92; font-weight:800; margin-right:12px; }}
  .pie {{ display:flex; align-items:center; gap:18px; margin-top:38px; padding-top:30px; border-top:1px solid rgba(255,255,255,.16); }}
  .logo {{ width:62px; height:62px; border-radius:16px; background:#fff; display:flex; align-items:center;
          justify-content:center; font-weight:800; font-size:26px; color:#002D62; letter-spacing:-.04em; position:relative; overflow:hidden; }}
  .logo i {{ position:absolute; bottom:0; left:0; right:0; height:10px; background:#CE1126; }}
  .marca {{ font-size:27px; font-weight:800; }}
  .marca b {{ color:#FF4D5E; }}
  .dominio {{ margin-left:auto; font-size:23px; color:#9FC0E8; font-weight:600; }}
</style></head><body>
  <div class="rejilla"></div><div class="brillo"></div>
  <div class="cuerpo">
    <div class="eyebrow">{categoria}</div>
    <h1>{titulo}</h1>
    <div class="chips">{chips}</div>
    <div class="valor"><span>Lo gestionamos sin que viajes</span><span>{segunda}</span></div>
    <div class="pie">
      <div class="logo">TF<i></i></div>
      <div class="marca">TramitaFácil<b>RD</b></div>
      <div class="dominio">tramitafacilrd.com</div>
    </div>
  </div>
</body></html>"""


def esc(t: str) -> str:
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def html_de(sid: str, serv: dict, cat: dict) -> str:
    titulo = re.sub(r"\s*\([^)]*\)", "", serv["title"]).strip()
    tam = 74 if len(titulo) <= 32 else 64 if len(titulo) <= 48 else 54
    chips = "".join(f'<div class="chip">{esc(cat["instituciones"][i]["sigla"])}</div>'
                    for i in serv.get("inst", []) if i in cat["instituciones"])
    tiempo = (cat.get("tiempos", {}).get(sid) or {}).get("es", "")
    segunda = f"Listo en {tiempo[0].lower()}{tiempo[1:]}" if tiempo and len(tiempo) < 46 else "Lo recibes donde estés"
    return PLANTILLA.format(categoria=esc(cat["categorias"][serv["category"]]["label"]),
                            titulo=esc(titulo), chips=chips, tam=tam, segunda=esc(segunda))


async def generar(ids: list[str]) -> None:
    from playwright.async_api import async_playwright
    cat = json.loads((BASE / "data" / "catalogo.json").read_text(encoding="utf-8"))
    SALIDA.mkdir(parents=True, exist_ok=True)
    servicios = {k: v for k, v in cat["servicios"].items() if not ids or k in ids}
    async with async_playwright() as pw:
        navegador = await pw.chromium.launch()
        pagina = await navegador.new_page(viewport={"width": 1200, "height": 630})
        for sid, serv in servicios.items():
            await pagina.set_content(html_de(sid, serv, cat))
            await pagina.wait_for_timeout(60)
            await pagina.screenshot(path=str(SALIDA / f'{serv["slug"]}.jpg'), type="jpeg", quality=82)
            print("·", serv["slug"] + ".jpg")
        await navegador.close()
    print(f"✓ {len(servicios)} imágenes en {SALIDA.relative_to(BASE)}")


if __name__ == "__main__":
    asyncio.run(generar(sys.argv[1:]))
