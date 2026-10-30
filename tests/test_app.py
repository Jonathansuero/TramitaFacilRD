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
    assert r["total"] == 15000 + 11000 + cfg["express_fee"] + cfg["delivery_fee"]


def test_cotizacion_en_usd_usa_tasa():
    r = calculos.cotizar(CAT, "e_ticket", moneda="USD", tasas={"USD": 0.02})
    assert r["total"] == 11.0  # 550 DOP * 0.02


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
    assert r["total"] == 1720  # 620 tasas + 1100 honorarios


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
    for page in ("servicios", "servicio", "casos", "instituciones", "diaspora", "rastreo", "preguntas", "calculadora"):
        r = client.get("/" + page)
        assert r.status_code == 200 and b'id="tf-header"' in r.data


def test_solicitud_desde_otro_pais_en_frances(client):
    r = client.post("/api/solicitud", json={"nombre": "Luca Pérez", "contacto": "+39 333 000 0000", "pais": "es",
                                            "pais_detalle": "IT", "idioma": "fr", "servicio": "apostilla_documentos",
                                            "acepta": True})
    assert r.status_code == 201


def test_app_instalable(client):
    """La app instalable: service worker, manifiesto con íconos y página sin conexión."""
    sw = client.get("/sw.js")
    assert sw.status_code == 200 and b"const PRECACHE" in sw.data
    assert sw.headers.get("Cache-Control") == "no-cache"
    man = client.get("/site.webmanifest")
    assert man.status_code == 200 and "manifest+json" in man.headers.get("Content-Type", "")
    datos = man.get_json(force=True)
    assert datos["display"] == "standalone" and {"192x192", "512x512"} <= {i["sizes"] for i in datos["icons"]}
    for icono in datos["icons"]:
        assert client.get("/" + icono["src"]).status_code == 200
    assert client.get("/offline").status_code == 200


# ------------------------------------------------ panel de administración
def test_panel_admin(client):
    from werkzeug.security import generate_password_hash
    os.environ["TF_ADMIN_HASH"] = generate_password_hash("clave-de-prueba")
    try:
        assert client.get("/admin").status_code == 200
        assert client.get("/api/admin/expedientes").status_code == 401          # sin sesión, nada
        assert client.get("/api/admin/exportar").status_code == 401
        assert client.post("/api/admin/login", json={"clave": "mala"}).status_code == 401
        assert client.post("/api/admin/login", json={"clave": "clave-de-prueba"}).json["ok"]
        assert client.get("/api/admin/sesion").json["admin"]

        # una solicitud del formulario aparece en el panel con sus datos completos
        r = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "contacto": "+1 809 555 0000",
                                                "pais": "rd", "servicio": "apostilla_documentos", "acepta": True})
        codigo = r.json["codigo"]
        lista = client.get("/api/admin/expedientes").json
        assert lista["expedientes"][0]["nombre"] == "Ana Rodríguez" and lista["conteo"]["1"] == 1

        # mover el paso: el cliente lo ve en el rastreo
        r = client.post("/api/admin/estado", json={"codigo": codigo, "paso": 3, "detalle": "Depositado en el MIREX."})
        assert r.json["expediente"]["paso"] == 3
        t = client.get(f"/api/rastreo/{codigo}").json
        assert t["step"] == 3 and t["detail"] == "Depositado en el MIREX." and t["statusText"] == "En la institución"
        assert client.post("/api/admin/estado", json={"codigo": codigo, "paso": 9, "detalle": "x x x"}).status_code == 400
        assert client.post("/api/admin/estado", json={"codigo": "RD-NOEXIST", "paso": 2, "detalle": "Hola"}).status_code == 404

        # expediente creado a mano para un cliente de WhatsApp
        r = client.post("/api/admin/nuevo", json={"nombre": "Pedro Gómez", "contacto": "8095550000",
                                                  "servicio": "creacion_cv", "pais": "us"})
        assert r.status_code == 201
        nuevo = r.json["expediente"]["codigo"]
        assert client.get(f"/api/rastreo/{nuevo}").json["client"] == "Pedro G."

        csv_txt = client.get("/api/admin/exportar").get_data(as_text=True)
        assert "Ana Rodríguez" in csv_txt and "Pedro Gómez" in csv_txt

        client.post("/api/admin/logout")
        assert client.get("/api/admin/expedientes").status_code == 401
    finally:
        os.environ.pop("TF_ADMIN_HASH", None)


def test_panel_admin_sin_activar(client):
    os.environ.pop("TF_ADMIN_HASH", None)
    assert not client.get("/api/admin/sesion").json["configurado"]
    assert client.post("/api/admin/login", json={"clave": "x"}).status_code == 503


def test_varios_tramites_un_codigo(client):
    from werkzeug.security import generate_password_hash
    os.environ["TF_ADMIN_HASH"] = generate_password_hash("x-clave-123")
    try:
        client.post("/api/admin/login", json={"clave": "x-clave-123"})
        r = client.post("/api/admin/nuevo", json={"nombre": "Rosa Almonte", "contacto": "8295550000", "pais": "us",
                                                  "servicios": [{"servicio": "apostilla_documentos"},
                                                                {"servicio": "otro", "titulo": "Certificado de buena conducta", "precio": 2500}]})
        assert r.status_code == 201
        exp = r.json["expediente"]
        codigo, items = exp["codigo"], exp["tramites"]
        assert len(items) == 2 and items[1]["titulo"] == "Certificado de buena conducta"
        assert exp["total_dop"] == 1720 + 2500

        # cada trámite avanza por su cuenta; el resumen va al ritmo del más atrasado
        client.post("/api/admin/estado", json={"codigo": codigo, "tramite": items[0]["id"], "paso": 4, "detalle": "Apostilla lista."})
        t = client.get(f"/api/rastreo/{codigo}").json
        assert t["step"] == 1 and t["statusText"] == "1 de 2 listos" and t["service"] == "2 trámites"
        assert [i["step"] for i in t["items"]] == [4, 1]

        # sin indicar el trámite no se sabe cuál mover
        assert client.post("/api/admin/estado", json={"codigo": codigo, "paso": 2, "detalle": "Hola"}).status_code == 400

        # agregar un tercero al mismo código y luego quitarlo
        r = client.post("/api/admin/agregar", json={"codigo": codigo, "servicio": "creacion_cv"})
        assert len(r.json["expediente"]["tramites"]) == 3
        tercero = r.json["expediente"]["tramites"][2]["id"]
        assert len(client.post("/api/admin/quitar", json={"codigo": codigo, "tramite": tercero}).json["expediente"]["tramites"]) == 2

        client.post("/api/admin/estado", json={"codigo": codigo, "tramite": items[1]["id"], "paso": 4, "detalle": "Listo."})
        t = client.get(f"/api/rastreo/{codigo}").json
        assert t["step"] == 4 and t["statusText"] == "Completado"
        assert "Certificado de buena conducta" in client.get("/api/admin/exportar").get_data(as_text=True)
    finally:
        os.environ.pop("TF_ADMIN_HASH", None)


def test_direcciones_limpias_y_redireccion(client):
    r = client.get("/servicio.html?id=e_ticket")
    assert r.status_code == 301 and r.headers["Location"].endswith("/servicio?id=e_ticket")
    assert client.get("/index.html").headers["Location"].endswith("/")
    assert client.get("/servicio?id=e_ticket").status_code == 200
    assert b"GTM-PTD3KJ4Q" in client.get("/servicios").data
    pagina = client.get("/").data
    assert b"'gtm.start'" in pagina and b"ns.html?id=GTM-PTD3KJ4Q" in pagina   # instalación oficial de Tag Manager
    assert b"GTM-PTD3KJ4Q" not in client.get("/admin").data
    assert client.get("/app.py").status_code == 404
    assert client.get("/nada.html").status_code == 404


def test_pausa(client):
    os.environ["TF_PAUSA"] = "1"
    try:
        r = client.get("/servicios")
        assert r.status_code == 503 and "Volvemos pronto".encode() in r.data
        assert client.get("/").status_code == 503
        assert client.get("/admin").status_code == 200
        assert client.get("/assets/css/styles.css").status_code == 200
        assert client.post("/api/solicitud", json={}).status_code == 503
    finally:
        os.environ.pop("TF_PAUSA")
    assert client.get("/servicios").status_code == 200


def test_seo_canonical_y_vista_previa(client):
    r = client.get("/servicio?id=e_ticket").get_data(as_text=True)
    assert '<link rel="canonical" href="https://tramitafacilrd.com/servicio?id=e_ticket">' in r
    assert "<title>Llenado Formulario E-Ticket Viaje RD | TramitaFácil RD</title>" in r
    assert 'og:image" content="https://tramitafacilrd.com/assets/img/og-tramitafacil.png"' in r
    assert r.count('rel="canonical"') == 1 and r.count('property="og:title"') == 1
    assert 'href="https://tramitafacilrd.com/"' in client.get("/").get_data(as_text=True)
    assert 'canonical" href="https://tramitafacilrd.com/servicios"' in client.get("/servicio?id=nada").get_data(as_text=True)
    assert "canonical" not in client.get("/admin").get_data(as_text=True)
    w = client.get("/servicios?cat=viajes", headers={"Host": "www.tramitafacilrd.com"})
    assert w.status_code == 301 and w.headers["Location"] == "https://tramitafacilrd.com/servicios?cat=viajes"
    assert client.get("/assets/img/og-tramitafacil.png").status_code == 200


# ------------------------------------------------ panel: cobros, notas, documentos, precios y origen
def test_panel_cobros_precios_origen(client):
    from werkzeug.security import generate_password_hash
    os.environ["TF_ADMIN_HASH"] = generate_password_hash("clave-de-prueba")
    try:
        assert client.get("/api/admin/precios").status_code == 401
        assert client.post("/api/admin/pago", json={}).status_code == 401
        client.post("/api/admin/login", json={"clave": "clave-de-prueba"})

        # la solicitud guarda de dónde llegó, desde qué página y en qué dispositivo
        r = client.post("/api/solicitud", json={"nombre": "Luis Peña", "contacto": "+1 809 555 1111", "pais": "us",
                                                "servicio": "apostilla_documentos", "acepta": True,
                                                "origen": "l.instagram.com", "pagina": "/casos"},
                        headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148"})
        codigo = r.json["codigo"]
        e = client.get("/api/admin/expedientes").json["expedientes"][0]
        assert (e["origen"], e["origen_detalle"], e["pagina"], e["dispositivo"]) == ("instagram", "l.instagram.com", "casos", "movil")
        assert e["total_dop"] == 1720 and e["pagado"] == 0 and e["pendiente"] == 1720

        # cobro 50 / 50
        e = client.post("/api/admin/pago", json={"codigo": codigo, "tipo": "anticipo", "monto": 860, "metodo": "Zelle",
                                                 "fecha": "2026-10-20"}).json["expediente"]
        assert e["pagado"] == 860 and e["pendiente"] == 860 and e["pagos"][0]["metodo"] == "Zelle"
        assert client.post("/api/admin/pago", json={"codigo": codigo, "monto": -5}).status_code == 400
        assert client.post("/api/admin/pago", json={"codigo": "RD-NADA", "monto": 5}).status_code == 404
        e = client.post("/api/admin/pago", json={"codigo": codigo, "tipo": "saldo", "monto": 860}).json["expediente"]
        assert e["pendiente"] == 0
        e = client.post("/api/admin/pago/quitar", json={"codigo": codigo, "id": e["pagos"][1]["id"]}).json["expediente"]
        assert e["pendiente"] == 860

        # notas internas (no salen en el rastreo) y documentos recibidos
        e = client.post("/api/admin/nota", json={"codigo": codigo, "texto": "Falta copia de cédula"}).json["expediente"]
        assert e["notas"][0]["texto"] == "Falta copia de cédula"
        assert "Falta copia" not in client.get(f"/api/rastreo/{codigo}").get_data(as_text=True)
        tid = e["tramites"][0]["id"]
        e = client.post("/api/admin/docs", json={"codigo": codigo, "tramite": tid, "docs": ["Pasaporte"]}).json["expediente"]
        assert e["tramites"][0]["docs"] == ["Pasaporte"]
        client.post("/api/admin/nota/quitar", json={"codigo": codigo, "id": e["notas"][0]["id"]})

        # precios desde el panel: la API pública y la cotización usan el nuevo precio
        assert client.post("/api/admin/precio", json={"servicio": "apostilla_documentos", "tax": 700, "fee": 1300}).json["ok"]
        assert client.get("/api/precios").json["precios"]["apostilla_documentos"] == {"tax": 700, "fee": 1300}
        assert client.post("/api/cotizar", json={"servicio": "apostilla_documentos"}).json["total"] == 2000
        p = client.get("/api/admin/precios").json
        s = next(x for x in p["servicios"] if x["id"] == "apostilla_documentos")
        assert s["modificado"] and s["tax_base"] == 620 and p["historial"][0]["tax"] == 700
        assert client.post("/api/admin/precio", json={"servicio": "apostilla_documentos", "tax": -1, "fee": 1}).status_code == 400
        assert client.post("/api/admin/precio", json={"servicio": "apostilla_documentos", "restaurar": True}).json["ok"]
        assert client.get("/api/precios").json["precios"] == {}

        # expediente del panel: origen elegido a mano · respaldo descargable
        e = client.post("/api/admin/nuevo", json={"nombre": "Rosa Díaz", "servicio": "creacion_cv", "origen": "referido"}).json["expediente"]
        assert e["origen"] == "referido" and e["pagina"] == "panel"
        r = client.get("/api/admin/respaldo")
        assert r.status_code == 200 and r.data[:15] == b"SQLite format 3"
    finally:
        os.environ.pop("TF_ADMIN_HASH", None)
