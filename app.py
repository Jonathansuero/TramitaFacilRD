"""
app.py — Servidor web y API de TramitaFácil RD (Flask).

Ejecutar en local:
    pip install -r requirements.txt
    python app.py            -> http://localhost:5000

Endpoints:
    GET  /api/salud                  Estado del servidor
    GET  /api/catalogo               Catálogo completo (servicios, países, instituciones, FAQ)
    GET  /api/tasas                  Tasas DOP -> USD/EUR (en vivo con caché, o de respaldo)
    POST /api/cotizar                {servicio, express, envio, moneda}
    POST /api/ipi                    {valor}
    POST /api/traspaso               {valor}
    GET  /api/rastreo/<codigo>       Estado de un expediente
    POST /api/solicitud              Registra una solicitud y devuelve un código de seguimiento

Panel de administración (admin.html, requiere contraseña: TF_ADMIN_HASH):
    POST /api/admin/login            {clave}
    POST /api/admin/logout
    GET  /api/admin/sesion
    GET  /api/admin/expedientes      Lista de expedientes con datos del cliente
    POST /api/admin/estado           {codigo, paso, detalle, estado?}
    POST /api/admin/nuevo            {nombre, contacto, servicio, pais, mensaje?}
    GET  /api/admin/exportar         CSV para Excel
"""
from __future__ import annotations

import csv
import io
import json
import os
import secrets
import smtplib
import sqlite3
import threading
import time
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from functools import wraps
from pathlib import Path

from flask import Flask, Response, abort, g, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash

import calculos

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("TF_DB_PATH", BASE_DIR / "instance" / "tramitafacil.db"))
PASOS = {1: "Recibido", 2: "Verificado", 3: "En la institución", 4: "Listo"}
TONO_POR_PASO = {1: "sky", 2: "sky", 3: "amber", 4: "emerald"}

app = Flask(__name__, static_folder=None)
app.json.ensure_ascii = False  # acentos legibles en las respuestas JSON
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024  # las solicitudes son JSON pequeños
# Sesión del panel de administración (cookie firmada, solo HTTP, solo este sitio)
app.secret_key = os.environ.get("TF_SECRET_KEY") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Strict",
                  SESSION_COOKIE_SECURE=os.environ.get("TF_COOKIE_SEGURA", "0") == "1",
                  SESSION_COOKIE_NAME="tf_admin", PERMANENT_SESSION_LIFETIME=timedelta(hours=12))


# ---------------------------------------------------------------- catálogo
_catalogo_cache = {"mtime": 0.0, "data": None}


def catalogo() -> dict:
    """Recarga data/catalogo.json automáticamente si cambió (no hace falta reiniciar)."""
    mtime = calculos.CATALOGO_PATH.stat().st_mtime
    if mtime != _catalogo_cache["mtime"]:
        _catalogo_cache.update(mtime=mtime, data=calculos.cargar_catalogo())
    return _catalogo_cache["data"]


# ---------------------------------------------------------------- base de datos
SCHEMA = """
CREATE TABLE IF NOT EXISTS solicitudes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    pais TEXT NOT NULL,
    servicio TEXT NOT NULL,
    contacto TEXT NOT NULL,
    mensaje TEXT,
    moneda TEXT,
    total_estimado REAL,
    creado TEXT NOT NULL,
    idioma TEXT,
    pais_detalle TEXT
);
CREATE TABLE IF NOT EXISTS seguimiento (
    codigo TEXT PRIMARY KEY,
    servicio TEXT NOT NULL,
    cliente TEXT NOT NULL,
    paso INTEGER NOT NULL DEFAULT 1,
    estado TEXT NOT NULL,
    detalle TEXT NOT NULL,
    actualizado TEXT NOT NULL
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.executescript(SCHEMA)
        migrar(g.db)
    return g.db


def migrar(db: sqlite3.Connection) -> None:
    """Agrega columnas nuevas a bases de datos creadas con versiones anteriores."""
    cols = {r[1] for r in db.execute("PRAGMA table_info(solicitudes)")}
    for col in ("idioma", "pais_detalle"):
        if col not in cols:
            db.execute(f"ALTER TABLE solicitudes ADD COLUMN {col} TEXT")


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ahora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- utilidades
_hits: dict[str, deque] = defaultdict(deque)


def limitar(clave: str, maximo: int, ventana_s: int) -> bool:
    """Límite simple en memoria por IP. True si se superó el límite."""
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
    q, t = _hits[f"{clave}:{ip}"], time.time()
    while q and t - q[0] > ventana_s:
        q.popleft()
    if len(q) >= maximo:
        return True
    q.append(t)
    return False


def error(msg: str, status: int = 400):
    return jsonify({"ok": False, "error": msg}), status


def cuerpo_json() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def numero(valor) -> float | None:
    try:
        return float(str(valor).replace(",", ""))
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- tasas de cambio
_tasas_cache = {"t": 0.0, "data": None}
TASAS_TTL = 6 * 3600


def obtener_tasas() -> dict:
    """Tasas en vivo (open.er-api.com, sin clave) con caché de 6 h; si falla, las de respaldo."""
    if _tasas_cache["data"] and time.time() - _tasas_cache["t"] < TASAS_TTL:
        return _tasas_cache["data"]
    cfg = catalogo()["config"]
    data = {"DOP": 1, **cfg["tasas_respaldo"], "fuente": "respaldo", "fecha": cfg["tasas_fecha"]}
    if os.environ.get("TF_TASAS_EN_VIVO", "1") == "1":
        try:
            with urllib.request.urlopen("https://open.er-api.com/v6/latest/DOP", timeout=5) as r:
                rates = json.load(r)["rates"]
            data = {"DOP": 1, "USD": rates["USD"], "EUR": rates["EUR"], "fuente": "en vivo",
                    "fecha": datetime.now().strftime("%d/%m/%Y")}
        except Exception:  # sin internet o servicio caído: usamos respaldo
            pass
    _tasas_cache.update(t=time.time(), data=data)
    return data


# ---------------------------------------------------------------- notificación opcional
def notificar_solicitud(datos: dict) -> None:
    """Envía un correo si SMTP_HOST, SMTP_USER, SMTP_PASS y NOTIFY_TO están configurados."""
    host, to = os.environ.get("SMTP_HOST"), os.environ.get("NOTIFY_TO")
    if not host or not to:
        return

    def _enviar():
        try:
            msg = EmailMessage()
            msg["Subject"] = f"Nueva solicitud {datos['codigo']} — {datos['servicio_titulo']}"
            msg["From"] = os.environ.get("SMTP_USER", to)
            msg["To"] = to
            msg.set_content("\n".join(f"{k}: {v}" for k, v in datos.items()))
            with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", 587)), timeout=10) as s:
                s.starttls()
                if os.environ.get("SMTP_USER"):
                    s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
                s.send_message(msg)
        except Exception as exc:  # nunca debe romper la respuesta al cliente
            app.logger.warning("No se pudo enviar el correo: %s", exc)

    threading.Thread(target=_enviar, daemon=True).start()


# ---------------------------------------------------------------- API
@app.get("/api/salud")
def salud():
    return jsonify({"ok": True, "servicio": "TramitaFácil RD", "hora": ahora()})


@app.get("/api/catalogo")
def api_catalogo():
    return jsonify(catalogo())


@app.get("/api/tasas")
def api_tasas():
    return jsonify(obtener_tasas())


@app.post("/api/cotizar")
def api_cotizar():
    d = cuerpo_json()
    try:
        tasas = obtener_tasas()
        res = calculos.cotizar(catalogo(), str(d.get("servicio", "")), bool(d.get("express")),
                               bool(d.get("envio")), str(d.get("moneda", "DOP")),
                               {k: tasas[k] for k in ("USD", "EUR")})
    except ValueError as exc:
        return error(str(exc))
    return jsonify({"ok": True, **res})


@app.post("/api/ipi")
def api_ipi():
    try:
        return jsonify({"ok": True, **calculos.calcular_ipi(numero(cuerpo_json().get("valor")),
                                                            catalogo()["config"]["ipi_exencion"])})
    except (ValueError, TypeError) as exc:
        return error(str(exc) or "Valor inválido.")


@app.post("/api/traspaso")
def api_traspaso():
    cfg = catalogo()["config"]
    try:
        return jsonify({"ok": True, **calculos.calcular_traspaso(numero(cuerpo_json().get("valor")),
                                                                 cfg["traspaso_tasa"], cfg["traspaso_cargos"])})
    except (ValueError, TypeError) as exc:
        return error(str(exc) or "Valor inválido.")


@app.get("/api/rastreo/<codigo>")
def api_rastreo(codigo: str):
    if limitar("rastreo", 30, 60):
        return error("Demasiadas consultas. Intenta en un minuto.", 429)
    codigo = codigo.strip().upper()[:12]
    row = get_db().execute("SELECT * FROM seguimiento WHERE codigo = ?", (codigo,)).fetchone()
    if row:
        return jsonify({"ok": True, "codigo": codigo, "service": row["servicio"], "client": row["cliente"],
                        "step": row["paso"], "statusText": row["estado"], "detail": row["detalle"],
                        "tone": TONO_POR_PASO.get(row["paso"], "sky"), "updated": row["actualizado"]})
    demo = catalogo()["rastreo_demo"].get(codigo)
    if demo:
        return jsonify({"ok": True, "codigo": codigo, **demo, "demo": True})
    return error("No encontramos ningún expediente con ese código.", 404)


@app.post("/api/solicitud")
def api_solicitud():
    if limitar("solicitud", 5, 600):
        return error("Recibimos varias solicitudes seguidas. Intenta de nuevo en unos minutos.", 429)
    d = cuerpo_json()
    if d.get("web"):  # campo trampa anti-spam (invisible para personas)
        return jsonify({"ok": True, "codigo": "RD-000000"})

    nombre = str(d.get("nombre", "")).strip()[:80]
    contacto = str(d.get("contacto", "")).strip()[:120]
    mensaje = str(d.get("mensaje", "")).strip()[:1000]
    pais = str(d.get("pais", "")).strip()
    servicio = str(d.get("servicio", "")).strip()
    moneda = str(d.get("moneda", "DOP")).upper()
    idioma = str(d.get("idioma", "es"))[:2] if str(d.get("idioma", "es"))[:2] in ("es", "en", "fr") else "es"
    pais_detalle = "".join(ch for ch in str(d.get("pais_detalle", "")).upper() if ch.isalpha())[:2]
    cat = catalogo()

    if len(nombre) < 2:
        return error("Escribe tu nombre.")
    if len(contacto) < 6:
        return error("Indica un WhatsApp o correo para contactarte.")
    if pais not in calculos.PAISES_VALIDOS:
        return error("Selecciona desde dónde nos escribes.")
    if servicio not in cat["servicios"]:
        return error("Selecciona un trámite válido.")
    if not d.get("acepta"):
        return error("Debes aceptar el uso de tus datos para gestionar el trámite.")

    db = get_db()
    existe = lambda c: db.execute("SELECT 1 FROM solicitudes WHERE codigo=?", (c,)).fetchone() is not None
    codigo = calculos.generar_codigo(existe)
    try:
        cot = calculos.cotizar(cat, servicio, bool(d.get("express")), bool(d.get("envio")),
                               moneda if moneda in calculos.MONEDAS else "DOP")
    except ValueError:
        cot = {"total": None, "moneda": "DOP"}
    titulo = cat["servicios"][servicio]["title"]
    ts = ahora()
    db.execute("INSERT INTO solicitudes (codigo, nombre, pais, servicio, contacto, mensaje, moneda, total_estimado, creado,"
               " idioma, pais_detalle) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
               (codigo, nombre, pais, servicio, contacto, mensaje, cot["moneda"], cot["total"], ts, idioma, pais_detalle))
    db.execute("INSERT INTO seguimiento (codigo, servicio, cliente, paso, estado, detalle, actualizado)"
               " VALUES (?,?,?,?,?,?,?)",
               (codigo, titulo, calculos.nombre_publico(nombre), 1, "Solicitud Recibida",
                "Recibimos tu solicitud. Un gestor te contactará para validar documentos y pago.", ts))
    db.commit()

    notificar_solicitud({"codigo": codigo, "nombre": nombre, "idioma": idioma.upper(),
                         "pais": cat["paises"][pais]["nombre"] + (f" ({pais_detalle})" if pais_detalle else ""),
                         "servicio_titulo": titulo, "contacto": contacto, "mensaje": mensaje,
                         "total_estimado": f"{cot['total']} {cot['moneda']}"})
    return jsonify({"ok": True, "codigo": codigo, "servicio": titulo}), 201


# ---------------------------------------------------------------- panel de administración
def admin_configurado() -> bool:
    return bool(os.environ.get("TF_ADMIN_HASH"))


def requiere_admin(fn):
    @wraps(fn)
    def envoltura(*args, **kwargs):
        if not session.get("admin"):
            return error("Tu sesión terminó. Vuelve a entrar.", 401)
        return fn(*args, **kwargs)
    return envoltura


def expediente(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["tono"] = TONO_POR_PASO.get(d["paso"], "sky")
    return d


CONSULTA_EXPEDIENTES = """
SELECT s.codigo, s.servicio AS servicio_titulo, s.cliente, s.paso, s.estado, s.detalle, s.actualizado,
       o.nombre, o.contacto, o.pais, o.pais_detalle, o.mensaje, o.total_estimado, o.moneda, o.creado,
       o.idioma, o.servicio AS servicio_id
FROM seguimiento s LEFT JOIN solicitudes o ON o.codigo = s.codigo
"""


@app.get("/api/admin/sesion")
def admin_sesion():
    return jsonify({"ok": True, "admin": bool(session.get("admin")), "configurado": admin_configurado()})


@app.post("/api/admin/login")
def admin_login():
    if not admin_configurado():
        return error("El panel no está activado. En el servidor escribe: tramita clave", 503)
    if limitar("login", 5, 900):
        return error("Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.", 429)
    clave = str(cuerpo_json().get("clave", ""))[:200]
    if not clave or not check_password_hash(os.environ["TF_ADMIN_HASH"], clave):
        return error("Contraseña incorrecta.", 401)
    session.clear()
    session.permanent = True
    session["admin"] = True
    return jsonify({"ok": True})


@app.post("/api/admin/logout")
def admin_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/admin/expedientes")
@requiere_admin
def admin_expedientes():
    rows = get_db().execute(CONSULTA_EXPEDIENTES + " ORDER BY s.actualizado DESC LIMIT 1000").fetchall()
    lista = [expediente(r) for r in rows]
    conteo = {str(p): sum(1 for e in lista if e["paso"] == p) for p in PASOS}
    return jsonify({"ok": True, "expedientes": lista, "conteo": conteo, "pasos": PASOS})


@app.post("/api/admin/estado")
@requiere_admin
def admin_estado():
    d = cuerpo_json()
    codigo = str(d.get("codigo", "")).strip().upper()[:12]
    try:
        paso = int(d.get("paso"))
    except (TypeError, ValueError):
        paso = 0
    if paso not in PASOS:
        return error("Elige un paso del 1 al 4.")
    detalle = str(d.get("detalle", "")).strip()[:500]
    if len(detalle) < 3:
        return error("Escribe un mensaje para el cliente.")
    estado = str(d.get("estado", "")).strip()[:60] or PASOS[paso]
    db = get_db()
    cur = db.execute("UPDATE seguimiento SET paso=?, estado=?, detalle=?, actualizado=? WHERE codigo=?",
                     (paso, estado, detalle, ahora(), codigo))
    if cur.rowcount == 0:
        return error("No existe ese código.", 404)
    db.commit()
    row = db.execute(CONSULTA_EXPEDIENTES + " WHERE s.codigo=?", (codigo,)).fetchone()
    return jsonify({"ok": True, "expediente": expediente(row)})


@app.post("/api/admin/nuevo")
@requiere_admin
def admin_nuevo():
    """Crea un expediente para un cliente que llegó por WhatsApp (sin usar el formulario)."""
    d = cuerpo_json()
    nombre = str(d.get("nombre", "")).strip()[:80]
    contacto = str(d.get("contacto", "")).strip()[:120]
    pais = str(d.get("pais", "rd")).strip()
    servicio = str(d.get("servicio", "")).strip()
    mensaje = str(d.get("mensaje", "")).strip()[:1000]
    cat = catalogo()
    if len(nombre) < 2:
        return error("Escribe el nombre del cliente.")
    if servicio not in cat["servicios"]:
        return error("Elige el trámite.")
    if pais not in calculos.PAISES_VALIDOS:
        pais = "rd"
    db = get_db()
    existe = lambda c: db.execute("SELECT 1 FROM seguimiento WHERE codigo=?", (c,)).fetchone() is not None
    codigo = calculos.generar_codigo(existe)
    try:
        cot = calculos.cotizar(cat, servicio)
    except ValueError:
        cot = {"total": None, "moneda": "DOP"}
    titulo, ts = cat["servicios"][servicio]["title"], ahora()
    db.execute("INSERT INTO solicitudes (codigo, nombre, pais, servicio, contacto, mensaje, moneda, total_estimado, creado,"
               " idioma, pais_detalle) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
               (codigo, nombre, pais, servicio, contacto, mensaje, cot["moneda"], cot["total"], ts, "es", ""))
    db.execute("INSERT INTO seguimiento (codigo, servicio, cliente, paso, estado, detalle, actualizado)"
               " VALUES (?,?,?,?,?,?,?)",
               (codigo, titulo, calculos.nombre_publico(nombre), 1, "Solicitud Recibida",
                "Recibimos tu solicitud. Un gestor te contactará para validar documentos y pago.", ts))
    db.commit()
    row = db.execute(CONSULTA_EXPEDIENTES + " WHERE s.codigo=?", (codigo,)).fetchone()
    return jsonify({"ok": True, "expediente": expediente(row)}), 201


@app.get("/api/admin/exportar")
@requiere_admin
def admin_exportar():
    rows = get_db().execute(CONSULTA_EXPEDIENTES + " ORDER BY COALESCE(o.creado, s.actualizado)").fetchall()
    salida = io.StringIO()
    w = csv.writer(salida)
    w.writerow(["Código", "Nombre", "Contacto", "País", "Trámite", "Paso", "Estado", "Mensaje al cliente",
                "Total estimado", "Moneda", "Nota del cliente", "Creado", "Última actualización"])
    for r in rows:
        w.writerow([r["codigo"], r["nombre"] or r["cliente"], r["contacto"] or "", r["pais"] or "", r["servicio_titulo"],
                    r["paso"], r["estado"], r["detalle"], r["total_estimado"] or "", r["moneda"] or "",
                    r["mensaje"] or "", (r["creado"] or "")[:16], (r["actualizado"] or "")[:16]])
    nombre = f"solicitudes-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return Response("\ufeff" + salida.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


@app.errorhandler(404)
def no_encontrado(_e):
    if request.path.startswith("/api/"):
        return error("Ruta no encontrada.", 404)
    return send_from_directory(BASE_DIR, "index.html"), 404


# ---------------------------------------------------------------- sitio estático
# Solo servimos lo público: nunca app.py, la base de datos ni .env
ARCHIVOS_RAIZ = {"index.html", "servicio.html", "instituciones.html", "diaspora.html", "rastreo.html", "preguntas.html", "calculadora.html",
                 "offline.html", "admin.html", "sw.js", "robots.txt", "sitemap.xml", "site.webmanifest"}


@app.get("/")
def inicio():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/assets/<path:ruta>")
def assets(ruta: str):
    return send_from_directory(BASE_DIR / "assets", ruta)


@app.get("/<nombre>")
def archivo_raiz(nombre: str):
    if nombre not in ARCHIVOS_RAIZ:
        abort(404)
    return send_from_directory(BASE_DIR, nombre)


@app.after_request
def cabeceras(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    if request.path.startswith("/api/") or request.path == "/admin.html":
        resp.headers["Cache-Control"] = "no-store"
        if request.path.startswith("/api/admin") or request.path == "/admin.html":
            resp.headers["X-Robots-Tag"] = "noindex, nofollow"
            resp.headers["X-Frame-Options"] = "DENY"
    elif request.path == "/sw.js":
        # el navegador debe revisar siempre si hay una versión nueva de la app
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["Service-Worker-Allowed"] = "/"
    elif request.path == "/site.webmanifest":
        resp.headers["Content-Type"] = "application/manifest+json"
    return resp


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)),
            debug=os.environ.get("FLASK_DEBUG") == "1")
