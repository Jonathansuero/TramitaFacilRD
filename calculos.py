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
    extras = (cfg["express_fee"] if express else 0) + (cfg["delivery_fee"] if envio else 0)
    total_dop = s["tax"] + s["fee"] + extras
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
