"""Pruebas: python -m pytest -q"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["TF_TASAS_EN_VIVO"] = "0"  # las pruebas no dependen de internet

import calculos  # noqa: E402

CAT = calculos.cargar_catalogo()


# ------------------------------------------------ cálculos
def test_cotizacion_dop_con_extras():
    r = calculos.cotizar(CAT, "residencia_dominicana", express=True, envio=True)
    cfg = CAT["config"]
    assert r["total"] == 15000 + 10000 + cfg["express_fee"] + cfg["delivery_fee"]


def test_cotizacion_en_usd_usa_tasa():
    r = calculos.cotizar(CAT, "e_ticket", moneda="USD", tasas={"USD": 0.02})
    assert r["total"] == 10.0  # 500 DOP * 0.02


def test_cotizacion_servicio_invalido():
    with pytest.raises(ValueError):
        calculos.cotizar(CAT, "no_existe")


def test_ipi_exento_y_gravado():
    assert calculos.calcular_ipi(5_000_000, 9_520_861)["exento"]
    r = calculos.calcular_ipi(10_520_861, 9_520_861)
    assert r["ipi_anual"] == 10_000 and r["cuota_semestral"] == 5_000


def test_traspaso():
    assert calculos.calcular_traspaso(850_000)["total"] == 17_300


def test_codigo_y_nombre_publico():
    c = calculos.generar_codigo()
    assert c.startswith("RD-") and len(c) == 9
    assert calculos.nombre_publico("Juan Pérez Gómez") == "Juan P."


def test_catalogo_consistente():
    for k in CAT["checklists"]:
        assert k in CAT["servicios"]
    for p in CAT["paises"].values():
        assert all(k in CAT["servicios"] for k in p["destacados"])
    for s in CAT["servicios"].values():
        assert s["category"] in CAT["categorias"]
        assert set(s["paises"]) <= set(calculos.PAISES_VALIDOS)


# ------------------------------------------------ API
@pytest.fixture()
def client(tmp_path, monkeypatch):
    import app as app_module
    monkeypatch.setattr(app_module, "DB_PATH", tmp_path / "test.db")
    app_module._hits.clear()
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()


def test_sitio_y_api_basica(client):
    assert client.get("/").status_code == 200
    assert client.get("/api/salud").json["ok"]
    assert "servicios" in client.get("/api/catalogo").json
    assert client.get("/app.py").status_code == 404  # el código fuente no se expone


def test_solicitud_y_rastreo(client):
    r = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "contacto": "+34 600 000 000",
                                            "pais": "es", "servicio": "certificacion_solteria",
                                            "moneda": "EUR", "acepta": True})
    assert r.status_code == 201
    codigo = r.json["codigo"]
    t = client.get(f"/api/rastreo/{codigo}").json
    assert t["step"] == 1 and t["client"] == "Ana R."


def test_solicitud_validaciones(client):
    r = client.post("/api/solicitud", json={"nombre": "A", "contacto": "x"})
    assert r.status_code == 400


def test_rastreo_demo_y_desconocido(client):
    assert client.get("/api/rastreo/rd-8492").json["step"] == 3
    assert client.get("/api/rastreo/RD-ZZZZ").status_code == 404


def test_cotizar_api(client):
    r = client.post("/api/cotizar", json={"servicio": "apostilla_documentos", "moneda": "DOP"}).json
    assert r["total"] == 1620


# ------------------------------------------------ v3: idiomas, instituciones, diáspora
import traducciones  # noqa: E402


def test_todo_traducido_es_en_fr():
    assert traducciones.verificar(CAT, traducciones.cargar()) == []


def test_servicios_apuntan_a_instituciones_existentes():
    for s in CAT["servicios"].values():
        assert all(i in CAT["instituciones"] for i in s["inst"])


def test_paises_mundo_validos():
    for code, tz, moneda, perfil in CAT["paises_mundo"]:
        assert len(code) == 2 and perfil in CAT["paises"] and moneda in calculos.MONEDAS and "/" in tz


def test_paginas_nuevas(client):
    for page in ("servicio.html", "instituciones.html", "diaspora.html", "rastreo.html", "preguntas.html"):
        r = client.get("/" + page)
        assert r.status_code == 200 and b'id="tf-header"' in r.data


def test_solicitud_desde_otro_pais_en_frances(client):
    r = client.post("/api/solicitud", json={"nombre": "Luca Pérez", "contacto": "+39 333 000 0000", "pais": "es",
                                            "pais_detalle": "IT", "idioma": "fr", "servicio": "apostilla_documentos",
                                            "acepta": True})
    assert r.status_code == 201
