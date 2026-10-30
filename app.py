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

Panel de administración (/admin, requiere contraseña: TF_ADMIN_HASH):
    POST /api/admin/login            {clave}
    POST /api/admin/logout
    GET  /api/admin/sesion
    GET  /api/admin/expedientes      Lista de expedientes con datos del cliente
    POST /api/admin/estado           {codigo, tramite, paso, detalle, estado?}
    POST /api/admin/agregar          {codigo, servicio, titulo?, precio?}  (otro trámite, mismo código)
    POST /api/admin/quitar           {codigo, tramite}
    POST /api/admin/nuevo            {nombre, contacto, pais, mensaje?, servicios:[{servicio, titulo?, precio?}]}
    GET  /api/admin/exportar         CSV para Excel
    POST /api/admin/pago             {codigo, tipo, monto, metodo, fecha?, nota?}   · /api/admin/pago/quitar {codigo, id}
    POST /api/admin/nota             {codigo, texto}                                · /api/admin/nota/quitar {codigo, id}
    POST /api/admin/docs             {codigo, tramite, docs:[…]}                    Documentos recibidos
    GET  /api/admin/precios          Precios de todos los servicios + historial
    POST /api/admin/precio           {servicio, tax, fee} o {servicio, restaurar: true}
    GET  /api/admin/respaldo         Copia de la base de datos
    GET  /api/precios                (público) precios cambiados desde el panel
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
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

from flask import Flask, Response, abort, g, has_app_context, jsonify, redirect, request, send_from_directory, session
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


def catalogo_base() -> dict:
    """Recarga data/catalogo.json automáticamente si cambió (no hace falta reiniciar)."""
    mtime = calculos.CATALOGO_PATH.stat().st_mtime
    if mtime != _catalogo_cache["mtime"]:
        _catalogo_cache.update(mtime=mtime, data=calculos.cargar_catalogo())
    return _catalogo_cache["data"]


_catalogo_precios = {"clave": None, "data": None}


def precios_guardados() -> dict[str, tuple[float, float]]:
    """Precios cambiados desde el panel (tabla `precios`): {servicio: (tasa, honorario)}."""
    try:
        if has_app_context():
            rows = get_db().execute("SELECT servicio_id, tax, fee FROM precios").fetchall()
        else:
            if not DB_PATH.exists():
                return {}
            with sqlite3.connect(DB_PATH) as db:
                db.executescript(SCHEMA)
                rows = db.execute("SELECT servicio_id, tax, fee FROM precios").fetchall()
    except sqlite3.Error:
        return {}
    return {r[0]: (r[1], r[2]) for r in rows}


def _entero(v: float):
    return int(v) if float(v).is_integer() else v


def catalogo() -> dict:
    """Catálogo con los precios del panel aplicados (lo que usan la API y la página)."""
    base = catalogo_base()
    guardados = {k: v for k, v in precios_guardados().items() if k in base["servicios"]}
    if not guardados:
        return base
    clave = (_catalogo_cache["mtime"], tuple(sorted(guardados.items())))
    if _catalogo_precios["clave"] != clave:
        servicios = dict(base["servicios"])
        for sid, (tax, fee) in guardados.items():
            servicios[sid] = {**servicios[sid], "tax": _entero(tax), "fee": _entero(fee)}
        _catalogo_precios.update(clave=clave, data={**base, "servicios": servicios})
    return _catalogo_precios["data"]


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
CREATE TABLE IF NOT EXISTS tramites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    servicio_id TEXT,
    titulo TEXT NOT NULL,
    paso INTEGER NOT NULL DEFAULT 1,
    estado TEXT NOT NULL,
    detalle TEXT NOT NULL,
    precio REAL,
    actualizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tramites_codigo ON tramites (codigo);
CREATE TABLE IF NOT EXISTS seguimiento (
    codigo TEXT PRIMARY KEY,
    servicio TEXT NOT NULL,
    cliente TEXT NOT NULL,
    paso INTEGER NOT NULL DEFAULT 1,
    estado TEXT NOT NULL,
    detalle TEXT NOT NULL,
    actualizado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS precios (
    servicio_id TEXT PRIMARY KEY,
    tax REAL NOT NULL,
    fee REAL NOT NULL,
    actualizado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS precios_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    servicio_id TEXT NOT NULL,
    tax_antes REAL, fee_antes REAL,
    tax REAL NOT NULL, fee REAL NOT NULL,
    fecha TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    monto REAL NOT NULL,
    metodo TEXT,
    fecha TEXT NOT NULL,
    nota TEXT,
    creado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pagos_codigo ON pagos (codigo);
CREATE TABLE IF NOT EXISTS notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    texto TEXT NOT NULL,
    creado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notas_codigo ON notas (codigo);
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
    for col in ("idioma", "pais_detalle", "origen", "origen_detalle", "pagina", "dispositivo"):
        if col not in cols:
            db.execute(f"ALTER TABLE solicitudes ADD COLUMN {col} TEXT")
    if "docs" not in {r[1] for r in db.execute("PRAGMA table_info(tramites)")}:
        db.execute("ALTER TABLE tramites ADD COLUMN docs TEXT")  # documentos recibidos (lista JSON)
    # Expedientes de antes de "varios trámites por código": cada uno pasa a tener su trámite
    db.execute("""INSERT INTO tramites (codigo, servicio_id, titulo, paso, estado, detalle, precio, actualizado)
                  SELECT s.codigo, o.servicio, s.servicio, s.paso, s.estado, s.detalle, NULL, s.actualizado
                  FROM seguimiento s LEFT JOIN solicitudes o ON o.codigo = s.codigo
                  WHERE NOT EXISTS (SELECT 1 FROM tramites t WHERE t.codigo = s.codigo)""")
    db.commit()


# ---------------------------------------------------------------- trámites de un expediente
DETALLE_INICIAL = "Recibimos tu solicitud. Un gestor te contactará para validar documentos y pago."


def tramites_de(db: sqlite3.Connection, codigo: str) -> list[dict]:
    rows = db.execute("SELECT * FROM tramites WHERE codigo=? ORDER BY id", (codigo,)).fetchall()
    return [{**dict(r), "tono": TONO_POR_PASO.get(r["paso"], "sky"), "docs": _lista_json(r["docs"])} for r in rows]


def _lista_json(texto) -> list:
    try:
        v = json.loads(texto or "[]")
        return v if isinstance(v, list) else []
    except (TypeError, ValueError):
        return []


def agregar_tramite(db: sqlite3.Connection, codigo: str, servicio_id: str | None, titulo: str,
                    precio: float | None, ts: str, detalle: str = DETALLE_INICIAL) -> int:
    cur = db.execute("INSERT INTO tramites (codigo, servicio_id, titulo, paso, estado, detalle, precio, actualizado)"
                     " VALUES (?,?,?,?,?,?,?,?)", (codigo, servicio_id, titulo, 1, "Solicitud Recibida", detalle, precio, ts))
    return cur.lastrowid


def recalcular(db: sqlite3.Connection, codigo: str) -> None:
    """Resumen general del expediente a partir de sus trámites (lo que ve el cliente arriba)."""
    items = tramites_de(db, codigo)
    if not items:
        return
    n = len(items)
    reciente = max(items, key=lambda t: t["actualizado"])
    if n == 1:
        t = items[0]
        servicio, paso, estado, detalle = t["titulo"], t["paso"], t["estado"], t["detalle"]
    else:
        listos = sum(1 for t in items if t["paso"] == 4)
        servicio, paso = f"{n} trámites", min(t["paso"] for t in items)
        if listos == n:
            estado, detalle = "Completado", "¡Todos tus trámites están listos!"
        else:
            estado = f"{listos} de {n} listos"
            detalle = f"{reciente['titulo']}: {reciente['detalle']}"
    db.execute("UPDATE seguimiento SET servicio=?, paso=?, estado=?, detalle=?, actualizado=? WHERE codigo=?",
               (servicio, paso, estado, detalle, reciente["actualizado"], codigo))


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


# ---------------------------------------------------------------- de dónde llega cada solicitud
ORIGENES = {  # palabra en utm_source o en el sitio que envió la visita -> categoría
    "instagram": ("instagram", "ig"), "facebook": ("facebook", "fb", "fbclid"), "whatsapp": ("whatsapp", "wa.me", "wa"),
    "google": ("google",), "tiktok": ("tiktok",), "youtube": ("youtube", "youtu.be"), "bing": ("bing",),
    "x": ("twitter", "t.co", "x.com", "x"), "referido": ("referido",), "app": ("app",), "directo": ("directo", "direct"),
}


def clasificar_origen(texto: str) -> str:
    t = (texto or "").lower().strip()
    if not t:
        return "directo"
    for cat, palabras in ORIGENES.items():
        for w in palabras:
            if t == w or (len(w) > 3 and w in t):
                return cat
    return "otro"


def tipo_dispositivo(ua: str) -> str:
    ua = ua or ""
    if re.search(r"iPad|Tablet", ua):
        return "tablet"
    return "movil" if re.search(r"Mobi|Android|iPhone|iPod", ua) else "escritorio"


def nombre_pagina(ruta: str) -> str:
    n = (ruta or "").strip().split("?")[0].strip("/").rsplit("/", 1)[-1].removesuffix(".html")
    return "inicio" if n in ("", "index") else (n if n in PAGINAS else "otra")


# ---------------------------------------------------------------- API
@app.get("/api/salud")
def salud():
    return jsonify({"ok": True, "servicio": "TramitaFácil RD", "hora": ahora()})


@app.get("/api/catalogo")
def api_catalogo():
    return jsonify(catalogo())


@app.get("/api/precios")
def api_precios():
    """Precios cambiados desde el panel; la página los aplica encima de data.js."""
    base = catalogo_base()["servicios"]
    return jsonify({"ok": True, "precios": {k: {"tax": _entero(t), "fee": _entero(f)}
                                            for k, (t, f) in precios_guardados().items() if k in base}})


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
        items = [{"service": t["titulo"], "step": t["paso"], "statusText": t["estado"], "detail": t["detalle"],
                  "tone": t["tono"], "updated": t["actualizado"]} for t in tramites_de(get_db(), codigo)]
        return jsonify({"ok": True, "codigo": codigo, "service": row["servicio"], "client": row["cliente"],
                        "step": row["paso"], "statusText": row["estado"], "detail": row["detalle"],
                        "tone": TONO_POR_PASO.get(row["paso"], "sky"), "updated": row["actualizado"], "items": items})
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
    origen_detalle = re.sub(r"[^\w.\- /:]", "", str(d.get("origen", "")))[:80]
    origen = clasificar_origen(origen_detalle)
    pagina_origen = nombre_pagina(str(d.get("pagina", "")))
    dispositivo = tipo_dispositivo(request.headers.get("User-Agent", ""))
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
               " idioma, pais_detalle, origen, origen_detalle, pagina, dispositivo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (codigo, nombre, pais, servicio, contacto, mensaje, cot["moneda"], cot["total"], ts, idioma, pais_detalle,
                origen, origen_detalle, pagina_origen, dispositivo))
    db.execute("INSERT INTO seguimiento (codigo, servicio, cliente, paso, estado, detalle, actualizado)"
               " VALUES (?,?,?,?,?,?,?)",
               (codigo, titulo, calculos.nombre_publico(nombre), 1, "Solicitud Recibida", DETALLE_INICIAL, ts))
    srv = cat["servicios"][servicio]
    agregar_tramite(db, codigo, servicio, titulo, srv["tax"] + srv["fee"], ts)
    db.commit()

    notificar_solicitud({"codigo": codigo, "nombre": nombre, "idioma": idioma.upper(),
                         "pais": cat["paises"][pais]["nombre"] + (f" ({pais_detalle})" if pais_detalle else ""),
                         "servicio_titulo": titulo, "contacto": contacto, "mensaje": mensaje,
                         "origen": f"{origen} ({origen_detalle})" if origen_detalle else origen, "pagina": pagina_origen,
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


def expediente(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    d = dict(row)
    d["tono"] = TONO_POR_PASO.get(d["paso"], "sky")
    d["tramites"] = tramites_de(db, d["codigo"])
    precios = [t["precio"] for t in d["tramites"]]
    d["total_dop"] = sum(precios) if precios and all(p is not None for p in precios) else None
    d["pagos"] = [dict(r) for r in db.execute("SELECT id, tipo, monto, metodo, fecha, nota FROM pagos WHERE codigo=? ORDER BY fecha, id",
                                             (d["codigo"],))]
    d["pagado"] = sum(p["monto"] for p in d["pagos"])
    d["pendiente"] = max(0, d["total_dop"] - d["pagado"]) if d["total_dop"] is not None else None
    d["notas"] = [dict(r) for r in db.execute("SELECT id, texto, creado FROM notas WHERE codigo=? ORDER BY id DESC", (d["codigo"],))]
    return d


CONSULTA_EXPEDIENTES = """
SELECT s.codigo, s.servicio AS servicio_titulo, s.cliente, s.paso, s.estado, s.detalle, s.actualizado,
       o.nombre, o.contacto, o.pais, o.pais_detalle, o.mensaje, o.total_estimado, o.moneda, o.creado,
       o.idioma, o.servicio AS servicio_id, o.origen, o.origen_detalle, o.pagina, o.dispositivo
FROM seguimiento s LEFT JOIN solicitudes o ON o.codigo = s.codigo
"""


def un_expediente(db: sqlite3.Connection, codigo: str) -> dict:
    return expediente(db, db.execute(CONSULTA_EXPEDIENTES + " WHERE s.codigo=?", (codigo,)).fetchone())


def servicio_pedido(item: dict, cat: dict) -> tuple[str, str, float | None] | str:
    """Valida un trámite pedido desde el panel. Devuelve (servicio_id, título, precio) o un mensaje de error."""
    sid = str(item.get("servicio", "")).strip()
    precio = numero(item.get("precio"))
    if sid == "otro":
        titulo = str(item.get("titulo", "")).strip()[:120]
        if len(titulo) < 3:
            return "Describe el servicio personalizado."
        return "otro", titulo, precio
    if sid not in cat["servicios"]:
        return "Elige el trámite."
    s = cat["servicios"][sid]
    return sid, s["title"], precio if precio is not None else s["tax"] + s["fee"]


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
    db = get_db()
    rows = db.execute(CONSULTA_EXPEDIENTES + " ORDER BY s.actualizado DESC LIMIT 1000").fetchall()
    lista = [expediente(db, r) for r in rows]
    conteo = {str(p): sum(1 for e in lista if e["paso"] == p) for p in PASOS}
    return jsonify({"ok": True, "expedientes": lista, "conteo": conteo, "pasos": PASOS})


@app.post("/api/admin/estado")
@requiere_admin
def admin_estado():
    """Mueve un trámite del expediente: {codigo, tramite (id), paso, detalle, estado?}."""
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
    items = tramites_de(db, codigo)
    if not items:
        return error("No existe ese código.", 404)
    try:
        tid = int(d["tramite"]) if d.get("tramite") is not None else (items[0]["id"] if len(items) == 1 else 0)
    except (TypeError, ValueError):
        tid = 0
    if tid not in {t["id"] for t in items}:
        return error("Elige cuál de los trámites quieres actualizar.")
    db.execute("UPDATE tramites SET paso=?, estado=?, detalle=?, actualizado=? WHERE id=? AND codigo=?",
               (paso, estado, detalle, ahora(), tid, codigo))
    recalcular(db, codigo)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/agregar")
@requiere_admin
def admin_agregar():
    """Agrega otro trámite al mismo código: {codigo, servicio, titulo?, precio?}."""
    d = cuerpo_json()
    codigo = str(d.get("codigo", "")).strip().upper()[:12]
    db = get_db()
    if not db.execute("SELECT 1 FROM seguimiento WHERE codigo=?", (codigo,)).fetchone():
        return error("No existe ese código.", 404)
    pedido = servicio_pedido(d, catalogo())
    if isinstance(pedido, str):
        return error(pedido)
    if len(tramites_de(db, codigo)) >= 15:
        return error("Un expediente puede tener hasta 15 trámites.")
    agregar_tramite(db, codigo, *pedido, ahora())
    recalcular(db, codigo)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


@app.post("/api/admin/quitar")
@requiere_admin
def admin_quitar():
    """Quita un trámite agregado por error (el expediente debe quedar con al menos uno)."""
    d = cuerpo_json()
    codigo = str(d.get("codigo", "")).strip().upper()[:12]
    db = get_db()
    items = tramites_de(db, codigo)
    try:
        tid = int(d.get("tramite"))
    except (TypeError, ValueError):
        tid = 0
    if tid not in {t["id"] for t in items}:
        return error("Ese trámite no existe.", 404)
    if len(items) == 1:
        return error("El expediente debe tener al menos un trámite.")
    db.execute("DELETE FROM tramites WHERE id=? AND codigo=?", (tid, codigo))
    recalcular(db, codigo)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/nuevo")
@requiere_admin
def admin_nuevo():
    """Crea un expediente (uno o varios trámites con un solo código) para un cliente de WhatsApp."""
    d = cuerpo_json()
    nombre = str(d.get("nombre", "")).strip()[:80]
    contacto = str(d.get("contacto", "")).strip()[:120]
    pais = str(d.get("pais", "rd")).strip()
    mensaje = str(d.get("mensaje", "")).strip()[:1000]
    origen = str(d.get("origen", "")).strip()[:40]
    cat = catalogo()
    if len(nombre) < 2:
        return error("Escribe el nombre del cliente.")
    pedidos_raw = d.get("servicios") or [{"servicio": d.get("servicio"), "titulo": d.get("titulo"), "precio": d.get("precio")}]
    if not isinstance(pedidos_raw, list) or not 1 <= len(pedidos_raw) <= 15:
        return error("Agrega entre 1 y 15 trámites.")
    pedidos = []
    for item in pedidos_raw:
        p = servicio_pedido(item if isinstance(item, dict) else {}, cat)
        if isinstance(p, str):
            return error(p)
        pedidos.append(p)
    if pais not in calculos.PAISES_VALIDOS:
        pais = "rd"
    db = get_db()
    existe = lambda c: db.execute("SELECT 1 FROM seguimiento WHERE codigo=?", (c,)).fetchone() is not None
    codigo = calculos.generar_codigo(existe)
    precios = [p[2] for p in pedidos]
    total = sum(precios) if all(x is not None for x in precios) else None
    ts = ahora()
    db.execute("INSERT INTO solicitudes (codigo, nombre, pais, servicio, contacto, mensaje, moneda, total_estimado, creado,"
               " idioma, pais_detalle, origen, origen_detalle, pagina, dispositivo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (codigo, nombre, pais, pedidos[0][0], contacto, mensaje, "DOP", total, ts, "es", "",
                clasificar_origen(origen) if origen else "whatsapp", origen or "creado en el panel", "panel", ""))
    db.execute("INSERT INTO seguimiento (codigo, servicio, cliente, paso, estado, detalle, actualizado)"
               " VALUES (?,?,?,?,?,?,?)",
               (codigo, pedidos[0][1], calculos.nombre_publico(nombre), 1, "Solicitud Recibida", DETALLE_INICIAL, ts))
    for sid, titulo, precio in pedidos:
        agregar_tramite(db, codigo, sid, titulo, precio, ts)
    recalcular(db, codigo)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


def _codigo_existente(d: dict) -> str | None:
    codigo = str(d.get("codigo", "")).strip().upper()[:12]
    return codigo if get_db().execute("SELECT 1 FROM seguimiento WHERE codigo=?", (codigo,)).fetchone() else None


def _fecha_dia(valor) -> str:
    """'2026-10-29' (si no viene o es inválida, hoy)."""
    try:
        return datetime.strptime(str(valor)[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return datetime.now(timezone(timedelta(hours=-4))).strftime("%Y-%m-%d")  # hoy en República Dominicana


TIPOS_PAGO = {"anticipo": "Anticipo 50%", "saldo": "Saldo 50%", "otro": "Otro pago"}


@app.post("/api/admin/pago")
@requiere_admin
def admin_pago():
    """Registra un pago del cliente: {codigo, tipo (anticipo|saldo|otro), monto, metodo, fecha?, nota?}."""
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    if not codigo:
        return error("No existe ese código.", 404)
    monto = numero(d.get("monto"))
    if monto is None or not 0 < monto <= 50_000_000:
        return error("Escribe el monto recibido.")
    tipo = str(d.get("tipo", "otro")) if str(d.get("tipo")) in TIPOS_PAGO else "otro"
    db = get_db()
    db.execute("INSERT INTO pagos (codigo, tipo, monto, metodo, fecha, nota, creado) VALUES (?,?,?,?,?,?,?)",
               (codigo, tipo, round(monto, 2), str(d.get("metodo", "")).strip()[:40], _fecha_dia(d.get("fecha")),
                str(d.get("nota", "")).strip()[:200], ahora()))
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


@app.post("/api/admin/pago/quitar")
@requiere_admin
def admin_pago_quitar():
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    db = get_db()
    if not codigo or not db.execute("DELETE FROM pagos WHERE id=? AND codigo=?", (numero(d.get("id")), codigo)).rowcount:
        return error("Ese pago no existe.", 404)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/nota")
@requiere_admin
def admin_nota():
    """Nota interna del expediente (el cliente no la ve): {codigo, texto}."""
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    if not codigo:
        return error("No existe ese código.", 404)
    texto = str(d.get("texto", "")).strip()[:1000]
    if len(texto) < 2:
        return error("Escribe la nota.")
    db = get_db()
    db.execute("INSERT INTO notas (codigo, texto, creado) VALUES (?,?,?)", (codigo, texto, ahora()))
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


@app.post("/api/admin/nota/quitar")
@requiere_admin
def admin_nota_quitar():
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    db = get_db()
    if not codigo or not db.execute("DELETE FROM notas WHERE id=? AND codigo=?", (numero(d.get("id")), codigo)).rowcount:
        return error("Esa nota no existe.", 404)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/docs")
@requiere_admin
def admin_docs():
    """Documentos recibidos de un trámite: {codigo, tramite, docs: ["Pasaporte…", …]}."""
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    if not codigo:
        return error("No existe ese código.", 404)
    docs = d.get("docs")
    if not isinstance(docs, list):
        return error("Lista de documentos inválida.")
    docs = [str(x).strip()[:160] for x in docs if str(x).strip()][:30]
    db = get_db()
    if not db.execute("UPDATE tramites SET docs=? WHERE id=? AND codigo=?",
                      (json.dumps(docs, ensure_ascii=False), numero(d.get("tramite")), codigo)).rowcount:
        return error("Ese trámite no existe.", 404)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.get("/api/admin/precios")
@requiere_admin
def admin_precios():
    """Precios de todos los servicios (catálogo + cambios del panel) y el historial de cambios."""
    base, guardados = catalogo_base(), precios_guardados()
    servicios = []
    for sid, s in base["servicios"].items():
        tax, fee = guardados.get(sid, (s["tax"], s["fee"]))
        servicios.append({"id": sid, "title": s["title"], "category": s["category"], "tax": _entero(tax), "fee": _entero(fee),
                          "tax_base": s["tax"], "fee_base": s["fee"], "modificado": sid in guardados})
    historial = [dict(r) for r in get_db().execute(
        "SELECT * FROM precios_historial ORDER BY id DESC LIMIT 100").fetchall()]
    for h in historial:
        h["title"] = base["servicios"].get(h["servicio_id"], {}).get("title", h["servicio_id"])
    return jsonify({"ok": True, "servicios": servicios, "historial": historial,
                    "categorias": {k: v.get("label", k) for k, v in base["categorias"].items()}})


@app.post("/api/admin/precio")
@requiere_admin
def admin_precio():
    """Cambia la tasa oficial y el honorario de un servicio: {servicio, tax, fee} o {servicio, restaurar: true}."""
    d = cuerpo_json()
    base = catalogo_base()["servicios"]
    sid = str(d.get("servicio", ""))
    if sid not in base:
        return error("Ese servicio no existe.", 404)
    antes = catalogo()["servicios"][sid]
    if d.get("restaurar"):
        tax, fee = base[sid]["tax"], base[sid]["fee"]
    else:
        tax, fee = numero(d.get("tax")), numero(d.get("fee"))
        if tax is None or fee is None or not (0 <= tax <= 10_000_000 and 0 <= fee <= 10_000_000):
            return error("Escribe la tasa y el honorario en pesos (números de 0 en adelante).")
        tax, fee = round(tax, 2), round(fee, 2)
    if (tax, fee) == (antes["tax"], antes["fee"]):
        return error("Ese servicio ya tiene esos precios.")
    db = get_db()
    if (tax, fee) == (base[sid]["tax"], base[sid]["fee"]):
        db.execute("DELETE FROM precios WHERE servicio_id=?", (sid,))
    else:
        db.execute("INSERT INTO precios (servicio_id, tax, fee, actualizado) VALUES (?,?,?,?) ON CONFLICT(servicio_id)"
                   " DO UPDATE SET tax=excluded.tax, fee=excluded.fee, actualizado=excluded.actualizado", (sid, tax, fee, ahora()))
    db.execute("INSERT INTO precios_historial (servicio_id, tax_antes, fee_antes, tax, fee, fecha) VALUES (?,?,?,?,?,?)",
               (sid, antes["tax"], antes["fee"], tax, fee, ahora()))
    db.commit()
    return jsonify({"ok": True, "servicio": {"id": sid, "tax": _entero(tax), "fee": _entero(fee),
                                             "modificado": (tax, fee) != (base[sid]["tax"], base[sid]["fee"])}})


@app.get("/api/admin/respaldo")
@requiere_admin
def admin_respaldo():
    """Copia completa de la base de datos (se abre con cualquier visor de SQLite)."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        destino = Path(tmp) / "respaldo.db"
        copia = sqlite3.connect(destino)
        get_db().backup(copia)
        copia.close()
        datos = destino.read_bytes()
    nombre = f"tramitafacil-respaldo-{datetime.now().strftime('%Y-%m-%d')}.db"
    return Response(datos, mimetype="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


@app.get("/api/admin/exportar")
@requiere_admin
def admin_exportar():
    """Excel: una fila por trámite (los trámites del mismo cliente comparten el código)."""
    db = get_db()
    rows = db.execute("""SELECT t.*, o.nombre, o.contacto, o.pais, o.mensaje, o.creado, o.origen, s.cliente
                         FROM tramites t JOIN seguimiento s ON s.codigo = t.codigo
                         LEFT JOIN solicitudes o ON o.codigo = t.codigo
                         ORDER BY COALESCE(o.creado, s.actualizado), t.id""").fetchall()
    salida = io.StringIO()
    w = csv.writer(salida)
    w.writerow(["Código", "Nombre", "Contacto", "País", "Trámite", "Paso", "Estado", "Mensaje al cliente",
                "Precio (RD$)", "Nota del cliente", "Llegó por", "Creado", "Última actualización"])
    for r in rows:
        w.writerow([r["codigo"], r["nombre"] or r["cliente"], r["contacto"] or "", r["pais"] or "", r["titulo"],
                    r["paso"], r["estado"], r["detalle"], "" if r["precio"] is None else r["precio"],
                    r["mensaje"] or "", r["origen"] or "", (r["creado"] or "")[:16], (r["actualizado"] or "")[:16]])
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
# Direcciones limpias: /servicios, /servicio?id=…, /rastreo… (sin ".html").
PAGINAS = {"servicios", "servicio", "casos", "instituciones", "diaspora", "rastreo", "preguntas", "calculadora", "offline", "admin"}
# 33200d87b13a122cdb2087cad4e581ff.txt: clave de IndexNow (Bing, Yandex…) para avisar a los buscadores de páginas nuevas
INDEXNOW_KEY = "33200d87b13a122cdb2087cad4e581ff"
ARCHIVOS_RAIZ = {"sw.js", "robots.txt", "sitemap.xml", "site.webmanifest", f"{INDEXNOW_KEY}.txt"}


def _con_busqueda(destino: str) -> str:
    q = request.query_string.decode("utf-8", "ignore")
    return f"{destino}?{q}" if q else destino


# ---------------------------------------------------------------- SEO
# Cada página sale del servidor con su dirección oficial (canonical) y su vista previa para
# WhatsApp/Facebook/Google (Open Graph). La página de cada servicio lleva su propio título y descripción.
SEO_PAGINAS = {"index", "servicios", "servicio", "casos", "instituciones", "diaspora", "rastreo", "preguntas", "calculadora"}
_html_cache: dict = {}


def _leer_html(nombre: str) -> str:
    ruta = BASE_DIR / f"{nombre}.html"
    mtime = ruta.stat().st_mtime
    if _html_cache.get(nombre, (0, ""))[0] != mtime:
        _html_cache[nombre] = (mtime, ruta.read_text(encoding="utf-8"))
    return _html_cache[nombre][1]


def _atr(texto: str) -> str:
    return (texto or "").replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def pagina(nombre: str):
    """Sirve una página pública con canonical y Open Graph ya puestos (sin esperar al JavaScript)."""
    html = _leer_html(nombre)
    if nombre not in SEO_PAGINAS:
        return Response(html, mimetype="text/html")
    cat = catalogo()
    sitio = cat["config"].get("sitio", "").rstrip("/")
    ruta = "/" if nombre == "index" else f"/{nombre}"
    titulo = re.search(r"<title>(.*?)</title>", html, re.S).group(1).strip()
    m = re.search(r'<meta name="description" content="([^"]*)"', html)
    desc = m.group(1) if m else ""
    if nombre == "servicio":
        sid = request.args.get("id", "")
        serv = cat["servicios"].get(sid)
        if serv:
            ruta = f"/servicio?id={sid}"
            titulo = f"{serv['title']} | TramitaFácil RD"
            desc = " ".join(serv.get("desc", "").split())[:300]
            html = re.sub(r"<title>.*?</title>", f"<title>{_atr(titulo)}</title>", html, count=1, flags=re.S)
            html = re.sub(r'<meta name="description" content="[^"]*"', f'<meta name="description" content="{_atr(desc)}"', html, count=1)
        else:
            ruta = "/servicios"   # sin servicio válido: la dirección oficial es el catálogo
    url = sitio + ruta
    imagen = f"{sitio}/assets/img/og-tramitafacil.png"
    etiquetas = f"""
    <link rel="canonical" href="{_atr(url)}">
    <meta property="og:site_name" content="TramitaFácil RD">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="es_DO">
    <meta property="og:url" content="{_atr(url)}">
    <meta property="og:title" content="{_atr(titulo)}">
    <meta property="og:description" content="{_atr(desc)}">
    <meta property="og:image" content="{imagen}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="TramitaFácil RD · Todos tus trámites en un solo lugar">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="{imagen}">"""
    html = html.replace("</title>", "</title>" + etiquetas, 1)
    return Response(html, mimetype="text/html")


@app.before_request
def sin_www():
    """www.tramitafacilrd.com → tramitafacilrd.com (una sola dirección para Google)."""
    host = (request.host or "").lower()
    if host.startswith("www."):
        destino = "https://" + host[4:] + request.full_path.rstrip("?")
        return redirect(destino, 301)
    return None


@app.get("/")
def inicio():
    return pagina("index")


@app.get("/assets/<path:ruta>")
def assets(ruta: str):
    # 10 min en caché del navegador: cambiar de página no vuelve a pedir estilos ni scripts
    return send_from_directory(BASE_DIR / "assets", ruta, max_age=600)


@app.get("/<nombre>")
def archivo_raiz(nombre: str):
    if nombre in PAGINAS:
        return pagina(nombre)
    if nombre.endswith(".html"):
        # enlaces viejos (servicios.html, index.html…) → dirección limpia, permanente
        limpio = nombre[:-5]
        if limpio == "index":
            return redirect(_con_busqueda("/"), 301)
        if limpio in PAGINAS:
            return redirect(_con_busqueda(f"/{limpio}"), 301)
        abort(404)
    if nombre in ARCHIVOS_RAIZ:
        return send_from_directory(BASE_DIR, nombre)
    abort(404)


# Pausa (mantenimiento): con TF_PAUSA=1 los visitantes ven "Volvemos pronto"; el panel /admin sigue funcionando.
@app.before_request
def pausa():
    if os.environ.get("TF_PAUSA") != "1":
        return None
    ruta = request.path
    if ruta == "/admin" or ruta.startswith(("/api/admin", "/assets/")) or ruta in ("/robots.txt", "/sw.js"):
        return None
    if ruta.startswith("/api/"):
        return error("Estamos en mantenimiento. Escríbenos por WhatsApp: +1 (849) 243-1206.", 503)
    resp = send_from_directory(BASE_DIR, "pausa.html")
    resp.status_code = 503
    resp.headers["Retry-After"] = "1800"
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.after_request
def cabeceras(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    if request.path.startswith("/api/") or request.path == "/admin":
        resp.headers["Cache-Control"] = "no-store"
        if request.path.startswith("/api/admin") or request.path == "/admin":
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
