# TramitaFácil RD — Sitio web v3

Gestoría digital dominicana para **quienes viven en RD**, **dominicanos en EE.UU.**, **dominicanos en España y Europa** y **extranjeros**.

## App instalable (Android, iPhone y computadora)

El sitio se instala como una app desde el navegador, sin Play Store ni App Store:

| Qué | Cómo funciona |
|---|---|
| **Instalar** | Android / Chrome / Edge: botón **"Instalar app"** (encabezado y menú) y un aviso en el teléfono. iPhone: el aviso muestra los pasos (Compartir → *Agregar a inicio*). |
| **Modo app** | Al abrirla desde el ícono se ve a pantalla completa con una **barra inferior**: Inicio, Servicios, Cotizar, Rastrear y WhatsApp. Al mantener presionado el ícono aparecen accesos directos a Calculadoras, Rastrear e Iniciar trámite. |
| **Sin internet** | Las páginas, el catálogo y las calculadoras funcionan sin conexión (`sw.js`). Si se pide algo no guardado, aparece `offline.html`. Solicitudes y rastreo (`/api/`) siempre van en vivo. |
| **Actualizaciones** | `python manage.py build` pone una versión nueva en `sw.js`; los teléfonos muestran **"Hay una versión nueva · Actualizar"**. |

Archivos: `site.webmanifest`, `sw.js`, `offline.html`, `assets/img/app/` (íconos 192/512, adaptables y de iPhone).
**Requisito:** el sitio debe estar publicado con **HTTPS** (o en `localhost` para pruebas); sin HTTPS los navegadores no permiten instalarlo.

## Novedades v3

| Área | Qué hace |
|---|---|
| **Idiomas ES · EN · FR** | Selector siempre visible arriba (barra azul) y en el pie. Traduce toda la interfaz, los 39 servicios, requisitos, instituciones, países y preguntas frecuentes. El sitio abre en español; si el navegador del visitante está en inglés o francés, se le sugiere cambiar con un aviso discreto. Los mensajes de WhatsApp salen en el idioma elegido. |
| **4 páginas conectadas** | `index.html` (portada), `servicio.html?id=…` (una página por cada trámite: cómo funciona, requisitos, institución, precio con Express/envío, compartir, relacionados), `instituciones.html` (directorio con filtro y panel de detalle) y `diaspora.html` (guía por país). Todo enlaza entre sí: tarjeta → página del servicio → institución → otros trámites → solicitud con el trámite ya elegido. |
| **Instituciones** | Muro de 23 entidades (14 públicas, 5 privadas, 4 internacionales) con sellos de diseño propio por siglas y enlace a sus trámites. Cada servicio muestra ante qué entidad se gestiona. |
| **Dominicanos en cualquier país** | Mensaje en la barra superior, sección con banderas en movimiento y buscador de país, nuevo perfil "🌐 Mundo" en el selector, y página de diáspora con: hora local vs RD, barra de 24 h con el horario de atención en la hora del visitante, moneda, trámites más pedidos y guía de 4 pasos. 31 países listados (agregar más en `paises_mundo`). |

### Sobre los logos oficiales
Los sellos de las instituciones son de diseño propio (siglas + nombre) y **no reproducen logos oficiales**. Usar emblemas del Estado sin autorización puede interpretarse como afiliación oficial, que el aviso legal descarta. Si alguna entidad o empresa privada te autoriza por escrito a usar su logo, agrégalo en `data/catalogo.json` → `instituciones.<id>.logo` (ruta a la imagen) y el sitio lo mostrará automáticamente.

### Traducciones
- Textos en `data/i18n.json` (`ui`: `[español, inglés, francés]`; `contenido`: servicios, países, etc.).
- `python manage.py i18n` avisa si falta alguna traducción o si una página usa un texto que no existe.
- Si agregas un servicio en `catalogo.json`, agrega su traducción en `i18n.json` → `contenido.en.servicios` y `contenido.fr.servicios`; mientras tanto se muestra en español.

## Novedades v2

| Área | Mejora |
|---|---|
| **Selector de país** | “Estoy en: 🇩🇴 / 🇺🇸 / 🇪🇸 / 🌍” en la barra de navegación, en el hero, en el mapa y en el pie. Al elegir, toda la página se adapta: moneda (RD$/US$/€), mensaje del hero, trámites recomendados, orden de preguntas frecuentes y saludo de WhatsApp. Se recuerda en el dispositivo y se detecta automáticamente por zona horaria. |
| **“Atendemos donde estés”** | Mapa interactivo (rutas animadas RD ↔ EE.UU. ↔ España), panel con beneficios por país, relojes en vivo de Santo Domingo, Nueva York/Miami y Madrid con la diferencia horaria, e indicador de oficina abierta/cerrada. |
| **Extranjeros** | Perfil propio con texto en inglés y botón “Message us in English”. |
| **Catálogo** | Los 39 servicios en tarjetas filtrables por área, por país y por texto; cada tarjeta lleva a Cotizar o a Requisitos. |
| **Navegación interna** | Todo redirige dentro de la página: tarjetas → cotizador, asistente → requisitos, checklist completo → solicitud, solicitud → rastreo. Enlaces directos para compartir: `#cotizar=apostilla_documentos`, `#requisitos=poderes_especiales`, `#pais=us`. |
| **Solicitud en línea** | Formulario que guarda la solicitud (con Python) y entrega un **código de seguimiento real** (p. ej. `RD-7KQ4MX`); sin servidor, envía todo por WhatsApp. |
| **Rastreo** | Lee la base de datos real; muestra solo nombre + inicial del cliente. |
| **Rendimiento** | Tailwind compilado (sin el CDN de desarrollo), SEO (Open Graph, datos estructurados, sitemap, robots), accesibilidad (teclado, `aria`, contraste, reducción de movimiento). |
| **Correcciones** | Pestañas de requisitos rotas (comillas escapadas), dos números de WhatsApp distintos, funciones duplicadas en `script.js`, recargo de envío que salía en 400 en vez de 600, página que saltaba al cargar. |

## Estructura

```
index.html                 Página
assets/css/styles.css      Estilos propios
assets/css/tailwind.css    Tailwind compilado (generado)
assets/css/tailwind.src.css  Fuente de Tailwind (colores de marca)
assets/js/core.js          Base común: idioma, país, encabezado, pie, WhatsApp
assets/js/script.js        Portada
assets/js/servicio.js      Página de cada servicio
assets/js/instituciones.js Directorio de instituciones
assets/js/diaspora.js      Guía para la diáspora
servicio.html · instituciones.html · diaspora.html
calculadora.html           Calculadora desglosada + IPI + traspaso vehicular (calculadora.html?s=<servicio>)
rastreo.html               Rastreo de expedientes (rastreo.html?c=RD-XXXX)
preguntas.html             Preguntas frecuentes
site.webmanifest           Datos de la app instalable (nombre, íconos, accesos directos)
sw.js                      Service worker: modo sin conexión y actualizaciones de la app
offline.html               Página que se muestra sin internet
assets/js/cotizador.js     Calculadora desglosada (la usan la portada y calculadora.html)
assets/js/calculadora.js   Pestaña de calculadoras (IPI y traspaso)
assets/js/rastreo.js       Lógica del rastreo
assets/js/preguntas.js     Lógica de las preguntas frecuentes
assets/js/data.js          Datos para el navegador (generado desde data/catalogo.json)
assets/img/favicon.svg
data/catalogo.json         ★ ÚNICA fuente de precios, servicios, requisitos, FAQ, países e instituciones
data/i18n.json             Traducciones (español, inglés, francés)
traducciones.py            Verificación de traducciones
app.py                     Servidor web + API (Flask)
calculos.py                Cotizaciones, IPI, traspaso, códigos de seguimiento
manage.py                  Herramientas de administración (consola)
tests/test_app.py          Pruebas automáticas
tools/build-css.mjs        Compila Tailwind
```

## Dos formas de usarlo

**1. Sitio estático (Netlify, GitHub Pages, Hostinger…)** — sube los 4 `.html`, `assets/`, `site.webmanifest`, `robots.txt` y `sitemap.xml`. Todo funciona; las solicitudes se envían por WhatsApp y el rastreo usa los códigos de demostración.

**2. Con Python (Render, Railway, PythonAnywhere, un VPS)** — activa solicitudes con código, rastreo real, tasas de cambio en vivo y aviso por correo:

```bash
pip install -r requirements.txt
python app.py                      # http://localhost:5000
# producción:
gunicorn app:app --bind 0.0.0.0:$PORT
```

**VPS con Ubuntu (Hostinger u otro) en un solo paso** — instala la página, Nginx, HTTPS, firewall, respaldos diarios y el comando `tramita`:

```bash
git clone https://github.com/Jonathansuero/TramitaFacilRD.git /opt/tramitafacil
cd /opt/tramitafacil && bash tools/instalar_vps.sh tudominio.com tucorreo@ejemplo.com
tramita ayuda
```

**Panel de administración** (`/admin.html`, solo con el servidor): ver solicitudes, mover el seguimiento paso a paso, crear expedientes para clientes de WhatsApp, avisarles por WhatsApp y descargar Excel. El instalador muestra la contraseña inicial; se cambia con `tramita clave`.

## Tareas del día a día

```bash
python manage.py solicitudes                         # ver últimas solicitudes
python manage.py estado RD-7KQ4MX 3 "Depositado en la DGM"   # el cliente lo ve al rastrear
python manage.py exportar solicitudes.csv           # abrir en Excel
python manage.py precio residencia_dominicana --tasa 15500 --honorario 10000
python manage.py build                              # tras editar catalogo.json o i18n.json (regenera data.js y sitemap.xml)
python manage.py i18n                               # verifica las traducciones
python -m pytest -q                                 # pruebas
```

Pasos del rastreo: 1 Recibido · 2 Verificado · 3 En Entidad · 4 Listo.

## Si agregas clases de Tailwind nuevas

```bash
npm i -D tailwindcss@4 && node tools/build-css.mjs
# o con el CLI oficial:
npx @tailwindcss/cli -i assets/css/tailwind.src.css -o assets/css/tailwind.css --minify
```

## Pendiente de confirmar antes de publicar

- `config.horario` en `data/catalogo.json` (puse L–V 8:00–18:00 y sábado 9:00–13:00 como ejemplo).
- Que atienden en inglés y francés (el sitio ya lo ofrece).
- Revisión de las traducciones al inglés y francés por un hablante nativo antes de publicar.
- Requisitos nuevos: *Poder desde el exterior* y *Soltería JCE*.
- Reemplazar `TU-DOMINIO.com` en `robots.txt`, `sitemap.xml`, `index.html` y `config.sitio`.
- Tasas de respaldo USD/EUR (`config.tasas_respaldo`).
