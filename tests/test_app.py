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
    r = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "contacto": "+34 600 000 000 · ana@correo.com",
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
    r = client.post("/api/solicitud", json={"nombre": "Luca Pérez", "contacto": "+39 333 000 0000 · luca@correo.com", "pais": "es",
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
        r = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "contacto": "+1 809 555 0000 · ana@correo.com",
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
        r = client.post("/api/solicitud", json={"nombre": "Luis Peña", "contacto": "+1 809 555 1111 · luis@correo.com", "pais": "us",
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


def test_descripcion_para_google_por_servicio(client):
    for sid, s in CAT["servicios"].items():
        assert 110 <= len(s["seo"]) <= 160, sid          # largo que Google muestra completo
    html = client.get("/servicio?id=pasaporte_normal").get_data(as_text=True)
    seo = CAT["servicios"]["pasaporte_normal"]["seo"]
    assert f'<meta name="description" content="{seo}"' in html and f'<meta property="og:description" content="{seo}"' in html


def test_icono_y_logo_para_google(client):
    r = client.get("/favicon.ico")
    assert r.status_code == 200 and r.data[:4] == b"\x00\x00\x01\x00"
    html = client.get("/").get_data(as_text=True)
    assert 'sizes="192x192" href="/assets/img/app/icon-192.png"' in html
    assert '"@type": "Organization"' in html and "/assets/img/app/icon-512.png" in html
    assert client.get("/assets/img/app/icon-192.png").status_code == 200


def test_assetlinks_app_android(client):
    r = client.get("/.well-known/assetlinks.json")
    assert r.status_code == 200 and r.mimetype == "application/json"
    assert r.json[0]["target"]["namespace"] == "android_app"


def yo_admin(client):
    return next(x for x in client.get("/api/admin/usuarios").json["usuarios"] if x["usuario"] == "admin")


def test_usuarios_permisos_y_datos_del_cliente(client):
    from werkzeug.security import generate_password_hash
    os.environ["TF_ADMIN_HASH"] = generate_password_hash("clave-del-dueno")
    try:
        # el dueño entra como «admin» con la clave de `tramita clave`
        assert client.post("/api/admin/login", json={"usuario": "admin", "clave": "mala"}).status_code == 401
        assert client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"}).json["ok"]
        s = client.get("/api/admin/sesion").json
        assert s["usuario"]["usuario"] == "admin" and "usuarios" in s["usuario"]["permisos"]

        # crea una gestora que solo trabaja expedientes
        r = client.post("/api/admin/usuarios/guardar", json={"usuario": "maria", "nombre": "María Gestora",
                                                             "clave": "clave-maria-1", "permisos": ["expedientes"]})
        assert r.json["ok"]
        assert client.post("/api/admin/usuarios/guardar", json={"usuario": "Maria Mal", "nombre": "x y", "clave": "12345678"}).status_code == 400
        sol = client.post("/api/solicitud", json={"nombre": "Ana Pérez", "contacto": "+1 809 555 0000 · ana@correo.com", "pais": "rd",
                                                  "servicio": "apostilla_documentos", "acepta": True}).json["codigo"]
        client.post("/api/admin/logout")

        assert client.post("/api/admin/login", json={"usuario": "maria", "clave": "clave-maria-1"}).json["ok"]
        # la clave que le puso el administrador es temporal: primero debe crear la suya
        assert client.get("/api/admin/sesion").json["usuario"]["cambiar_clave"]
        assert client.get("/api/admin/expedientes").status_code == 403
        assert client.post("/api/admin/cuenta/clave", json={"actual": "clave-maria-1", "nueva": "clave-maria-1"}).status_code == 400
        assert client.post("/api/admin/cuenta/clave", json={"actual": "clave-maria-1", "nueva": "mi-clave-propia"}).json["ok"]
        assert not client.get("/api/admin/sesion").json["usuario"]["cambiar_clave"]
        # puede corregir el contacto del cliente (y queda anotado quién lo hizo)
        e = client.post("/api/admin/cliente", json={"codigo": sol, "nombre": "Ana Pérez", "contacto": "+1 829 555 9999",
                                                    "pais": "us"}).json["expediente"]
        assert e["contacto"] == "+1 829 555 9999" and e["pais"] == "us"
        assert e["actividad"][0]["usuario"] == "maria" and "contacto" in e["actividad"][0]["detalle"]
        # no puede cobrar, cambiar precios, descargar ni administrar usuarios; y no ve los pagos
        assert client.post("/api/admin/pago", json={"codigo": sol, "monto": 100}).status_code == 403
        assert client.get("/api/admin/precios").status_code == 403
        assert client.get("/api/admin/respaldo").status_code == 403
        assert client.get("/api/admin/usuarios").status_code == 403
        assert client.get("/api/admin/expedientes").json["expedientes"][0]["pagado"] is None
        # cambia su contraseña y su nombre cuando quiera
        assert client.post("/api/admin/cuenta/clave", json={"actual": "mi-clave-propia", "nueva": "otra-clave-2"}).json["ok"]
        assert client.post("/api/admin/cuenta/nombre", json={"nombre": "María P."}).json["ok"]
        client.post("/api/admin/logout")

        # el dueño la desactiva: ya no puede entrar
        client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
        u = client.get("/api/admin/usuarios").json
        maria = next(x for x in u["usuarios"] if x["usuario"] == "maria")
        assert any(a["accion"] == "Editó los datos del cliente" for a in u["actividad"])
        assert maria["nombre"] == "María P."
        # el administrador la edita: le cambia el usuario y los permisos
        assert client.post("/api/admin/usuarios/guardar", json={**maria, "usuario": "maria.p", "permisos": ["expedientes", "pagos"]}).json["ok"]
        maria = next(x for x in client.get("/api/admin/usuarios").json["usuarios"] if x["usuario"] == "maria.p")
        assert maria["permisos"] == ["expedientes", "pagos"]
        assert client.post("/api/admin/usuarios/guardar", json={**yo_admin(client), "usuario": "jefe"}).status_code == 400
        assert client.post("/api/admin/usuarios/guardar", json={**maria, "activo": False}).json["ok"]
        # no se puede quitar el último administrador
        yo = next(x for x in u["usuarios"] if x["usuario"] == "admin")
        assert client.post("/api/admin/usuarios/guardar", json={**yo, "permisos": ["expedientes"]}).status_code == 400
        client.post("/api/admin/logout")
        assert client.post("/api/admin/login", json={"usuario": "maria.p", "clave": "otra-clave-2"}).status_code == 403
    finally:
        os.environ.pop("TF_ADMIN_HASH", None)


# ------------------------------------------------ correos, documentos y avisos al equipo
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def test_correos_documentos_y_avisos(client, monkeypatch, tmp_path):
    import io
    import app as app_module
    import avisos
    from werkzeug.security import generate_password_hash
    enviados = []
    monkeypatch.setattr(avisos, "_smtp_enviar", lambda msg: enviados.append(msg))
    for k, v in {"SMTP_HOST": "smtp.prueba", "SMTP_USER": "info@tramitafacilrd.com", "TF_CORREO_SINCRONO": "1",
                 "TF_ARCHIVOS": str(tmp_path / "archivos"), "TF_ADMIN_HASH": generate_password_hash("clave-del-dueno")}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("NOTIFY_TO", raising=False)
    assert client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"}).json["ok"]
    assert client.get("/api/admin/sesion").json["correo_activo"] is True
    # el equipo: un gestor con correo (recibe avisos) y uno de solo lectura (no)
    assert client.post("/api/admin/usuarios/guardar", json={"usuario": "maria", "nombre": "María", "permisos": ["expedientes"],
                                                           "clave": "temporal-123", "correo": "maria@ejemplo.com"}).json["ok"]
    assert client.post("/api/admin/usuarios/guardar", json={"usuario": "pedro", "nombre": "Pedro", "permisos": [],
                                                           "clave": "temporal-123", "correo": "pedro@ejemplo.com"}).json["ok"]
    assert client.post("/api/admin/usuarios/guardar", json={"usuario": "malo", "nombre": "Malo", "permisos": [],
                                                           "clave": "temporal-123", "correo": "no-es-correo"}).status_code == 400
    # llega una solicitud: aviso en la campana + correo solo a quien gestiona
    r = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "contacto": "+1 809 555 1234 · Ana@Correo.com",
                                            "pais": "us", "servicio": "certificacion_solteria", "acepta": True})
    codigo = r.json["codigo"]
    assert len(enviados) == 1 and enviados[0]["To"] == "maria@ejemplo.com"
    assert enviados[0]["Subject"].startswith("Nueva solicitud: ")
    av = client.get("/api/admin/avisos").json
    assert av["sin_leer"] == 1 and av["avisos"][0]["codigo"] == codigo and av["avisos"][0]["titulo"].startswith("Nueva solicitud")
    assert client.post("/api/admin/avisos/visto", json={"hasta": av["ultimo"]}).json["ok"]
    assert client.get("/api/admin/avisos").json["sin_leer"] == 0
    # cambio de estado -> correo al cliente
    exp = next(e for e in client.get("/api/admin/expedientes").json["expedientes"] if e["codigo"] == codigo)
    assert exp["correo_cliente"] == "ana@correo.com"
    tid = exp["tramites"][0]["id"]
    r = client.post("/api/admin/estado", json={"codigo": codigo, "tramite": tid, "paso": 2, "detalle": "Documentos validados",
                                               "avisar": True})
    assert r.json["correo"] == "enviando" and enviados[-1]["To"] == "ana@correo.com"
    assert "Documentos validados" in enviados[-1].get_body(("plain",)).get_content()
    assert client.post("/api/admin/estado", json={"codigo": codigo, "tramite": tid, "paso": 3, "detalle": "En la JCE",
                                                  "avisar": False}).json["correo"] == "desactivado"
    n = len(enviados)  # sin elegir aviso: solo se cambia el estado
    assert client.post("/api/admin/estado", json={"codigo": codigo, "tramite": tid, "paso": 3, "detalle": "Seguimos en la JCE"}).json["correo"] == "desactivado"
    assert len(enviados) == n
    # documentos: solo PDF/fotos de verdad
    falso = client.post("/api/admin/archivo", data={"codigo": codigo, "archivo": (io.BytesIO(b"hola"), "acta.pdf")},
                        content_type="multipart/form-data")
    assert falso.status_code == 400
    exe = client.post("/api/admin/archivo", data={"codigo": codigo, "archivo": (io.BytesIO(PDF), "virus.exe")},
                      content_type="multipart/form-data")
    assert exe.status_code == 400
    r = client.post("/api/admin/archivo", data={"codigo": codigo, "archivo": (io.BytesIO(PDF), "Acta de soltería.pdf")},
                    content_type="multipart/form-data")
    assert r.status_code == 201 and r.json["expediente"]["archivos"][0]["nombre"] == "Acta de soltería.pdf"
    enlace = r.json["expediente"]["archivos"][0]["enlace"]
    # al pasar a Listo el correo lleva el enlace de descarga
    client.post("/api/admin/estado", json={"codigo": codigo, "tramite": tid, "paso": 4, "detalle": "Listo para entregar", "avisar": True})
    assert "/descarga/" in enviados[-1].get_body(("plain",)).get_content()
    # enviar los documentos por correo (adjuntos)
    assert client.post("/api/admin/archivo/enviar", json={"codigo": codigo}).json["para"] == "ana@correo.com"
    assert [a.get_filename() for a in enviados[-1].iter_attachments()] == ["Acta de soltería.pdf"]
    # el cliente: el rastreo dice cuántos hay; para descargarlos debe confirmar su WhatsApp o su correo
    assert client.get(f"/api/rastreo/{codigo}").json["archivos"] == 1
    assert client.post(f"/api/rastreo/{codigo}/archivos", json={"dato": "9999"}).status_code == 403
    assert client.post(f"/api/rastreo/{codigo}/archivos", json={"dato": "1234"}).json["archivos"][0]["nombre"] == "Acta de soltería.pdf"
    assert client.post(f"/api/rastreo/{codigo}/archivos", json={"dato": "ana@correo.com"}).json["ok"]
    d = client.get("/descarga/" + enlace.split("/descarga/")[1])
    assert d.status_code == 200 and d.data == PDF and "attachment" in d.headers["Content-Disposition"]
    assert client.get("/descarga/inventado").status_code == 410
    # historial de correos en el expediente
    exp = next(e for e in client.get("/api/admin/expedientes").json["expedientes"] if e["codigo"] == codigo)
    assert {c["tipo"] for c in exp["correos"]} == {"estado", "documentos"} and all(c["estado"] == "enviado" for c in exp["correos"])
    # quitar documento
    aid = exp["archivos"][0]["id"]
    assert client.post("/api/admin/archivo/quitar", json={"codigo": codigo, "id": aid}).json["expediente"]["archivos"] == []
    # un usuario de solo lectura no recibe avisos
    client.post("/api/admin/logout")
    assert client.post("/api/admin/login", json={"usuario": "pedro", "clave": "temporal-123"}).json["ok"]
    client.post("/api/admin/cuenta/clave", json={"actual": "temporal-123", "nueva": "pedro-clave-1"})
    assert client.get("/api/admin/avisos").json["solo_lectura"] is True


def test_sin_smtp_no_se_envia(client, monkeypatch):
    import avisos
    for k in ("SMTP_HOST", "SMTP_USER", "SMTP_FROM"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(avisos, "_smtp_enviar", lambda msg: (_ for _ in ()).throw(AssertionError("no debía enviar")))
    r = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "whatsapp": "+1 809 555 7777", "email": "ana@correo.com",
                                            "pais": "us", "servicio": "certificacion_solteria", "acepta": True})
    assert r.status_code == 201
    assert client.post("/api/solicitud", data="x" * 40000, content_type="application/json").status_code == 413


def test_solicitud_pide_whatsapp_y_correo(client):
    base = {"nombre": "Ana Rodríguez", "pais": "us", "servicio": "certificacion_solteria", "acepta": True}
    solo_tel = client.post("/api/solicitud", json={**base, "contacto": "+1 809 555 1234"})
    assert solo_tel.status_code == 400 and "correo" in solo_tel.json["error"]
    solo_correo = client.post("/api/solicitud", json={**base, "whatsapp": "", "email": "ana@correo.com"})
    assert solo_correo.status_code == 400 and "WhatsApp" in solo_correo.json["error"]
    malo = client.post("/api/solicitud", json={**base, "whatsapp": "+1 809 555 1234", "email": "ana@correo"})
    assert malo.status_code == 400
    ok = client.post("/api/solicitud", json={**base, "whatsapp": "+1 809 555 1234", "email": "Ana@Correo.com"})
    assert ok.status_code == 201  # el comentario es opcional


def test_avisar_al_cliente_con_un_clic(client, monkeypatch, tmp_path):
    import avisos
    from werkzeug.security import generate_password_hash
    enviados = []
    monkeypatch.setattr(avisos, "_smtp_enviar", lambda msg: enviados.append(msg))
    for k, v in {"SMTP_HOST": "smtp.prueba", "SMTP_USER": "info@tramitafacilrd.com", "TF_CORREO_SINCRONO": "1",
                 "TF_ADMIN_HASH": generate_password_hash("clave-del-dueno")}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("NOTIFY_TO", raising=False)
    codigo = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "whatsapp": "+1 809 555 1234", "email": "ana@correo.com",
                                                 "pais": "us", "servicio": "certificacion_solteria", "acepta": True}).json["codigo"]
    assert client.post("/api/admin/avisar", json={"codigo": codigo}).status_code == 401
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    r = client.post("/api/admin/avisar", json={"codigo": codigo})
    assert r.json["para"] == "ana@correo.com" and enviados[-1]["To"] == "ana@correo.com"
    assert "Certificación de Soltería" in enviados[-1].get_body(("plain",)).get_content()
    assert r.json["expediente"]["correos"][0]["tipo"] == "aviso"


def test_zafacon_solo_admin_7_dias_y_reactivar(client, monkeypatch, tmp_path):
    import io
    import sqlite3
    import app as app_module
    from werkzeug.security import generate_password_hash
    monkeypatch.setenv("TF_ADMIN_HASH", generate_password_hash("clave-del-dueno"))
    monkeypatch.setenv("TF_ARCHIVOS", str(tmp_path / "archivos"))
    base = {"pais": "us", "servicio": "certificacion_solteria", "acepta": True}
    c1 = client.post("/api/solicitud", json={**base, "nombre": "Ana Rodríguez", "whatsapp": "+1 809 555 1234", "email": "ana@correo.com"}).json["codigo"]
    c2 = client.post("/api/solicitud", json={**base, "nombre": "Luis Peña", "whatsapp": "+1 809 555 9876", "email": "luis@correo.com"}).json["codigo"]
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    client.post("/api/admin/archivo", data={"codigo": c2, "archivo": (io.BytesIO(PDF), "acta.pdf")}, content_type="multipart/form-data")
    # un gestor no puede eliminar
    client.post("/api/admin/usuarios/guardar", json={"usuario": "maria", "nombre": "María", "permisos": ["expedientes", "pagos"], "clave": "temporal-123"})
    client.post("/api/admin/logout")
    client.post("/api/admin/login", json={"usuario": "maria", "clave": "temporal-123"})
    client.post("/api/admin/cuenta/clave", json={"actual": "temporal-123", "nueva": "maria-clave-1"})
    assert client.post("/api/admin/eliminar", json={"codigo": c1}).status_code == 403
    assert client.get("/api/admin/zafacon").status_code == 403
    client.post("/api/admin/logout")
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    # el administrador lo manda al zafacón: desaparece de la lista, del rastreo y del Excel
    assert client.post("/api/admin/eliminar", json={"codigo": c1, "motivo": "No respondió"}).json["dias"] == 7
    assert c1 not in [e["codigo"] for e in client.get("/api/admin/expedientes").json["expedientes"]]
    assert client.get(f"/api/rastreo/{c1}").status_code == 404
    assert c1 not in client.get("/api/admin/exportar").data.decode()
    assert client.post("/api/admin/nota", json={"codigo": c1, "texto": "x"}).status_code == 404
    z = client.get("/api/admin/zafacon").json["zafacon"]
    assert z[0]["codigo"] == c1 and z[0]["dias_restantes"] == 7 and z[0]["motivo"] == "No respondió" and not z[0]["volvio"]
    # el cliente vuelve a escribir (mismo WhatsApp): se marca y se puede reactivar tal cual
    client.post("/api/solicitud", json={**base, "nombre": "Ana R.", "whatsapp": "+1 809 555 1234", "email": "otra@correo.com"})
    assert client.get("/api/admin/zafacon").json["zafacon"][0]["volvio"] is True
    r = client.post("/api/admin/restaurar", json={"codigo": c1})
    assert r.json["expediente"]["nombre"] == "Ana Rodríguez" and client.get(f"/api/rastreo/{c1}").status_code == 200
    assert client.get("/api/admin/zafacon").json["zafacon"] == []
    # a los 7 días se borra por completo, con sus documentos
    client.post("/api/admin/eliminar", json={"codigo": c2})
    db = sqlite3.connect(app_module.DB_PATH)
    db.execute("UPDATE seguimiento SET eliminado='2020-01-01T00:00:00+00:00' WHERE codigo=?", (c2,)); db.commit()
    assert client.get("/api/admin/zafacon").json["zafacon"] == []
    for tabla in ("seguimiento", "solicitudes", "tramites", "archivos"):
        assert db.execute(f"SELECT COUNT(*) FROM {tabla} WHERE codigo=?", (c2,)).fetchone()[0] == 0
    assert not any((tmp_path / "archivos").rglob("*.pdf"))
    assert client.post("/api/admin/restaurar", json={"codigo": c2}).status_code == 404


def test_mensajes_preestablecidos(client, monkeypatch):
    from werkzeug.security import generate_password_hash
    monkeypatch.setenv("TF_ADMIN_HASH", generate_password_hash("clave-del-dueno"))
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    m = client.get("/api/admin/mensajes").json["mensajes"]
    general1 = [x for x in m if x["servicio_id"] == "" and x["paso"] == 1]
    eticket1 = [x for x in m if x["servicio_id"] == "e_ticket" and x["paso"] == 1]
    assert general1 and "pasaporte" in eticket1[0]["texto"]
    # el administrador agrega otro y lo pone por defecto; luego lo edita y lo quita
    m = client.post("/api/admin/mensajes/guardar", json={"servicio": "e_ticket", "paso": 1, "texto": "Envíanos tu pasaporte y la fecha del vuelo.",
                                                           "defecto": True}).json["mensajes"]
    lista = [x for x in m if x["servicio_id"] == "e_ticket" and x["paso"] == 1]
    assert len(lista) == 2 and lista[0]["texto"].startswith("Envíanos")
    m = client.post("/api/admin/mensajes/guardar", json={"id": lista[1]["id"], "servicio": "e_ticket", "paso": 1,
                                                           "texto": lista[1]["texto"], "defecto": True}).json["mensajes"]
    assert [x for x in m if x["servicio_id"] == "e_ticket" and x["paso"] == 1][0]["id"] == lista[1]["id"]
    assert client.post("/api/admin/mensajes/guardar", json={"servicio": "no_existe", "paso": 1, "texto": "Hola hola"}).status_code == 400
    assert client.post("/api/admin/mensajes/guardar", json={"servicio": "", "paso": 9, "texto": "Hola hola"}).status_code == 400
    m = client.post("/api/admin/mensajes/quitar", json={"id": lista[0]["id"]}).json["mensajes"]
    assert lista[0]["id"] not in [x["id"] for x in m]
    # un gestor los ve (para usarlos) pero no los puede cambiar
    client.post("/api/admin/usuarios/guardar", json={"usuario": "maria", "nombre": "María", "permisos": ["expedientes"], "clave": "temporal-123"})
    client.post("/api/admin/logout")
    client.post("/api/admin/login", json={"usuario": "maria", "clave": "temporal-123"})
    client.post("/api/admin/cuenta/clave", json={"actual": "temporal-123", "nueva": "maria-clave-1"})
    assert client.get("/api/admin/mensajes").json["ok"]
    assert client.post("/api/admin/mensajes/guardar", json={"servicio": "", "paso": 1, "texto": "Hola hola"}).status_code == 403


def test_pagos_por_confirmar(client, monkeypatch):
    from werkzeug.security import generate_password_hash
    monkeypatch.setenv("TF_ADMIN_HASH", generate_password_hash("clave-del-dueno"))
    codigo = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "whatsapp": "+1 809 555 1234", "email": "ana@correo.com",
                                                 "pais": "us", "servicio": "certificacion_solteria", "acepta": True}).json["codigo"]
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    for u, perms in (("gestor", ["expedientes", "pagos"]), ("conta", ["pagos", "resumen", "validar_pagos"])):
        client.post("/api/admin/usuarios/guardar", json={"usuario": u, "nombre": u.title(), "permisos": perms, "clave": "temporal-123"})
    def entrar(u):
        client.post("/api/admin/logout")
        if client.post("/api/admin/login", json={"usuario": u, "clave": u + "-clave-1"}).status_code != 200:
            client.post("/api/admin/login", json={"usuario": u, "clave": "temporal-123"})
            client.post("/api/admin/cuenta/clave", json={"actual": "temporal-123", "nueva": u + "-clave-1"})
    # el gestor registra un pago: queda por confirmar y no cuenta como cobrado
    entrar("gestor")
    r = client.post("/api/admin/pago", json={"codigo": codigo, "tipo": "anticipo", "monto": 1000, "metodo": "Transferencia"})
    assert r.json["estado"] == "pendiente"
    e = r.json["expediente"]
    assert e["pagado"] == 0 and e["por_confirmar"] == 1000 and e["pagos"][0]["registrado_por"] == "gestor"
    pid = e["pagos"][0]["id"]
    assert client.get(f"/api/rastreo/{codigo}").json["pago"] == "por_confirmar"   # el cliente ve «pendiente por confirmar»
    assert client.post("/api/admin/pago/validar", json={"codigo": codigo, "id": pid, "accion": "confirmar"}).status_code == 403
    # contabilidad recibe el aviso, rechaza sin motivo (no se puede) y luego confirma
    entrar("conta")
    av = client.get("/api/admin/avisos").json
    assert av["avisos"][0]["tipo"] == "pago" and "1,000.00" in av["avisos"][0]["titulo"]
    assert client.post("/api/admin/pago/validar", json={"codigo": codigo, "id": pid, "accion": "rechazar"}).status_code == 400
    r = client.post("/api/admin/pago/validar", json={"codigo": codigo, "id": pid, "accion": "confirmar"})
    assert r.json["expediente"]["pagado"] == 1000 and r.json["expediente"]["pagos"][0]["validado_por"] == "conta"
    assert client.get(f"/api/rastreo/{codigo}").json["pago"] == "confirmado"
    # un pago rechazado no cuenta; el gestor no puede borrar un pago confirmado
    entrar("gestor")
    pid2 = client.post("/api/admin/pago", json={"codigo": codigo, "tipo": "saldo", "monto": 1120, "metodo": "Zelle"}).json["expediente"]["pagos"][-1]["id"]
    assert client.post("/api/admin/pago/quitar", json={"codigo": codigo, "id": pid}).status_code == 403
    entrar("conta")
    r = client.post("/api/admin/pago/validar", json={"codigo": codigo, "id": pid2, "accion": "rechazar", "motivo": "No llegó la transferencia"})
    e = r.json["expediente"]
    assert e["pagado"] == 1000 and e["por_confirmar"] == 0 and e["pagos"][-1]["estado"] == "rechazado"
    # el gestor (sin permiso de confirmar) no ve avisos de pagos; lo que registra el administrador queda confirmado
    entrar("gestor")
    assert all(a["tipo"] != "pago" for a in client.get("/api/admin/avisos").json["avisos"])
    client.post("/api/admin/logout")
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    assert client.post("/api/admin/pago", json={"codigo": codigo, "tipo": "otro", "monto": 50, "metodo": "Efectivo"}).json["estado"] == "confirmado"


def test_push_cifrado_y_firma_estandar():
    """El mensaje cifrado se puede descifrar como lo hace el navegador (RFC 8291) y la firma VAPID es válida (RFC 8292)."""
    import base64, json as _json, struct
    import push
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    # «el teléfono»: sus claves
    tel = ec.generate_private_key(ec.SECP256R1())
    tel_pub = tel.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    auth = b"0123456789abcdef"
    cuerpo = push.cifrar(b'{"titulo":"Hola"}', push.b64u(tel_pub), push.b64u(auth))
    salt, rs, idlen = cuerpo[:16], struct.unpack("!I", cuerpo[16:20])[0], cuerpo[20]
    as_pub, cifrado = cuerpo[21:21 + idlen], cuerpo[21 + idlen:]
    assert rs == 4096 and idlen == 65
    compartido = tel.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_pub))
    h = lambda s, k, i, n: HKDF(algorithm=hashes.SHA256(), length=n, salt=s, info=i).derive(k)
    ikm = h(auth, compartido, b"WebPush: info\x00" + tel_pub + as_pub, 32)
    claro = AESGCM(h(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)).decrypt(h(salt, ikm, b"Content-Encoding: nonce\x00", 12), cifrado, None)
    assert claro == b'{"titulo":"Hola"}\x02'
    # firma VAPID
    privada, publica = push.nuevas_claves()
    cab = push.firma_vapid("https://fcm.googleapis.com/fcm/send/abc", privada, "mailto:a@b.com")
    t_, k_ = cab.removeprefix("vapid t=").split(", k=")
    assert k_ == publica
    h64, d64, f64 = t_.split(".")
    assert _json.loads(push.de_b64u(d64))["aud"] == "https://fcm.googleapis.com"
    firma = push.de_b64u(f64)
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), push.de_b64u(publica))
    pub.verify(encode_dss_signature(int.from_bytes(firma[:32], "big"), int.from_bytes(firma[32:], "big")), f"{h64}.{d64}".encode(), ec.ECDSA(hashes.SHA256()))


def test_comprobante_del_cliente_y_notificaciones(client, monkeypatch, tmp_path):
    import io
    import push
    from werkzeug.security import generate_password_hash
    monkeypatch.setenv("TF_ADMIN_HASH", generate_password_hash("clave-del-dueno"))
    monkeypatch.setenv("TF_ARCHIVOS", str(tmp_path / "archivos"))
    monkeypatch.setenv("TF_CORREO_SINCRONO", "1")
    enviados = []
    monkeypatch.setattr(push, "_post", lambda endpoint, cuerpo, aut: enviados.append(endpoint) or (410 if "vencida" in endpoint else 201))
    codigo = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "whatsapp": "+1 809 555 1234", "email": "ana@correo.com",
                                                 "pais": "us", "servicio": "certificacion_solteria", "acepta": True}).json["codigo"]
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    # el administrador activa las notificaciones en dos dispositivos (uno ya no existe)
    clave = client.get("/api/admin/push/clave").json
    assert clave["disponible"] and len(push.de_b64u(clave["clave"])) == 65
    tel = __import__("cryptography.hazmat.primitives.asymmetric.ec", fromlist=["ec"])
    from cryptography.hazmat.primitives import serialization
    k = tel.generate_private_key(tel.SECP256R1()).public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    for ep in ("https://fcm.googleapis.com/fcm/send/telefono", "https://fcm.googleapis.com/fcm/send/vencida"):
        assert client.post("/api/admin/push/suscribir", json={"endpoint": ep, "keys": {"p256dh": push.b64u(k), "auth": push.b64u(b"0123456789abcdef")}}).json["ok"]
    assert client.post("/api/admin/push/probar").json["dispositivos"] == 2
    assert client.post("/api/admin/push/probar").json["dispositivos"] == 1   # la vencida se borró sola
    # el cliente sube su comprobante desde Rastrear (con los últimos 4 de su WhatsApp)
    pdf = b"%PDF-1.4\n%%EOF\n"
    malo = client.post(f"/api/rastreo/{codigo}/comprobante", data={"dato": "0000", "monto": "1060", "metodo": "Zelle",
                       "archivo": (io.BytesIO(pdf), "zelle.pdf")}, content_type="multipart/form-data")
    assert malo.status_code == 403
    n = len(enviados)
    r = client.post(f"/api/rastreo/{codigo}/comprobante", data={"dato": "1234", "monto": "1060", "metodo": "Zelle", "nota": "Desde la cuenta de mi hermano",
                    "archivo": (io.BytesIO(pdf), "zelle.pdf")}, content_type="multipart/form-data")
    assert r.status_code == 201 and len(enviados) == n + 1          # notificación al teléfono del administrador
    assert client.get(f"/api/rastreo/{codigo}").json["pago"] == "por_confirmar"
    exp = next(e for e in client.get("/api/admin/expedientes").json["expedientes"] if e["codigo"] == codigo)
    comp = exp["comprobantes"][0]
    assert comp["monto"] == 1060 and comp["estado"] == "nuevo" and comp["nota"].startswith("Desde")
    assert client.get(f"/api/admin/comprobante/{comp['id']}").data == pdf
    assert client.get("/api/admin/avisos").json["avisos"][0]["tipo"] == "comprobante"
    # se registra el pago con ese comprobante (doble evidencia) y queda enlazado
    e = client.post("/api/admin/pago", json={"codigo": codigo, "tipo": "anticipo", "monto": 1060, "metodo": "Zelle", "comprobante_id": comp["id"]}).json["expediente"]
    assert e["pagos"][0]["comprobante_id"] == comp["id"] and e["comprobantes"][0]["estado"] == "usado" and e["pagado"] == 1060
    assert client.get(f"/api/rastreo/{codigo}").json["pago"] == "confirmado"
    # otro comprobante se puede descartar con motivo
    client.post(f"/api/rastreo/{codigo}/comprobante", data={"dato": "ana@correo.com", "monto": "50", "metodo": "Otro",
                "archivo": (io.BytesIO(pdf), "otro.pdf")}, content_type="multipart/form-data")
    exp = next(e for e in client.get("/api/admin/expedientes").json["expedientes"] if e["codigo"] == codigo)
    c2 = exp["comprobantes"][-1]["id"]
    assert client.post("/api/admin/comprobante/descartar", json={"codigo": codigo, "id": c2}).status_code == 400
    e = client.post("/api/admin/comprobante/descartar", json={"codigo": codigo, "id": c2, "motivo": "Es de otro cliente"}).json["expediente"]
    assert e["comprobantes"][-1]["estado"] == "descartado"


def test_documentos_recibidos_avisos_y_registro(client, monkeypatch, tmp_path):
    import io
    import push
    from werkzeug.security import generate_password_hash
    monkeypatch.setenv("TF_ADMIN_HASH", generate_password_hash("clave-del-dueno"))
    monkeypatch.setenv("TF_ARCHIVOS", str(tmp_path / "archivos"))
    monkeypatch.setenv("TF_CORREO_SINCRONO", "1")
    enviados = []
    monkeypatch.setattr(push, "_post", lambda endpoint, cuerpo, aut: enviados.append(endpoint) or 201)
    codigo = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "whatsapp": "+1 809 555 1234", "email": "ana@correo.com",
                                                 "pais": "us", "servicio": "certificacion_solteria", "acepta": True}).json["codigo"]
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    for u, perms in (("gestor", ["expedientes"]), ("conta", ["pagos", "validar_pagos", "resumen"])):
        client.post("/api/admin/usuarios/guardar", json={"usuario": u, "nombre": u.title(), "permisos": perms, "clave": "temporal-123",
                                                          "correo": f"{u}@ejemplo.com"})
    def entrar(u, clave="temporal-123"):
        client.post("/api/admin/logout")
        if client.post("/api/admin/login", json={"usuario": u, "clave": u + "-clave-1"}).status_code != 200:
            client.post("/api/admin/login", json={"usuario": u, "clave": clave})
            client.post("/api/admin/cuenta/clave", json={"actual": clave, "nueva": u + "-clave-1"})
    # el administrador activa notificaciones en su teléfono
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    k = push.b64u(ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    client.post("/api/admin/push/suscribir", json={"endpoint": "https://fcm.googleapis.com/fcm/send/dueno",
                                                   "keys": {"p256dh": k, "auth": push.b64u(b"0123456789abcdef")}})
    # el gestor sube un documento recibido del cliente: lo ve el equipo, no el cliente
    entrar("gestor")
    n = len(enviados)
    r = client.post("/api/admin/archivo", data={"codigo": codigo, "clase": "recibido", "archivo": (io.BytesIO(PDF), "cedula.pdf")},
                    content_type="multipart/form-data")
    assert r.status_code == 201
    e = r.json["expediente"]
    assert e["recibidos"][0]["nombre"] == "cedula.pdf" and e["recibidos"][0]["estado"] == "nuevo" and e["archivos"] == []
    assert len(enviados) == n + 1                                  # le avisó a quien confirma (el dueño)
    rid = e["recibidos"][0]["id"]
    assert client.get(f"/api/rastreo/{codigo}").json["archivos"] == 0   # el cliente no ve los recibidos
    assert client.post(f"/api/rastreo/{codigo}/archivos", json={"dato": "1234"}).json["archivos"] == []
    assert client.post("/api/admin/archivo/validar", json={"codigo": codigo, "id": rid, "accion": "validar"}).status_code == 403
    # avisar al equipo desde el expediente
    assert client.post("/api/admin/avisar-equipo", json={"codigo": codigo, "texto": "Falta el acta apostillada", "para": "todos"}).json["ok"]
    assert client.post("/api/admin/avisar-equipo", json={"codigo": codigo, "texto": "x"}).status_code == 400
    # contabilidad también puede subir recibidos y es quien valida
    entrar("conta")
    assert client.post("/api/admin/archivo", data={"codigo": codigo, "clase": "recibido", "archivo": (io.BytesIO(PDF), "transferencia.pdf")},
                       content_type="multipart/form-data").status_code == 201
    assert client.post("/api/admin/archivo", data={"codigo": codigo, "clase": "entrega", "archivo": (io.BytesIO(PDF), "acta.pdf")},
                       content_type="multipart/form-data").status_code == 403   # entregar al cliente es de gestores
    assert client.post("/api/admin/archivo/validar", json={"codigo": codigo, "id": rid, "accion": "rechazar"}).status_code == 400
    e = client.post("/api/admin/archivo/validar", json={"codigo": codigo, "id": rid, "accion": "validar"}).json["expediente"]
    assert e["recibidos"][0]["estado"] == "validado" and e["recibidos"][0]["revisado_por"] == "conta"
    e = client.post("/api/admin/archivo/validar", json={"codigo": codigo, "id": e["recibidos"][1]["id"], "accion": "rechazar",
                                                         "motivo": "Se ve borroso"}).json["expediente"]
    assert e["recibidos"][1]["estado"] == "rechazado" and e["recibidos"][1]["motivo"] == "Se ve borroso"
    # un cambio de estado avisa al administrador principal, con quién lo hizo
    entrar("gestor")
    n = len(enviados)
    tid = client.get("/api/admin/expedientes").json["expedientes"][0]["tramites"][0]["id"]
    client.post("/api/admin/estado", json={"codigo": codigo, "tramite": tid, "paso": 3, "detalle": "Depositado en la JCE"})
    assert len(enviados) == n + 1
    assert client.get("/api/admin/registro").status_code == 403    # el gestor no ve el registro
    # el administrador principal: avisos de estado y registro con búsqueda
    client.post("/api/admin/logout")
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    av = client.get("/api/admin/avisos").json["avisos"]
    assert av[0]["tipo"] == "estado" and av[0]["titulo"].startswith("Gestor movió un trámite")
    assert {"recibido", "equipo"} <= {a["tipo"] for a in av}
    reg = client.get("/api/admin/registro").json
    assert reg["nombres"]["gestor"] == "Gestor" and "gestor" in reg["usuarios"]
    assert [x for x in reg["registro"] if x["accion"].startswith("Movió a paso 3")][0]["usuario"] == "gestor"
    solo = client.get("/api/admin/registro?estados=1&usuario=gestor").json["registro"]
    assert solo and all(x["usuario"] == "gestor" and x["accion"].startswith("Movió a paso") for x in solo)
    assert all("cedula" in (x["detalle"] or "") + x["accion"] for x in client.get("/api/admin/registro?q=cedula").json["registro"])
    n = len(enviados)   # sus propios cambios no se los notifica a sí mismo
    client.post("/api/admin/estado", json={"codigo": codigo, "tramite": tid, "paso": 4, "detalle": "Listo"})
    assert len(enviados) == n


def test_pago_rechazado_y_por_whatsapp(client, monkeypatch, tmp_path):
    import io
    from werkzeug.security import generate_password_hash
    monkeypatch.setenv("TF_ADMIN_HASH", generate_password_hash("clave-del-dueno"))
    monkeypatch.setenv("TF_ARCHIVOS", str(tmp_path / "archivos"))
    codigo = client.post("/api/solicitud", json={"nombre": "Ana Rodríguez", "whatsapp": "+1 809 555 1234", "email": "ana@correo.com",
                                                 "pais": "us", "servicio": "certificacion_solteria", "acepta": True}).json["codigo"]
    # el cliente avisa que paga por WhatsApp
    r = client.post(f"/api/rastreo/{codigo}/pago-whatsapp")
    assert r.json["ok"]
    assert client.post(f"/api/rastreo/{codigo}/pago-whatsapp").json["ok"]       # repetirlo no molesta
    assert client.post("/api/rastreo/RD-NOEXIST/pago-whatsapp").status_code == 404
    client.post("/api/admin/login", json={"usuario": "admin", "clave": "clave-del-dueno"})
    e = next(x for x in client.get("/api/admin/expedientes").json["expedientes"] if x["codigo"] == codigo)
    assert e["pago_wa"] and len([a for a in client.get("/api/admin/avisos").json["avisos"] if "WhatsApp" in a["titulo"]]) == 1
    # el cliente sube un comprobante y se lo descartan: lo ve en rojo, con el motivo
    client.post(f"/api/rastreo/{codigo}/comprobante", data={"dato": "1234", "monto": "1060", "metodo": "Transferencia",
                "archivo": (io.BytesIO(PDF), "borroso.pdf")}, content_type="multipart/form-data")
    assert client.get(f"/api/rastreo/{codigo}").json["pago"] == "por_confirmar"
    cid = next(x for x in client.get("/api/admin/expedientes").json["expedientes"] if x["codigo"] == codigo)["comprobantes"][0]["id"]
    client.post("/api/admin/comprobante/descartar", json={"codigo": codigo, "id": cid, "motivo": "No se lee el monto"})
    v = client.get(f"/api/rastreo/{codigo}").json
    assert v["pago"] == "rechazado" and v["pago_motivo"] == "No se lee el monto"
    # vuelve a enviarlo: otra vez en revisión
    client.post(f"/api/rastreo/{codigo}/comprobante", data={"dato": "1234", "monto": "1060", "metodo": "Transferencia",
                "archivo": (io.BytesIO(PDF), "claro.pdf")}, content_type="multipart/form-data")
    assert client.get(f"/api/rastreo/{codigo}").json["pago"] == "por_confirmar"
    # el equipo registra el pago indicando que llegó por WhatsApp
    e = client.post("/api/admin/pago", json={"codigo": codigo, "tipo": "anticipo", "monto": 1060, "metodo": "Transferencia",
                                              "whatsapp": True}).json["expediente"]
    assert e["pagos"][0]["via_whatsapp"] == 1
    assert client.get(f"/api/rastreo/{codigo}").json["pago"] == "por_confirmar"   # queda el otro comprobante sin revisar
    cid2 = e["comprobantes"][-1]["id"]
    client.post("/api/admin/comprobante/descartar", json={"codigo": codigo, "id": cid2, "motivo": "Duplicado", "avisar": False})
    v = client.get(f"/api/rastreo/{codigo}").json
    assert v["pago"] == "confirmado" and v["pago_motivo"] == ""   # el pago bueno es posterior al rechazo
    # y un pago rechazado también se le avisa al cliente
    pid = e["pagos"][0]["id"]
    client.post("/api/admin/pago/validar", json={"codigo": codigo, "id": pid, "accion": "rechazar", "motivo": "No llegó"})
    v = client.get(f"/api/rastreo/{codigo}").json
    assert v["pago"] == "rechazado" and v["pago_motivo"] == "No llegó"
