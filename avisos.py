"""
avisos.py — Correos de TramitaFácil RD (al cliente y al equipo).

Se activa con estas variables (las pone `tramita correo` en el servidor):
    SMTP_HOST   p. ej. smtp.hostinger.com · smtp.gmail.com
    SMTP_PORT   465 (SSL) o 587 (STARTTLS)
    SMTP_USER   la cuenta de correo que envía
    SMTP_PASS   su contraseña (en Gmail: «contraseña de aplicación»)
    SMTP_FROM   opcional: dirección que ve el cliente (por defecto SMTP_USER)
    NOTIFY_TO   opcional: correo que siempre recibe el aviso de solicitud nueva
Sin SMTP_HOST no se envía nada y la página funciona igual.
"""
from __future__ import annotations

import html
import mimetypes
import os
import re
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path
from typing import Callable

NOMBRE = "TramitaFácil RD"
AZUL, ROJO, ORO = "#002D62", "#CE1126", "#D4AF37"
RE_CORREO = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
MAX_ADJUNTOS = 8 * 1024 * 1024   # si los documentos pesan más, solo van los enlaces


def configurado() -> bool:
    return bool(os.environ.get("SMTP_HOST") and (os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER")))


def sitio() -> str:
    return (os.environ.get("TF_SITIO") or "https://tramitafacilrd.com").rstrip("/")


def correo_de(texto: str | None) -> str:
    """Primer correo válido dentro del contacto («+1 809… · ana@correo.com»)."""
    m = RE_CORREO.search(str(texto or ""))
    return m.group(0).lower() if m else ""


def valido(correo: str) -> bool:
    return bool(RE_CORREO.fullmatch(str(correo or "").strip()))


# ---------------------------------------------------------------- plantilla formal
def plantilla(titulo: str, saludo: str, parrafos: list[str], datos: list[tuple[str, str]] | None = None,
              boton: tuple[str, str] | None = None, enlaces: list[tuple[str, str]] | None = None,
              pie: str = "") -> tuple[str, str]:
    """Devuelve (texto, html). Los textos llegan sin escapar; aquí se escapan."""
    e = html.escape
    datos, enlaces = datos or [], enlaces or []
    texto = [saludo, ""] + parrafos
    if datos:
        texto += [""] + [f"{k}: {v}" for k, v in datos]
    if enlaces:
        texto += [""] + [f"{n}: {u}" for n, u in enlaces]
    if boton:
        texto += ["", f"{boton[0]}: {boton[1]}"]
    texto += ["", "—", NOMBRE, "Todos tus trámites en un solo lugar.", sitio()]
    if pie:
        texto += ["", pie]

    filas = "".join(f'<tr><td style="padding:8px 0;color:#64748B;font-size:13px;width:38%;vertical-align:top">{e(k)}</td>'
                    f'<td style="padding:8px 0;color:#0F172A;font-size:14px;font-weight:600">{e(v)}</td></tr>' for k, v in datos)
    lista = "".join(f'<tr><td style="padding:10px 12px;border:1px solid #E2E8F0;border-radius:10px;background:#F8FAFC">'
                    f'<a href="{e(u)}" style="color:{AZUL};font-weight:700;text-decoration:none">&#8595;&nbsp; {e(n)}</a></td></tr>'
                    f'<tr><td style="height:8px"></td></tr>' for n, u in enlaces)
    cuerpo = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{e(titulo)}</title></head>
<body style="margin:0;background:#F3F5F9;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
<tr><td style="background:{AZUL};padding:20px 24px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td><img src="{e(sitio())}/assets/img/app/icon-192.png" width="40" height="40" alt="" style="display:block;border-radius:10px;background:#fff"></td>
    <td style="padding-left:12px;color:#fff;font-size:18px;font-weight:700">TramitaFácil<span style="color:#FF8A98">RD</span></td>
  </tr></table>
</td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,{AZUL} 0 45%,#fff 45% 55%,{ROJO} 55% 100%);background-color:{ROJO}"></td></tr>
<tr><td style="padding:28px 24px 8px">
  <h1 style="margin:0 0 14px;font-size:20px;color:{AZUL}">{e(titulo)}</h1>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.55">{e(saludo)}</p>
  {''.join(f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155">{e(p)}</p>' for p in parrafos)}
  {f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0">{filas}</table>' if filas else ''}
  {f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 6px">{lista}</table>' if lista else ''}
  {f'<p style="margin:18px 0 8px"><a href="{e(boton[1])}" style="display:inline-block;background:{AZUL};color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">{e(boton[0])}</a></p>' if boton else ''}
</td></tr>
<tr><td style="padding:16px 24px 24px;color:#64748B;font-size:12px;line-height:1.5;border-top:1px solid #F1F5F9">
  <b style="color:{AZUL}">{NOMBRE}</b> · Todos tus trámites en un solo lugar.<br>
  <a href="{e(sitio())}" style="color:#64748B">{e(sitio().replace('https://', ''))}</a>{('<br><br>' + e(pie)) if pie else ''}
</td></tr>
</table></td></tr></table></body></html>"""
    return "\n".join(texto), cuerpo


# ---------------------------------------------------------------- envío
def _smtp_enviar(msg: EmailMessage) -> None:
    host = os.environ["SMTP_HOST"]
    puerto = int(os.environ.get("SMTP_PORT", 587))
    usuario, clave = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASS", "")
    ctx = ssl.create_default_context()
    if puerto == 465:
        with smtplib.SMTP_SSL(host, puerto, context=ctx, timeout=20) as s:
            if usuario:
                s.login(usuario, clave)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, puerto, timeout=20) as s:
            s.starttls(context=ctx)
            if usuario:
                s.login(usuario, clave)
            s.send_message(msg)


def armar(para: list[str], asunto: str, texto: str, cuerpo_html: str,
          adjuntos: list[tuple[str, Path]] | None = None, responder_a: str | None = None) -> EmailMessage:
    remite = os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER", "")
    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = formataddr((NOMBRE, remite))
    msg["To"] = ", ".join(para)
    msg["Message-ID"] = make_msgid(domain=remite.split("@")[-1] if "@" in remite else None)
    if responder_a:
        msg["Reply-To"] = responder_a
    msg.set_content(texto)
    msg.add_alternative(cuerpo_html, subtype="html")
    total = 0
    for nombre, ruta in adjuntos or []:
        try:
            datos = Path(ruta).read_bytes()
        except OSError:
            continue
        total += len(datos)
        if total > MAX_ADJUNTOS:
            break
        tipo = (mimetypes.guess_type(nombre)[0] or "application/octet-stream").split("/")
        msg.add_attachment(datos, maintype=tipo[0], subtype=tipo[1], filename=nombre)
    return msg


def enviar(para: list[str], asunto: str, texto: str, cuerpo_html: str,
           adjuntos: list[tuple[str, Path]] | None = None, al_terminar: Callable[[bool, str], None] | None = None) -> bool:
    """Envía en segundo plano (nunca frena la respuesta). Devuelve False si no hay a quién o no hay SMTP."""
    para = sorted({p.strip().lower() for p in para if valido(p)})
    if not para or not configurado():
        return False
    msg = armar(para, asunto, texto, cuerpo_html, adjuntos, os.environ.get("NOTIFY_TO") or None)

    def _tarea():
        try:
            _smtp_enviar(msg)
            ok, err = True, ""
        except Exception as exc:  # noqa: BLE001 — un correo fallido nunca rompe la página
            ok, err = False, f"{type(exc).__name__}: {exc}"[:300]
        if al_terminar:
            try:
                al_terminar(ok, err)
            except Exception:  # noqa: BLE001
                pass

    if os.environ.get("TF_CORREO_SINCRONO") == "1":
        _tarea()
    else:
        threading.Thread(target=_tarea, daemon=True).start()
    return True


# ---------------------------------------------------------------- textos para el cliente (es / en / fr)
TEXTOS = {
    "es": {"asunto": "Actualización de tu trámite · {codigo}", "titulo": "Tu trámite avanzó",
           "hola": "Hola, {nombre}:", "intro": "Te informamos que tu trámite tiene una actualización.",
           "tramite": "Trámite", "codigo": "Código de seguimiento", "estado": "Estado", "paso": "Paso {n} de 4",
           "mensaje": "Mensaje del gestor", "boton": "Ver mi expediente",
           "listo_t": "¡Tu trámite está listo!", "listo": "Tu trámite está listo. Puedes descargar tus documentos aquí:",
           "listo_sin": "Te contactaremos para coordinar la entrega.",
           "docs_asunto": "Tus documentos están listos · {codigo}", "docs_t": "Tus documentos están listos",
           "docs": "Adjuntamos los documentos de tu expediente. También puedes descargarlos con estos enlaces:",
           "vence": "Los enlaces de descarga son personales y vencen en 30 días. Después puedes descargarlos en la página de rastreo con tu código.",
           "pie": "Recibes este correo porque tienes un trámite con TramitaFácil RD. Si no lo reconoces, responde a este mensaje."},
    "en": {"asunto": "Update on your request · {codigo}", "titulo": "Your request has progressed",
           "hola": "Hello {nombre},", "intro": "There is an update on your request.",
           "tramite": "Service", "codigo": "Tracking code", "estado": "Status", "paso": "Step {n} of 4",
           "mensaje": "Message from your agent", "boton": "View my request",
           "listo_t": "Your request is ready!", "listo": "Your request is ready. You can download your documents here:",
           "listo_sin": "We will contact you to arrange delivery.",
           "docs_asunto": "Your documents are ready · {codigo}", "docs_t": "Your documents are ready",
           "docs": "Your documents are attached. You can also download them with these links:",
           "vence": "Download links are personal and expire in 30 days. After that, download them from the tracking page with your code.",
           "pie": "You receive this email because you have a request with TramitaFácil RD. If you don't recognize it, reply to this message."},
    "fr": {"asunto": "Mise à jour de votre démarche · {codigo}", "titulo": "Votre démarche avance",
           "hola": "Bonjour {nombre},", "intro": "Votre démarche a été mise à jour.",
           "tramite": "Démarche", "codigo": "Code de suivi", "estado": "Statut", "paso": "Étape {n} sur 4",
           "mensaje": "Message de votre conseiller", "boton": "Voir mon dossier",
           "listo_t": "Votre démarche est prête !", "listo": "Votre démarche est prête. Téléchargez vos documents ici :",
           "listo_sin": "Nous vous contacterons pour organiser la remise.",
           "docs_asunto": "Vos documents sont prêts · {codigo}", "docs_t": "Vos documents sont prêts",
           "docs": "Vos documents sont joints. Vous pouvez aussi les télécharger avec ces liens :",
           "vence": "Les liens sont personnels et expirent dans 30 jours. Ensuite, téléchargez-les depuis la page de suivi avec votre code.",
           "pie": "Vous recevez ce courriel car vous avez une démarche avec TramitaFácil RD. Si vous ne la reconnaissez pas, répondez à ce message."},
}


def textos(idioma: str | None) -> dict:
    return TEXTOS.get((idioma or "es")[:2], TEXTOS["es"])
