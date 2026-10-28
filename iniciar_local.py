#!/usr/bin/env python3
"""
iniciar_local.py — Corre TramitaFácil RD en tu propia computadora (sin VPS).

    Windows:      doble clic en  INICIAR-WINDOWS.bat
    Mac:          doble clic en  INICIAR-MAC.command
    Linux / otro: python3 iniciar_local.py

Opciones:
    --red        Permite abrirla desde otros equipos de tu misma red (celular, otra PC)
    --puerto N   Usar otro puerto (por defecto 8000; en Mac el 5000 lo ocupa AirPlay)
    --clave      Cambiar la contraseña del panel de administración

La primera vez crea un entorno de Python en la carpeta .venv e instala Flask.
Página: http://127.0.0.1:8000 · Panel: http://127.0.0.1:8000/admin · Clave: 123456
Las solicitudes se guardan en instance/tramitafacil.db (haz copia de esa carpeta).
"""
from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
VENV = RAIZ / ".venv"
INSTANCIA = RAIZ / "instance"
CONFIG = INSTANCIA / "panel_local.json"


def python_venv() -> Path:
    return VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def preparar_entorno() -> None:
    """Crea .venv con Flask y vuelve a ejecutar este script dentro de él."""
    if sys.version_info < (3, 9):
        sys.exit("Necesitas Python 3.9 o más nuevo. Descárgalo en https://www.python.org/downloads/")
    if Path(sys.prefix).resolve() == VENV.resolve():
        return  # ya estamos dentro del entorno
    if not python_venv().exists():
        print("→ Preparando el entorno (solo la primera vez)…")
        import venv
        venv.create(VENV, with_pip=True, system_site_packages=True)
    py = str(python_venv())
    if subprocess.run([py, "-c", "import flask"], capture_output=True).returncode != 0:
        print("→ Instalando Flask…")
        r = subprocess.run([py, "-m", "pip", "install", "--disable-pip-version-check", "-q", "Flask>=3.0,<4"])
        if r.returncode != 0:
            sys.exit("No se pudo instalar Flask. Revisa tu conexión a internet e inténtalo de nuevo.")
    sys.exit(subprocess.call([py, str(Path(__file__).resolve()), *sys.argv[1:]]))


def pedir_clave() -> str:
    from getpass import getpass
    clave = os.environ.get("TF_CLAVE_INICIAL", "")
    while len(clave) < 6:
        clave = getpass("Crea la contraseña del panel (mínimo 6 caracteres): ")
        if len(clave) < 6:
            print("  Muy corta, intenta otra.")
            continue
        if getpass("Repítela: ") != clave:
            print("  No coinciden, intenta de nuevo.")
            clave = ""
    return clave


CLAVE_LOCAL = "123456"   # contraseña del panel en esta computadora (cámbiala con --clave)


def configuracion(cambiar_clave: bool) -> dict:
    from werkzeug.security import generate_password_hash
    INSTANCIA.mkdir(exist_ok=True)
    cfg = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    if cambiar_clave:
        print("\nPanel de administración (/admin)")
        try:
            clave = pedir_clave()
        except (EOFError, OSError):
            sys.exit("No se pudo leer la contraseña. Ejecuta el comando desde la Terminal.")
        cfg["admin_hash"], cfg["clave_personal"] = generate_password_hash(clave), True
        print("✓ Contraseña guardada.\n")
    elif not cfg.get("clave_personal"):
        # Sin contraseña propia: se usa la del panel local (123456)
        cfg["admin_hash"] = generate_password_hash(CLAVE_LOCAL)
    cfg.setdefault("secret_key", secrets.token_hex(32))
    CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return cfg


def puerto_libre(preferido: int) -> int:
    """Devuelve el primer puerto libre desde el preferido (en Mac, AirPlay ocupa el 5000)."""
    for p in range(preferido, preferido + 20):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("0.0.0.0", p))
            return p
        except OSError:
            continue
    return preferido


def ip_local() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main() -> None:
    preparar_entorno()
    args = sys.argv[1:]
    en_red = "--red" in args
    puerto = puerto_libre(int(args[args.index("--puerto") + 1]) if "--puerto" in args else 8000)
    cfg = configuracion("--clave" in args)

    os.environ.setdefault("TF_DB_PATH", str(INSTANCIA / "tramitafacil.db"))
    os.environ["TF_ADMIN_HASH"] = cfg["admin_hash"]
    os.environ["TF_SECRET_KEY"] = cfg["secret_key"]
    os.environ.setdefault("TF_TASAS_EN_VIVO", "1")
    sys.path.insert(0, str(RAIZ))
    os.chdir(RAIZ)
    from app import app  # noqa: E402

    url = f"http://127.0.0.1:{puerto}"
    print("=" * 58)
    print("  TramitaFácil RD está funcionando en tu computadora")
    print(f"  Página:  {url}")
    print(f"  Panel:   {url}/admin")
    if not cfg.get("clave_personal"):
        print(f"  Clave:   {CLAVE_LOCAL}   (para cambiarla: python3 iniciar_local.py --clave)")
    if en_red:
        print(f"  Desde otro equipo de tu red:  http://{ip_local()}:{puerto}")
    print("  Datos:   instance/tramitafacil.db")
    print("  Para apagarla: cierra esta ventana o pulsa Ctrl+C")
    print("=" * 58)
    threading.Thread(target=lambda: (time.sleep(1.5), webbrowser.open(url)), daemon=True).start()
    app.run(host="0.0.0.0" if en_red else "127.0.0.1", port=puerto, debug=False, threaded=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nTramitaFácil RD se detuvo.")
