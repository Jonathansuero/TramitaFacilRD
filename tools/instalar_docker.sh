#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Instala TramitaFácil RD en un VPS que YA usa Docker con nginx-proxy + acme-companion.
# No toca las otras aplicaciones: crea un contenedor más y nginx-proxy le pone el dominio y HTTPS.
#
# Uso (como root):
#   curl -fsSL https://raw.githubusercontent.com/Jonathansuero/TramitaFacilRD/main/tools/instalar_docker.sh | bash -s tramitafacilrd.com tucorreo@ejemplo.com
# ---------------------------------------------------------------------------
set -euo pipefail
DOMINIO="${1:-tramitafacilrd.com}"
CORREO="${2:-jonathansuero24@gmail.com}"
APP=/opt/tramitafacil
DATOS=/opt/tramitafacil-datos
ENVF=/etc/tramitafacil-docker.env
NOMBRE=tramitafacil
paso() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root."; exit 1; }
command -v docker >/dev/null || { echo "Este VPS no tiene Docker. Usa tools/instalar_vps.sh"; exit 1; }

paso "1/5 Buscando nginx-proxy (el que reparte los dominios)"
PROXY="$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /nginx-proxy/ {print $1; exit}')"
[ -n "$PROXY" ] || { echo "No encontré un contenedor nginx-proxy funcionando."; exit 1; }
RED="$(docker inspect "$PROXY" -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')"
echo "nginx-proxy: $PROXY  ·  red: $RED"
for c in $(docker ps -q); do
  if docker inspect "$c" -f '{{range .Config.Env}}{{println .}}{{end}}' | grep -qE "^VIRTUAL_HOST=.*(^|[=,])(www\.)?$DOMINIO(,|$)"; then
    n="$(docker inspect "$c" -f '{{.Name}}' | tr -d /)"
    [ "$n" = "$NOMBRE" ] || { echo "OJO: el contenedor $n ya usa $DOMINIO. Quítaselo antes de seguir."; exit 1; }
  fi
done

paso "2/5 Descargando la página desde GitHub"
command -v git >/dev/null || { apt-get update -y && apt-get install -y git; }
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only; else git clone https://github.com/Jonathansuero/TramitaFacilRD.git "$APP"; fi
sed -i "s/TU-DOMINIO\.com/$DOMINIO/g" "$APP/sitemap.xml" "$APP/robots.txt"

paso "3/5 Construyendo la imagen (1-2 minutos)"
docker build -q -t tramitafacil:latest "$APP" >/dev/null
mkdir -p "$DATOS" && chown 10001:10001 "$DATOS"

paso "4/5 Configuración y contraseña del panel"
CLAVE_PANEL=""
if [ ! -f "$ENVF" ]; then
  CLAVE_PANEL="$(docker run --rm tramitafacil:latest python -c 'import secrets; print(secrets.token_urlsafe(9))')"
  HASH="$(docker run --rm -e C="$CLAVE_PANEL" tramitafacil:latest python -c 'import os; from werkzeug.security import generate_password_hash as g; print(g(os.environ["C"]))')"
  SECRETO="$(docker run --rm tramitafacil:latest python -c 'import secrets; print(secrets.token_hex(32))')"
  cat > "$ENVF" <<EOF
TF_SECRET_KEY=$SECRETO
TF_ADMIN_HASH=$HASH
TF_COOKIE_SEGURA=1
TF_TASAS_EN_VIVO=1
NOTIFY_TO=$CORREO
# Aviso por correo (opcional): quita el # y pon los datos de tu correo, luego: tramita reiniciar
#SMTP_HOST=smtp.hostinger.com
#SMTP_PORT=587
#SMTP_USER=info@$DOMINIO
#SMTP_PASS=tu-contraseña
EOF
  chmod 600 "$ENVF"
fi
cat > /etc/tramitafacil-docker.conf <<EOF
APP=$APP
DATOS=$DATOS
ENVF=$ENVF
NOMBRE=$NOMBRE
RED=$RED
DOMINIO=$DOMINIO
CORREO=$CORREO
EOF

# Comando de administración
cat > /usr/local/bin/tramita <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
. /etc/tramitafacil-docker.conf
arrancar() {
  docker rm -f "$NOMBRE" >/dev/null 2>&1 || true
  docker run -d --name "$NOMBRE" --restart unless-stopped --network "$RED" \
    --env-file "$ENVF" -v "$DATOS:/datos" \
    -e VIRTUAL_HOST="$DOMINIO,www.$DOMINIO" -e VIRTUAL_PORT=8000 \
    -e LETSENCRYPT_HOST="$DOMINIO,www.$DOMINIO" -e LETSENCRYPT_EMAIL="$CORREO" \
    tramitafacil:latest >/dev/null
}
m() { docker exec -it "$NOMBRE" python manage.py "$@"; }
case "${1:-ayuda}" in
  arrancar|reiniciar) arrancar && echo "TramitaFácil reiniciado." ;;
  actualizar)
    cd "$APP" && git checkout -- sitemap.xml robots.txt && git pull --ff-only
    sed -i "s/TU-DOMINIO\.com/$DOMINIO/g" sitemap.xml robots.txt
    docker build -q -t tramitafacil:latest "$APP" >/dev/null && arrancar && echo "Página actualizada desde GitHub." ;;
  clave)
    read -r -s -p "Nueva contraseña del panel (mínimo 8 caracteres): " c1; echo
    read -r -s -p "Repítela: " c2; echo
    [ "$c1" = "$c2" ] || { echo "No coinciden."; exit 1; }
    [ "${#c1}" -ge 8 ] || { echo "Debe tener al menos 8 caracteres."; exit 1; }
    h="$(docker run --rm -e C="$c1" tramitafacil:latest python -c 'import os; from werkzeug.security import generate_password_hash as g; print(g(os.environ["C"]))')"
    sed -i '/^TF_ADMIN_HASH=/d' "$ENVF" && echo "TF_ADMIN_HASH=$h" >> "$ENVF"
    arrancar && echo "Contraseña cambiada. Entra en https://$DOMINIO/admin" ;;
  correo) ${EDITOR:-nano} "$ENVF" && arrancar && echo "Listo." ;;
  solicitudes) shift; m solicitudes "$@" ;;
  estado) shift; m estado "$@" ;;
  respaldo)
    mkdir -p /var/backups/tramitafacil
    docker exec "$NOMBRE" python -c "import sqlite3; s=sqlite3.connect('/datos/tramitafacil.db'); d=sqlite3.connect('/datos/respaldo.db'); s.backup(d); d.close()"
    mv "$DATOS/respaldo.db" "/var/backups/tramitafacil/tramitafacil-$(date +%F).db"
    find /var/backups/tramitafacil -name '*.db' -mtime +30 -delete
    ls -1 /var/backups/tramitafacil | tail -n 3 ;;
  logs) docker logs --tail 80 "$NOMBRE" ;;
  *) cat <<AYUDA
Comandos de TramitaFácil RD (Docker):
  tramita actualizar     Traer los últimos cambios de GitHub
  tramita clave          Cambiar la contraseña del panel (/admin)
  tramita correo         Configurar el aviso por correo
  tramita solicitudes    Ver las últimas solicitudes
  tramita respaldo       Hacer un respaldo ahora
  tramita logs | reiniciar
AYUDA
  ;;
esac
EOF
chmod +x /usr/local/bin/tramita
printf '#!/bin/sh\n/usr/local/bin/tramita respaldo >/dev/null 2>&1\n' > /etc/cron.daily/tramitafacil-respaldo
chmod +x /etc/cron.daily/tramitafacil-respaldo

paso "5/5 Encendiendo TramitaFácil"
tramita arrancar >/dev/null
for i in $(seq 1 20); do
  docker exec "$NOMBRE" python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/salud',timeout=3)" >/dev/null 2>&1 && break
  sleep 2
done
if docker exec "$NOMBRE" python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/salud',timeout=3)" >/dev/null 2>&1; then
  printf '\n\033[1;32m✓ TramitaFácil RD está funcionando.\033[0m\n'
else
  printf '\n\033[1;31m✗ No respondió todavía. Revisa con: tramita logs\033[0m\n'
fi
echo "  El candado https tarda 1-3 minutos en aparecer (lo pide nginx-proxy solo)."
echo "  Página:  https://$DOMINIO"
echo "  Panel:   https://$DOMINIO/admin"
[ -n "$CLAVE_PANEL" ] && printf '  Contraseña del panel: \033[1;33m%s\033[0m  (anótala; cámbiala con: tramita clave)\n' "$CLAVE_PANEL"
echo "  Ayuda:   tramita ayuda"
