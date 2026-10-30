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
CORREO="${2:-Tramitafacilrd@gmail.com}"
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
avisar_buscadores() {
  # IndexNow: avisa a Bing, Yandex, Seznam y Naver de todas las páginas del sitemap (Google se avisa con Search Console)
  local urls
  urls="$(grep -o '<loc>[^<]*</loc>' "$APP/sitemap.xml" | sed 's/<[^>]*>//g' | sed 's/&amp;/\&/g' | awk '{printf "%s\"%s\"", (NR>1?",":""), $0}')"
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST https://api.indexnow.org/IndexNow \
    -H 'Content-Type: application/json; charset=utf-8' \
    -d "{\"host\":\"$DOMINIO\",\"key\":\"33200d87b13a122cdb2087cad4e581ff\",\"keyLocation\":\"https://$DOMINIO/33200d87b13a122cdb2087cad4e581ff.txt\",\"urlList\":[$urls]}" || echo "sin conexión"
}

case "${1:-ayuda}" in
  arrancar|reiniciar) arrancar && echo "TramitaFácil reiniciado." ;;
  actualizar)
    # Trae lo último de GitHub y vuelve a correr el instalador (no cambia la contraseña ni borra datos)
    cd "$APP" && git checkout -- sitemap.xml robots.txt && git pull --ff-only
    exec bash "$APP/tools/instalar_docker.sh" "$DOMINIO" "$CORREO" ;;
  pausar)
    sed -i '/^TF_PAUSA=/d' "$ENVF" && echo "TF_PAUSA=1" >> "$ENVF"
    arrancar && echo "Página en pausa: los visitantes ven \"Volvemos pronto\". El panel /admin sigue funcionando. Para volver: tramita reanudar" ;;
  reanudar)
    sed -i '/^TF_PAUSA=/d' "$ENVF"
    arrancar && echo "Página de nuevo en servicio." ;;
  clave)
    read -r -s -p "Nueva contraseña del panel (mínimo 8 caracteres): " c1; echo
    read -r -s -p "Repítela: " c2; echo
    [ "$c1" = "$c2" ] || { echo "No coinciden."; exit 1; }
    [ "${#c1}" -ge 8 ] || { echo "Debe tener al menos 8 caracteres."; exit 1; }
    h="$(docker run --rm -e C="$c1" tramitafacil:latest python -c 'import os; from werkzeug.security import generate_password_hash as g; print(g(os.environ["C"]))')"
    sed -i '/^TF_ADMIN_HASH=/d' "$ENVF" && echo "TF_ADMIN_HASH=$h" >> "$ENVF"
    arrancar && echo "Contraseña cambiada. Entra en https://$DOMINIO/admin con el usuario: admin" ;;
  correo)
    # Activa los correos automáticos (al cliente cuando cambia el estado y al equipo cuando llega una solicitud)
    if [ "${2:-}" = "prueba" ]; then m correo_prueba "${3:-$CORREO}"; exit; fi
    if [ "${2:-}" = "editar" ]; then ${EDITOR:-nano} "$ENVF" && arrancar && echo "Listo."; exit; fi
    echo "Datos del correo que enviará los avisos (los encuentras en tu proveedor de correo)."
    echo "  Hostinger: smtp.hostinger.com, puerto 465 · Gmail: smtp.gmail.com, puerto 465 (con contraseña de aplicación)"
    read -r -p "Servidor SMTP [smtp.hostinger.com]: " h; h="${h:-smtp.hostinger.com}"
    read -r -p "Puerto [465]: " pu; pu="${pu:-465}"
    read -r -p "Correo que envía (usuario), p. ej. info@$DOMINIO: " u
    read -r -s -p "Contraseña de ese correo: " c; echo
    [ -n "$u" ] && [ -n "$c" ] || { echo "Faltan datos."; exit 1; }
    sed -i '/^#\?SMTP_HOST=/d;/^#\?SMTP_PORT=/d;/^#\?SMTP_USER=/d;/^#\?SMTP_PASS=/d;/^#\?SMTP_FROM=/d;/^TF_SITIO=/d' "$ENVF"
    printf 'SMTP_HOST=%s\nSMTP_PORT=%s\nSMTP_USER=%s\nSMTP_PASS=%s\nTF_SITIO=https://%s\n' "$h" "$pu" "$u" "$c" "$DOMINIO" >> "$ENVF"
    arrancar && sleep 3
    echo "Enviando un correo de prueba a $CORREO…"
    m correo_prueba "$CORREO" || true ;;
  solicitudes) shift; m solicitudes "$@" ;;
  estado) shift; m estado "$@" ;;
  usuarios) m usuarios ;;
  respaldo)
    mkdir -p /var/backups/tramitafacil
    docker exec "$NOMBRE" python -c "import sqlite3; s=sqlite3.connect('/datos/tramitafacil.db'); d=sqlite3.connect('/datos/respaldo.db'); s.backup(d); d.close()"
    mv "$DATOS/respaldo.db" "/var/backups/tramitafacil/tramitafacil-$(date +%F).db"
    find /var/backups/tramitafacil -name '*.db' -mtime +30 -delete
    ls -1 /var/backups/tramitafacil | tail -n 3 ;;
  logs) docker logs --tail 80 "$NOMBRE" ;;
  buscadores) echo "Avisando a los buscadores (IndexNow)… respuesta: $(avisar_buscadores)  (200 o 202 = recibido)" ;;
  *) cat <<AYUDA
Comandos de TramitaFácil RD (Docker):
  tramita pausar         Poner la página en pausa ("Volvemos pronto")
  tramita reanudar       Volver a poner la página en servicio
  tramita actualizar     Traer los últimos cambios de GitHub
  tramita clave          Cambiar la contraseña del usuario «admin» del panel (también sirve si la olvidas)
  tramita usuarios       Ver los usuarios del panel y sus permisos
  tramita correo         Activar los correos automáticos (tramita correo prueba tu@correo.com para probar)
  tramita solicitudes    Ver las últimas solicitudes
  tramita respaldo       Hacer un respaldo ahora
  tramita buscadores     Avisar a Bing y otros buscadores de las páginas nuevas
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
echo "  Panel:   https://$DOMINIO/admin   (usuario: admin)"
[ -n "$CLAVE_PANEL" ] && printf '  Contraseña de admin: \033[1;33m%s\033[0m  (anótala; cámbiala con: tramita clave)\n' "$CLAVE_PANEL"
echo "  Ayuda:   tramita ayuda"
( sleep 60; /usr/local/bin/tramita buscadores >/dev/null 2>&1 ) &
