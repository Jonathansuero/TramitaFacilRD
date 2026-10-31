"""
push.py — Notificaciones «push» al teléfono o la computadora del equipo, aunque la app esté cerrada.

Usa el estándar Web Push (RFC 8030 / 8291 / 8292): el navegador entrega un «endpoint» y dos claves;
el servidor cifra el mensaje con ellas y lo firma con su clave VAPID. No hace falta ningún servicio pagado.
Las claves VAPID se crean solas la primera vez y se guardan en la base de datos (tabla ajustes).
Requiere el paquete «cryptography» (ya viene en la imagen de Docker).
"""
from __future__ import annotations

import base64
import json
import os
import struct
import threading
import time
import urllib.error
import urllib.request
from typing import Callable
from urllib.parse import urlparse

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    DISPONIBLE = True
except ImportError:  # sin «cryptography» la página funciona igual, solo sin push
    DISPONIBLE = False


def b64u(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode()


def de_b64u(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def _punto(clave_publica) -> bytes:
    return clave_publica.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def nuevas_claves() -> tuple[str, str]:
    """(privada PEM, pública b64url) para VAPID."""
    privada = ec.generate_private_key(ec.SECP256R1())
    pem = privada.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    return pem, b64u(_punto(privada.public_key()))


def _hkdf(salt: bytes, ikm: bytes, info: bytes, largo: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=largo, salt=salt, info=info).derive(ikm)


def cifrar(mensaje: bytes, p256dh: str, auth: str) -> bytes:
    """Cuerpo cifrado «aes128gcm» (RFC 8291) para una suscripción."""
    ua_publica = de_b64u(p256dh)
    secreto = de_b64u(auth)
    efimera = ec.generate_private_key(ec.SECP256R1())
    as_publica = _punto(efimera.public_key())
    compartido = efimera.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_publica))
    ikm = _hkdf(secreto, compartido, b"WebPush: info\x00" + ua_publica + as_publica, 32)
    salt = os.urandom(16)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    cifrado = AESGCM(cek).encrypt(nonce, mensaje + b"\x02", None)
    return salt + struct.pack("!I", 4096) + bytes([len(as_publica)]) + as_publica + cifrado


def firma_vapid(endpoint: str, privada_pem: str, contacto: str) -> str:
    """Encabezado «Authorization: vapid t=…, k=…» (RFC 8292)."""
    privada = serialization.load_pem_private_key(privada_pem.encode(), password=None)
    u = urlparse(endpoint)
    cabecera = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    datos = b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": contacto},
                            separators=(",", ":")).encode())
    r, s = decode_dss_signature(privada.sign(f"{cabecera}.{datos}".encode(), ec.ECDSA(hashes.SHA256())))
    firma = b64u(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={cabecera}.{datos}.{firma}, k={b64u(_punto(privada.public_key()))}"


def _post(endpoint: str, cuerpo: bytes, autorizacion: str) -> int:
    pedido = urllib.request.Request(endpoint, data=cuerpo, method="POST", headers={
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
        "TTL": "86400", "Urgency": "high", "Authorization": autorizacion})
    try:
        with urllib.request.urlopen(pedido, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def enviar(suscripciones: list[dict], datos: dict, privada_pem: str, contacto: str,
           al_vencer: Callable[[str], None] | None = None) -> None:
    """Envía en segundo plano. Las suscripciones vencidas (404/410) se avisan para borrarlas."""
    if not DISPONIBLE or not suscripciones:
        return
    mensaje = json.dumps(datos, ensure_ascii=False).encode()

    def _tarea():
        for s in suscripciones:
            try:
                estado = _post(s["endpoint"], cifrar(mensaje, s["p256dh"], s["auth"]), firma_vapid(s["endpoint"], privada_pem, contacto))
                if estado in (404, 410) and al_vencer:
                    al_vencer(s["endpoint"])
            except Exception:  # noqa: BLE001 — una notificación fallida nunca rompe nada
                pass

    if os.environ.get("TF_CORREO_SINCRONO") == "1":
        _tarea()
    else:
        threading.Thread(target=_tarea, daemon=True).start()
