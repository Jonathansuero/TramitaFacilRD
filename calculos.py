"""
calculos.py — Lógica de negocio de TramitaFácil RD.

Funciones puras (sin Flask ni base de datos) para que se puedan probar
y reutilizar desde la API (app.py) y desde la consola (manage.py).
Los mismos cálculos existen en assets/js/script.js para que la página
funcione aunque se abra sin servidor.
"""
from __future__ import annotations

import json
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CATALOGO_PATH = BASE_DIR / "data" / "catalogo.json"
MONEDAS = ("DOP", "USD", "EUR")
PAISES_VALIDOS = ("rd", "us", "es", "ext", "mundo")


def cargar_catalogo(path: Path = CATALOGO_PATH) -> dict:
    """Lee data/catalogo.json (la única fuente de verdad de precios y textos)."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _tasas(catalogo: dict, tasas: dict | None) -> dict:
    base = {"DOP": 1.0, **catalogo["config"]["tasas_respaldo"]}
    if tasas:
        base.update({k: float(v) for k, v in tasas.items() if k in MONEDAS and v})
    return base


def precio(s: dict, cfg: dict, express: bool = False, envio: bool = False) -> dict:
    """Precio de un trámite en DOP: tasa + honorarios + ITBIS (sobre los dos); Express y courier son cargos fijos aparte."""
    base = s["tax"] + s["fee"]
    itbis = round(base * cfg.get("itbis", 0))
    final = base + itbis
    express = cfg.get("express_fee", 0) if express and not s.get("digital") else 0
    envio = cfg.get("delivery_fee", 0) if envio and not s.get("digital") else 0
    return {"tax": s["tax"], "fee": s["fee"], "itbis": itbis, "final": final, "express": express, "envio": envio,
            "total": final + express + envio}


def anticipo(total: float, tasas: float, honorarios: float | None = None) -> float:
    """Lo que se paga para empezar:
    - si las tasas son menores que los honorarios: todo menos los honorarios (tasas + ITBIS + extras);
      los honorarios se pagan al terminar;
    - si no: la mitad del total, o las tasas si son más (nunca se adelanta dinero propio a una institución).
    Nunca más que el total."""
    if total is None:
        return None
    if honorarios is not None and (tasas or 0) < honorarios:
        return round(max(0, total - honorarios), 2)
    return round(min(total, max(total / 2, tasas or 0)), 2)


def composicion(tramites: list, servicios: dict, cfg: dict) -> dict:
    """De qué está hecho el precio de un expediente: tasas oficiales, ITBIS y lo demás (honorarios y extras).
    El ITBIS se detecta comparando con el catálogo: los precios viejos, sin ITBIS, no lo llevan.
    Un trámite puesto a mano (sin servicio del catálogo) se toma como precio con ITBIS incluido."""
    tasas = itbis = honorarios = 0.0
    tasa_itbis = cfg.get("itbis", 0)
    for t in tramites:
        precio = t.get("precio")
        if precio is None:
            continue
        s = servicios.get(t.get("servicio_id") or "")
        if s:
            base = s["tax"] + s["fee"]
            imp = round(base * tasa_itbis)
            t_tasa = min(precio, s["tax"])
            t_itbis = imp if precio >= base + imp - 1 else 0
            t_hon = min(s["fee"], max(0, precio - t_tasa - t_itbis))
        else:
            t_tasa = 0
            t_itbis = round(precio * tasa_itbis / (1 + tasa_itbis)) if tasa_itbis else 0
            t_hon = precio - t_itbis
        tasas += t_tasa
        itbis += t_itbis
        honorarios += t_hon
    return {"tasas": round(tasas, 2), "itbis": round(itbis, 2), "honorarios": round(honorarios, 2)}


def cotizar(catalogo: dict, servicio: str, express: bool = False, envio: bool = False,
            moneda: str = "DOP", tasas: dict | None = None) -> dict:
    """Desglose de una cotización. Los montos base están en DOP."""
    servicios = catalogo["servicios"]
    if servicio not in servicios:
        raise ValueError(f"Servicio desconocido: {servicio}")
    moneda = (moneda or "DOP").upper()
    if moneda not in MONEDAS:
        raise ValueError(f"Moneda no soportada: {moneda}")

    cfg = catalogo["config"]
    s = servicios[servicio]
    # Un trámite digital (sin institución ni documentos físicos) no tiene Express ni courier.
    if s.get("digital"):
        express = envio = False
    p = precio(s, cfg, express, envio)
    extras = p["express"] + p["envio"]
    total_dop = p["total"]
    tasa = _tasas(catalogo, tasas)[moneda]
    decimales = 0 if moneda == "DOP" else 2

    def conv(v: float) -> float:
        return round(v * tasa, decimales)

    return {
        "servicio": servicio,
        "titulo": s["title"],
        "moneda": moneda,
        "tasa": tasa,
        "tasas_oficiales": conv(s["tax"]),
        "honorarios": conv(s["fee"]),
        "itbis": conv(p["itbis"]),
        "express": conv(p["express"]),
        "envio": conv(p["envio"]),
        "extras": conv(extras),
        "total": conv(total_dop),
        "total_dop": total_dop,
    }


def calcular_ipi(valor: float, exencion: float) -> dict:
    """IPI anual estimado: 1 % sobre el excedente del umbral de exención."""
    if valor is None or valor <= 0:
        raise ValueError("El valor del inmueble debe ser mayor a 0.")
    if valor <= exencion:
        return {"exento": True, "excedente": 0.0, "ipi_anual": 0.0, "cuota_semestral": 0.0, "exencion": exencion}
    excedente = valor - exencion
    ipi = round(excedente * 0.01, 2)
    return {"exento": False, "excedente": round(excedente, 2), "ipi_anual": ipi,
            "cuota_semestral": round(ipi / 2, 2), "exencion": exencion}


def calcular_traspaso(valor: float, tasa: float = 0.02, cargos: float = 300) -> dict:
    """Traspaso vehicular estimado: 2 % del valor + cargos administrativos."""
    if valor is None or valor <= 0:
        raise ValueError("El valor del vehículo debe ser mayor a 0.")
    impuesto = round(valor * tasa, 2)
    return {"impuesto": impuesto, "cargos": cargos, "total": round(impuesto + cargos, 2)}


# Sin 0/O/1/I para que los clientes no se confundan al dictar el código.
_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generar_codigo(existe=lambda c: False, largo: int = 6) -> str:
    """Código de seguimiento único y difícil de adivinar, p. ej. RD-7KQ4MX."""
    for _ in range(50):
        codigo = "RD-" + "".join(secrets.choice(_ALFABETO) for _ in range(largo))
        if not existe(codigo):
            return codigo
    raise RuntimeError("No se pudo generar un código único.")


def nombre_publico(nombre: str) -> str:
    """'Juan Pérez Gómez' -> 'Juan P.' (no exponemos nombres completos en el rastreo)."""
    partes = (nombre or "").split()
    if not partes:
        return "Cliente"
    return partes[0] if len(partes) == 1 else f"{partes[0]} {partes[1][0]}."
