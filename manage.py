"""
manage.py — Herramientas de administración de TramitaFácil RD.

    python manage.py build                       Genera assets/js/data.js (catálogo + traducciones), sitemap.xml y la versión de la app (sw.js)
    python manage.py i18n                        Verifica que todo esté traducido en español, inglés y francés
    python manage.py solicitudes                 Lista las últimas solicitudes recibidas
    python manage.py exportar solicitudes.csv    Exporta todas las solicitudes a CSV (Excel)
    python manage.py estado RD-7KQ4MX 3 "Expediente depositado en la DGM"
                                                 Actualiza el paso (1-4) que ve el cliente al rastrear
    python manage.py precio residencia_dominicana --tasa 15000 --honorario 10000
                                                 Cambia precios (igual que «Precios» en el panel)

Después de editar data/catalogo.json a mano, corre `build`
para que la versión estática (sin servidor) también tenga los cambios.
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys

import calculos
import traducciones
from app import DB_PATH, PASOS, SCHEMA, agregar_tramite, ahora, migrar, recalcular, tramites_de

DATA_JS = calculos.BASE_DIR / "assets" / "js" / "data.js"


def conectar() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    migrar(db)
    return db


def cmd_build(_args):
    cat = calculos.cargar_catalogo()
    faltan = [k for k in cat["checklists"] if k not in cat["servicios"]]
    faltan += [k for p in cat["paises"].values() for k in p["destacados"] if k not in cat["servicios"]]
    faltan += [i for s in cat["servicios"].values() for i in s.get("inst", []) if i not in cat["instituciones"]]
    if faltan:
        sys.exit(f"Error: claves inexistentes en el catálogo: {faltan}")
    problemas = traducciones.verificar(cat, traducciones.cargar())
    if problemas:
        print(f"⚠ {len(problemas)} traducciones pendientes (se mostrará el español). Detalle: python manage.py i18n")
    # los textos "seo" solo los usa el servidor (Google); no hace falta enviarlos en data.js
    datos = {**cat, "servicios": {k: {c: v for c, v in s.items() if c != "seo"} for k, s in cat["servicios"].items()},
             "i18n": traducciones.cargar()}
    datos["i18n"].pop("_formato", None)
    DATA_JS.parent.mkdir(parents=True, exist_ok=True)
    DATA_JS.write_text(
        "/* Archivo generado por `python manage.py build` desde data/catalogo.json y data/i18n.json — no editar a mano. */\n"
        f"window.TF_DATA = {json.dumps(datos, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8")
    print(f"✓ {DATA_JS.relative_to(calculos.BASE_DIR)} generado ({len(cat['servicios'])} servicios, "
          f"{len(cat['instituciones'])} instituciones, {len(datos['i18n']['ui'])} textos × 3 idiomas).")
    cmd_sitemap(_args)
    cmd_app(_args)


def cmd_i18n(_args):
    problemas = traducciones.verificar(calculos.cargar_catalogo(), traducciones.cargar())
    if not problemas:
        print("✓ Todo traducido en español, inglés y francés.")
        return
    print("\n".join(f"  • {p}" for p in problemas))
    sys.exit(f"✗ {len(problemas)} problemas de traducción.")


def cmd_sitemap(_args):
    """sitemap.xml con la portada, las páginas fijas y una página por servicio."""
    cat = calculos.cargar_catalogo()
    sitio = cat["config"]["sitio"].rstrip("/")
    urls = [("/", "1.0"), ("/instituciones", "0.8"), ("/diaspora", "0.8"),
            ("/servicios", "0.9"), ("/casos", "0.8"), ("/calculadora", "0.8"), ("/preguntas", "0.7"), ("/rastreo", "0.5")]
    urls += [(f"/servicio?id={k}", "0.6") for k in cat["servicios"]]
    from datetime import date
    hoy = date.today().isoformat()
    cuerpo = "\n".join(f"  <url><loc>{sitio}{u.replace('&', '&amp;')}</loc><lastmod>{hoy}</lastmod><priority>{p}</priority></url>" for u, p in urls)
    (calculos.BASE_DIR / "sitemap.xml").write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{cuerpo}\n</urlset>\n',
        encoding="utf-8")
    print(f"✓ sitemap.xml ({len(urls)} páginas)")


def cmd_app(_args):
    """Pone en sw.js una versión nueva (huella de los archivos guardados) para que la app instalada se actualice."""
    import hashlib, re
    sw = calculos.BASE_DIR / "sw.js"
    texto = sw.read_text(encoding="utf-8")
    lista = re.search(r"const PRECACHE = \[(.*?)\];", texto, re.S).group(1)
    huella = hashlib.sha256()
    for ruta in re.findall(r"'\./([^']*)'", lista):
        archivo = calculos.BASE_DIR / (ruta or "index.html")
        if not archivo.is_file() and "." not in ruta:
            archivo = calculos.BASE_DIR / f"{ruta}.html"
        huella.update(archivo.read_bytes() if archivo.is_file() else ruta.encode())
    version = huella.hexdigest()[:10]
    sw.write_text(re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", texto, count=1), encoding="utf-8")
    print(f"✓ sw.js versión {version} (la app instalada se actualizará sola)")


def cmd_solicitudes(args):
    rows = conectar().execute("SELECT * FROM solicitudes ORDER BY id DESC LIMIT ?", (args.limite,)).fetchall()
    if not rows:
        print("Aún no hay solicitudes.")
    for r in rows:
        lugar = r['pais'] + (f"/{r['pais_detalle']}" if r['pais_detalle'] else "")
        print(f"{r['creado'][:16]}  {r['codigo']}  [{lugar}] [{(r['idioma'] or 'es').upper()}]  {r['nombre']}  ·  {r['servicio']}  ·  {r['contacto']}")


def cmd_exportar(args):
    rows = conectar().execute("SELECT * FROM solicitudes ORDER BY id").fetchall()
    with open(args.archivo, "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: Excel abre bien los acentos
        w = csv.writer(f)
        w.writerow(rows[0].keys() if rows else ["sin datos"])
        w.writerows([tuple(r) for r in rows])
    print(f"✓ {len(rows)} solicitudes exportadas a {args.archivo}")


def cmd_estado(args):
    codigo = args.codigo.upper()
    if args.paso not in PASOS:
        sys.exit("El paso debe ser 1 (Recibido), 2 (Verificado), 3 (En la institución) o 4 (Listo).")
    db = conectar()
    estado, ts = args.estado or PASOS[args.paso], ahora()
    items = tramites_de(db, codigo)
    if not items:
        if not args.servicio or not args.cliente:
            sys.exit("Código nuevo: indica también --servicio y --cliente.")
        db.execute("INSERT INTO seguimiento (codigo, servicio, cliente, paso, estado, detalle, actualizado) VALUES (?,?,?,?,?,?,?)",
                   (codigo, args.servicio, calculos.nombre_publico(args.cliente), args.paso, estado, args.detalle, ts))
        tid = agregar_tramite(db, codigo, None, args.servicio, None, ts)
    elif len(items) == 1 and not args.tramite:
        tid = items[0]["id"]
    elif args.tramite and 1 <= args.tramite <= len(items):
        tid = items[args.tramite - 1]["id"]
    else:
        lista = "\n".join(f"  {i}. {t['titulo']} (paso {t['paso']})" for i, t in enumerate(items, 1))
        sys.exit(f"{codigo} tiene {len(items)} trámites. Indica cuál con --tramite N:\n{lista}")
    db.execute("UPDATE tramites SET paso=?, estado=?, detalle=?, actualizado=? WHERE id=?", (args.paso, estado, args.detalle, ts, tid))
    recalcular(db, codigo)
    db.commit()
    print(f"✓ {codigo}: paso {args.paso} ({estado}) — {args.detalle}")


def cmd_precio(args):
    """Igual que «Precios» en el panel: se guarda en la base de datos y la página lo usa al momento."""
    import app as servidor
    base = calculos.cargar_catalogo()["servicios"]
    s = base.get(args.servicio)
    if not s:
        sys.exit(f"No existe el servicio '{args.servicio}'.")
    db = conectar()
    fila = db.execute("SELECT tax, fee FROM precios WHERE servicio_id=?", (args.servicio,)).fetchone()
    antes = (fila["tax"], fila["fee"]) if fila else (s["tax"], s["fee"])
    tax = args.tasa if args.tasa is not None else antes[0]
    fee = args.honorario if args.honorario is not None else antes[1]
    if (tax, fee) == (s["tax"], s["fee"]):
        db.execute("DELETE FROM precios WHERE servicio_id=?", (args.servicio,))
    else:
        db.execute("INSERT INTO precios (servicio_id, tax, fee, actualizado) VALUES (?,?,?,?) ON CONFLICT(servicio_id)"
                   " DO UPDATE SET tax=excluded.tax, fee=excluded.fee, actualizado=excluded.actualizado",
                   (args.servicio, tax, fee, ahora()))
    db.execute("INSERT INTO precios_historial (servicio_id, tax_antes, fee_antes, tax, fee, fecha) VALUES (?,?,?,?,?,?)",
               (args.servicio, antes[0], antes[1], tax, fee, ahora()))
    db.commit()
    print(f"✓ {s['title']}: tasas RD$ {servidor._entero(tax):,} · honorarios RD$ {servidor._entero(fee):,} (ya se ve en la página)")


def main():
    p = argparse.ArgumentParser(description="Administración de TramitaFácil RD")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build").set_defaults(fn=cmd_build)
    sub.add_parser("i18n").set_defaults(fn=cmd_i18n)
    sub.add_parser("sitemap").set_defaults(fn=cmd_sitemap)
    sub.add_parser("app").set_defaults(fn=cmd_app)
    s = sub.add_parser("solicitudes"); s.add_argument("--limite", type=int, default=20); s.set_defaults(fn=cmd_solicitudes)
    s = sub.add_parser("exportar"); s.add_argument("archivo", nargs="?", default="solicitudes.csv"); s.set_defaults(fn=cmd_exportar)
    s = sub.add_parser("estado")
    s.add_argument("codigo"); s.add_argument("paso", type=int); s.add_argument("detalle")
    s.add_argument("--estado"); s.add_argument("--servicio"); s.add_argument("--cliente")
    s.add_argument("--tramite", type=int, help="Número del trámite cuando el código tiene varios (1, 2, 3…)")
    s.set_defaults(fn=cmd_estado)
    s = sub.add_parser("precio")
    s.add_argument("servicio"); s.add_argument("--tasa", type=int); s.add_argument("--honorario", type=int)
    s.set_defaults(fn=cmd_precio)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
