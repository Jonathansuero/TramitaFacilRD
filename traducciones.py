"""
traducciones.py — Idiomas del sitio (español, inglés y francés).

- data/i18n.json  -> "ui": textos de la interfaz [es, en, fr]
                     "contenido": servicios, países, requisitos, instituciones y FAQ en inglés y francés
- verificar() revisa que no falte ninguna traducción y que cada clave usada en las
  páginas (data-i18n="...") y en los scripts (t('...')) exista en el diccionario.

    python manage.py i18n      -> informe en consola (sale con error si falta algo)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
I18N_PATH = BASE_DIR / "data" / "i18n.json"
IDIOMAS = ("es", "en", "fr")

_RE_ATTR = re.compile(r'data-i18n(?:-html|-ph|-aria|-title)?="([\w.]+)"')
_RE_T = re.compile(r"\bt\('([\w.]*\w)'(?!\s*\+)")  # ignora claves armadas con '+'
# claves que se construyen dinámicamente en el JS
_DINAMICAS = [
    "serv.p{n}.t", "serv.p{n}.d",
]


def cargar(path: Path = I18N_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def claves_usadas(base: Path = BASE_DIR) -> set[str]:
    usadas: set[str] = set()
    for f in list(base.glob("*.html")) + list((base / "assets" / "js").glob("*.js")):
        if f.name == "data.js":
            continue
        txt = f.read_text(encoding="utf-8")
        usadas |= set(_RE_ATTR.findall(txt)) | set(_RE_T.findall(txt))
    usadas |= {p.format(n=n) for p in _DINAMICAS for n in range(1, 5)}
    usadas |= {f"instp.f.{k}" for k in ("todas", "publica", "privada", "internacional")}
    return usadas


def verificar(catalogo: dict, i18n: dict, base: Path = BASE_DIR) -> list[str]:
    """Devuelve la lista de problemas encontrados (vacía = todo traducido)."""
    problemas: list[str] = []
    ui = i18n["ui"]
    for k, v in ui.items():
        if not isinstance(v, list) or len(v) != len(IDIOMAS) or not all(isinstance(x, str) and x.strip() for x in v):
            problemas.append(f"ui.{k}: debe tener {len(IDIOMAS)} textos no vacíos (es, en, fr)")
        else:
            vars_es = set(re.findall(r"\{(\w+)\}", v[0]))
            for lang, txt in zip(IDIOMAS[1:], v[1:]):
                if set(re.findall(r"\{(\w+)\}", txt)) != vars_es:
                    problemas.append(f"ui.{k} [{lang}]: las variables {{...}} no coinciden con el español")
    for k in sorted(claves_usadas(base) - set(ui)):
        problemas.append(f"ui.{k}: se usa en la página pero no está en i18n.json")

    secciones = {
        "servicios": catalogo["servicios"], "categorias": catalogo["categorias"],
        "checklists": catalogo["checklists"], "instituciones": catalogo["instituciones"], "paises": catalogo["paises"],
    }
    for lang in IDIOMAS[1:]:
        cont = i18n["contenido"].get(lang, {})
        for sec, fuente in secciones.items():
            tr = cont.get(sec, {})
            for k in fuente:
                if k not in tr:
                    problemas.append(f"contenido.{lang}.{sec}.{k}: falta traducción")
            for k in tr:
                if k not in fuente:
                    problemas.append(f"contenido.{lang}.{sec}.{k}: no existe en el catálogo")
        for k, items in catalogo["checklists"].items():
            tr = cont.get("checklists", {}).get(k)
            if tr and len(tr[1]) != len(items["items"]):
                problemas.append(f"contenido.{lang}.checklists.{k}: {len(tr[1])} requisitos, el español tiene {len(items['items'])}")
        if len(cont.get("faq", [])) != len(catalogo["faq"]):
            problemas.append(f"contenido.{lang}.faq: {len(cont.get('faq', []))} preguntas, el español tiene {len(catalogo['faq'])}")
    return problemas
