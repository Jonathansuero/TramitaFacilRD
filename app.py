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
    POST /api/solicitud              {nombre, whatsapp, email, pais, servicio, mensaje?, acepta} -> código de seguimiento

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
    POST /api/admin/pago/validar     {codigo, id, accion: confirmar|rechazar, motivo?}  (administración y contabilidad)
    POST /api/rastreo/<codigo>/comprobante  (público, formulario) dato, archivo, monto, metodo, nota?  Comprobante del cliente
    POST /api/rastreo/<codigo>/pago-whatsapp  (público) el cliente avisa que envía el pago por WhatsApp
    GET  /api/admin/comprobante/<id> (ver) · POST /api/admin/comprobante/descartar {codigo, id, motivo}
    POST /api/admin/archivo          (formulario) codigo, clase (entrega|recibido), archivo[]
    POST /api/admin/archivo/validar  {codigo, id, accion: validar|rechazar, motivo?}   Documentos recibidos
    POST /api/admin/avisar-equipo    {codigo, texto, para: todos|confirman}   Aviso del equipo al equipo
    GET  /api/admin/registro         Quién hizo cada cambio (solo el administrador principal)
    GET  /api/admin/push/clave · POST /api/admin/push/suscribir · /quitar · /probar   Notificaciones con la app cerrada
Pagos: los registra quien tiene «pagos», pero solo cuentan como cobrados cuando los confirma alguien con
«validar_pagos» (o un administrador). Mientras tanto el cliente ve «Pago pendiente por confirmar».
    POST /api/admin/nota             {codigo, texto}                                · /api/admin/nota/quitar {codigo, id}
    POST /api/admin/docs             {codigo, tramite, docs:[…]}                    Documentos recibidos
    GET  /api/admin/precios          Precios de todos los servicios + historial
    POST /api/admin/precio           {servicio, tax, fee} o {servicio, restaurar: true}
    GET  /api/admin/respaldo         Copia de la base de datos
    GET  /api/precios                (público) precios cambiados desde el panel
    POST /api/admin/cliente          {codigo, nombre, contacto, pais, pais_detalle?}  Corregir datos del cliente
    GET  /api/admin/usuarios         Usuarios del equipo y actividad reciente (permiso «usuarios»)
    POST /api/admin/usuarios/guardar {id?, usuario, nombre, permisos, activo, clave?}
    POST /api/admin/cuenta/clave     {actual, nueva}  Cambiar mi contraseña
    POST /api/admin/cuenta/nombre    {nombre, correo?} Cambiar mi nombre y mi correo para avisos
    POST /api/admin/archivo          (formulario) codigo, archivo[]  Documentos escaneados para entregar al cliente
    POST /api/admin/archivo/quitar   {codigo, id}     · GET /api/admin/archivo/<id> (ver)
    POST /api/admin/archivo/enviar   {codigo}         Envía los documentos al correo del cliente
    POST /api/admin/avisar           {codigo}         Envía al cliente el estado actual por correo (un clic)
    POST /api/admin/eliminar         {codigo, motivo?} Mueve el cliente al zafacón (solo administradores)
    GET  /api/admin/zafacon          Clientes eliminados (se borran por completo a los 7 días)
    POST /api/admin/restaurar        {codigo}         Reactiva el cliente tal como estaba
    GET  /api/admin/mensajes         Mensajes preestablecidos por trámite y paso (el primero de cada lista es el de por defecto)
    POST /api/admin/mensajes/guardar {id?, servicio ('' = todos), paso, texto, defecto?}   (solo administradores)
    POST /api/admin/mensajes/quitar  {id}
    GET  /api/admin/avisos           Avisos de solicitudes nuevas (no los ven los usuarios de solo lectura)
    POST /api/admin/avisos/visto     {hasta}
    POST /api/rastreo/<codigo>/archivos {dato}   (público) últimos 4 del WhatsApp o el correo -> enlaces de descarga
    GET  /descarga/<token>           (público) descarga con enlace firmado (vence en 30 días)
Correos (avisos.py): al cliente cuando cambia el estado y al equipo cuando llega una solicitud. Se activan con `tramita correo`.
Cuando el administrador crea un usuario o le pone una clave nueva, esa persona debe crear su propia clave al entrar.

Usuarios: cada persona entra con usuario y clave; los permisos (PERMISOS) deciden qué puede hacer.
«admin» toma la clave de `tramita clave` (TF_ADMIN_HASH): primer acceso y llave de emergencia.
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

from flask import Flask, Response, abort, g, has_app_context, jsonify, redirect, request, send_file, send_from_directory, session
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

import avisos
import push
import calculos

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("TF_DB_PATH", BASE_DIR / "instance" / "tramitafacil.db"))
PASOS = {1: "Recibido", 2: "Verificado", 3: "En la institución", 4: "Listo"}
TONO_POR_PASO = {1: "sky", 2: "sky", 3: "amber", 4: "emerald"}

app = Flask(__name__, static_folder=None)
app.json.ensure_ascii = False  # acentos legibles en las respuestas JSON
app.json.sort_keys = False     # conserva el orden (por ejemplo, el de los permisos)
app.config["MAX_CONTENT_LENGTH"] = 26 * 1024 * 1024  # solo la subida de documentos llega a esto (ver tamano_maximo)
LIMITE_JSON = 32 * 1024  # el resto son JSON pequeños
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
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    hash TEXT NOT NULL,
    permisos TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL,
    ultimo_acceso TEXT
);
CREATE TABLE IF NOT EXISTS actividad (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    accion TEXT NOT NULL,
    codigo TEXT,
    detalle TEXT,
    fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_actividad_codigo ON actividad (codigo);
CREATE TABLE IF NOT EXISTS archivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    archivo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    tamano INTEGER NOT NULL,
    creado TEXT NOT NULL,
    usuario TEXT,
    clase TEXT NOT NULL DEFAULT 'entrega',
    estado TEXT NOT NULL DEFAULT '',
    revisado_por TEXT,
    motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_archivos_codigo ON archivos (codigo);
CREATE TABLE IF NOT EXISTS avisos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    detalle TEXT,
    codigo TEXT,
    creado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS correos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT,
    para TEXT NOT NULL,
    asunto TEXT NOT NULL,
    tipo TEXT NOT NULL,
    estado TEXT NOT NULL,
    error TEXT,
    fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_correos_codigo ON correos (codigo);
CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    servicio_id TEXT NOT NULL DEFAULT '',
    paso INTEGER NOT NULL,
    texto TEXT NOT NULL,
    orden REAL NOT NULL,
    actualizado TEXT NOT NULL,
    usuario TEXT
);
CREATE INDEX IF NOT EXISTS idx_mensajes ON mensajes (servicio_id, paso, orden);
CREATE TABLE IF NOT EXISTS comprobantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    archivo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    tamano INTEGER NOT NULL,
    monto REAL,
    moneda TEXT NOT NULL DEFAULT 'DOP',
    metodo TEXT,
    nota TEXT,
    creado TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    via_whatsapp INTEGER NOT NULL DEFAULT 0,
    pago_id INTEGER,
    revisado_por TEXT,
    revisado_en TEXT,
    motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_comprobantes_codigo ON comprobantes (codigo);
CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    creado TEXT NOT NULL,
    dispositivo TEXT
);
CREATE TABLE IF NOT EXISTS ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT
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
    for col in ("idioma", "pais_detalle", "origen", "origen_detalle", "pagina", "dispositivo"):
        if col not in cols:
            db.execute(f"ALTER TABLE solicitudes ADD COLUMN {col} TEXT")
    cols_u = {r[1] for r in db.execute("PRAGMA table_info(usuarios)")}
    if "cambiar_clave" not in cols_u:
        db.execute("ALTER TABLE usuarios ADD COLUMN cambiar_clave INTEGER NOT NULL DEFAULT 0")  # debe poner su propia clave al entrar
    if "correo" not in cols_u:
        db.execute("ALTER TABLE usuarios ADD COLUMN correo TEXT")  # para recibir avisos de solicitudes nuevas
    if "avisos_visto" not in cols_u:
        db.execute("ALTER TABLE usuarios ADD COLUMN avisos_visto INTEGER NOT NULL DEFAULT 0")
    cols_s = {r[1] for r in db.execute("PRAGMA table_info(seguimiento)")}
    for col in ("eliminado", "eliminado_por", "eliminado_motivo"):  # zafacón: fecha, quién y por qué
        if col not in cols_s:
            db.execute(f"ALTER TABLE seguimiento ADD COLUMN {col} TEXT")
    cols_p = {r[1] for r in db.execute("PRAGMA table_info(pagos)")}
    if "estado" not in cols_p:  # los pagos de antes ya se daban por buenos
        db.execute("ALTER TABLE pagos ADD COLUMN estado TEXT NOT NULL DEFAULT 'confirmado'")
    for col in ("registrado_por", "validado_por", "validado_en", "motivo"):
        if col not in cols_p:
            db.execute(f"ALTER TABLE pagos ADD COLUMN {col} TEXT")
    if "usuario" not in {r[1] for r in db.execute("PRAGMA table_info(avisos)")}:
        db.execute("ALTER TABLE avisos ADD COLUMN usuario TEXT")   # quién lo provocó (no se le avisa a sí mismo)
    cols_a = {r[1] for r in db.execute("PRAGMA table_info(archivos)")}
    if "clase" not in cols_a:   # los de antes eran todos para entregar al cliente
        db.execute("ALTER TABLE archivos ADD COLUMN clase TEXT NOT NULL DEFAULT 'entrega'")
    if "estado" not in cols_a:
        db.execute("ALTER TABLE archivos ADD COLUMN estado TEXT NOT NULL DEFAULT ''")
    for col in ("revisado_por", "motivo"):
        if col not in cols_a:
            db.execute(f"ALTER TABLE archivos ADD COLUMN {col} TEXT")
    if "comprobante_id" not in cols_p:
        db.execute("ALTER TABLE pagos ADD COLUMN comprobante_id INTEGER")  # comprobante del cliente que respalda el pago
    if "via_whatsapp" not in cols_p:
        db.execute("ALTER TABLE pagos ADD COLUMN via_whatsapp INTEGER NOT NULL DEFAULT 0")   # el comprobante llegó por WhatsApp
    cols_c = {r[1] for r in db.execute("PRAGMA table_info(comprobantes)")}
    if "revisado_en" not in cols_c:
        db.execute("ALTER TABLE comprobantes ADD COLUMN revisado_en TEXT")
    if "avisar_cliente" not in cols_c:
        db.execute("ALTER TABLE comprobantes ADD COLUMN avisar_cliente INTEGER NOT NULL DEFAULT 1")
    if "avisar_cliente" not in cols_p:
        db.execute("ALTER TABLE pagos ADD COLUMN avisar_cliente INTEGER NOT NULL DEFAULT 1")
    if "pago_wa" not in cols_s:
        db.execute("ALTER TABLE seguimiento ADD COLUMN pago_wa TEXT")   # el cliente avisó que paga por WhatsApp
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


# ---------------------------------------------------------------- correos y avisos
def anotar_correo(codigo: str | None, para: list[str], asunto: str, tipo: str):
    """Anota el correo como «enviando» y devuelve la función que guarda cómo terminó (corre en otro hilo)."""
    db = get_db()
    cid = db.execute("INSERT INTO correos (codigo, para, asunto, tipo, estado, fecha) VALUES (?,?,?,?,?,?)",
                     (codigo, ", ".join(para), asunto[:200], tipo, "enviando", ahora())).lastrowid
    db.commit()
    ruta = DB_PATH

    def terminar(ok: bool, err: str) -> None:
        con = sqlite3.connect(ruta)
        try:
            con.execute("UPDATE correos SET estado=?, error=? WHERE id=?", ("enviado" if ok else "fallido", err or None, cid))
            con.commit()
        finally:
            con.close()
        if not ok:
            app.logger.warning("Correo %s no enviado: %s", cid, err)
    return terminar


def correos_equipo(db: sqlite3.Connection) -> list[str]:
    """A quién avisar de una solicitud nueva: usuarios activos que trabajan expedientes (no los de solo lectura)."""
    lista = [r["correo"] for r in db.execute("SELECT correo, permisos FROM usuarios WHERE activo=1 AND correo IS NOT NULL AND correo<>''")
             if "expedientes" in _permisos(r["permisos"])]
    if os.environ.get("NOTIFY_TO"):
        lista.append(os.environ["NOTIFY_TO"])
    return [c for c in lista if avisos.valido(c)]


def notificar_solicitud(datos: dict) -> None:
    """Solicitud nueva: queda un aviso en el panel (campana) y llega un correo al equipo."""
    db = get_db()
    titulo = f"Nueva solicitud: {datos['servicio_titulo']}"
    db.execute("INSERT INTO avisos (tipo, titulo, detalle, codigo, creado, usuario) VALUES (?,?,?,?,?,?)",
               ("solicitud", titulo[:200], f"{datos['nombre']} · {datos['pais']}"[:200], datos["codigo"], ahora(), None))
    db.commit()
    notificar_push(db, lambda perms: "expedientes" in perms, titulo, f"{datos['nombre']} · {datos['pais']} · {datos['codigo']}", datos["codigo"])
    para = correos_equipo(db)
    if not para or not avisos.configurado():
        return
    texto, html_ = avisos.plantilla(
        titulo, "Hola, equipo:", ["Llegó una solicitud nueva desde la página. Entra al panel para atenderla."],
        datos=[("Trámite", datos["servicio_titulo"]), ("Código", datos["codigo"]), ("Cliente", datos["nombre"]),
               ("Desde", datos["pais"]), ("Contacto", datos["contacto"]), ("Total estimado", datos["total_estimado"]),
               ("Llegó por", datos["origen"])] + ([("Nota del cliente", datos["mensaje"])] if datos.get("mensaje") else []),
        boton=("Abrir el panel", f"{avisos.sitio()}/admin"),
        pie="Aviso interno del panel de TramitaFácil RD. Lo reciben los usuarios que gestionan expedientes.")
    avisos.enviar(para, f"{titulo} · {datos['codigo']}", texto, html_,
                  al_terminar=anotar_correo(datos["codigo"], para, titulo, "equipo"))


# ---------------------------------------------------------------- documentos para entregar al cliente
TIPOS_ARCHIVO = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_ARCHIVO = 10 * 1024 * 1024
MAX_ARCHIVOS_CODIGO = 20
DIAS_ENLACE = 30


def carpeta_archivos() -> Path:
    return Path(os.environ.get("TF_ARCHIVOS") or DB_PATH.parent / "archivos")


def _firmador() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(app.secret_key, salt="tf-descarga")


def enlace_descarga(archivo_id: int) -> str:
    return f"{avisos.sitio()}/descarga/{_firmador().dumps({'a': archivo_id})}"


def _es_tipo_real(cabeza: bytes, ext: str) -> bool:
    """Revisa los primeros bytes: que un .pdf sea de verdad un PDF, etc."""
    if ext == ".pdf":
        return cabeza.startswith(b"%PDF")
    if ext in (".jpg", ".jpeg"):
        return cabeza.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return cabeza.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".webp":
        return cabeza[:4] == b"RIFF" and cabeza[8:12] == b"WEBP"
    return False


CLASES_ARCHIVO = ("entrega", "recibido")   # entrega: va al cliente · recibido: lo mandó el cliente, uso interno


def archivos_de(db: sqlite3.Connection, codigo: str, clase: str = "entrega") -> list[dict]:
    return [dict(r) for r in db.execute(
        "SELECT id, nombre, tipo, tamano, creado, usuario, archivo, clase, estado, revisado_por, motivo"
        " FROM archivos WHERE codigo=? AND clase=? ORDER BY id", (codigo, clase))]


def contacto_coincide(contacto: str, dato: str) -> bool:
    """El cliente demuestra que es él: los últimos 4 dígitos de su WhatsApp o su correo completo."""
    dato = str(dato or "").strip().lower()
    if "@" in dato:
        return bool(dato) and dato == avisos.correo_de(contacto)
    dig = re.sub(r"\D", "", dato)
    partes = [re.sub(r"\D", "", x) for x in str(contacto or "").split("·") if "@" not in x]
    return len(dig) >= 4 and any(len(p) >= 7 and p.endswith(dig[-4:]) for p in partes)


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
    row = get_db().execute("SELECT * FROM seguimiento WHERE codigo = ? AND eliminado IS NULL", (codigo,)).fetchone()
    if row:
        items = [{"service": t["titulo"], "step": t["paso"], "statusText": t["estado"], "detail": t["detalle"],
                  "tone": t["tono"], "updated": t["actualizado"]} for t in tramites_de(get_db(), codigo)]
        return jsonify({"ok": True, "codigo": codigo, "service": row["servicio"], "client": row["cliente"],
                        "step": row["paso"], "statusText": row["estado"], "detail": row["detalle"],
                        "tone": TONO_POR_PASO.get(row["paso"], "sky"), "updated": row["actualizado"], "items": items,
                        "archivos": get_db().execute("SELECT COUNT(*) FROM archivos WHERE codigo=? AND clase='entrega'", (codigo,)).fetchone()[0],
                        **estado_pago_cliente(get_db(), codigo), "falta_pagar": falta_por_pagar(get_db(), codigo)})
    demo = catalogo()["rastreo_demo"].get(codigo)
    if demo:
        return jsonify({"ok": True, "codigo": codigo, **demo, "demo": True})
    return error("No encontramos ningún expediente con ese código.", 404)


def estado_pago_cliente(db: sqlite3.Connection, codigo: str) -> dict:
    """Lo que ve el cliente: esperando confirmación, rechazado (con el motivo) o confirmado."""
    pagos = db.execute("SELECT estado, validado_en, motivo, avisar_cliente FROM pagos WHERE codigo=?", (codigo,)).fetchall()
    comps = db.execute("SELECT estado, revisado_en, creado, motivo, avisar_cliente FROM comprobantes WHERE codigo=?", (codigo,)).fetchall()
    if any(p["estado"] == "pendiente" for p in pagos) or any(c["estado"] == "nuevo" for c in comps):
        return {"pago": "por_confirmar", "pago_motivo": ""}
    # (cuándo, prioridad, motivo): si coinciden en el tiempo, pesa más el rechazo de un pago que el de un comprobante
    rechazos = [((p["validado_en"] or ""), 1, (p["motivo"] or "")) for p in pagos if p["estado"] == "rechazado" and p["avisar_cliente"]]
    rechazos += [((c["revisado_en"] or c["creado"] or ""), 0, (c["motivo"] or "")) for c in comps
                 if c["estado"] == "descartado" and c["avisar_cliente"]]
    confirmados = [(p["validado_en"] or "") for p in pagos if p["estado"] == "confirmado"]
    if rechazos:
        cuando, _, motivo = max(rechazos, key=lambda x: (x[0], x[1]))
        if not any(c >= cuando for c in confirmados):   # si después le confirmamos un pago, ya no se le alarma
            return {"pago": "rechazado", "pago_motivo": motivo}
    if confirmados:
        return {"pago": "confirmado", "pago_motivo": ""}
    return {"pago": None, "pago_motivo": ""}


def falta_por_pagar(db: sqlite3.Connection, codigo: str) -> bool:
    """¿Al cliente todavía le queda saldo? Si no, ya no se le pide otro comprobante."""
    total = db.execute("SELECT SUM(precio) FROM tramites WHERE codigo=?", (codigo,)).fetchone()[0]
    if total is None:
        return True   # sin precio no se sabe: se deja la opción abierta
    pagado = db.execute("SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE codigo=? AND estado='confirmado'", (codigo,)).fetchone()[0]
    return pagado < total


@app.post("/api/rastreo/<codigo>/archivos")
def api_rastreo_archivos(codigo: str):
    """{dato}: últimos 4 dígitos del WhatsApp o el correo del cliente -> enlaces para descargar sus documentos."""
    if limitar("verificar", 8, 600):
        return error("Demasiados intentos. Espera unos minutos.", 429)
    codigo = codigo.strip().upper()[:12]
    db = get_db()
    sol = db.execute("SELECT o.contacto FROM solicitudes o JOIN seguimiento s ON s.codigo = o.codigo"
                     " WHERE o.codigo=? AND s.eliminado IS NULL", (codigo,)).fetchone()
    if not sol or not contacto_coincide(sol["contacto"], cuerpo_json().get("dato", "")):
        return error("Los datos no coinciden con este expediente.", 403)
    lista = [{"nombre": a["nombre"], "tamano": a["tamano"], "url": enlace_descarga(a["id"])} for a in archivos_de(db, codigo)]
    return jsonify({"ok": True, "archivos": lista})


@app.get("/descarga/<token>")
def descarga(token: str):
    try:
        datos = _firmador().loads(token, max_age=DIAS_ENLACE * 86400)
    except BadSignature:
        return Response("Este enlace no es válido o ya venció. Descarga tus documentos en la página de rastreo con tu código.",
                        status=410, mimetype="text/plain; charset=utf-8")
    r = get_db().execute("SELECT a.* FROM archivos a JOIN seguimiento s ON s.codigo = a.codigo"
                         " WHERE a.id=? AND a.clase='entrega' AND s.eliminado IS NULL", (int(datos.get("a", 0)),)).fetchone()
    ruta = carpeta_archivos() / r["archivo"] if r else None
    if not r or not ruta.is_file():
        return Response("Este documento ya no está disponible. Escríbenos por WhatsApp.", status=404, mimetype="text/plain; charset=utf-8")
    resp = send_file(ruta, mimetype=r["tipo"], as_attachment=True, download_name=r["nombre"])
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    return resp


METODOS_PAGO = ("Transferencia", "Zelle", "Remesa", "PayPal", "Tarjeta", "Efectivo", "Otro")


@app.post("/api/rastreo/<codigo>/pago-whatsapp")
def api_pago_whatsapp(codigo: str):
    """El cliente avisa que enviará el pago y el comprobante por WhatsApp. Solo deja la señal para el equipo."""
    if limitar("pago_wa", 6, 3600):
        return error("Ya recibimos tu aviso. Escríbenos por WhatsApp si necesitas algo más.", 429)
    codigo = codigo.strip().upper()[:12]
    db = get_db()
    sol = db.execute("SELECT o.nombre FROM solicitudes o JOIN seguimiento s ON s.codigo = o.codigo"
                     " WHERE o.codigo=? AND s.eliminado IS NULL", (codigo,)).fetchone()
    if not sol:
        return error("No encontramos ese expediente.", 404)
    ya = db.execute("SELECT pago_wa FROM seguimiento WHERE codigo=?", (codigo,)).fetchone()["pago_wa"]
    db.execute("UPDATE seguimiento SET pago_wa=? WHERE codigo=?", (ahora(), codigo))
    db.execute("INSERT INTO actividad (usuario, accion, codigo, detalle, fecha) VALUES (?,?,?,?,?)",
               ("cliente", "Avisó que envía el pago por WhatsApp", codigo, "", ahora()))
    db.commit()
    if not ya:   # solo se avisa la primera vez, para no repetir
        titulo = "El cliente pagará por WhatsApp"
        db.execute("INSERT INTO avisos (tipo, titulo, detalle, codigo, creado, usuario) VALUES (?,?,?,?,?,?)",
                   ("comprobante", titulo, f"{sol['nombre']} · {codigo}"[:200], codigo, ahora(), None))
        db.commit()
        avisar_equipo_correo(db, lambda perms: bool({"pagos", "validar_pagos", "usuarios"} & perms), titulo,
                             f"{sol['nombre']} · {codigo}", codigo,
                             ["El cliente avisó desde la página que enviará el pago y el comprobante por WhatsApp."])
    return jsonify({"ok": True})


@app.post("/api/rastreo/<codigo>/comprobante")
def api_comprobante(codigo: str):
    """El cliente sube su comprobante de pago (opcional). Formulario: dato (últimos 4 del WhatsApp o correo), archivo, monto, metodo, nota."""
    if limitar("comprobante", 6, 3600):
        return error("Ya recibimos varios comprobantes. Si necesitas enviar otro, escríbenos por WhatsApp.", 429)
    codigo = codigo.strip().upper()[:12]
    db = get_db()
    sol = db.execute("SELECT o.contacto, o.nombre FROM solicitudes o JOIN seguimiento s ON s.codigo = o.codigo"
                     " WHERE o.codigo=? AND s.eliminado IS NULL", (codigo,)).fetchone()
    if not sol or not contacto_coincide(sol["contacto"], request.form.get("dato", "")):
        return error("Los datos no coinciden con este expediente.", 403)
    f = request.files.get("archivo")
    if not f:
        return error("Elige la foto o el PDF del comprobante.")
    monto = numero(request.form.get("monto"))
    if monto is None or not 0 < monto <= 50_000_000:
        return error("Escribe el monto que pagaste.")
    metodo = str(request.form.get("metodo", "")).strip()
    metodo = metodo if metodo in METODOS_PAGO else "Otro"
    moneda = str(request.form.get("moneda", "DOP")).upper()
    moneda = moneda if moneda in ("DOP", "USD", "EUR") else "DOP"
    simbolo = {"DOP": "RD$", "USD": "US$", "EUR": "€"}[moneda]
    if db.execute("SELECT COUNT(*) FROM comprobantes WHERE codigo=?", (codigo,)).fetchone()[0] >= 10:
        return error("Este expediente ya tiene muchos comprobantes. Escríbenos por WhatsApp.")
    nombre = re.sub(r"[^\w.\- ()áéíóúñÁÉÍÓÚÑ]", "_", Path(f.filename or "comprobante").name)[:100] or "comprobante"
    ext = Path(nombre).suffix.lower()
    if ext not in TIPOS_ARCHIVO:
        return error("Sube una foto (JPG, PNG o WEBP) o un PDF.")
    datos = f.read(MAX_ARCHIVO + 1)
    if len(datos) > MAX_ARCHIVO:
        return error("El archivo pesa más de 10 MB.")
    if not _es_tipo_real(datos[:16], ext):
        return error("El archivo no parece una foto o un PDF válido.")
    carpeta = carpeta_archivos() / codigo
    carpeta.mkdir(parents=True, exist_ok=True)
    guardado = f"comprobante-{secrets.token_hex(10)}{ext}"
    (carpeta / guardado).write_bytes(datos)
    nota = str(request.form.get("nota", "")).strip()[:200]
    db.execute("INSERT INTO comprobantes (codigo, nombre, archivo, tipo, tamano, monto, moneda, metodo, nota, creado) VALUES (?,?,?,?,?,?,?,?,?,?)",
               (codigo, nombre, f"{codigo}/{guardado}", TIPOS_ARCHIVO[ext], len(datos), round(monto, 2), moneda, metodo, nota, ahora()))
    db.execute("INSERT INTO actividad (usuario, accion, codigo, detalle, fecha) VALUES (?,?,?,?,?)",
               ("cliente", "Envió un comprobante de pago", codigo, f"{simbolo}{monto:,.2f} · {metodo}", ahora()))
    titulo = f"Comprobante del cliente: {simbolo}{monto:,.2f}"
    db.execute("INSERT INTO avisos (tipo, titulo, detalle, codigo, creado, usuario) VALUES (?,?,?,?,?,?)",
               ("comprobante", titulo, f"{sol['nombre']} · {metodo}"[:200], codigo, ahora(), None))
    db.commit()
    quien_cobra = lambda perms: bool({"pagos", "validar_pagos", "usuarios"} & perms)
    notificar_push(db, quien_cobra, titulo, f"{sol['nombre']} · {metodo} · {codigo}", codigo)
    para = correos_validadores(db)
    if para and avisos.configurado():
        texto, html_ = avisos.plantilla(titulo, "Hola:", ["El cliente subió su comprobante de pago desde la página. Revísalo y registra o confirma el pago en el panel."],
                                        datos=[("Código", codigo), ("Cliente", sol["nombre"]), ("Monto que indicó", f"{simbolo}{monto:,.2f}"), ("Método", metodo)]
                                        + ([("Nota", nota)] if nota else []),
                                        boton=("Revisar en el panel", f"{avisos.sitio()}/admin"), pie="Aviso interno: lo reciben administración y contabilidad.")
        avisos.enviar(para, f"{titulo} · {codigo}", texto, html_, al_terminar=anotar_correo(codigo, para, titulo, "equipo"))
    return jsonify({"ok": True}), 201


@app.post("/api/solicitud")
def api_solicitud():
    if limitar("solicitud", 5, 600):
        return error("Recibimos varias solicitudes seguidas. Intenta de nuevo en unos minutos.", 429)
    d = cuerpo_json()
    if d.get("web"):  # campo trampa anti-spam (invisible para personas)
        return jsonify({"ok": True, "codigo": "RD-000000"})

    nombre = str(d.get("nombre", "")).strip()[:80]
    # WhatsApp y correo son obligatorios (para avisarle de cada avance y enviarle sus documentos)
    if "whatsapp" in d or "email" in d:
        wa_cliente = str(d.get("whatsapp", "") or "").strip()[:40]
        correo_cliente = str(d.get("email", "") or "").strip().lower()[:80]
    else:  # versiones anteriores del formulario mandaban todo junto en «contacto»
        partes = [x.strip() for x in str(d.get("contacto", "")).split("·")]
        wa_cliente = " ".join(x for x in partes if "@" not in x)[:40]
        correo_cliente = avisos.correo_de(d.get("contacto"))
    contacto = f"{wa_cliente} · {correo_cliente}"[:120]
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
    if not 8 <= len(re.sub(r"\D", "", wa_cliente)) <= 15:
        return error("Escribe tu número de WhatsApp con el código de país.")
    if not avisos.valido(correo_cliente):
        return error("Escribe un correo electrónico válido.")
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
                         "origen": (f"{origen} ({origen_detalle})" if origen_detalle else origen).capitalize(), "pagina": pagina_origen,
                         "total_estimado": (("RD$" if cot["moneda"] == "DOP" else cot["moneda"] + " ") + f"{cot['total']:,.2f}".removesuffix(".00")) if cot["total"] is not None else "Por cotizar"})
    return jsonify({"ok": True, "codigo": codigo, "servicio": titulo}), 201


# ---------------------------------------------------------------- panel de administración: usuarios y permisos
# Cada persona del equipo entra con su usuario y su clave. Lo que puede hacer depende de sus permisos.
PERMISOS = {
    "expedientes": "Trabajar expedientes: avance, documentos, notas, datos del cliente y expedientes nuevos",
    "pagos": "Ver y registrar pagos",
    "resumen": "Ver el resumen del negocio",
    "precios": "Cambiar precios",
    "validar_pagos": "Confirmar o rechazar los pagos registrados (administración y contabilidad)",
    "herramientas": "Descargar Excel y respaldos",
    "usuarios": "Administrar usuarios y ver la actividad del equipo",
}
RE_USUARIO = re.compile(r"^[a-z0-9._-]{3,30}$")


def _permisos(texto) -> list[str]:
    return [x for x in _lista_json(texto) if x in PERMISOS]


def sincronizar_dueno(db: sqlite3.Connection) -> None:
    """La clave de `tramita clave` (TF_ADMIN_HASH) es la del usuario «admin», con todos los permisos.
    Sirve para el primer acceso y como llave de emergencia si se olvida la clave."""
    h = os.environ.get("TF_ADMIN_HASH")
    if not h:
        return
    fila = db.execute("SELECT valor FROM ajustes WHERE clave='admin_hash'").fetchone()
    if fila and fila[0] == h and db.execute("SELECT 1 FROM usuarios WHERE usuario='admin'").fetchone():
        return
    ts = ahora()
    if db.execute("SELECT 1 FROM usuarios WHERE usuario='admin'").fetchone():
        db.execute("UPDATE usuarios SET hash=?, activo=1, permisos=?, version=version+1 WHERE usuario='admin'",
                   (h, json.dumps(list(PERMISOS))))
    else:
        db.execute("INSERT INTO usuarios (usuario, nombre, hash, permisos, activo, creado) VALUES (?,?,?,?,1,?)",
                   ("admin", "Administrador", h, json.dumps(list(PERMISOS)), ts))
    db.execute("INSERT INTO ajustes (clave, valor) VALUES ('admin_hash', ?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor", (h,))
    db.commit()


def admin_configurado() -> bool:
    return bool(os.environ.get("TF_ADMIN_HASH")) or get_db().execute("SELECT 1 FROM usuarios LIMIT 1").fetchone() is not None


def usuario_actual() -> dict | None:
    """El usuario de esta sesión (si sigue activo y no le cambiaron la clave)."""
    if "usuario" in g:
        return g.usuario
    g.usuario = None
    uid = session.get("uid")
    if uid:
        r = get_db().execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone()
        if r and r["activo"] and r["version"] == session.get("ver"):
            g.usuario = {"id": r["id"], "usuario": r["usuario"], "nombre": r["nombre"], "permisos": _permisos(r["permisos"]),
                         "cambiar_clave": bool(r["cambiar_clave"]), "correo": r["correo"] or ""}
    return g.usuario


def puede(permiso: str) -> bool:
    u = usuario_actual()
    return bool(u and permiso in u["permisos"])


def es_dueno() -> bool:
    """El administrador principal: el usuario que tiene todos los permisos."""
    u = usuario_actual()
    return bool(u and set(PERMISOS) <= set(u["permisos"]))


def puede_validar() -> bool:
    """Confirmar pagos: contabilidad (validar_pagos) o un administrador (usuarios)."""
    return puede("validar_pagos") or puede("usuarios")


def requiere(permiso: str | None = None):
    def deco(fn):
        @wraps(fn)
        def envoltura(*args, **kwargs):
            u = usuario_actual()
            if not u:
                return error("Tu sesión terminó. Vuelve a entrar.", 401)
            if u["cambiar_clave"] and fn.__name__ not in ("admin_mi_clave", "admin_mi_nombre"):
                return error("Primero crea tu contraseña personal (Mi cuenta).", 403)
            if permiso and not puede(permiso):
                return error("Tu usuario no tiene permiso para esto. Pídeselo al administrador.", 403)
            return fn(*args, **kwargs)
        return envoltura
    return deco


requiere_admin = requiere()  # cualquier usuario con sesión


def registrar(accion: str, codigo: str | None = None, detalle: str = "") -> None:
    """Anota quién hizo qué (se guarda con el siguiente commit)."""
    u = usuario_actual()
    get_db().execute("INSERT INTO actividad (usuario, accion, codigo, detalle, fecha) VALUES (?,?,?,?,?)",
                     (u["usuario"] if u else "sistema", accion, codigo, str(detalle)[:300], ahora()))


def expediente(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    d = dict(row)
    d["tono"] = TONO_POR_PASO.get(d["paso"], "sky")
    d["tramites"] = tramites_de(db, d["codigo"])
    precios = [t["precio"] for t in d["tramites"]]
    d["total_dop"] = sum(precios) if precios and all(p is not None for p in precios) else None
    d["pagos"] = [dict(r) for r in db.execute("SELECT id, tipo, monto, metodo, fecha, nota, estado, registrado_por, validado_por, validado_en, motivo, comprobante_id, via_whatsapp"
                                             " FROM pagos WHERE codigo=? ORDER BY fecha, id",
                                             (d["codigo"],))]
    d["pagado"] = sum(p["monto"] for p in d["pagos"] if p["estado"] == "confirmado")  # solo lo confirmado cuenta
    d["por_confirmar"] = sum(p["monto"] for p in d["pagos"] if p["estado"] == "pendiente")
    d["pendiente"] = max(0, d["total_dop"] - d["pagado"]) if d["total_dop"] is not None else None
    d["notas"] = [dict(r) for r in db.execute("SELECT id, texto, creado FROM notas WHERE codigo=? ORDER BY id DESC", (d["codigo"],))]
    d["actividad"] = [dict(r) for r in db.execute(
        "SELECT usuario, accion, detalle, fecha FROM actividad WHERE codigo=? ORDER BY id DESC LIMIT 20", (d["codigo"],))]
    d["correo_cliente"] = avisos.correo_de(d.get("contacto"))
    d["archivos"] = [{k: a[k] for k in ("id", "nombre", "tipo", "tamano", "creado", "usuario")} | {"enlace": enlace_descarga(a["id"])}
                     for a in archivos_de(db, d["codigo"])]
    d["recibidos"] = [{k: a[k] for k in ("id", "nombre", "tipo", "tamano", "creado", "usuario", "estado", "revisado_por", "motivo")}
                      for a in archivos_de(db, d["codigo"], "recibido")]
    d["correos"] = [dict(r) for r in db.execute(
        "SELECT asunto, para, tipo, estado, fecha FROM correos WHERE codigo=? AND tipo<>'equipo' ORDER BY id DESC LIMIT 10", (d["codigo"],))]
    d["pago_wa"] = db.execute("SELECT pago_wa FROM seguimiento WHERE codigo=?", (d["codigo"],)).fetchone()["pago_wa"]
    d["comprobantes"] = [dict(r) for r in db.execute(
        "SELECT id, nombre, tipo, tamano, monto, moneda, metodo, nota, creado, estado, pago_id, revisado_por, motivo, avisar_cliente"
        " FROM comprobantes WHERE codigo=? ORDER BY id",
        (d["codigo"],))]
    if has_app_context() and usuario_actual() and not puede("pagos"):
        d["pagos"], d["pagado"], d["pendiente"], d["por_confirmar"], d["comprobantes"] = [], None, None, None, []
    if has_app_context() and usuario_actual() and not (puede("expedientes") or puede("pagos")):
        d["recibidos"] = []
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
    u = usuario_actual()
    return jsonify({"ok": True, "admin": bool(u), "usuario": u, "configurado": admin_configurado(), "permisos": PERMISOS,
                    "correo_activo": avisos.configurado() if u else None})


@app.post("/api/admin/login")
def admin_login():
    """{usuario, clave}. Sin usuario se entiende «admin» (como antes, solo con contraseña)."""
    db = get_db()
    sincronizar_dueno(db)
    if not admin_configurado():
        return error("El panel no está activado. En el servidor escribe: tramita clave", 503)
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "?").split(",")[0].strip()
    fallos = _hits[f"login:{ip}"]
    while fallos and time.time() - fallos[0] > 900:
        fallos.popleft()
    if len(fallos) >= 8:  # solo cuentan los intentos fallidos
        return error("Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.", 429)
    d = cuerpo_json()
    nombre = str(d.get("usuario", "")).strip().lower()[:30] or "admin"
    clave = str(d.get("clave", ""))[:200]
    r = db.execute("SELECT * FROM usuarios WHERE usuario=?", (nombre,)).fetchone()
    if not r or not clave or not check_password_hash(r["hash"], clave):
        fallos.append(time.time())
        return error("Usuario o contraseña incorrectos.", 401)
    if not r["activo"]:
        return error("Este usuario está desactivado. Habla con el administrador.", 403)
    session.clear()
    session.permanent = True
    session["uid"], session["ver"] = r["id"], r["version"]
    db.execute("UPDATE usuarios SET ultimo_acceso=? WHERE id=?", (ahora(), r["id"]))
    g.pop("usuario", None)
    registrar("Entró al panel")
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/logout")
def admin_logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/admin/cuenta/clave")
@requiere()
def admin_mi_clave():
    """Cambiar mi propia contraseña: {actual, nueva}."""
    d = cuerpo_json()
    db, u = get_db(), usuario_actual()
    r = db.execute("SELECT * FROM usuarios WHERE id=?", (u["id"],)).fetchone()
    if not check_password_hash(r["hash"], str(d.get("actual", ""))[:200]):
        return error("La contraseña actual no es correcta.")
    nueva = str(d.get("nueva", ""))[:200]
    if len(nueva) < 8:
        return error("La contraseña nueva debe tener al menos 8 caracteres.")
    if check_password_hash(r["hash"], nueva):
        return error("La contraseña nueva debe ser distinta de la actual.")
    db.execute("UPDATE usuarios SET hash=?, version=version+1, cambiar_clave=0 WHERE id=?", (generate_password_hash(nueva), u["id"]))
    session["ver"] = r["version"] + 1
    registrar("Cambió su contraseña")
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/cuenta/nombre")
@requiere()
def admin_mi_nombre():
    """Cambiar el nombre que se muestra y, si viene, el correo para avisos: {nombre, correo?}."""
    d = cuerpo_json()
    nombre = str(d.get("nombre", "")).strip()[:60]
    if len(nombre) < 2:
        return error("Escribe tu nombre.")
    db, u = get_db(), usuario_actual()
    db.execute("UPDATE usuarios SET nombre=? WHERE id=?", (nombre, u["id"]))
    if "correo" in d:
        correo = str(d.get("correo") or "").strip().lower()[:120]
        if correo and not avisos.valido(correo):
            return error("El correo no es válido.")
        db.execute("UPDATE usuarios SET correo=? WHERE id=?", (correo or None, u["id"]))
    registrar("Actualizó sus datos", None, nombre)
    db.commit()
    return jsonify({"ok": True})


def _usuario_publico(r: sqlite3.Row) -> dict:
    return {"id": r["id"], "usuario": r["usuario"], "nombre": r["nombre"], "permisos": _permisos(r["permisos"]),
            "activo": bool(r["activo"]), "creado": r["creado"], "ultimo_acceso": r["ultimo_acceso"],
            "cambiar_clave": bool(r["cambiar_clave"]), "correo": r["correo"] or ""}


@app.get("/api/admin/usuarios")
@requiere("usuarios")
def admin_usuarios():
    db = get_db()
    lista = [_usuario_publico(r) for r in db.execute("SELECT * FROM usuarios ORDER BY activo DESC, usuario")]
    actividad = [dict(r) for r in db.execute("SELECT * FROM actividad ORDER BY id DESC LIMIT 100")]
    return jsonify({"ok": True, "usuarios": lista, "actividad": actividad, "permisos": PERMISOS})


@app.post("/api/admin/usuarios/guardar")
@requiere("usuarios")
def admin_usuario_guardar():
    """Crear o editar un usuario: {id?, usuario, nombre, permisos:[…], activo, clave?}."""
    d = cuerpo_json()
    db, yo = get_db(), usuario_actual()
    nombre = str(d.get("nombre", "")).strip()[:60]
    permisos = [x for x in (d.get("permisos") or []) if x in PERMISOS] if isinstance(d.get("permisos"), list) else []
    activo = 1 if d.get("activo", True) else 0
    clave = str(d.get("clave", "") or "")[:200]
    correo = str(d.get("correo", "") or "").strip().lower()[:120]
    if len(nombre) < 2:
        return error("Escribe el nombre de la persona.")
    if correo and not avisos.valido(correo):
        return error("El correo no es válido.")
    if clave and len(clave) < 8:
        return error("La contraseña debe tener al menos 8 caracteres.")
    uid = d.get("id")
    if uid:
        r = db.execute("SELECT * FROM usuarios WHERE id=?", (numero(uid),)).fetchone()
        if not r:
            return error("Ese usuario no existe.", 404)
        if r["id"] == yo["id"] and (not activo or "usuarios" not in permisos):
            return error("No puedes quitarte a ti mismo el acceso ni el permiso de administrar usuarios.")
        otros_admin = db.execute("SELECT COUNT(*) FROM usuarios WHERE activo=1 AND id<>? AND permisos LIKE '%\"usuarios\"%'",
                                 (r["id"],)).fetchone()[0]
        if (not activo or "usuarios" not in permisos) and not otros_admin:
            return error("Debe quedar al menos un usuario activo que pueda administrar usuarios.")
        nuevo_usuario = str(d.get("usuario", r["usuario"]) or r["usuario"]).strip().lower()
        if nuevo_usuario != r["usuario"]:
            if r["usuario"] == "admin":
                return error("El usuario «admin» no se puede renombrar (es la llave de emergencia de `tramita clave`).")
            if not RE_USUARIO.match(nuevo_usuario) or nuevo_usuario == "admin":
                return error("El usuario debe tener de 3 a 30 letras minúsculas, números, punto, guion o guion bajo (sin espacios).")
            if db.execute("SELECT 1 FROM usuarios WHERE usuario=? AND id<>?", (nuevo_usuario, r["id"])).fetchone():
                return error("Ya existe un usuario con ese nombre.")
        cambia_clave = bool(clave)
        propio = r["id"] == yo["id"]
        campos = ["usuario=?", "nombre=?", "permisos=?", "activo=?", "correo=?"]
        valores = [nuevo_usuario, nombre, json.dumps(permisos), activo, correo or None]
        if cambia_clave:
            campos += ["hash=?", "cambiar_clave=?"]
            valores += [generate_password_hash(clave), 0 if propio else 1]
        if cambia_clave or not activo or nuevo_usuario != r["usuario"] or permisos != _permisos(r["permisos"]):
            campos.append("version=version+1")  # cierra sus sesiones abiertas para que entre con lo nuevo
        db.execute(f"UPDATE usuarios SET {', '.join(campos)} WHERE id=?", (*valores, r["id"]))
        if propio:
            session["ver"] = db.execute("SELECT version FROM usuarios WHERE id=?", (r["id"],)).fetchone()[0]
        cambios = [f"permisos: {', '.join(permisos) or 'ninguno'}"]
        if nuevo_usuario != r["usuario"]:
            cambios.append(f"usuario: {r['usuario']} → {nuevo_usuario}")
        if r["nombre"] != nombre:
            cambios.append(f"nombre: {r['nombre']} → {nombre}")
        if (r["correo"] or "") != correo:
            cambios.append(f"correo: {correo or 'sin correo'}")
        if not activo:
            cambios.append("desactivado")
        elif not r["activo"]:
            cambios.append("reactivado")
        if cambia_clave:
            cambios.append("contraseña nueva (deberá cambiarla al entrar)" if not propio else "contraseña nueva")
        registrar(f"Editó el usuario {r['usuario']}", None, "; ".join(cambios))
    else:
        usuario = str(d.get("usuario", "")).strip().lower()
        if not RE_USUARIO.match(usuario):
            return error("El usuario debe tener de 3 a 30 letras minúsculas, números, punto, guion o guion bajo (sin espacios).")
        if db.execute("SELECT 1 FROM usuarios WHERE usuario=?", (usuario,)).fetchone():
            return error("Ya existe un usuario con ese nombre.")
        if len(clave) < 8:
            return error("Ponle una contraseña de al menos 8 caracteres.")
        ultimo = db.execute("SELECT COALESCE(MAX(id), 0) FROM avisos").fetchone()[0]  # empieza sin avisos viejos pendientes
        db.execute("INSERT INTO usuarios (usuario, nombre, hash, permisos, activo, creado, cambiar_clave, correo, avisos_visto)"
                   " VALUES (?,?,?,?,?,?,1,?,?)",
                   (usuario, nombre, generate_password_hash(clave), json.dumps(permisos), activo, ahora(), correo or None, ultimo))
        registrar(f"Creó el usuario {usuario}", None, f"permisos: {', '.join(permisos) or 'ninguno'}")
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/cliente")
@requiere("expedientes")
def admin_cliente():
    """Corrige los datos del cliente: {codigo, nombre, contacto, pais, pais_detalle?}."""
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    if not codigo:
        return error("No existe ese código.", 404)
    nombre = str(d.get("nombre", "")).strip()[:80]
    contacto = str(d.get("contacto", "")).strip()[:120]
    pais = str(d.get("pais", "")).strip()
    pais_detalle = "".join(ch for ch in str(d.get("pais_detalle", "")).upper() if ch.isalpha())[:2]
    if len(nombre) < 2:
        return error("Escribe el nombre del cliente.")
    if pais not in calculos.PAISES_VALIDOS:
        return error("Elige el país.")
    db = get_db()
    antes = db.execute("SELECT nombre, contacto, pais FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
    if antes:
        db.execute("UPDATE solicitudes SET nombre=?, contacto=?, pais=?, pais_detalle=? WHERE codigo=?",
                   (nombre, contacto, pais, pais_detalle, codigo))
    else:  # expediente viejo creado solo con el rastreo
        s = db.execute("SELECT * FROM seguimiento WHERE codigo=?", (codigo,)).fetchone()
        db.execute("INSERT INTO solicitudes (codigo, nombre, pais, servicio, contacto, mensaje, moneda, total_estimado, creado,"
                   " idioma, pais_detalle, origen, origen_detalle, pagina, dispositivo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                   (codigo, nombre, pais, "", contacto, "", "DOP", None, s["actualizado"], "es", pais_detalle, "", "", "", ""))
    db.execute("UPDATE seguimiento SET cliente=? WHERE codigo=?", (calculos.nombre_publico(nombre), codigo))
    cambios = []
    if antes:
        for campo, nuevo in (("nombre", nombre), ("contacto", contacto), ("pais", pais)):
            if (antes[campo] or "") != nuevo:
                cambios.append(f"{campo}: «{antes[campo] or '—'}» → «{nuevo or '—'}»")
    registrar("Editó los datos del cliente", codigo, "; ".join(cambios) or "sin cambios")
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.get("/api/admin/expedientes")
@requiere_admin
def admin_expedientes():
    db = get_db()
    purgar_zafacon(db)
    rows = db.execute(CONSULTA_EXPEDIENTES + " WHERE s.eliminado IS NULL ORDER BY s.actualizado DESC LIMIT 1000").fetchall()
    lista = [expediente(db, r) for r in rows]
    conteo = {str(p): sum(1 for e in lista if e["paso"] == p) for p in PASOS}
    return jsonify({"ok": True, "expedientes": lista, "conteo": conteo, "pasos": PASOS})


@app.post("/api/admin/estado")
@requiere("expedientes")
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
    items = tramites_de(db, codigo) if _codigo_existente({"codigo": codigo}) else []
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
    titulo = next(t["titulo"] for t in items if t["id"] == tid)
    registrar(f"Movió a paso {paso} ({PASOS[paso]})", codigo, f"{titulo}: {detalle}")
    db.commit()
    avisar_cambio_estado(db, codigo, titulo, paso, estado)
    correo = "desactivado"
    if d.get("avisar") is True:  # el aviso por correo es opcional: solo si se pide
        correo = correo_estado(db, codigo, titulo, paso, estado, detalle)
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo), "correo": correo})


def avisar_cambio_estado(db: sqlite3.Connection, codigo: str, titulo: str, paso: int, estado: str) -> None:
    """El administrador principal se entera de quién movió cada expediente (no de sus propios cambios)."""
    yo = usuario_actual()
    sol = db.execute("SELECT nombre FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
    cliente = sol["nombre"] if sol else codigo
    db.execute("INSERT INTO avisos (tipo, titulo, detalle, codigo, creado, usuario) VALUES (?,?,?,?,?,?)",
               ("estado", f"{yo['nombre']} movió un trámite a «{PASOS[paso]}»"[:200], f"{cliente} · {titulo}"[:200], codigo, ahora(), yo["usuario"]))
    db.commit()
    duenos = [r["id"] for r in db.execute("SELECT id, permisos FROM usuarios WHERE activo=1")
              if set(PERMISOS) <= set(_permisos(r["permisos"])) and r["id"] != yo["id"]]
    for uid in duenos:
        notificar_push(db, None, f"{yo['nombre']} movió un trámite a «{PASOS[paso]}»", f"{cliente} · {titulo} · {codigo}",
                       codigo, solo_usuario=uid)


@app.get("/api/admin/registro")
@requiere_admin
def admin_registro():
    """Quién hizo qué, con búsqueda. Solo el administrador principal (el que tiene todos los permisos)."""
    if not es_dueno():
        return error("Solo el administrador principal puede ver el registro completo.", 403)
    db = get_db()
    q = f"%{str(request.args.get('q', '')).strip()[:60]}%"
    usuario = str(request.args.get("usuario", "")).strip()[:30]
    solo_estados = request.args.get("estados") == "1"
    sql = "SELECT id, usuario, accion, codigo, detalle, fecha FROM actividad WHERE (accion LIKE ? OR detalle LIKE ? OR codigo LIKE ?)"
    args: list = [q, q, q]
    if usuario:
        sql += " AND usuario=?"
        args.append(usuario)
    if solo_estados:
        sql += " AND accion LIKE 'Movió a paso%'"
    sql += " ORDER BY id DESC LIMIT 300"
    filas = [dict(r) for r in db.execute(sql, args)]
    quienes = [r[0] for r in db.execute("SELECT DISTINCT usuario FROM actividad ORDER BY usuario")]
    nombres = {r["usuario"]: r["nombre"] for r in db.execute("SELECT usuario, nombre FROM usuarios")}
    return jsonify({"ok": True, "registro": filas, "usuarios": quienes, "nombres": nombres,
                    "total": db.execute("SELECT COUNT(*) FROM actividad").fetchone()[0]})


def correo_estado(db: sqlite3.Connection, codigo: str, titulo: str, paso: int, estado: str, detalle: str) -> str:
    """Correo al cliente cuando cambia el estado. Devuelve: enviando | sin_correo | no_configurado."""
    sol = db.execute("SELECT nombre, contacto, idioma FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
    para = avisos.correo_de(sol["contacto"]) if sol else ""
    if not para:
        return "sin_correo"
    if not avisos.configurado():
        return "no_configurado"
    T = avisos.textos(sol["idioma"])
    archivos = archivos_de(db, codigo) if paso == 4 else []
    if paso == 4:
        parrafos = [T["listo"] if archivos else T["listo_sin"]]
    else:
        parrafos = [T["intro"]]
    texto, html_ = avisos.plantilla(
        T["listo_t"] if paso == 4 else T["titulo"], T["hola"].format(nombre=sol["nombre"].split()[0]), parrafos,
        datos=[(T["tramite"], titulo), (T["codigo"], codigo), (T["estado"], f"{estado} · {T['paso'].format(n=paso)}"), (T["mensaje"], detalle)],
        enlaces=[(a["nombre"], enlace_descarga(a["id"])) for a in archivos],
        boton=(T["boton"], f"{avisos.sitio()}/rastreo?c={codigo}"),
        pie=(T["vence"] + " " if archivos else "") + T["pie"])
    asunto = T["asunto"].format(codigo=codigo)
    avisos.enviar([para], asunto, texto, html_, al_terminar=anotar_correo(codigo, [para], asunto, "estado"))
    registrar("Envió un correo al cliente", codigo, f"{asunto} → {para}")
    db.commit()
    return "enviando"


@app.post("/api/admin/avisar")
@requiere("expedientes")
def admin_avisar():
    """Envía al cliente, con un clic, el estado actual de su expediente por correo: {codigo}."""
    codigo = str(cuerpo_json().get("codigo", "")).strip().upper()[:12]
    db = get_db()
    sol = db.execute("SELECT nombre, contacto, idioma FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
    items = tramites_de(db, codigo)
    if not items:
        return error("No existe ese código.", 404)
    para = avisos.correo_de(sol["contacto"]) if sol else ""
    if not para:
        return error("Este cliente no tiene correo. Agrégalo en «Editar datos del cliente» o avísale por WhatsApp.")
    if not avisos.configurado():
        return error("El envío de correos aún no está activado. En el servidor escribe: tramita correo", 503)
    T = avisos.textos(sol["idioma"])
    listo = all(t["paso"] == 4 for t in items)
    archivos = archivos_de(db, codigo) if any(t["paso"] == 4 for t in items) else []
    datos = [(T["codigo"], codigo)]
    for t in items:
        datos += [(T["tramite"], t["titulo"]), (T["estado"], f"{t['estado']} · {T['paso'].format(n=t['paso'])}"), (T["mensaje"], t["detalle"])]
    texto, html_ = avisos.plantilla(
        T["listo_t"] if listo else T["titulo"], T["hola"].format(nombre=sol["nombre"].split()[0]),
        [T["listo"] if archivos else (T["listo_sin"] if listo else T["intro"])], datos=datos,
        enlaces=[(a["nombre"], enlace_descarga(a["id"])) for a in archivos],
        boton=(T["boton"], f"{avisos.sitio()}/rastreo?c={codigo}"), pie=(T["vence"] + " " if archivos else "") + T["pie"])
    asunto = T["asunto"].format(codigo=codigo)
    avisos.enviar([para], asunto, texto, html_, al_terminar=anotar_correo(codigo, [para], asunto, "aviso"))
    registrar("Envió un correo al cliente", codigo, f"{asunto} → {para}")
    db.commit()
    return jsonify({"ok": True, "para": para, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/agregar")
@requiere("expedientes")
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
    registrar("Agregó un trámite", codigo, pedido[1])
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


@app.post("/api/admin/quitar")
@requiere("expedientes")
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
    registrar("Quitó un trámite", codigo, next(t["titulo"] for t in items if t["id"] == tid))
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/nuevo")
@requiere("expedientes")
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
    registrar("Creó el expediente", codigo, f"{nombre}: " + ", ".join(p[1] for p in pedidos))
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


def _codigo_existente(d: dict) -> str | None:
    codigo = str(d.get("codigo", "")).strip().upper()[:12]
    return codigo if get_db().execute("SELECT 1 FROM seguimiento WHERE codigo=? AND eliminado IS NULL", (codigo,)).fetchone() else None


def _fecha_dia(valor) -> str:
    """'2026-10-29' (si no viene o es inválida, hoy)."""
    try:
        return datetime.strptime(str(valor)[:10], "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return datetime.now(timezone(timedelta(hours=-4))).strftime("%Y-%m-%d")  # hoy en República Dominicana


TIPOS_PAGO = {"anticipo": "Anticipo 50%", "saldo": "Saldo 50%", "otro": "Otro pago"}


@app.post("/api/admin/pago")
@requiere("pagos")
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
    db, yo = get_db(), usuario_actual()
    # lo que registra administración o contabilidad ya queda confirmado; lo demás espera su confirmación
    estado = "confirmado" if puede_validar() else "pendiente"
    metodo = str(d.get("metodo", "")).strip()[:40]
    db.execute("INSERT INTO pagos (codigo, tipo, monto, metodo, fecha, nota, creado, estado, registrado_por, validado_por, validado_en, via_whatsapp)"
               " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
               (codigo, tipo, round(monto, 2), metodo, _fecha_dia(d.get("fecha")), str(d.get("nota", "")).strip()[:200], ahora(),
                estado, yo["usuario"], yo["usuario"] if estado == "confirmado" else None, ahora() if estado == "confirmado" else None,
                1 if d.get("whatsapp") else 0))
    pid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    comp = db.execute("SELECT id FROM comprobantes WHERE id=? AND codigo=? AND estado='nuevo'", (numero(d.get("comprobante_id")), codigo)).fetchone() \
        if d.get("comprobante_id") else None
    if comp:
        db.execute("UPDATE pagos SET comprobante_id=? WHERE id=?", (comp["id"], pid))
        db.execute("UPDATE comprobantes SET estado='usado', pago_id=?, revisado_por=?, revisado_en=? WHERE id=?", (pid, yo["usuario"], ahora(), comp["id"]))
    registrar("Registró un pago" + (" (por confirmar)" if estado == "pendiente" else "") + (" con el comprobante del cliente" if comp else ""), codigo,
              f"RD${monto:,.2f} · {TIPOS_PAGO[tipo]} · {metodo}" + (" · llegó por WhatsApp" if d.get("whatsapp") else ""))
    db.commit()
    if estado == "pendiente":
        avisar_pago_por_confirmar(db, codigo, monto, metodo, yo["nombre"])
    return jsonify({"ok": True, "estado": estado, "expediente": un_expediente(db, codigo)}), 201


def correos_validadores(db: sqlite3.Connection) -> list[str]:
    lista = [r["correo"] for r in db.execute("SELECT correo, permisos FROM usuarios WHERE activo=1 AND correo IS NOT NULL AND correo<>''")
             if {"validar_pagos", "usuarios"} & set(_permisos(r["permisos"]))]
    if os.environ.get("NOTIFY_TO"):
        lista.append(os.environ["NOTIFY_TO"])
    return [c for c in lista if avisos.valido(c)]


def avisar_pago_por_confirmar(db: sqlite3.Connection, codigo: str, monto: float, metodo: str, quien: str) -> None:
    """Aviso en la campana (solo para quien confirma pagos) y correo a administración y contabilidad."""
    sol = db.execute("SELECT nombre FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
    nombre = sol["nombre"] if sol else codigo
    titulo = f"Pago por confirmar: RD${monto:,.2f}"
    db.execute("INSERT INTO avisos (tipo, titulo, detalle, codigo, creado, usuario) VALUES (?,?,?,?,?,?)",
               ("pago", titulo, f"{nombre} · {metodo or 'sin método'} · registró {quien}"[:200], codigo, ahora(), usuario_actual()["usuario"] if usuario_actual() else None))
    db.commit()
    notificar_push(db, lambda perms: bool({"validar_pagos", "usuarios"} & perms), titulo, f"{nombre} · {codigo} · registró {quien}", codigo)
    para = correos_validadores(db)
    if not para or not avisos.configurado():
        return
    texto, html_ = avisos.plantilla(titulo, "Hola:", ["Un gestor registró un pago que necesita tu confirmación. Revisa que el dinero llegó antes de confirmarlo."],
                                    datos=[("Código", codigo), ("Cliente", nombre), ("Monto", f"RD${monto:,.2f}"), ("Método", metodo or "—"), ("Registró", quien)],
                                    boton=("Revisar en el panel", f"{avisos.sitio()}/admin"),
                                    pie="Aviso interno: lo reciben administración y contabilidad.")
    avisos.enviar(para, f"{titulo} · {codigo}", texto, html_, al_terminar=anotar_correo(codigo, para, titulo, "equipo"))


@app.post("/api/admin/pago/validar")
@requiere("pagos")
def admin_pago_validar():
    """Administración o contabilidad confirma o rechaza un pago: {codigo, id, accion: confirmar|rechazar, motivo?}."""
    if not puede_validar():
        return error("Solo administración o contabilidad pueden confirmar pagos.", 403)
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    db = get_db()
    fila = db.execute("SELECT * FROM pagos WHERE id=? AND codigo=?", (numero(d.get("id")), codigo)).fetchone() if codigo else None
    if not fila:
        return error("Ese pago no existe.", 404)
    accion = str(d.get("accion", ""))
    motivo = str(d.get("motivo", "") or "").strip()[:200]
    if accion not in ("confirmar", "rechazar"):
        return error("Elige confirmar o rechazar.")
    if accion == "rechazar" and len(motivo) < 3:
        return error("Escribe por qué se rechaza (por ejemplo: no llegó la transferencia).")
    estado = "confirmado" if accion == "confirmar" else "rechazado"
    avisar = 0 if d.get("avisar") is False else 1
    db.execute("UPDATE pagos SET estado=?, validado_por=?, validado_en=?, motivo=?, avisar_cliente=? WHERE id=?",
               (estado, usuario_actual()["usuario"], ahora(), motivo or None, avisar, fila["id"]))
    registrar("Confirmó un pago" if estado == "confirmado" else "Rechazó un pago", codigo,
              f"RD${fila['monto']:,.2f} · {TIPOS_PAGO.get(fila['tipo'], fila['tipo'])}" + (f" · {motivo}" if motivo else "")
              + ("" if avisar or estado == "confirmado" else " (sin avisar al cliente)"))
    db.commit()
    return jsonify({"ok": True, "estado": estado, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/pago/quitar")
@requiere("pagos")
def admin_pago_quitar():
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    db = get_db()
    fila = db.execute("SELECT monto, tipo, estado, registrado_por FROM pagos WHERE id=? AND codigo=?",
                      (numero(d.get("id")), codigo)).fetchone() if codigo else None
    if not fila:
        return error("Ese pago no existe.", 404)
    if not puede_validar() and not (fila["estado"] == "pendiente" and fila["registrado_por"] == usuario_actual()["usuario"]):
        return error("Solo administración o contabilidad pueden borrar un pago ya confirmado.", 403)
    db.execute("DELETE FROM pagos WHERE id=? AND codigo=?", (numero(d.get("id")), codigo))
    registrar("Borró un pago", codigo, f"RD${fila['monto']:,.2f} · {TIPOS_PAGO.get(fila['tipo'], fila['tipo'])}")
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/nota")
@requiere("expedientes")
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
    registrar("Agregó una nota", codigo, texto[:120])
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


@app.post("/api/admin/nota/quitar")
@requiere("expedientes")
def admin_nota_quitar():
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    db = get_db()
    if not codigo or not db.execute("DELETE FROM notas WHERE id=? AND codigo=?", (numero(d.get("id")), codigo)).rowcount:
        return error("Esa nota no existe.", 404)
    registrar("Borró una nota", codigo)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/docs")
@requiere("expedientes")
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
    registrar("Actualizó documentos recibidos", codigo, f"{len(docs)} recibidos")
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/archivo")
@requiere_admin
def admin_archivo():
    """Sube documentos: clase «entrega» (para el cliente) o «recibido» (lo que mandó el cliente). Formulario: codigo, clase, archivo."""
    clase = str(request.form.get("clase", "entrega"))
    if clase not in CLASES_ARCHIVO:
        return error("Clase de documento no válida.")
    if clase == "entrega" and not puede("expedientes"):
        return error("Tu usuario no tiene permiso para esto. Pídeselo al administrador.", 403)
    if clase == "recibido" and not (puede("expedientes") or puede("pagos")):
        return error("Tu usuario no tiene permiso para esto. Pídeselo al administrador.", 403)
    codigo = str(request.form.get("codigo", "")).strip().upper()[:12]
    db = get_db()
    if not db.execute("SELECT 1 FROM seguimiento WHERE codigo=? AND eliminado IS NULL", (codigo,)).fetchone():
        return error("No existe ese código.", 404)
    subidos = request.files.getlist("archivo")
    if not subidos:
        return error("Elige al menos un archivo.")
    if len(archivos_de(db, codigo, clase)) + len(subidos) > MAX_ARCHIVOS_CODIGO:
        return error(f"Un expediente puede tener hasta {MAX_ARCHIVOS_CODIGO} documentos.")
    carpeta = carpeta_archivos() / codigo
    carpeta.mkdir(parents=True, exist_ok=True)
    nombres = []
    for f in subidos:
        nombre = re.sub(r"[^\w.\- ()áéíóúñÁÉÍÓÚÑ]", "_", Path(f.filename or "documento").name)[:100] or "documento"
        ext = Path(nombre).suffix.lower()
        if ext not in TIPOS_ARCHIVO:
            return error(f"«{nombre}»: solo se aceptan PDF, JPG, PNG o WEBP.")
        datos = f.read(MAX_ARCHIVO + 1)
        if len(datos) > MAX_ARCHIVO:
            return error(f"«{nombre}» pesa más de 10 MB.")
        if not _es_tipo_real(datos[:16], ext):
            return error(f"«{nombre}» no parece un {ext[1:].upper()} válido.")
        guardado = f"{secrets.token_hex(12)}{ext}"
        (carpeta / guardado).write_bytes(datos)
        db.execute("INSERT INTO archivos (codigo, nombre, archivo, tipo, tamano, creado, usuario, clase, estado) VALUES (?,?,?,?,?,?,?,?,?)",
                   (codigo, nombre, f"{codigo}/{guardado}", TIPOS_ARCHIVO[ext], len(datos), ahora(), usuario_actual()["usuario"],
                    clase, "nuevo" if clase == "recibido" else ""))
        nombres.append(nombre)
    yo = usuario_actual()
    registrar("Subió documentos para entregar" if clase == "entrega" else "Subió documentos recibidos del cliente", codigo, ", ".join(nombres))
    db.commit()
    if clase == "recibido":
        sol = db.execute("SELECT nombre FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
        cliente = sol["nombre"] if sol else codigo
        titulo = f"Documento recibido: {nombres[0]}" + (f" y {len(nombres) - 1} más" if len(nombres) > 1 else "")
        db.execute("INSERT INTO avisos (tipo, titulo, detalle, codigo, creado, usuario) VALUES (?,?,?,?,?,?)",
                   ("recibido", titulo[:200], f"{cliente} · lo subió {yo['nombre']}"[:200], codigo, ahora(), yo["usuario"]))
        db.commit()
        avisar_equipo_correo(db, lambda perms: bool({"pagos", "validar_pagos", "usuarios"} & perms), titulo,
                             f"{cliente} · {codigo} · lo subió {yo['nombre']}", codigo,
                             ["Un documento del cliente está en el expediente, listo para revisar o validar."], excluir=yo["id"])
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)}), 201


def avisar_equipo_correo(db: sqlite3.Connection, a_quien, titulo: str, cuerpo: str, codigo: str | None,
                         parrafos: list[str], excluir: int | None = None) -> None:
    """Notificación al teléfono + correo a los usuarios del equipo que cumplen a_quien(permisos)."""
    notificar_push(db, a_quien, titulo, cuerpo, codigo, excluir=excluir)
    para = [r["correo"] for r in db.execute("SELECT id, correo, permisos FROM usuarios WHERE activo=1 AND correo IS NOT NULL AND correo<>''")
            if r["id"] != excluir and a_quien(set(_permisos(r["permisos"]))) and avisos.valido(r["correo"])]
    if not para or not avisos.configurado():
        return
    texto, html_ = avisos.plantilla(titulo, "Hola:", parrafos,
                                    datos=[("Código", codigo or "—"), ("Detalle", cuerpo)],
                                    boton=("Abrir el panel", f"{avisos.sitio()}/admin"),
                                    pie="Aviso interno del panel de TramitaFácil RD.")
    avisos.enviar(para, f"{titulo}" + (f" · {codigo}" if codigo else ""), texto, html_,
                  al_terminar=anotar_correo(codigo, para, titulo, "equipo"))


@app.post("/api/admin/archivo/quitar")
@requiere_admin
def admin_archivo_quitar():
    d = cuerpo_json()
    codigo = str(d.get("codigo", "")).strip().upper()[:12]
    db = get_db()
    r = db.execute("SELECT * FROM archivos WHERE id=? AND codigo=?", (numero(d.get("id")), codigo)).fetchone()
    if not r:
        return error("Ese documento no existe.", 404)
    if r["clase"] == "entrega" and not puede("expedientes"):
        return error("Tu usuario no tiene permiso para esto. Pídeselo al administrador.", 403)
    if r["clase"] == "recibido" and not (puede("expedientes") or puede("pagos")):
        return error("Tu usuario no tiene permiso para esto. Pídeselo al administrador.", 403)
    (carpeta_archivos() / r["archivo"]).unlink(missing_ok=True)
    db.execute("DELETE FROM archivos WHERE id=?", (r["id"],))
    registrar("Quitó un documento" + (" recibido" if r["clase"] == "recibido" else " para entregar"), codigo, r["nombre"])
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.get("/api/admin/archivo/<int:aid>")
@requiere_admin
def admin_archivo_ver(aid: int):
    r = get_db().execute("SELECT * FROM archivos WHERE id=?", (aid,)).fetchone()
    ruta = carpeta_archivos() / r["archivo"] if r else None
    if not r or not ruta.is_file():
        return error("Ese documento no existe.", 404)
    return send_file(ruta, mimetype=r["tipo"], download_name=r["nombre"])


@app.post("/api/admin/archivo/validar")
@requiere_admin
def admin_archivo_validar():
    """Valida o rechaza un documento recibido del cliente: {codigo, id, accion: validar|rechazar, motivo?}."""
    if not puede_validar():
        return error("Solo administración o contabilidad pueden validar documentos.", 403)
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    db = get_db()
    r = db.execute("SELECT * FROM archivos WHERE id=? AND codigo=? AND clase='recibido'", (numero(d.get("id")), codigo)).fetchone() if codigo else None
    if not r:
        return error("Ese documento no existe.", 404)
    accion = str(d.get("accion", ""))
    motivo = str(d.get("motivo", "") or "").strip()[:200]
    if accion not in ("validar", "rechazar"):
        return error("Elige validar o rechazar.")
    if accion == "rechazar" and len(motivo) < 3:
        return error("Escribe por qué se rechaza (por ejemplo: ilegible o no corresponde).")
    estado = "validado" if accion == "validar" else "rechazado"
    yo = usuario_actual()
    db.execute("UPDATE archivos SET estado=?, revisado_por=?, motivo=? WHERE id=?", (estado, yo["usuario"], motivo or None, r["id"]))
    registrar("Validó un documento recibido" if estado == "validado" else "Rechazó un documento recibido", codigo,
              r["nombre"] + (f" · {motivo}" if motivo else ""))
    db.commit()
    # al gestor que lo subió le interesa saberlo
    quien = db.execute("SELECT id FROM usuarios WHERE usuario=? AND activo=1", (r["usuario"],)).fetchone()
    if quien and quien["id"] != yo["id"]:
        notificar_push(db, None, f"Documento {estado}: {r['nombre']}"[:120],
                       f"{codigo} · {yo['nombre']}" + (f": {motivo}" if motivo else ""), codigo, solo_usuario=quien["id"])
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.post("/api/admin/avisar-equipo")
@requiere_admin
def admin_avisar_equipo():
    """Aviso de un miembro del equipo al equipo: {codigo, texto, para: todos|confirman}."""
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    if not codigo:
        return error("No existe ese código.", 404)
    texto = str(d.get("texto", "") or "").strip()[:200]
    if len(texto) < 3:
        return error("Escribe el aviso para el equipo.")
    yo = usuario_actual()
    db = get_db()
    solo_confirman = str(d.get("para", "confirman")) == "confirman"
    a_quien = (lambda perms: bool({"validar_pagos", "usuarios"} & perms)) if solo_confirman \
        else (lambda perms: bool({"expedientes", "pagos", "validar_pagos", "usuarios"} & perms))
    sol = db.execute("SELECT nombre FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
    cliente = sol["nombre"] if sol else codigo
    titulo = f"Aviso de {yo['nombre']}: {texto}"[:120]
    db.execute("INSERT INTO avisos (tipo, titulo, detalle, codigo, creado, usuario) VALUES (?,?,?,?,?,?)",
               ("equipo" if not solo_confirman else "recibido", titulo[:200], f"{cliente} · {codigo}"[:200], codigo, ahora(), yo["usuario"]))
    registrar("Avisó al equipo", codigo, texto)
    db.commit()
    avisar_equipo_correo(db, a_quien, titulo, f"{cliente} · {codigo}", codigo,
                         [f"{yo['nombre']} dejó este aviso sobre el expediente {codigo}:", texto], excluir=yo["id"])
    return jsonify({"ok": True})


@app.post("/api/admin/archivo/enviar")
@requiere("expedientes")
def admin_archivo_enviar():
    """Envía al correo del cliente sus documentos (adjuntos si caben, y siempre los enlaces)."""
    codigo = str(cuerpo_json().get("codigo", "")).strip().upper()[:12]
    db = get_db()
    sol = db.execute("SELECT nombre, contacto, idioma FROM solicitudes WHERE codigo=?", (codigo,)).fetchone()
    archivos = archivos_de(db, codigo)
    if not archivos:
        return error("Primero sube los documentos.")
    para = avisos.correo_de(sol["contacto"]) if sol else ""
    if not para:
        return error("Este cliente no tiene correo. Agrégalo en «Editar datos del cliente» o envíalos por WhatsApp.")
    if not avisos.configurado():
        return error("El envío de correos aún no está activado. En el servidor escribe: tramita correo", 503)
    T = avisos.textos(sol["idioma"])
    texto, html_ = avisos.plantilla(T["docs_t"], T["hola"].format(nombre=sol["nombre"].split()[0]), [T["docs"]],
                                    datos=[(T["codigo"], codigo)],
                                    enlaces=[(a["nombre"], enlace_descarga(a["id"])) for a in archivos],
                                    boton=(T["boton"], f"{avisos.sitio()}/rastreo?c={codigo}"), pie=T["vence"] + " " + T["pie"])
    asunto = T["docs_asunto"].format(codigo=codigo)
    avisos.enviar([para], asunto, texto, html_, adjuntos=[(a["nombre"], carpeta_archivos() / a["archivo"]) for a in archivos],
                  al_terminar=anotar_correo(codigo, [para], asunto, "documentos"))
    registrar("Envió los documentos por correo", codigo, para)
    db.commit()
    return jsonify({"ok": True, "para": para, "expediente": un_expediente(db, codigo)})


# ---------------------------------------------------------------- zafacón (solo administradores)
DIAS_ZAFACON = 7
TABLAS_CLIENTE = ("tramites", "pagos", "notas", "archivos", "comprobantes", "correos", "avisos", "solicitudes", "seguimiento")


def _digitos_tel(contacto: str | None) -> set[str]:
    return {re.sub(r"\D", "", x)[-8:] for x in str(contacto or "").split("·") if "@" not in x and len(re.sub(r"\D", "", x)) >= 7}


def purgar_zafacon(db: sqlite3.Connection) -> int:
    """Borra por completo (con sus documentos) lo que lleva más de 7 días en el zafacón."""
    limite = (datetime.now(timezone.utc) - timedelta(days=DIAS_ZAFACON)).isoformat(timespec="seconds")
    viejos = [r[0] for r in db.execute("SELECT codigo FROM seguimiento WHERE eliminado IS NOT NULL AND eliminado < ?", (limite,))]
    for codigo in viejos:
        for a in db.execute("SELECT archivo FROM archivos WHERE codigo=? UNION ALL SELECT archivo FROM comprobantes WHERE codigo=?", (codigo, codigo)).fetchall():
            (carpeta_archivos() / a[0]).unlink(missing_ok=True)
        try:
            (carpeta_archivos() / codigo).rmdir()
        except OSError:
            pass
        for tabla in TABLAS_CLIENTE:
            db.execute(f"DELETE FROM {tabla} WHERE codigo=?", (codigo,))
        db.execute("DELETE FROM actividad WHERE codigo=?", (codigo,))  # el historial tenía datos personales
        db.execute("INSERT INTO actividad (usuario, accion, codigo, detalle, fecha) VALUES (?,?,?,?,?)",
                   ("sistema", "Borró definitivamente un cliente del zafacón", None, f"{codigo} (pasaron {DIAS_ZAFACON} días)", ahora()))
    if viejos:
        db.commit()
    return len(viejos)


@app.post("/api/admin/eliminar")
@requiere("usuarios")
def admin_eliminar():
    """Mueve un cliente al zafacón: {codigo, motivo?}. Se puede reactivar durante 7 días."""
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    if not codigo:
        return error("No existe ese código.", 404)
    motivo = str(d.get("motivo", "") or "").strip()[:200]
    db = get_db()
    db.execute("UPDATE seguimiento SET eliminado=?, eliminado_por=?, eliminado_motivo=? WHERE codigo=?",
               (ahora(), usuario_actual()["usuario"], motivo or None, codigo))
    registrar("Movió el cliente al zafacón", codigo, motivo or f"se borrará en {DIAS_ZAFACON} días si no se reactiva")
    db.commit()
    return jsonify({"ok": True, "dias": DIAS_ZAFACON})


@app.get("/api/admin/zafacon")
@requiere("usuarios")
def admin_zafacon():
    db = get_db()
    purgar_zafacon(db)
    filas = db.execute("SELECT codigo FROM seguimiento WHERE eliminado IS NOT NULL ORDER BY eliminado DESC").fetchall()
    activos = db.execute("SELECT o.contacto, o.creado FROM solicitudes o JOIN seguimiento s ON s.codigo = o.codigo WHERE s.eliminado IS NULL").fetchall()
    lista = []
    for f in filas:
        e = un_expediente(db, f["codigo"])
        s = db.execute("SELECT eliminado, eliminado_por, eliminado_motivo FROM seguimiento WHERE codigo=?", (f["codigo"],)).fetchone()
        vence = datetime.fromisoformat(s["eliminado"]) + timedelta(days=DIAS_ZAFACON)
        quedan = max(0, (vence - datetime.now(timezone.utc)).total_seconds())
        # ¿volvió a aparecer? otra solicitud activa, después de eliminarlo, con el mismo correo o el mismo WhatsApp
        correo, tels = avisos.correo_de(e.get("contacto")), _digitos_tel(e.get("contacto"))
        volvio = any((o["creado"] or "") >= s["eliminado"] and ((correo and avisos.correo_de(o["contacto"]) == correo) or (tels & _digitos_tel(o["contacto"])))
                     for o in activos)
        lista.append({"codigo": e["codigo"], "nombre": e.get("nombre") or e.get("cliente"), "contacto": e.get("contacto"), "pais": e.get("pais"),
                      "tramites": [t["titulo"] for t in e["tramites"]], "paso": e["paso"], "estado": e["estado"],
                      "eliminado": s["eliminado"], "eliminado_por": s["eliminado_por"], "motivo": s["eliminado_motivo"],
                      "vence": vence.isoformat(timespec="seconds"), "dias_restantes": int(quedan // 86400) + (1 if quedan % 86400 else 0),
                      "volvio": volvio})
    return jsonify({"ok": True, "zafacon": lista, "dias": DIAS_ZAFACON})


@app.post("/api/admin/restaurar")
@requiere("usuarios")
def admin_restaurar():
    """Reactiva un cliente del zafacón tal como estaba: {codigo}."""
    codigo = str(cuerpo_json().get("codigo", "")).strip().upper()[:12]
    db = get_db()
    if not db.execute("SELECT 1 FROM seguimiento WHERE codigo=? AND eliminado IS NOT NULL", (codigo,)).fetchone():
        return error("Ese cliente ya no está en el zafacón.", 404)
    db.execute("UPDATE seguimiento SET eliminado=NULL, eliminado_por=NULL, eliminado_motivo=NULL WHERE codigo=?", (codigo,))
    registrar("Reactivó el cliente desde el zafacón", codigo)
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


@app.get("/api/admin/comprobante/<int:cid>")
@requiere("pagos")
def admin_comprobante_ver(cid: int):
    r = get_db().execute("SELECT * FROM comprobantes WHERE id=?", (cid,)).fetchone()
    ruta = carpeta_archivos() / r["archivo"] if r else None
    if not r or not ruta.is_file():
        return error("Ese comprobante no existe.", 404)
    return send_file(ruta, mimetype=r["tipo"], download_name=r["nombre"])


@app.post("/api/admin/comprobante/descartar")
@requiere("pagos")
def admin_comprobante_descartar():
    """Marca un comprobante como no válido: {codigo, id, motivo} (administración o contabilidad)."""
    if not puede_validar():
        return error("Solo administración o contabilidad pueden descartar un comprobante.", 403)
    d = cuerpo_json()
    codigo = _codigo_existente(d)
    motivo = str(d.get("motivo", "") or "").strip()[:200]
    db = get_db()
    r = db.execute("SELECT * FROM comprobantes WHERE id=? AND codigo=? AND estado='nuevo'", (numero(d.get("id")), codigo)).fetchone() if codigo else None
    if not r:
        return error("Ese comprobante ya fue revisado o no existe.", 404)
    if len(motivo) < 3:
        return error("Escribe por qué se descarta (por ejemplo: comprobante ilegible o de otro cliente).")
    avisar = 0 if d.get("avisar") is False else 1
    db.execute("UPDATE comprobantes SET estado='descartado', revisado_por=?, revisado_en=?, motivo=?, avisar_cliente=? WHERE id=?",
               (usuario_actual()["usuario"], ahora(), motivo, avisar, r["id"]))
    registrar("Descartó un comprobante del cliente", codigo, f"RD${(r['monto'] or 0):,.2f} · {motivo}" + ("" if avisar else " (sin avisar al cliente)"))
    db.commit()
    return jsonify({"ok": True, "expediente": un_expediente(db, codigo)})


# ---------------------------------------------------------------- notificaciones con la app cerrada (Web Push)
def claves_vapid(db: sqlite3.Connection) -> tuple[str, str] | None:
    if not push.DISPONIBLE:
        return None
    filas = dict(db.execute("SELECT clave, valor FROM ajustes WHERE clave IN ('vapid_privada', 'vapid_publica')").fetchall())
    if len(filas) < 2:
        privada, publica = push.nuevas_claves()
        db.execute("INSERT OR REPLACE INTO ajustes (clave, valor) VALUES ('vapid_privada', ?)", (privada,))
        db.execute("INSERT OR REPLACE INTO ajustes (clave, valor) VALUES ('vapid_publica', ?)", (publica,))
        db.commit()
        return privada, publica
    return filas["vapid_privada"], filas["vapid_publica"]


def notificar_push(db: sqlite3.Connection, a_quien, titulo: str, cuerpo: str, codigo: str | None = None,
                   solo_usuario: int | None = None, excluir: int | None = None) -> int:
    """Envía la notificación a los dispositivos de los usuarios activos que cumplen a_quien(permisos)."""
    claves = claves_vapid(db)
    if not claves:
        return 0
    ids = {r["id"] for r in db.execute("SELECT id, permisos FROM usuarios WHERE activo=1")
           if (r["id"] == solo_usuario if solo_usuario else a_quien(set(_permisos(r["permisos"])))) and r["id"] != excluir}
    subs = [dict(r) for r in db.execute("SELECT endpoint, p256dh, auth, usuario_id FROM push_subs").fetchall() if r["usuario_id"] in ids]
    ruta = DB_PATH

    def vencida(endpoint: str) -> None:
        con = sqlite3.connect(ruta)
        try:
            con.execute("DELETE FROM push_subs WHERE endpoint=?", (endpoint,))
            con.commit()
        finally:
            con.close()
    push.enviar(subs, {"titulo": titulo, "cuerpo": cuerpo, "url": "/admin" + (f"?c={codigo}" if codigo else ""), "tag": f"tf-{codigo or 'aviso'}"},
                claves[0], "mailto:" + (os.environ.get("NOTIFY_TO") or "Tramitafacilrd@gmail.com"), vencida)
    return len(subs)


@app.get("/api/admin/push/clave")
@requiere_admin
def admin_push_clave():
    claves = claves_vapid(get_db())
    u = usuario_actual()
    n = get_db().execute("SELECT COUNT(*) FROM push_subs WHERE usuario_id=?", (u["id"],)).fetchone()[0]
    return jsonify({"ok": True, "disponible": bool(claves), "clave": claves[1] if claves else None, "dispositivos": n})


@app.post("/api/admin/push/suscribir")
@requiere_admin
def admin_push_suscribir():
    d = cuerpo_json()
    endpoint = str(d.get("endpoint", ""))[:600]
    llaves = d.get("keys") or {}
    if not endpoint.startswith("https://") or not llaves.get("p256dh") or not llaves.get("auth"):
        return error("Suscripción no válida.")
    db = get_db()
    db.execute("INSERT INTO push_subs (usuario_id, endpoint, p256dh, auth, creado, dispositivo) VALUES (?,?,?,?,?,?)"
               " ON CONFLICT(endpoint) DO UPDATE SET usuario_id=excluded.usuario_id, p256dh=excluded.p256dh, auth=excluded.auth",
               (usuario_actual()["id"], endpoint, str(llaves["p256dh"])[:200], str(llaves["auth"])[:100], ahora(),
                tipo_dispositivo(request.headers.get("User-Agent", ""))))
    registrar("Activó las notificaciones en un dispositivo")
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/push/quitar")
@requiere_admin
def admin_push_quitar():
    db = get_db()
    db.execute("DELETE FROM push_subs WHERE endpoint=? AND usuario_id=?", (str(cuerpo_json().get("endpoint", ""))[:600], usuario_actual()["id"]))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/push/probar")
@requiere_admin
def admin_push_probar():
    u = usuario_actual()
    n = notificar_push(get_db(), None, "Notificaciones activadas", f"Hola, {u['nombre'].split()[0]}: así te avisaremos de solicitudes y pagos.",
                       solo_usuario=u["id"])
    if not n:
        return error("Este usuario todavía no tiene notificaciones activadas en ningún dispositivo.", 404)
    return jsonify({"ok": True, "dispositivos": n})


@app.get("/api/admin/avisos")
@requiere_admin
def admin_avisos():
    """Solicitudes nuevas para la campana del panel. Los usuarios de solo lectura no reciben avisos."""
    tipos = (["solicitud", "equipo"] if puede("expedientes") else []) + (["pago"] if puede_validar() else []) \
        + (["comprobante", "recibido"] if puede("pagos") or puede_validar() else []) + (["estado"] if es_dueno() else [])
    if not tipos:
        return jsonify({"ok": True, "avisos": [], "sin_leer": 0, "ultimo": 0, "solo_lectura": True})
    db = get_db()
    visto = db.execute("SELECT avisos_visto FROM usuarios WHERE id=?", (usuario_actual()["id"],)).fetchone()[0]
    marcas = ",".join("?" * len(tipos))
    mio = usuario_actual()["usuario"]
    lista = [dict(r) | {"nuevo": r["id"] > visto, "propio": r["usuario"] == mio} for r in db.execute(
        f"SELECT a.* FROM avisos a LEFT JOIN seguimiento s ON s.codigo = a.codigo WHERE s.eliminado IS NULL AND a.tipo IN ({marcas})"
        " ORDER BY a.id DESC LIMIT 30", tipos)]
    sin_leer = db.execute(f"SELECT COUNT(*) FROM avisos WHERE id>? AND tipo IN ({marcas})", (visto, *tipos)).fetchone()[0]
    return jsonify({"ok": True, "avisos": lista, "sin_leer": sin_leer, "ultimo": lista[0]["id"] if lista else 0})


@app.post("/api/admin/avisos/visto")
@requiere_admin
def admin_avisos_visto():
    hasta = int(numero(cuerpo_json().get("hasta")) or 0)
    db = get_db()
    db.execute("UPDATE usuarios SET avisos_visto=MAX(avisos_visto, ?) WHERE id=?", (hasta, usuario_actual()["id"]))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- mensajes preestablecidos para el cliente
# servicio_id '' = sirven para todos los trámites. En cada (trámite, paso) el primero (menor «orden») es el de por defecto.
MENSAJES_INICIALES = [
    ("", 1, "Recibimos tu solicitud. Te contactaremos pronto para validar documentos y pago."),
    ("", 2, "Documentos y pago confirmados. Ya estamos preparando tu expediente."),
    ("", 3, "Tu expediente fue depositado en la institución. Te avisaremos de cualquier novedad."),
    ("", 4, "¡Tu trámite está listo! Te contactaremos para coordinar la entrega."),
    ("e_ticket", 1, "Para completar tu E-Ticket necesitamos: foto de la página principal de tu pasaporte y el día y la fecha de tu vuelo."),
    ("e_ticket", 4, "¡Tu E-Ticket está listo! Te enviamos el código QR para que lo presentes en el aeropuerto."),
]


def mensajes_lista(db: sqlite3.Connection) -> list[dict]:
    if not db.execute("SELECT 1 FROM ajustes WHERE clave='mensajes_iniciales'").fetchone():
        ts = ahora()
        for i, (sid, paso, texto) in enumerate(MENSAJES_INICIALES):
            db.execute("INSERT INTO mensajes (servicio_id, paso, texto, orden, actualizado, usuario) VALUES (?,?,?,?,?,?)",
                       (sid, paso, texto, i, ts, "sistema"))
        db.execute("INSERT INTO ajustes (clave, valor) VALUES ('mensajes_iniciales', ?)", (ts,))
        db.commit()
    return [dict(r) for r in db.execute("SELECT id, servicio_id, paso, texto, orden, actualizado, usuario FROM mensajes ORDER BY servicio_id, paso, orden, id")]


@app.get("/api/admin/mensajes")
@requiere_admin
def admin_mensajes():
    return jsonify({"ok": True, "mensajes": mensajes_lista(get_db()), "pasos": PASOS})


@app.post("/api/admin/mensajes/guardar")
@requiere("usuarios")
def admin_mensaje_guardar():
    """Crea o edita un mensaje: {id?, servicio, paso, texto, defecto?}. «defecto» lo pone primero en su lista."""
    d = cuerpo_json()
    db = get_db()
    mensajes_lista(db)
    sid = str(d.get("servicio", "") or "").strip()
    try:
        paso = int(d.get("paso"))
    except (TypeError, ValueError):
        paso = 0
    texto = str(d.get("texto", "") or "").strip()[:500]
    if sid and sid not in catalogo()["servicios"]:
        return error("Elige un trámite válido.")
    if paso not in PASOS:
        return error("Elige un paso del 1 al 4.")
    if len(texto) < 5:
        return error("Escribe el mensaje (mínimo 5 caracteres).")
    minimo = db.execute("SELECT MIN(orden) FROM mensajes WHERE servicio_id=? AND paso=?", (sid, paso)).fetchone()[0]
    maximo = db.execute("SELECT MAX(orden) FROM mensajes WHERE servicio_id=? AND paso=?", (sid, paso)).fetchone()[0]
    nombre_srv = catalogo()["servicios"][sid]["title"] if sid else "todos los trámites"
    if d.get("id"):
        r = db.execute("SELECT * FROM mensajes WHERE id=?", (numero(d.get("id")),)).fetchone()
        if not r:
            return error("Ese mensaje ya no existe.", 404)
        orden = (minimo - 1) if d.get("defecto") and minimo is not None else r["orden"]
        db.execute("UPDATE mensajes SET texto=?, orden=?, actualizado=?, usuario=? WHERE id=?",
                   (texto, orden, ahora(), usuario_actual()["usuario"], r["id"]))
        registrar("Editó un mensaje preestablecido", None, f"{nombre_srv} · paso {paso}" + (" (por defecto)" if d.get("defecto") else ""))
    else:
        orden = ((minimo - 1) if minimo is not None else 0) if d.get("defecto") else ((maximo + 1) if maximo is not None else 0)
        db.execute("INSERT INTO mensajes (servicio_id, paso, texto, orden, actualizado, usuario) VALUES (?,?,?,?,?,?)",
                   (sid, paso, texto, orden, ahora(), usuario_actual()["usuario"]))
        registrar("Agregó un mensaje preestablecido", None, f"{nombre_srv} · paso {paso}")
    db.commit()
    return jsonify({"ok": True, "mensajes": mensajes_lista(db)})


@app.post("/api/admin/mensajes/quitar")
@requiere("usuarios")
def admin_mensaje_quitar():
    db = get_db()
    r = db.execute("SELECT * FROM mensajes WHERE id=?", (numero(cuerpo_json().get("id")),)).fetchone()
    if not r:
        return error("Ese mensaje ya no existe.", 404)
    db.execute("DELETE FROM mensajes WHERE id=?", (r["id"],))
    registrar("Quitó un mensaje preestablecido", None, r["texto"][:80])
    db.commit()
    return jsonify({"ok": True, "mensajes": mensajes_lista(db)})


@app.get("/api/admin/precios")
@requiere("precios")
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
@requiere("precios")
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
    registrar("Cambió un precio", None, f"{base[sid]['title']}: RD${antes['tax'] + antes['fee']:,.0f} → RD${tax + fee:,.0f}")
    db.commit()
    return jsonify({"ok": True, "servicio": {"id": sid, "tax": _entero(tax), "fee": _entero(fee),
                                             "modificado": (tax, fee) != (base[sid]["tax"], base[sid]["fee"])}})


@app.get("/api/admin/respaldo")
@requiere("herramientas")
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
@requiere("herramientas")
def admin_exportar():
    """Excel: una fila por trámite (los trámites del mismo cliente comparten el código)."""
    db = get_db()
    rows = db.execute("""SELECT t.*, o.nombre, o.contacto, o.pais, o.mensaje, o.creado, o.origen, s.cliente
                         FROM tramites t JOIN seguimiento s ON s.codigo = t.codigo
                         LEFT JOIN solicitudes o ON o.codigo = t.codigo
                         WHERE s.eliminado IS NULL
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
            # texto pensado para Google (data/catalogo.json → "seo"); si falta, la descripción del servicio
            desc = " ".join((serv.get("seo") or serv.get("desc", "")).split())[:300]
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
    if nombre == "index":
        # Para Google: nombre del sitio y logo de la empresa (no depende del JavaScript)
        org = {"@context": "https://schema.org", "@graph": [
            {"@type": "WebSite", "name": "TramitaFácil RD", "alternateName": "TramitaFacilRD", "url": sitio + "/"},
            {"@type": "Organization", "name": "TramitaFácil RD", "url": sitio + "/",
             "logo": sitio + "/assets/img/app/icon-512.png", "email": cat["config"].get("email", ""),
             "telephone": "+" + cat["config"].get("whatsapp", ""),
             "sameAs": [f"https://www.instagram.com/{cat['config'].get('instagram', '')}"]}]}
        etiquetas += '\n    <script type="application/ld+json">' + json.dumps(org, ensure_ascii=False).replace("</", "<\\/") + "</script>"
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


@app.get("/.well-known/assetlinks.json")
def assetlinks():
    """Vincula la app de Android (Google Play) con este dominio: la app abre sin barra del navegador."""
    resp = send_from_directory(BASE_DIR / ".well-known", "assetlinks.json", mimetype="application/json")
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp


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
    if nombre == "favicon.ico":  # Google y los navegadores lo buscan en la raíz
        return send_from_directory(BASE_DIR / "assets" / "img", "favicon.ico", max_age=86400)
    abort(404)


@app.before_request
def tamano_maximo():
    grande = request.path == "/api/admin/archivo" or (request.path.startswith("/api/rastreo/") and request.path.endswith("/comprobante"))
    if not grande and (request.content_length or 0) > LIMITE_JSON:
        return error("La solicitud es demasiado grande.", 413)
    return None


# Pausa (mantenimiento): con TF_PAUSA=1 los visitantes ven "Volvemos pronto"; el panel /admin sigue funcionando.
@app.before_request
def pausa():
    if os.environ.get("TF_PAUSA") != "1":
        return None
    ruta = request.path
    if ruta == "/admin" or ruta.startswith(("/api/admin", "/assets/", "/descarga/")) or ruta in ("/robots.txt", "/sw.js"):
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
