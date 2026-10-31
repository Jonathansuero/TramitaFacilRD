/* ==========================================================
   TramitaFácil RD — service worker (la "app" instalable)
   - Guarda las páginas y recursos para abrir rápido y sin internet.
   - Páginas: primero la red (para ver siempre lo último); sin conexión, la copia guardada.
   - Estilos, scripts e imágenes: copia guardada al instante y se actualiza en segundo plano.
   - /api/ nunca se guarda (solicitudes y rastreo siempre en vivo).
   VERSION la actualiza `python manage.py build`; al cambiar, los teléfonos reciben la nueva versión.
   ========================================================== */
const VERSION = 'b391efb39b';
const CACHE = `tramitafacil-${VERSION}`;
const CACHE_EXT = 'tramitafacil-externos';

const PRECACHE = [
    './', './servicios', './servicio', './casos', './instituciones', './diaspora',
    './rastreo', './preguntas', './calculadora', './offline', './site.webmanifest',
    './assets/css/tailwind.css', './assets/css/styles.css',
    './assets/js/data.js', './assets/js/core.js', './assets/js/imagen.js', './assets/js/cotizador.js', './assets/js/script.js',
    './assets/js/servicio.js', './assets/js/servicios.js', './assets/js/casos.js', './assets/js/carrusel.js', './assets/js/instituciones.js', './assets/js/diaspora.js',
    './assets/js/rastreo.js', './assets/js/preguntas.js', './assets/js/calculadora.js',
    './assets/img/favicon.svg', './assets/img/favicon-32.png',
    './assets/img/app/icon-192.png', './assets/img/app/icon-512.png', './assets/img/app/apple-touch-icon.png'
];
const EXTERNOS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
    // la versión nueva se activa sola, sin pedirle nada al visitante
    event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const nombres = await caches.keys();
        await Promise.all(nombres.filter(n => n.startsWith('tramitafacil-') && n !== CACHE && n !== CACHE_EXT).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

// La página pide activar la versión nueva cuando el visitante toca "Actualizar".
self.addEventListener('message', event => {
    if (event.data === 'actualizar') self.skipWaiting();
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        if (url.pathname.includes('/api/') || url.pathname.includes('admin') || url.pathname.startsWith('/descarga/')) return;   // siempre en vivo (API y panel)
        if (req.mode === 'navigate') { event.respondWith(pagina(req)); return; }
        event.respondWith(recurso(req, CACHE));
        return;
    }
    if (EXTERNOS.includes(url.hostname)) event.respondWith(recurso(req, CACHE_EXT));
});

/** Páginas: red primero (máx. 4 s); si no hay red, la copia guardada; si tampoco, offline. */
async function pagina(req) {
    const cache = await caches.open(CACHE);
    try {
        const resp = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('lento')), 4000))]);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
    } catch (e) {
        return (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true })) || cache.match('./offline');
    }
}

/** Recursos: copia guardada al instante y actualización en segundo plano. */
async function recurso(req, nombre) {
    const cache = await caches.open(nombre);
    const guardado = await cache.match(req, { ignoreSearch: nombre === CACHE });
    const red = fetch(req).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
        return resp;
    }).catch(() => guardado || Response.error());
    return guardado || red;
}

// Notificaciones «push»: llegan aunque la app o el navegador estén cerrados
self.addEventListener('push', event => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = { cuerpo: event.data ? event.data.text() : '' }; }
    event.waitUntil(self.registration.showNotification(d.titulo || 'TramitaFácil RD', {
        body: d.cuerpo || '', icon: './assets/img/app/icon-192.png', badge: './assets/img/app/icon-192.png',
        tag: d.tag || 'tf-aviso', renotify: true, data: { url: d.url || '/admin' }
    }));
});

// Al tocar un aviso se abre el panel (en el expediente, si viene un código)
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/admin';
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
        const panel = ventanas.find(v => v.url.includes('/admin'));
        if (panel) { panel.postMessage({ tipo: 'abrir', url }); return panel.focus(); }
        return self.clients.openWindow(url);
    }));
});
