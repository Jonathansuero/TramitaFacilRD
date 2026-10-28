#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Instalador de TramitaFácil RD en un VPS con Ubuntu 22.04 / 24.04
#
# Uso (como root, dentro de la carpeta del proyecto):
#   git clone https://github.com/Jonathansuero/TramitaFacilRD.git /opt/tramitafacil
#   cd /opt/tramitafacil && bash tools/instalar_vps.sh tudominio.com tucorreo@ejemplo.com
#
# Deja funcionando: la página + API (Flask/gunicorn), Nginx, HTTPS gratis
# (Let's Encrypt), firewall, respaldo diario de la base de datos y el comando
# "tramita" para administrar todo.
# ---------------------------------------------------------------------------
set -euo pipefail

DOMINIO="${1:-}"
CORREO="${2:-}"
if [ -z "$DOMINIO" ] || [ -z "$CORREO" ]; then
  echo "Uso: bash tools/instalar_vps.sh tudominio.com tucorreo@ejemplo.com"
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta el instalador como root (o con sudo)."
  exit 1
fi
DOMINIO="${DOMINIO#http://}"; DOMINIO="${DOMINIO#https://}"; DOMINIO="${DOMINIO#www.}"; DOMINIO="${DOMINIO%%/*}"

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USUARIO=tramita
ENVF=/etc/tramitafacil.env
CONF=/etc/tramitafacil.conf
paso() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

paso "1/8 Instalando programas del sistema (tarda unos minutos)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-venv git nginx certbot python3-certbot-nginx ufw sqlite3 curl fail2ban unattended-upgrades
# Seguridad: bloquea intentos repetidos de entrar por SSH y aplica parches de seguridad solos
systemctl enable --now fail2ban >/dev/null 2>&1 || true
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

paso "2/8 Creando el usuario del servicio"
id -u "$USUARIO" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$USUARIO" --shell /usr/sbin/nologin "$USUARIO"
git config --system --add safe.directory "$APP" 2>/dev/null || true
printf 'APP=%s\nDOMINIO=%s\nCORREO=%s\nUSUARIO=%s\n' "$APP" "$DOMINIO" "$CORREO" "$USUARIO" > "$CONF"

paso "3/8 Poniendo tu dominio en sitemap.xml y robots.txt"
sed -i "s/TU-DOMINIO\.com/$DOMINIO/g" "$APP/sitemap.xml" "$APP/robots.txt"

paso "4/8 Instalando Python y la aplicación"
mkdir -p "$APP/instance"
[ -d "$APP/.venv" ] || python3 -m venv "$APP/.venv"
"$APP/.venv/bin/pip" install --quiet --upgrade pip
"$APP/.venv/bin/pip" install --quiet "Flask>=3.0,<4" "gunicorn>=22.0"
chown -R "$USUARIO:$USUARIO" "$APP"

if [ ! -f "$ENVF" ]; then
  cat > "$ENVF" <<EOF
# Configuración de TramitaFácil RD. Después de cambiar algo: tramita reiniciar
TF_DB_PATH=$APP/instance/tramitafacil.db
TF_TASAS_EN_VIVO=1

# Aviso por correo de cada solicitud nueva (opcional).
# Quita el # de las 4 líneas SMTP y pon los datos de tu correo de Hostinger.
#SMTP_HOST=smtp.hostinger.com
#SMTP_PORT=587
#SMTP_USER=info@$DOMINIO
#SMTP_PASS=tu-contraseña-del-correo
NOTIFY_TO=$CORREO
EOF
  chmod 600 "$ENVF"
fi

# Panel de administración (tudominio.com/admin.html): clave secreta de sesión y contraseña inicial
grep -q '^TF_SECRET_KEY=' "$ENVF" || echo "TF_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> "$ENVF"
CLAVE_PANEL=""
if ! grep -q '^TF_ADMIN_HASH=' "$ENVF"; then
  CLAVE_PANEL="$(python3 -c 'import secrets; print(secrets.token_urlsafe(9))')"
  HASH="$(printf '%s' "$CLAVE_PANEL" | "$APP/.venv/bin/python" -c 'import sys; from werkzeug.security import generate_password_hash as g; print(g(sys.stdin.read()))')"
  echo "TF_ADMIN_HASH='$HASH'" >> "$ENVF"
fi

paso "5/8 Creando el servicio que mantiene la página encendida"
cat > /etc/systemd/system/tramitafacil.service <<EOF
[Unit]
Description=TramitaFácil RD (página y API)
After=network.target

[Service]
User=$USUARIO
Group=$USUARIO
WorkingDirectory=$APP
EnvironmentFile=$ENVF
# 1 proceso con varios hilos: el límite anti-spam se comparte entre peticiones
ExecStart=$APP/.venv/bin/gunicorn app:app --bind 127.0.0.1:8000 --workers 1 --threads 8 --access-logfile -
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now tramitafacil
systemctl restart tramitafacil

paso "6/8 Configurando Nginx y el firewall"
cat > /etc/nginx/sites-available/tramitafacil <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMINIO www.$DOMINIO;
    client_max_body_size 64k;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/tramitafacil /etc/nginx/sites-enabled/tramitafacil
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

paso "7/8 Respaldo diario de la base de datos (se guardan 30 días)"
cat > /etc/cron.daily/tramitafacil-respaldo <<EOF
#!/bin/sh
DB=$APP/instance/tramitafacil.db
[ -f "\$DB" ] || exit 0
mkdir -p /var/backups/tramitafacil
sqlite3 "\$DB" ".backup /var/backups/tramitafacil/tramitafacil-\$(date +%F).db"
find /var/backups/tramitafacil -name '*.db' -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/tramitafacil-respaldo

# Comando de administración "tramita"
cat > /usr/local/bin/tramita <<'EOF'
#!/usr/bin/env bash
# Administración de TramitaFácil RD. Escribe "tramita ayuda" para ver las opciones.
set -euo pipefail
. /etc/tramitafacil.conf
py() { cd "$APP" && sudo -u "$USUARIO" "$APP/.venv/bin/python" manage.py "$@"; }
dominios() {
  local d="-d $DOMINIO"
  [ -n "$(getent ahostsv4 "www.$DOMINIO" 2>/dev/null)" ] && d="$d -d www.$DOMINIO"
  echo "$d"
}
case "${1:-ayuda}" in
  solicitudes) shift; py solicitudes "$@" ;;
  exportar)
    f="/root/solicitudes-$(date +%F).csv"
    py exportar "/tmp/solicitudes.csv" && mv /tmp/solicitudes.csv "$f" && echo "Archivo listo: $f" ;;
  estado) shift; py estado "$@" ;;
  precio) shift; py precio "$@" && systemctl restart tramitafacil ;;
  correo) ${EDITOR:-nano} /etc/tramitafacil.env && systemctl restart tramitafacil && echo "Listo, servicio reiniciado." ;;
  reiniciar) systemctl restart tramitafacil && echo "Servicio reiniciado." ;;
  estado-servidor) systemctl --no-pager status tramitafacil ;;
  logs) journalctl -u tramitafacil -n 80 --no-pager ;;
  ssl)
    certbot --nginx $(dominios) --non-interactive --agree-tos -m "$CORREO" --redirect
    grep -q '^TF_COOKIE_SEGURA=' /etc/tramitafacil.env || echo "TF_COOKIE_SEGURA=1" >> /etc/tramitafacil.env
    systemctl restart tramitafacil ;;
  clave)
    read -r -s -p "Nueva contraseña del panel (mínimo 8 caracteres): " c1; echo
    read -r -s -p "Repítela: " c2; echo
    [ "$c1" = "$c2" ] || { echo "No coinciden. Inténtalo de nuevo."; exit 1; }
    [ "${#c1}" -ge 8 ] || { echo "Debe tener al menos 8 caracteres."; exit 1; }
    h="$(printf '%s' "$c1" | "$APP/.venv/bin/python" -c 'import sys; from werkzeug.security import generate_password_hash as g; print(g(sys.stdin.read()))')"
    sed -i '/^TF_ADMIN_HASH=/d' /etc/tramitafacil.env
    echo "TF_ADMIN_HASH='$h'" >> /etc/tramitafacil.env
    grep -q '^TF_SECRET_KEY=' /etc/tramitafacil.env || echo "TF_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> /etc/tramitafacil.env
    systemctl restart tramitafacil && echo "Contraseña cambiada. Entra en https://$DOMINIO/admin.html" ;;
  respaldo) /etc/cron.daily/tramitafacil-respaldo && ls -1 /var/backups/tramitafacil | tail -n 3 ;;
  actualizar)
    cd "$APP"
    sudo -u "$USUARIO" git checkout -- sitemap.xml robots.txt
    sudo -u "$USUARIO" git pull --ff-only
    sed -i "s/TU-DOMINIO\.com/$DOMINIO/g" sitemap.xml robots.txt
    systemctl restart tramitafacil && echo "Página actualizada desde GitHub." ;;
  *)
    cat <<AYUDA
Comandos de TramitaFácil RD:
  tramita solicitudes [--limite 20]       Ver las últimas solicitudes
  tramita exportar                        Crear un CSV (Excel) con todas las solicitudes
  tramita estado RD-1234 3 "Detalle"      Actualizar el rastreo (pasos 1 a 4)
  tramita precio <servicio> --honorario N Cambiar un precio
  tramita clave                           Cambiar la contraseña del panel (admin.html)
  tramita correo                          Configurar el aviso por correo
  tramita actualizar                      Traer los últimos cambios de GitHub
  tramita ssl                             Activar o renovar HTTPS
  tramita respaldo                        Hacer un respaldo ahora
  tramita logs | reiniciar | estado-servidor
AYUDA
    ;;
esac
EOF
chmod +x /usr/local/bin/tramita

paso "8/8 Activando HTTPS (candado verde)"
IP_VPS="$(curl -4 -s --max-time 8 https://api.ipify.org || true)"
IP_DNS="$(getent ahostsv4 "$DOMINIO" 2>/dev/null | awk 'NR==1{print $1}')"
if [ -n "$IP_VPS" ] && [ "$IP_VPS" = "$IP_DNS" ]; then
  tramita ssl || echo "No se pudo activar HTTPS todavía. Inténtalo más tarde con: tramita ssl"
else
  echo "Tu dominio todavía no apunta a este VPS (dominio: ${IP_DNS:-sin IP}, VPS: ${IP_VPS:-?})."
  echo "Cuando el DNS esté listo, escribe:  tramita ssl"
fi

sleep 1
if curl -s --max-time 5 http://127.0.0.1:8000/api/salud | grep -q '"ok"'; then
  printf '\n\033[1;32m✓ TramitaFácil RD está funcionando.\033[0m\n'
else
  printf '\n\033[1;31m✗ El servicio no respondió. Revisa con: tramita logs\033[0m\n'
fi
echo "  Página:   https://$DOMINIO"
echo "  Panel:    https://$DOMINIO/admin.html"
if [ -n "$CLAVE_PANEL" ]; then
  printf '  Contraseña del panel: \033[1;33m%s\033[0m  (anótala; cámbiala cuando quieras con: tramita clave)\n' "$CLAVE_PANEL"
fi
echo "  Ayuda:    tramita ayuda"
