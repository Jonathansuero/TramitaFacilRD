/* TramitaFácil RD — panel de administración (admin)
   Pestañas: Inicio (saludo y mapa) · Expedientes · Resumen · Pagos · Precios · Herramientas.
   Un código por cliente con uno o varios trámites; cada trámite avanza por su cuenta.
   Cobro 50/50, notas internas, documentos recibidos, mensajes rápidos por WhatsApp,
   de dónde llega cada solicitud y precios editables. Requiere el servidor (app.py). */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const PASOS = { 1: 'Recibido', 2: 'Verificado', 3: 'En la institución', 4: 'Listo' };
    const PLANTILLAS = {
        1: 'Recibimos tu solicitud. Te contactaremos pronto para validar documentos y pago.',
        2: 'Documentos y pago confirmados. Ya estamos preparando tu expediente.',
        3: 'Tu expediente fue depositado en la institución. Te avisaremos de cualquier novedad.',
        4: '¡Tu trámite está listo! Te contactaremos para coordinar la entrega.'
    };
    const DIAS_ALERTA = 5;
    const DIAS_ZAFACON = 7;   // días que un cliente eliminado se puede reactivar   // días sin moverse para marcar un expediente como detenido
    const TZ = 'America/Santo_Domingo';
    const ORIGEN_N = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', google: 'Google', tiktok: 'TikTok', youtube: 'YouTube',
        bing: 'Bing', x: 'X (Twitter)', referido: 'Recomendado', app: 'App instalada', directo: 'Directo (escribió la dirección)', otro: 'Otro sitio web', '': 'Sin dato' };
    const PAGINA_N = { inicio: 'Inicio', servicio: 'Página de un servicio', servicios: 'Catálogo', casos: 'Casos reales', calculadora: 'Calculadora',
        diaspora: 'Diáspora', instituciones: 'Instituciones', preguntas: 'Preguntas', rastreo: 'Rastreo', panel: 'Creado por ti en el panel', otra: 'Otra', '': 'Sin dato' };
    const DISP_N = { movil: 'Celular', escritorio: 'Computadora', tablet: 'Tablet', '': 'Sin dato' };
    // Íconos de línea (formales, en vez de emojis)
    const ICO = {
        clip: '<path d="M21 11.5 12.6 20a5 5 0 0 1-7.1-7.1L14 4.4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.6 7.4"/>',
        cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
        nota: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
        editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        chat: '<path d="M21 12a8 8 0 0 1-11.7 7.1L3 21l1.9-6.2A8 8 0 1 1 21 12z"/>',
        entrega: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
        subir: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
        correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
        alerta: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
        ok: '<path d="M20 6 9 17l-5-5"/>',
        campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
        usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>',
        escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
        expedientes: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        pagos: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
        resumen: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        precios: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
        herramientas: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
        validar_pagos: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
        zafacon: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
        usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.9 2.6 2.6 3 5.2"/>'
    };
    const ico = (n, s = 16) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n] || ''}</svg>`;
    /** Rol que se muestra según los permisos. */
    function rolDe(perms) {
        const s = new Set(perms || []);
        if (s.has('usuarios')) return { n: 'Administrador', c: 'admin' };
        if (s.has('expedientes') && s.has('pagos')) return { n: 'Gestor y cobros', c: 'gestor' };
        if (s.has('expedientes')) return { n: 'Gestor', c: 'gestor' };
        if (s.has('pagos') || s.has('resumen') || s.has('herramientas')) return { n: 'Contabilidad', c: 'conta' };
        return { n: 'Solo lectura', c: 'lectura' };
    }
    const COLORES = ['#002D62', '#0E7A52', '#7C3AED', '#B45309', '#0369A1', '#BE123C', '#4D7C0F', '#334155'];
    const colorDe = s => COLORES[[...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORES.length];
    const peso = b => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
    const IDIOMA_N = { es: 'Español', en: 'Inglés', fr: 'Francés', '': 'Sin dato' };
    const TIPO_PAGO = { anticipo: 'Anticipo 50%', saldo: 'Saldo 50%', otro: 'Otro pago' };
    const METODOS = ['Transferencia', 'Zelle', 'Efectivo', 'Remesa', 'PayPal', 'Tarjeta', 'Otro'];

    // Mapa de la isla (Hispaniola) dibujado a mano para un lienzo de 640×380
    const MAPA = {"rd": "M289.7,136.3 L291.4,151.0 L287.9,174.0 L295.7,192.4 L292.3,212.6 L270.5,233.8 L279.2,248.5 L283.6,266.0 L288.8,290.8 L296.6,302.8 L316.6,330.4 L332.3,302.8 L345.3,274.3 L367.9,261.4 L376.6,255.0 L398.4,275.2 L425.4,270.6 L437.5,255.9 L448.8,251.3 L474.1,252.2 L501.0,252.2 L529.7,255.0 L541.0,259.6 L561.9,260.5 L577.6,255.0 L581.9,247.6 L586.3,237.5 L568.0,223.7 L535.8,206.2 L523.7,203.4 L493.2,196.1 L473.2,192.4 L461.9,185.0 L474.1,180.4 L498.4,183.2 L515.8,174.0 L501.0,170.3 L481.0,172.2 L461.9,174.0 L453.2,166.6 L448.8,142.7 L433.2,141.8 L404.5,132.6 L394.9,131.7 L380.1,128.0 L357.5,118.8 L327.1,121.6 L296.6,123.4 L289.7,136.3Z", "ht": "M288.8,290.8 L283.6,266.0 L279.2,248.5 L270.5,233.8 L292.3,212.6 L295.7,192.4 L287.9,174.0 L291.4,151.0 L289.7,136.3 L286.2,289.9 L220.1,272.4 L145.3,268.8 L113.9,276.1 L99.2,286.2 L57.4,264.2 L53.0,247.6 L54.8,238.4 L81.8,233.8 L127.0,247.6 L171.4,252.2 L211.4,246.7 L236.6,243.9 L218.3,224.6 L205.3,206.2 L205.3,191.5 L206.1,160.2 L174.8,144.6 L146.1,126.2 L194.0,115.1 L248.8,131.7 L280.1,140.0 L289.7,136.3Z", "ciudades": {"Santo Domingo": [446.2, 249.4], "Santiago": [379.3, 160.2], "Puerto Plata": [380.1, 128.9], "Punta Cana": [579.3, 242.1], "La Romana": [529.7, 254.0], "Samaná": [498.4, 182.3], "Barahona": [344.5, 274.3]}};
    let expedientes = [], conteo = {}, cat = null, animarMapa = false;
    let yo = null, nombresPermisos = {}, correoActivo = false;       // usuario con sesión y descripción de cada permiso
    const puede = p => !!(yo && (yo.permisos || []).includes(p));
    /** Confirmar pagos: contabilidad (validar_pagos) o un administrador. */
    const puedeValidar = () => puede('validar_pagos') || puede('usuarios');
    const confirmados = pagos => (pagos || []).filter(p => !p.estado || p.estado === 'confirmado');
    const editandoCliente = new Set();         // códigos con el formulario de datos del cliente abierto
    let usuariosData = null, editandoUsuario = null;
    const PERM_TAB = { resumen: 'resumen', pagos: 'pagos', precios: 'precios', herr: 'herramientas', usuarios: 'usuarios', zafacon: 'usuarios', mensajes: 'usuarios' };
    const filtro = { paso: 0, detenidos: false, servicio: '', pais: '', origen: '', cobro: '', desde: '', hasta: '' };
    let tab = 'inicio', periodo = 30;
    let precios = null, preciosQ = '', preciosCat = '';
    const abiertos = new Set();      // códigos con la tarjeta abierta
    const recien = new Set();        // solicitudes que acaban de llegar (se resaltan unos segundos)
    let borrando = null;
    const porSubir = new Map();      // código -> archivos elegidos que todavía no se han guardado
    const agregando = new Set();     // códigos con el formulario «Agregar otro trámite» abierto             // código con la confirmación de «Eliminar cliente» abierta
    const docsAbiertos = new Set();  // "CODIGO:idTramite" con la lista de documentos abierta
    let editando = null;             // "CODIGO:idTramite" con el formulario de avance abierto

    // ------------------------------------------------------------ utilidades
    async function api(path, opts = {}) {
        const r = await fetch('/api' + path, {
            credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' }, ...opts
        });
        let data = {};
        try { data = await r.json(); } catch (e) { /* respuesta sin JSON */ }
        if (r.status === 401 && path !== '/admin/login') { mostrarLogin('Tu sesión terminó. Vuelve a entrar.'); throw new Error('sesion'); }
        if (!r.ok || data.ok === false) { const e = new Error(data.error || 'No se pudo completar. Revisa tu conexión.'); e.status = r.status; throw e; }
        return data;
    }
    const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

    let toastT;
    function toast(msg) {
        const t = $('toast'); t.textContent = msg; t.hidden = false;
        clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800);
    }

    function fecha(iso) {
        if (!iso) return '';
        const d = new Date(iso), seg = (Date.now() - d) / 1000;
        if (seg < 60) return 'hace un momento';
        if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
        if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
        return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
            + ' · ' + d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
    }
    /** "2026-10-29" → "29 oct" */
    const diaCorto = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return y ? new Date(y, m - 1, d).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' }) : ''; };
    /** Día (AAAA-MM-DD) en hora de República Dominicana. */
    const diaRD = d => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
    const hoyRD = () => diaRD(Date.now());
    const sumarDias = (dia, n) => { const [y, m, d] = dia.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
    const rd = v => (v == null || v === '') ? '—' : 'RD$' + Number(v).toLocaleString('es-DO', { maximumFractionDigits: 2 });
    const num = v => Number(v || 0).toLocaleString('es-DO');

    /** Número de WhatsApp a partir del contacto (si parece un teléfono). */
    function telefono(contacto) {
        const parte = String(contacto || '').split('·').map(x => x.trim()).find(x => x && !x.includes('@'));
        if (!parte) return '';
        let n = parte.replace(/\D/g, '');
        if (n.length < 8) return '';
        if (n.length === 10 && /^(809|829|849)/.test(n)) n = '1' + n;   // número dominicano sin el 1
        return n;
    }
    const sitio = () => ((cat && cat.config && cat.config.sitio) || location.origin).replace(/\/$/, '');
    const primerNombre = e => (e.nombre || e.cliente || '').split(' ')[0];
    function wa(e, lineas) {
        const tel = telefono(e.contacto);
        return `https://api.whatsapp.com/send?${tel ? 'phone=' + tel + '&' : ''}text=${encodeURIComponent(lineas.join('\n').normalize('NFC'))}`;
    }
    const enlaceRastreo = e => `${sitio()}/rastreo?c=${encodeURIComponent(e.codigo)}`;

    function linkWhatsApp(e) {
        const items = e.tramites || [];
        const lineas = [`Hola ${primerNombre(e)} 👋`, '', 'Te escribimos de *TramitaFácil RD*.', `🔎 Tu código: *${e.codigo}*`];
        if (items.length > 1) {
            lineas.push('', `📄 Tus trámites (${items.length}):`);
            items.forEach(t => lineas.push(`• ${t.titulo} — ${t.paso === 4 ? 'Listo ✅' : (t.estado || PASOS[t.paso])}`));
        } else {
            lineas.push(`📄 Trámite: ${e.servicio_titulo}`, `📍 Estado: ${e.estado} — ${e.detalle}`);
        }
        lineas.push('', 'Consulta el avance cuando quieras aquí:', enlaceRastreo(e));
        return wa(e, lineas);
    }
    function linkDocs(e) {
        const faltan = (e.tramites || []).map(t => [t, checklist(t).filter(d => !(t.docs || []).includes(d))]).filter(([, f]) => f.length);
        const lineas = [`Hola ${primerNombre(e)} 👋`, '', `Para avanzar con tu expediente *${e.codigo}* necesitamos estos documentos:`];
        if (!faltan.length) lineas.push('', '• (escribe aquí lo que falta)');
        faltan.forEach(([t, f]) => { if (faltan.length > 1 || (e.tramites || []).length > 1) lineas.push('', `📄 *${t.titulo}*`); f.forEach(d => lineas.push(`• ${d}`)); });
        lineas.push('', 'Puedes enviarlos por aquí mismo (foto clara o PDF). ¡Gracias! 🙌', '— TramitaFácil RD');
        return wa(e, lineas);
    }
    function linkPago(e) {
        const total = e.total_dop, pagado = e.pagado || 0;
        const lineas = [`Hola ${primerNombre(e)} 👋`, ''];
        if (total == null) lineas.push(`Te recordamos el pago pendiente de tu expediente *${e.codigo}*.`);
        else if (!pagado) lineas.push(`Para iniciar tu expediente *${e.codigo}* necesitamos el anticipo del 50%: *${rd(Math.round(total / 2))}*.`, `(Total del servicio: ${rd(total)}. El otro 50% se paga al terminar.)`);
        else lineas.push(`Te recordamos el saldo pendiente de tu expediente *${e.codigo}*: *${rd(e.pendiente)}*.`, `Total: ${rd(total)} · Recibido: ${rd(pagado)}.`);
        lineas.push('', 'Cuando hagas el pago, envíanos el comprobante por aquí. ¡Gracias! 🙌', '— TramitaFácil RD');
        return wa(e, lineas);
    }
    function linkListo(e) {
        const listos = (e.tramites || []).filter(t => t.paso === 4), arch = e.archivos || [];
        const lineas = [`Hola ${primerNombre(e)} 🎉`, ''];
        if (listos.length === 1) lineas.push(`¡Buenas noticias! Tu trámite *${listos[0].titulo}* está listo.`);
        else { lineas.push('¡Buenas noticias! Tus trámites están listos:'); (listos.length ? listos : e.tramites || []).forEach(t => lineas.push(`• ${t.titulo}`)); }
        lineas.push('', `🔎 Número de seguimiento: *${e.codigo}*`);
        if (arch.length) { lineas.push('', 'Puedes descargar tus documentos aquí:'); arch.forEach(a => lineas.push(`• ${a.nombre}: ${a.enlace}`)); }
        if (e.pendiente) lineas.push('', `Para la entrega queda pendiente el saldo de *${rd(e.pendiente)}*.`);
        lineas.push('', `Consulta tu expediente cuando quieras: ${enlaceRastreo(e)}`, arch.length ? '' : 'Escríbenos para coordinar la entrega.', '¡Gracias por confiar en nosotros! 🇩🇴', '— TramitaFácil RD');
        return wa(e, lineas.filter((x, i, l) => x !== '' || l[i - 1] !== ''));
    }
    /** WhatsApp con el avance de un trámite (si quedó listo, el mensaje de «listo»). */
    function linkAvance(e, tid) {
        const t = (e.tramites || []).find(x => x.id === tid) || (e.tramites || [])[0];
        if (!t || t.paso === 4) return linkListo(e);
        return wa(e, [`Hola ${primerNombre(e)}`, '', 'Te escribimos de *TramitaFácil RD* con una actualización de tu trámite.', '',
            `📄 Trámite: ${t.titulo}`, `🔎 Número de seguimiento: *${e.codigo}*`, `📍 Estado: ${t.estado} — ${t.detalle}`, '',
            `Consulta el avance aquí: ${enlaceRastreo(e)}`, '', '— TramitaFácil RD']);
    }

    const bandera = pais => (cat && cat.paises[pais] && cat.paises[pais].bandera) || '';
    const paisNombre = (pais, det) => ((cat && cat.paises[pais] && cat.paises[pais].nombre) || pais || '—') + (det ? ` (${det})` : '');
    const tono = paso => ({ 1: 'sky', 2: 'sky', 3: 'amber', 4: 'emerald' }[paso] || 'sky');
    const barra = paso => `<span class="barra">${[1, 2, 3, 4].map(i => `<i class="${i <= paso ? 'on' : ''}${paso === 4 ? ' listo' : ''}"></i>`).join('')}</span>`;
    const precioCatalogo = id => (cat && cat.servicios[id]) ? cat.servicios[id].tax + cat.servicios[id].fee : null;
    const DOCS_GENERICOS = ['Copia de cédula o pasaporte', 'Datos completos del trámite', 'Documentos de soporte', 'Comprobante de pago'];
    const checklist = t => (cat && cat.checklists && cat.checklists[t.servicio_id] && cat.checklists[t.servicio_id].items) || DOCS_GENERICOS;
    const diasSin = e => Math.floor((Date.now() - new Date(e.actualizado)) / 86400000);
    const detenido = e => e.paso < 4 && diasSin(e) >= DIAS_ALERTA;
    const creado = e => e.creado || e.actualizado;
    const origenDe = e => e.origen || '';

    function opcionesServicio() {
        if (!cat) return '<option value="">Cargando…</option>';
        const porCat = {};
        Object.entries(cat.servicios).forEach(([id, s]) => (porCat[s.category] = porCat[s.category] || []).push([id, s.title]));
        return '<option value="">Elige el trámite…</option>' + Object.entries(porCat).map(([c, arr]) =>
            `<optgroup label="${esc((cat.categorias[c] || {}).label || c)}">${arr.sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([id, t]) => `<option value="${esc(id)}">${esc(t)}</option>`).join('')}</optgroup>`).join('')
            + '<optgroup label="Otro"><option value="otro">Otro: servicio personalizado…</option></optgroup>';
    }

    /** Bloque "trámite + precio" reutilizado al crear y al agregar. */
    function campoServicio() {
        return `<div class="fila-serv">
                <select class="input" data-f="servicio" required>${opcionesServicio()}</select>
                <input class="input" data-f="precio" type="number" min="0" step="1" inputmode="decimal" placeholder="Precio RD$" title="Precio acordado (si lo dejas vacío, se usa el del catálogo)">
            </div>
            <input class="input" data-f="titulo" maxlength="120" placeholder="Describe el servicio (ej.: Certificado de buena conducta)" hidden>`;
    }
    function leerServicio(cont) {
        const v = f => cont.querySelector(`[data-f="${f}"]`).value.trim();
        return { servicio: v('servicio'), titulo: v('titulo'), precio: v('precio') === '' ? null : Number(v('precio')) };
    }
    function alCambiarServicio(sel) {
        const cont = sel.closest('.agregar, .item-nuevo'); if (!cont) return;
        const titulo = cont.querySelector('[data-f="titulo"]'), precio = cont.querySelector('[data-f="precio"]');
        titulo.hidden = sel.value !== 'otro'; titulo.required = sel.value === 'otro';
        if (sel.value === 'otro') titulo.focus();
        const p = precioCatalogo(sel.value);
        precio.placeholder = p != null ? `RD$${p.toLocaleString('es-DO')}` : 'Precio RD$';
    }

    /** Descarga un archivo (en la vista previa de Claude, el modo prueba pone su propia función). */
    async function descargar(nombre, contenido, tipo) {
        if (window.TF_DESCARGAR) return window.TF_DESCARGAR(nombre, contenido, tipo);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([contenido], { type: tipo })); a.download = nombre;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }

    // ------------------------------------------------------------ vistas
    function mostrarLogin(msg) {
        $('vPanel').hidden = true; $('vNuevo').hidden = true; $('vLogin').hidden = false;
        const err = $('loginError');
        err.hidden = !msg; err.textContent = msg || '';
        setTimeout(() => ($('usuario').value ? $('clave') : $('usuario')).focus(), 50);
    }

    async function mostrarPanel() {
        try { const s = await api('/admin/sesion'); yo = s.usuario; nombresPermisos = s.permisos || {}; correoActivo = !!s.correo_activo; } catch (e) { /* sigue */ }
        aplicarPermisos();
        $('vLogin').hidden = true; $('vPanel').hidden = false;
        if (yo && yo.cambiar_clave) { abrirCuenta(true); return; }   // primero crea su propia clave
        animarMapa = true;
        cargarMensajes();
        if (!cat) { try { cat = await api('/catalogo'); } catch (e) { /* el panel funciona igual */ } }
        llenarFiltros();
        await cargar();
        irATab(tab);
        cargarAvisos();
    }

    async function cargar() {
        try {
            const r = await api('/admin/expedientes');
            expedientes = r.expedientes; conteo = r.conteo; pendiente = null;
            $('avisoNuevas').hidden = true;
            pintarTodo();
        } catch (e) {
            if (e.message !== 'sesion') $('lista').innerHTML = `<div class="vacio"><b>No se pudo cargar</b>${esc(e.message)}</div>`;
        }
    }

    // ---------------- actualización automática: las solicitudes nuevas aparecen solas
    let pendiente = null, revisando = false;
    const huella = lista => lista.map(e => e.codigo + '@' + e.actualizado + '@' + (e.pagos || []).length + '@' + (e.notas || []).length).join('|');
    /** ¿Está escribiendo o con una ventana abierta? Entonces no le cambiamos la lista de golpe. */
    const ocupado = () => editando || editandoCliente.size || porSubir.size || agregando.size || !$('vNuevo').hidden || !$('vCuenta').hidden || (document.activeElement && document.activeElement.closest('#vPanel main form, #tPrecios'));
    async function revisar() {
        if (revisando || $('vPanel').hidden || document.hidden) return;
        revisando = true;
        try {
            const r = await api('/admin/expedientes');
            if (huella(r.expedientes) === huella(expedientes)) return;
            const conocidos = new Set(expedientes.map(e => e.codigo));
            const nuevas = r.expedientes.filter(e => !conocidos.has(e.codigo)).length;
            if (ocupado()) {
                pendiente = r;
                const b = $('avisoNuevas'); b.hidden = false;
                b.textContent = nuevas ? `${nuevas} ${nuevas === 1 ? 'solicitud nueva' : 'solicitudes nuevas'}. Toca para verlas.` : 'Hay cambios en los expedientes. Toca para actualizar.';
            } else {
                expedientes = r.expedientes; conteo = r.conteo; pintarTodo();
                if (nuevas) toast(`${nuevas} ${nuevas === 1 ? 'solicitud nueva' : 'solicitudes nuevas'}`);
            }
        } catch (e) { /* sin conexión: se intenta en la próxima vuelta */ }
        finally { revisando = false; }
    }
    setInterval(revisar, 10000);
    window.addEventListener('focus', revisar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });

    function recontar() { conteo = {}; expedientes.forEach(e => { conteo[e.paso] = (conteo[e.paso] || 0) + 1; }); }
    function reemplazar(exp) {
        const i = expedientes.findIndex(e => e.codigo === exp.codigo);
        if (i >= 0) expedientes[i] = exp; else expedientes.unshift(exp);
        recontar();
    }

    function pintarTodo() {
        const porCobrar = puede('pagos') ? expedientes.filter(e => e.pendiente > 0).length : 0;
        $('numCobro').hidden = !porCobrar; $('numCobro').textContent = porCobrar;
        $('numCobro2').hidden = !porCobrar; $('numCobro2').textContent = porCobrar;
        if (tab === 'inicio') pintarInicio();
        else if (tab === 'exp') pintar();
        else if (tab === 'resumen') pintarResumen();
        else if (tab === 'pagos') pintarPagos();
        else if (tab === 'herr') pintarHerramientas();
    }

    /** Muestra solo lo que el usuario puede usar. */
    function aplicarPermisos() {
        $('yoIniciales').textContent = iniciales(yo && yo.nombre);
        $('btnCuenta').title = yo ? `${yo.nombre} · Mi cuenta` : 'Mi cuenta';
        document.querySelectorAll('#tabs .tab, #bottomnav [data-tab], #vMas [data-tab]').forEach(b => { const p = PERM_TAB[b.dataset.tab]; b.hidden = !!p && !puede(p); });
        $('btnExcelTop').hidden = !puede('herramientas');
        $('btnExcelFiltro').hidden = !puede('herramientas');
        $('btnNuevo').hidden = !puede('expedientes');
        if (PERM_TAB[tab] && !puede(PERM_TAB[tab])) tab = 'inicio';
        $('bottomnav').querySelector('[data-mas]').hidden = !$('vMas').querySelector('[data-tab]:not([hidden])');
    }

    function irATab(nuevo, desdeHistorial) {
        if (!desdeHistorial && nuevo !== tab) marcarHistorial({ tab: nuevo });   // «atrás» vuelve a la sección anterior
        tab = nuevo;
        $('vMas').hidden = true;
        document.querySelectorAll('#tabs .tab').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
        const enBarra = !!$('bottomnav').querySelector(`[data-tab="${tab}"]`);
        $('bottomnav').querySelectorAll('.bn').forEach(b => b.classList.toggle('on', b.dataset.tab ? b.dataset.tab === tab : !enBarra));
        ['inicio', 'exp', 'resumen', 'pagos', 'precios', 'herr', 'usuarios', 'zafacon', 'mensajes'].forEach(t => { $({ mensajes: 'tMensajes', zafacon: 'tZafacon', inicio: 'tInicio', exp: 'tExp', resumen: 'tResumen', pagos: 'tPagos', precios: 'tPrecios', herr: 'tHerr', usuarios: 'tUsuarios' }[t]).hidden = t !== tab; });
        if (tab === 'precios') cargarPrecios(); else if (tab === 'usuarios') cargarUsuarios(); else if (tab === 'zafacon') cargarZafacon(); else if (tab === 'mensajes') pintarMensajes(); else pintarTodo();
        window.scrollTo({ top: 0 });
    }
    function verExpediente(codigo) {
        filtro.paso = 0; filtro.detenidos = false; $('q').value = codigo; abiertos.add(codigo);
        irATab('exp');
    }

    // ============================================================ EXPEDIENTES
    function llenarFiltros() {
        if (!cat) return;
        const usados = new Set(expedientes.map(e => e.servicio_id));
        $('fServicio').innerHTML = '<option value="">Todos</option>' + Object.entries(cat.servicios).sort((a, b) => a[1].title.localeCompare(b[1].title, 'es'))
            .map(([id, s]) => `<option value="${esc(id)}">${esc(s.title)}</option>`).join('') + '<option value="otro">Otro (personalizado)</option>';
        $('fPais').innerHTML = '<option value="">Todos</option>' + Object.entries(cat.paises).map(([id, p]) => `<option value="${esc(id)}">${p.bandera} ${esc(p.nombre)}</option>`).join('');
        $('fOrigen').innerHTML = '<option value="">Todos</option>' + Object.entries(ORIGEN_N).filter(([k]) => k).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('') + '<option value="-">Sin dato</option>';
        void usados;
    }

    function pasaFiltros(e, ignorarPaso) {
        const q = $('q').value.trim().toLowerCase();
        if (!ignorarPaso && filtro.paso && e.paso !== filtro.paso) return false;
        if (filtro.detenidos && !detenido(e)) return false;
        if (filtro.servicio && !(e.tramites || []).some(t => t.servicio_id === filtro.servicio)) return false;
        if (filtro.pais && e.pais !== filtro.pais) return false;
        if (filtro.origen && (filtro.origen === '-' ? origenDe(e) : origenDe(e) !== filtro.origen)) return false;
        if (filtro.cobro === 'sin' && !(e.paso < 4 && !(e.pagado > 0))) return false;
        if (filtro.cobro === 'pendiente' && !(e.pendiente > 0)) return false;
        if (filtro.cobro === 'pagado' && !(e.total_dop != null && e.pendiente === 0 && e.pagado > 0)) return false;
        const dia = diaRD(creado(e));
        if (filtro.desde && dia < filtro.desde) return false;
        if (filtro.hasta && dia > filtro.hasta) return false;
        if (q && ![e.codigo, e.nombre, e.cliente, e.contacto, e.servicio_titulo, ...(e.tramites || []).map(t => t.titulo)]
            .some(v => String(v || '').toLowerCase().includes(q))) return false;
        return true;
    }
    const filtrados = () => expedientes.filter(e => pasaFiltros(e));

    function pintarFiltros() {
        const base = expedientes.filter(e => pasaFiltros(e, true));
        const c = {}; base.forEach(e => { c[e.paso] = (c[e.paso] || 0) + 1; });
        const items = [[0, 'Todos', base.length], ...Object.entries(PASOS).map(([p, n]) => [Number(p), n, c[p] || 0])];
        $('filtros').innerHTML = items.map(([p, n, k]) =>
            `<button type="button" class="filtro${filtro.paso === p ? ' on' : ''}" data-paso="${p}" role="tab" aria-selected="${filtro.paso === p}"><b>${k}</b><span>${esc(n)}</span></button>`).join('');
        const total = expedientes.length, enProceso = total - (conteo['4'] || 0), det = expedientes.filter(detenido).length;
        $('resumen').textContent = total ? `${total} ${total === 1 ? 'cliente' : 'clientes'} · ${enProceso} en proceso${det ? ` · ${det} detenido${det === 1 ? '' : 's'}` : ''}` : 'Todavía no hay expedientes';
        $('btnDetenidos').classList.toggle('on', filtro.detenidos);
        $('btnDetenidos').textContent = `Detenidos${det ? ` (${det})` : ''}`;
        const extras = ['servicio', 'pais', 'origen', 'cobro', 'desde', 'hasta'].filter(k => filtro[k]).length;
        $('btnMas').classList.toggle('on', !$('masFiltros').hidden || extras > 0);
        $('btnMas').textContent = extras ? `Filtros (${extras})` : 'Filtros';
    }

    function linkEntrega(e) {
        const arch = e.archivos || [];
        const lineas = [`Hola ${primerNombre(e)}`, '', `Te escribimos de *TramitaFácil RD*. Los documentos de tu expediente *${e.codigo}* están listos.`, '', 'Puedes descargarlos aquí:'];
        arch.forEach(a => lineas.push(`• ${a.nombre}: ${a.enlace}`));
        lineas.push('', `Los enlaces son personales y vencen en 30 días. También puedes descargarlos en ${enlaceRastreo(e)} con tu código y los últimos 4 dígitos de tu WhatsApp.`, '', '— TramitaFácil RD');
        return wa(e, lineas);
    }
    /** Cambiar el estado con un toque: se elige el paso y se guarda (con el mensaje por defecto de ese paso). */
    const CORTO = { 1: 'Recibido', 2: 'Verificado', 3: 'En institución', 4: 'Listo' };
    function bloqueRapido(e) {
        const items = e.tramites || [];
        if (!items.length) return '';
        return `<div class="bloque rapido">
            <div class="bloque-t"><span>${ico('ok')} Cambiar estado</span><span>toca el paso y guarda</span></div>
            ${items.map(t => `<form class="rapido-f" data-codigo="${esc(e.codigo)}" data-tramite="${t.id}" data-actual="${t.paso}">
                ${items.length > 1 ? `<b class="rp-t">${esc(t.titulo)}</b>` : ''}
                <div class="rp-pasos" role="radiogroup" aria-label="Paso del trámite">${[1, 2, 3, 4].map(i => `<button type="button" role="radio" aria-checked="${i === t.paso}"
                    class="rp${i === t.paso ? ' sel actual' : ''}${i < t.paso ? ' hecho' : ''}" data-rp="${i}"><em>${i}</em><span>${CORTO[i]}</span></button>`).join('')}</div>
                <input type="hidden" name="paso" value="${t.paso}">
                <div class="rp-pie"><small data-rp-msg>Paso actual. Elige otro para cambiarlo.</small>
                    <button class="btn btn-azul btn-sm rp-guardar" type="submit" disabled>Guardar</button></div>
            </form>`).join('')}
        </div>`;
    }

    /** Avisar al cliente del estado actual con un clic: por correo (lo envía el servidor) o por WhatsApp. */
    function bloqueAvisar(e) {
        const email = e.correo_cliente, tel = telefono(e.contacto), gestiona = puede('expedientes');
        const ultimo = (e.correos || []).find(c => c.tipo === 'aviso' || c.tipo === 'estado');
        const listo = (e.tramites || []).length > 0 && e.tramites.every(t => t.paso === 4);
        return `<div class="bloque avisar${listo ? ' listo' : ''}">
            <div class="bloque-t"><span>${ico(listo ? 'ok' : 'campana')} ${listo ? 'Avisar que está listo' : 'Avisar al cliente'}</span>${ultimo ? `<span>último correo: ${esc(fecha(ultimo.fecha))}</span>` : ''}</div>
            <div class="avisar-btns">
                ${gestiona ? `<button type="button" class="btn btn-azul" data-avisar-correo="${esc(e.codigo)}"${!email || !correoActivo ? ' disabled' : ''}>
                    ${ico('correo', 18)}<span>Enviar por correo<small>${esc(email || 'Sin correo registrado')}</small></span></button>` : ''}
                <a class="btn btn-wa" href="${listo ? linkListo(e) : linkWhatsApp(e)}" target="_blank" rel="noopener"${tel ? '' : ' aria-disabled="true"'}>
                    ${ico('chat', 18)}<span>Enviar por WhatsApp<small>${tel ? '+' + esc(tel) : 'Sin WhatsApp registrado'}</small></span></a>
            </div>
            <small class="ayuda">${listo ? `Le avisa que su trámite está listo, con su número de seguimiento ${esc(e.codigo)}${(e.archivos || []).length ? ' y los enlaces de sus documentos' : ''}.` : `Le envía el estado actual de todos sus trámites con su número de seguimiento ${esc(e.codigo)}.`} Es opcional: úsalo solo cuando quieras avisar.${email && !correoActivo && gestiona ? ' El correo aún no está activado en el servidor (tramita correo).' : ''}</small>
        </div>`;
    }

    function bloqueEntrega(e) {
        const arch = e.archivos || [], hayListo = (e.tramites || []).some(t => t.paso === 4);
        if (!hayListo && !arch.length) return '';
        const email = e.correo_cliente, gestiona = puede('expedientes');
        return `<div class="bloque entrega">
            <div class="bloque-t"><span>${ico('entrega')} Documentos para entregar</span><span>${arch.length} ${arch.length === 1 ? 'archivo' : 'archivos'}</span></div>
            ${arch.length ? `<ul class="archivos">${arch.map(a => `<li>
                <span class="ar-tipo ${a.tipo === 'application/pdf' ? 'pdf' : 'img'}">${a.tipo === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                <span class="ar-t"><a href="/api/admin/archivo/${a.id}" target="_blank" rel="noopener">${esc(a.nombre)}</a><small>${esc(peso(a.tamano))} · ${esc(fecha(a.creado))}${a.usuario ? ` · ${esc(a.usuario)}` : ''}</small></span>
                ${gestiona ? `<button type="button" class="x" data-quitar-archivo="${a.id}" data-codigo="${esc(e.codigo)}" title="Quitar documento" aria-label="Quitar documento">×</button>` : ''}
            </li>`).join('')}</ul>` : '<p class="ayuda">Sube el documento escaneado (PDF o foto) para que el cliente lo reciba y pueda descargarlo con su número de expediente.</p>'}
            ${gestiona && (porSubir.get(e.codigo) || []).length ? `<div class="por-subir">
                <span class="ps-t">Listos para guardar (${porSubir.get(e.codigo).length})</span>
                <ul>${porSubir.get(e.codigo).map((f, i) => `<li><span class="ar-tipo ${/\.pdf$/i.test(f.name) ? 'pdf' : 'img'}">${/\.pdf$/i.test(f.name) ? 'PDF' : 'IMG'}</span>
                    <span class="ar-t"><b>${esc(f.name)}</b><small>${esc(peso(f.size))}</small></span>
                    <button type="button" class="x" data-sacar="${i}" data-codigo="${esc(e.codigo)}" title="No subir este" aria-label="No subir este archivo">×</button></li>`).join('')}</ul>
                <div class="acciones"><button type="button" class="btn btn-azul" data-guardar-docs="${esc(e.codigo)}">${ico('subir', 16)} Guardar documentos</button>
                    <button type="button" class="btn btn-borde" data-cancelar-subir="${esc(e.codigo)}">Cancelar</button></div>
                <small class="ayuda">Al guardar, el cliente podrá descargarlos en la página (Rastrear) con su número de expediente. No hace falta enviárselos.</small>
            </div>` : ''}
            ${gestiona ? `<label class="subir">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" multiple data-subir="${esc(e.codigo)}">
                ${ico('subir', 20)}<span><b>${arch.length || porSubir.has(e.codigo) ? 'Elegir más documentos' : 'Elegir documentos escaneados'}</b><small>PDF, JPG o PNG · hasta 10 MB cada uno</small></span>
            </label>` : ''}
            ${arch.length ? `<p class="disponible">${ico('ok', 16)}<span>Disponibles para el cliente en <b>Rastrear</b> con su código ${esc(e.codigo)}. Enviárselos es opcional:</span></p>
            <div class="acciones">
                ${gestiona ? `<button type="button" class="btn btn-azul btn-sm" data-enviar-docs="${esc(e.codigo)}"${!email || !correoActivo ? ' disabled' : ''}>${ico('correo')} Enviar por correo</button>` : ''}
                <a class="btn btn-wa btn-sm" href="${linkEntrega(e)}" target="_blank" rel="noopener">${ico('chat')} Enviar por WhatsApp</a>
            </div>
            <small class="ayuda">${!email ? 'El cliente no tiene correo registrado. ' : !correoActivo ? 'El envío de correos aún no está activado en el servidor (tramita correo). ' : `El correo se enviaría a ${esc(email)} con los documentos adjuntos. `}Para descargarlos en Rastrear, el cliente confirma los últimos 4 dígitos de su WhatsApp o su correo.</small>` : ''}
        </div>`;
    }

    function bloqueDocs(e, t) {
        const clave = `${e.codigo}:${t.id}`, lista = checklist(t), tengo = new Set(t.docs || []);
        const listos = lista.filter(d => tengo.has(d)).length;
        const abierto = docsAbiertos.has(clave);
        return `<button type="button" class="link" data-docs-abrir="${esc(clave)}">${ico('clip', 14)} Documentos recibidos ${listos}/${lista.length} ${abierto ? '▴' : '▾'}</button>
            ${abierto ? `<div class="docs" data-docs="${esc(clave)}" data-codigo="${esc(e.codigo)}" data-tramite="${t.id}">
                ${lista.map(d => `<label class="${tengo.has(d) ? 'ok' : ''}"><input type="checkbox" value="${esc(d)}"${tengo.has(d) ? ' checked' : ''}><span>${esc(d)}</span></label>`).join('')}
            </div>` : ''}`;
    }

    function bloqueTramite(e, t, varios) {
        const clave = `${e.codigo}:${t.id}`, abierto = editando === clave;
        const form = !abierto ? '' : `
            <form class="avance" data-codigo="${esc(e.codigo)}" data-tramite="${t.id}">
                <div class="pasos">${[1, 2, 3, 4].map(i => `<button type="button" class="paso${i === t.paso ? ' sel' : ''}" data-p="${i}"><em>${i}</em>${esc(PASOS[i])}</button>`).join('')}</div>
                <input type="hidden" name="paso" value="${t.paso}">
                <div><label class="campo" for="d-${clave}">Mensaje para el cliente</label>
                    <textarea class="input" id="d-${clave}" name="detalle" maxlength="500" required>${esc(mensajesDe(t, t.paso).defecto)}</textarea></div>
                <div class="presets" data-presets>${presetsHTML(t, t.paso)}</div>
                <div><label class="campo" for="s-${clave}">Estado (opcional)</label>
                    <input class="input" id="s-${clave}" name="estado" maxlength="60" placeholder="Ej.: Esperando firma del notario"></div>
                <fieldset class="aviso-opc">
                    <legend>¿Avisar al cliente al guardar? <small>Opcional</small></legend>
                    <div class="opc-btns">
                        <label class="opc"><input type="checkbox" name="avisarCorreo"${!e.correo_cliente || !correoActivo ? ' disabled' : ''}>
                            <span><b class="opc-t">${ico('correo')} Por correo</b><small>${esc(!e.correo_cliente ? 'Sin correo registrado' : !correoActivo ? 'Correo aún no activado' : e.correo_cliente)}</small></span></label>
                        <label class="opc"><input type="checkbox" name="avisarWa"${telefono(e.contacto) ? '' : ' disabled'}>
                            <span><b class="opc-t">${ico('chat')} Por WhatsApp</b><small>${telefono(e.contacto) ? '+' + esc(telefono(e.contacto)) : 'Sin WhatsApp registrado'}</small></span></label>
                    </div>
                    <p class="ayuda">Si no marcas nada, solo se cambia el estado: el cliente lo verá en Rastrear con su número de seguimiento. Si eliges «Listo», el aviso dice que está listo e incluye el número de seguimiento.</p>
                </fieldset>
                <div class="acciones"><button class="btn btn-azul" type="submit">Guardar</button><button class="btn btn-borde" type="button" data-cancelar>Cancelar</button></div>
            </form>`;
        return `<div class="tr">
            <div class="tr-top"><div><b>${esc(t.titulo)}</b><small>${esc(rd(t.precio))} · ${esc(fecha(t.actualizado))}</small></div><span class="chip ${tono(t.paso)}">${esc(t.paso === 3 ? 'En institución' : PASOS[t.paso])}</span></div>
            ${barra(t.paso)}
            <p>${esc(t.detalle)}</p>
            ${abierto ? form : (puede('expedientes') ? `<div class="tr-acc"><button type="button" class="link" data-editar="${esc(clave)}">Actualizar avance</button>${bloqueDocs(e, t)}${varios ? `<button type="button" class="link rojo" data-quitar="${t.id}" data-codigo="${esc(e.codigo)}">Quitar</button>` : ''}</div>` : '')}
        </div>`;
    }

    const ESTADO_PAGO = { pendiente: ['Por confirmar', 'pend'], confirmado: ['Confirmado', 'ok'], rechazado: ['Rechazado', 'mal'] };
    function filaPago(e, p) {
        const est = p.estado || 'confirmado', [nombre, clase] = ESTADO_PAGO[est] || [est, ''];
        const puedeBorrar = puedeValidar() || (est === 'pendiente' && yo && p.registrado_por === yo.usuario);
        const quien = est === 'pendiente' ? (p.registrado_por ? `registró ${p.registrado_por}` : '')
            : est === 'confirmado' ? (p.validado_por ? `confirmó ${p.validado_por}` : '') : `rechazó ${p.validado_por || ''}${p.motivo ? `: ${p.motivo}` : ''}`;
        return `<li class="pago ${clase}"><span><b>${esc(rd(p.monto))}</b> · ${esc(TIPO_PAGO[p.tipo] || p.tipo)}${p.metodo ? ` · ${esc(p.metodo)}` : ''} <span class="ep ${clase}">${esc(nombre)}</span>
                <br><small>${esc(diaCorto(p.fecha))}${p.nota ? ` · ${esc(p.nota)}` : ''}${quien ? ` · ${esc(quien)}` : ''}</small>
                ${est === 'pendiente' && puedeValidar() ? `<span class="validar-btns"><button type="button" class="btn btn-verde btn-sm" data-validar-pago="${p.id}" data-codigo="${esc(e.codigo)}">${ico('ok', 14)} Confirmar</button>
                    <button type="button" class="btn btn-borde btn-sm" data-rechazar-pago="${p.id}" data-codigo="${esc(e.codigo)}">Rechazar</button></span>` : ''}</span>
            ${puedeBorrar ? `<button type="button" class="x" data-quitar-pago="${p.id}" data-codigo="${esc(e.codigo)}" title="Borrar este pago" aria-label="Borrar este pago">×</button>` : ''}</li>`;
    }
    async function validarPago(btn, accion) {
        let motivo = '';
        if (accion === 'rechazar') {
            motivo = window.prompt('¿Por qué se rechaza este pago? (por ejemplo: no llegó la transferencia)') || '';
            if (!motivo.trim()) return;
        }
        btn.disabled = true;
        try {
            const r = await post('/admin/pago/validar', { codigo: btn.dataset.codigo, id: Number(btn.dataset.validarPago || btn.dataset.rechazarPago), accion, motivo });
            reemplazar(r.expediente);
            toast(accion === 'confirmar' ? 'Pago confirmado. Ya cuenta como cobrado.' : 'Pago rechazado. No cuenta como cobrado.');
        } catch (e) { if (e.message !== 'sesion') toast(e.message); btn.disabled = false; }
    }
    function bloqueCobro(e) {
        const pagos = e.pagos || [], total = e.total_dop, pagado = e.pagado || 0;
        const pct = total ? Math.min(100, Math.round(pagado / total * 100)) : 0;
        const tipo = !pagado ? 'anticipo' : 'saldo';
        const sugerido = total == null ? '' : (tipo === 'anticipo' ? Math.round(total / 2) : e.pendiente || '');
        return `<div class="bloque">
            <div class="bloque-t"><span>${ico('cash')} Cobro 50% / 50%</span><span>${total ? `${pct}% cobrado` : ''}</span></div>
            <div class="cobro-nums">
                <div><small>Total</small><b>${esc(rd(total))}</b></div>
                <div class="ok"><small>Recibido</small><b>${esc(rd(pagado))}</b></div>
                <div class="${e.pendiente > 0 ? 'pend' : 'ok'}"><small>Pendiente</small><b>${esc(total == null ? '—' : rd(e.pendiente))}</b></div>
            </div>
            ${total ? `<div class="progreso"><i style="width:${pct}%"></i></div>` : '<small style="color:var(--suave)">Este expediente tiene un trámite sin precio; ponle precio para calcular lo pendiente.</small>'}
            ${e.por_confirmar > 0 ? `<div class="pago-alerta">${ico('validar_pagos', 18)}<span><b>${esc(rd(e.por_confirmar))} por confirmar</b>${puedeValidar() ? 'Revisa que el dinero llegó y confírmalo o recházalo.' : 'Administración o contabilidad debe confirmarlo. El cliente ve «Pago pendiente por confirmar».'}</span></div>` : ''}
            ${pagos.length ? `<ul class="filas pagos-lista">${pagos.map(p => filaPago(e, p)).join('')}</ul>` : ''}
            ${e.pendiente === 0 && pagado > 0 ? `<small style="color:var(--verde);font-weight:700">${ico('ok')} Pagado completo</small>` : `
            <form class="form-pago" data-codigo="${esc(e.codigo)}" data-total="${total ?? ''}" data-pendiente="${e.pendiente ?? ''}">
                <select class="input" name="tipo" aria-label="Tipo de pago">${Object.entries(TIPO_PAGO).map(([k, n]) => `<option value="${k}"${k === tipo ? ' selected' : ''}>${n}</option>`).join('')}</select>
                <input class="input" name="monto" type="number" min="1" step="any" inputmode="decimal" placeholder="Monto RD$" value="${sugerido}" aria-label="Monto recibido" required>
                <select class="input" name="metodo" aria-label="Método">${METODOS.map(m => `<option>${m}</option>`).join('')}</select>
                <input class="input" name="fecha" type="date" value="${hoyRD()}" aria-label="Fecha del pago">
                <button class="btn btn-borde btn-sm" type="submit">Registrar</button>
            </form>`}
        </div>`;
    }

    function bloqueNotas(e) {
        const notas = e.notas || [];
        return `<div class="bloque">
            <div class="bloque-t"><span>${ico('nota')} Notas internas</span><span style="text-transform:none;letter-spacing:0">el cliente no las ve</span></div>
            ${notas.length ? `<ul class="filas">${notas.map(n => `<li><span>${esc(n.texto)}<br><small>${esc(fecha(n.creado))}</small></span>
                <button type="button" class="x" data-quitar-nota="${n.id}" data-codigo="${esc(e.codigo)}" title="Borrar nota" aria-label="Borrar nota">×</button></li>`).join('')}</ul>` : ''}
            <form class="form-nota" data-codigo="${esc(e.codigo)}">
                <input class="input" name="texto" maxlength="1000" placeholder="Ej.: Falta copia de cédula · Cita el martes 10 am" required>
                <button class="btn btn-borde btn-sm" type="submit">Guardar</button>
            </form>
        </div>`;
    }

    /** Separa «+1 809… · correo@…» en WhatsApp y correo. */
    function partesContacto(c) {
        const partes = String(c || '').split('·').map(x => x.trim()).filter(Boolean);
        return { wa: partes.filter(x => !x.includes('@')).join(' '), email: partes.find(x => x.includes('@')) || '' };
    }
    function bloqueDatosCliente(e) {
        if (!editandoCliente.has(e.codigo)) return `<div><button type="button" class="link" data-editar-cliente="${esc(e.codigo)}">${ico('editar', 14)} Editar datos del cliente (nombre, WhatsApp, correo, país)</button></div>`;
        const c = partesContacto(e.contacto);
        return `<form class="bloque form-cliente" data-codigo="${esc(e.codigo)}">
            <div class="bloque-t"><span>Datos del cliente</span></div>
            <div class="dos">
                <div><label class="campo" for="cn-${esc(e.codigo)}">Nombre</label><input class="input" id="cn-${esc(e.codigo)}" name="nombre" maxlength="80" required value="${esc(e.nombre || e.cliente || '')}"></div>
                <div><label class="campo" for="cp-${esc(e.codigo)}">País donde vive</label><select class="input" id="cp-${esc(e.codigo)}" name="pais">${cat ? Object.entries(cat.paises).map(([id, p]) => `<option value="${esc(id)}"${id === e.pais ? ' selected' : ''}>${p.bandera} ${esc(p.nombre)}</option>`).join('') : ''}</select></div>
            </div>
            <div class="dos">
                <div><label class="campo" for="cw-${esc(e.codigo)}">WhatsApp</label><input class="input" id="cw-${esc(e.codigo)}" name="wa" maxlength="40" inputmode="tel" placeholder="+1 809 555 0000" value="${esc(c.wa)}"></div>
                <div><label class="campo" for="ce-${esc(e.codigo)}">Correo</label><input class="input" id="ce-${esc(e.codigo)}" name="email" type="email" maxlength="80" value="${esc(c.email)}"></div>
            </div>
            <small style="color:var(--suave)">El cambio queda anotado en el historial con tu usuario.</small>
            <div class="acciones"><button class="btn btn-azul btn-sm" type="submit">Guardar datos</button><button class="btn btn-borde btn-sm" type="button" data-cancelar-cliente="${esc(e.codigo)}">Cancelar</button></div>
        </form>`;
    }
    const ESTADO_CORREO = { enviado: ['Enviado', 'ok'], fallido: ['No se pudo enviar', 'mal'], enviando: ['Enviando', 'va'] };
    function bloqueHistorial(e) {
        const act = e.actividad || [], cor = e.correos || [];
        if (!act.length && !cor.length) return '';
        return `<details class="bloque hist"><summary>${ico('reloj')} Historial del expediente (${act.length})${cor.length ? ` · ${cor.length} ${cor.length === 1 ? 'correo' : 'correos'}` : ''}</summary>
            ${cor.length ? `<p class="hist-t">${ico('correo', 14)} Correos al cliente</p><ul class="filas">${cor.map(c => { const [n, k] = ESTADO_CORREO[c.estado] || [c.estado, 'va'];
                return `<li><span><b>${esc(c.asunto)}</b><br><small>${esc(c.para)}</small></span><small style="text-align:right;white-space:nowrap"><span class="ec ${k}">${esc(n)}</span><br>${esc(fecha(c.fecha))}</small></li>`; }).join('')}</ul>
            <p class="hist-t">${ico('reloj', 14)} Movimientos</p>` : ''}
            <ul class="filas">${act.map(a => `<li><span><b>${esc(a.accion)}</b>${a.detalle ? `<br><small>${esc(a.detalle)}</small>` : ''}</span>
                <small style="text-align:right;white-space:nowrap">${esc(a.usuario)}<br>${esc(fecha(a.fecha))}</small></li>`).join('')}</ul></details>`;
    }

    function tarjeta(e) {
        const abierto = abiertos.has(e.codigo);
        const items = e.tramites || [];
        const contacto = e.contacto
            ? String(e.contacto).split('·').map(x => x.trim()).filter(Boolean).map(x =>
                x.includes('@') ? `<a href="mailto:${esc(x)}">${esc(x)}</a>` : (telefono(x) ? `<a href="tel:+${telefono(x)}">${esc(x)}</a>` : esc(x))).join('<br>')
            : '—';
        const titulo = items.length > 1 ? items.map(t => t.titulo).join(' · ') : e.servicio_titulo;
        const llego = [ORIGEN_N[origenDe(e)] ?? origenDe(e), e.origen === 'otro' && e.origen_detalle ? `(${e.origen_detalle})` : '',
            e.pagina ? `· ${PAGINA_N[e.pagina] || e.pagina}` : '', e.dispositivo ? `· ${DISP_N[e.dispositivo] || e.dispositivo}` : ''].filter(Boolean).join(' ');
        const dias = diasSin(e);
        const cuerpo = !abierto ? '' : `
            <div class="exp-cuerpo">
                ${puede('expedientes') ? bloqueRapido(e) : ''}
                <div class="actual"><small>Lo que ve el cliente arriba · ${esc(fecha(e.actualizado))}</small><b>${esc(e.estado)}:</b> ${esc(e.detalle)}</div>
                ${bloqueAvisar(e)}
                <div class="tramites">
                    <p class="tramites-t">Trámites en este código (${items.length})</p>
                    ${items.map(t => bloqueTramite(e, t, items.length > 1)).join('')}
                    ${!puede('expedientes') ? '' : agregando.has(e.codigo) ? `<form class="agregar" data-codigo="${esc(e.codigo)}">
                        <span class="campo" style="margin:0">Agregar otro trámite a esta solicitud (mismo código ${esc(e.codigo)})</span>
                        ${campoServicio()}
                        <div class="acciones"><button class="btn btn-azul btn-sm" type="submit">Agregar trámite</button>
                            <button class="btn btn-borde btn-sm" type="button" data-cerrar-agregar="${esc(e.codigo)}">Cancelar</button></div>
                    </form>` : `<button type="button" class="link agregar-abrir" data-abrir-agregar="${esc(e.codigo)}">+ Agregar otro trámite a esta solicitud</button>`}
                </div>
                ${puede('pagos') ? bloqueCobro(e) : ''}
                ${puede('expedientes') ? bloqueNotas(e) : ''}
                ${bloqueEntrega(e)}
                <details class="bloque datos-cli"${editandoCliente.has(e.codigo) ? ' open' : ''}>
                    <summary>${ico('usuario', 14)} Datos del cliente</summary>
                    <dl class="datos">
                        <div><dt>Contacto</dt><dd>${contacto}</dd></div>
                        <div><dt>País</dt><dd>${bandera(e.pais)} ${esc(paisNombre(e.pais, e.pais_detalle))}</dd></div>
                        <div><dt>Llegó por</dt><dd>${esc(llego || 'Sin dato')}</dd></div>
                        <div><dt>Creado</dt><dd>${esc(fecha(creado(e)))}${e.idioma && e.idioma !== 'es' ? ` · ${esc(IDIOMA_N[e.idioma] || e.idioma)}` : ''}</dd></div>
                        ${e.mensaje ? `<div style="grid-column:1/-1"><dt>Nota del cliente</dt><dd>${esc(e.mensaje)}</dd></div>` : ''}
                    </dl>
                    ${puede('expedientes') ? `<div style="margin-top:12px">${bloqueDatosCliente(e)}</div>` : ''}
                </details>
                ${bloqueHistorial(e)}
                <div class="bloque">
                    <div class="bloque-t"><span>${ico('chat')} Mensajes rápidos por WhatsApp</span></div>
                    <div class="rapidos">
                        <a href="${linkDocs(e)}" target="_blank" rel="noopener">${ico('clip', 14)} Pedir documentos</a>
                        ${puede('pagos') ? `<a href="${linkPago(e)}" target="_blank" rel="noopener">${ico('cash', 14)} Recordar pago</a>` : ''}
                        <a href="${linkListo(e)}" target="_blank" rel="noopener">${ico('ok', 14)} Trámite listo</a>
                    </div>
                </div>
                <div class="acciones">
                    <button class="btn btn-borde" type="button" data-copiar="${esc(e.codigo)}">Copiar código</button>
                </div>
                ${puede('usuarios') ? (borrando === e.codigo ? `<form class="confirmar-borrar" data-borrar="${esc(e.codigo)}">
                    <b>${ico('zafacon')} ¿Eliminar a ${esc(e.nombre || e.cliente)}?</b>
                    <p>El cliente pasa al zafacón y deja de verse en el panel y en Rastrear. Durante ${DIAS_ZAFACON} días puedes reactivarlo tal como está; después se borra por completo, con sus documentos.</p>
                    <input class="input" name="motivo" maxlength="200" placeholder="Motivo (opcional). Ej.: No respondió, solicitud duplicada">
                    <div class="acciones"><button class="btn btn-peligro" type="submit">Sí, mover al zafacón</button><button class="btn btn-borde" type="button" data-cancelar-borrar>Cancelar</button></div>
                </form>` : `<div class="zona-peligro"><button type="button" class="link-rojo" data-eliminar="${esc(e.codigo)}">${ico('zafacon', 14)} Eliminar cliente</button></div>`) : ''}
            </div>`;
        const cobroChip = !puede('pagos') ? '' : (e.por_confirmar > 0 ? '<span class="chip porconf">Pago por confirmar</span>' : '') + (e.pendiente > 0 ? (e.pagado > 0 ? `<span class="chip cobro">Debe ${esc(rd(e.pendiente))}</span>` : (e.paso < 4 ? '<span class="chip cobro">Sin anticipo</span>' : `<span class="chip cobro">Debe ${esc(rd(e.pendiente))}</span>`))
            : (e.pagado > 0 && e.pendiente === 0 ? '<span class="chip pagado">Pagado</span>' : ''));
        return `<article class="exp${recien.has(e.codigo) ? ' recien' : ''}" data-codigo="${esc(e.codigo)}">
            <button type="button" class="exp-cab" aria-expanded="${abierto}">
                <span class="exp-nombre">${esc(e.nombre || e.cliente)}</span>
                <span class="chip ${tono(e.paso)}">${esc(items.length > 1 ? e.estado : (e.paso === 3 ? 'En institución' : PASOS[e.paso] || e.estado))}</span>
                <span class="exp-serv">${esc(titulo)}</span>
                <span class="exp-meta"><span class="codigo">${esc(e.codigo)}</span>${items.length > 1 ? `<span>${items.length} trámites</span>` : ''}${bandera(e.pais)} <span>· ${esc(fecha(e.actualizado))}</span>
                    ${detenido(e) ? `<span class="chip alerta">${dias} días sin moverse</span>` : ''}${cobroChip}</span>
                ${barra(e.paso)}
            </button>${cuerpo}
        </article>`;
    }

    function pintar() {
        pintarFiltros();
        const lista = filtrados();
        $('mostrando').textContent = expedientes.length ? `Mostrando ${lista.length} de ${expedientes.length}` : '';
        $('lista').innerHTML = lista.length ? lista.map(tarjeta).join('')
            : `<div class="vacio"><b>${expedientes.length ? 'Sin resultados' : 'Aún no hay expedientes'}</b>${expedientes.length ? 'Prueba con otra búsqueda o filtro.' : 'Las solicitudes del formulario de tu página aparecerán aquí. También puedes crear una con «Nuevo expediente».'}</div>`;
    }

    function excel(lista, nombre) {
        const enc = ['Código', 'Nombre', 'Contacto', 'País', 'Trámites', 'Paso', 'Estado', 'Total (RD$)', 'Recibido (RD$)', 'Pendiente (RD$)',
            'Llegó por', 'Página', 'Dispositivo', 'Idioma', 'Creado', 'Última actualización', 'Días sin moverse', 'Notas internas'];
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const filas = lista.map(e => [e.codigo, e.nombre || e.cliente, e.contacto, paisNombre(e.pais, e.pais_detalle), (e.tramites || []).map(t => t.titulo).join(' | '),
            e.paso, e.estado, e.total_dop ?? '', e.pagado || 0, e.pendiente ?? '', ORIGEN_N[origenDe(e)] ?? origenDe(e), PAGINA_N[e.pagina || ''] || e.pagina,
            DISP_N[e.dispositivo || ''].replace(/^\S+ /, ''), IDIOMA_N[e.idioma || ''] || e.idioma, String(creado(e)).slice(0, 16).replace('T', ' '),
            String(e.actualizado).slice(0, 16).replace('T', ' '), e.paso < 4 ? diasSin(e) : '', (e.notas || []).map(n => n.texto).join(' | ')]);
        descargar(nombre, '﻿' + [enc, ...filas].map(f => f.map(q).join(',')).join('\r\n'), 'text/csv');
    }

    // ============================================================ RESUMEN
    function enPeriodo(dia, dias) { return !dias || dia >= sumarDias(hoyRD(), -(dias - 1)); }
    function contar(lista, clave) {
        const c = {}; lista.forEach(x => { const k = clave(x); if (k != null) c[k] = (c[k] || 0) + 1; });
        return Object.entries(c).sort((a, b) => b[1] - a[1]);
    }
    function ranking(titulo, sub, pares, nombre, max = 6) {
        const total = pares.reduce((s, [, v]) => s + v, 0), top = pares.slice(0, max);
        const resto = pares.slice(max).reduce((s, [, v]) => s + v, 0);
        if (resto) top.push(['__otros', resto]);
        const mayor = Math.max(1, ...top.map(([, v]) => v));
        return `<div class="card"><h3>${titulo}</h3><p class="sub">${sub}</p>
            ${top.length ? `<ul class="rank">${top.map(([k, v]) => `<li><span title="${esc(k === '__otros' ? 'Otros' : nombre(k))}">${esc(k === '__otros' ? 'Otros' : nombre(k))}</span><b>${v} <small style="color:var(--suave);font-weight:600">· ${Math.round(v / total * 100)}%</small></b><i><em style="width:${(v / mayor * 100).toFixed(1)}%"></em></i></li>`).join('')}</ul>`
                : '<p class="rank-vacio">Sin datos en este período.</p>'}</div>`;
    }

    function graficaDias(lista, dias) {
        // barras por día (o por mes si es "Todo")
        let cubos = [];
        if (dias) {
            for (let i = dias - 1; i >= 0; i--) cubos.push({ k: sumarDias(hoyRD(), -i), v: 0 });
            const idx = Object.fromEntries(cubos.map((c, i) => [c.k, i]));
            lista.forEach(e => { const i = idx[diaRD(creado(e))]; if (i != null) cubos[i].v++; });
        } else {
            const hoy = hoyRD(); let [y, m] = hoy.split('-').map(Number);
            for (let i = 0; i < 12; i++) { cubos.unshift({ k: `${y}-${String(m).padStart(2, '0')}`, v: 0 }); m--; if (!m) { m = 12; y--; } }
            const idx = Object.fromEntries(cubos.map((c, i) => [c.k, i]));
            lista.forEach(e => { const i = idx[diaRD(creado(e)).slice(0, 7)]; if (i != null) cubos[i].v++; });
        }
        const W = 640, H = 190, pb = 22, pt = 10, n = cubos.length, max = Math.max(1, ...cubos.map(c => c.v));
        const paso = W / n, ancho = Math.max(2, paso - 2);
        const y = v => H - pb - (v / max) * (H - pb - pt);
        const etiqueta = c => dias ? diaCorto(c.k) : new Date(c.k + '-15').toLocaleDateString('es-DO', { month: 'short' });
        const cadaN = Math.ceil(n / 6);
        const marcas = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Solicitudes por ${dias ? 'día' : 'mes'}">
            ${marcas.map(v => `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#E8EDF3" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('')}
            ${cubos.map((c, i) => {
                const h = Math.max(c.v ? 3 : 0, H - pb - y(c.v)), x = i * paso + (paso - ancho) / 2;
                return `<rect x="${x.toFixed(1)}" y="${(H - pb - h).toFixed(1)}" width="${ancho.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4, ancho / 2)}" fill="${c.k === hoyRD() ? '#CE1126' : '#002D62'}"/>
                    <rect x="${(i * paso).toFixed(1)}" y="0" width="${paso.toFixed(1)}" height="${H}" fill="transparent" data-tip="${esc(etiqueta(c))}: ${c.v} ${c.v === 1 ? 'solicitud' : 'solicitudes'}"/>`;
            }).join('')}
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--suave-2);margin-top:4px">${cubos.filter((c, i) => i % cadaN === 0 || i === n - 1).map(c => `<span>${esc(etiqueta(c))}</span>`).join('')}</div>
        <div style="font-size:11px;color:var(--suave-2);margin-top:2px">Máximo: ${max} ${max === 1 ? 'solicitud' : 'solicitudes'} en un ${dias ? 'día' : 'mes'}${dias ? ' · el rojo es hoy' : ''}</div>`;
    }

    function pintarResumen() {
        const dias = periodo;
        const hoy = hoyRD();
        const enP = expedientes.filter(e => enPeriodo(diaRD(creado(e)), dias));
        const antes = dias ? expedientes.filter(e => { const d = diaRD(creado(e)); return d < sumarDias(hoy, -(dias - 1)) && d >= sumarDias(hoy, -(2 * dias - 1)); }).length : null;
        const deHoy = expedientes.filter(e => diaRD(creado(e)) === hoy).length;
        const semana = expedientes.filter(e => enPeriodo(diaRD(creado(e)), 7)).length;
        const mesActual = hoy.slice(0, 7);
        const delMes = expedientes.filter(e => diaRD(creado(e)).startsWith(mesActual)).length;
        const enProceso = expedientes.filter(e => e.paso < 4).length;
        const det = expedientes.filter(detenido).length;
        const listosP = enP.filter(e => e.paso === 4).length;
        const cotizado = enP.reduce((s, e) => s + (e.total_dop || 0), 0);
        const pagosP = expedientes.flatMap(e => confirmados(e.pagos).filter(p => enPeriodo(p.fecha, dias)));
        const cobrado = pagosP.reduce((s, p) => s + p.monto, 0);
        const porCobrar = expedientes.reduce((s, e) => s + (e.pendiente || 0), 0);
        const cambio = antes == null ? '' : (antes === 0 ? (enP.length ? '<small class="sube">▲ nuevo</small>' : '<small>igual</small>')
            : (() => { const p = Math.round((enP.length - antes) / antes * 100); return p === 0 ? '<small>igual que antes</small>' : `<small class="${p > 0 ? 'sube' : 'baja'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% vs. período anterior</small>`; })());
        const tramitesP = enP.flatMap(e => e.tramites || []);
        const nP = { 7: 'últimos 7 días', 30: 'últimos 30 días', 90: 'últimos 90 días', 0: 'desde el inicio' }[dias];

        $('tResumen').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Resumen del negocio</h2><p>${esc(nP)} · se actualiza solo</p></div>
                <div class="chips" id="periodos">${[[7, '7 días'], [30, '30 días'], [90, '90 días'], [0, 'Todo']].map(([d, n]) => `<button type="button" class="chip-btn${dias === d ? ' on' : ''}" data-periodo="${d}">${n}</button>`).join('')}</div></div>
            <div class="kpis">
                <div class="kpi"><span>Solicitudes (${esc(nP)})</span><b>${num(enP.length)}</b>${cambio}</div>
                <div class="kpi"><span>Hoy</span><b>${num(deHoy)}</b><small>esta semana: ${num(semana)} · este mes: ${num(delMes)}</small></div>
                <div class="kpi"><span>En proceso ahora</span><b>${num(enProceso)}</b><small>${num(listosP)} completados en el período</small></div>
                <div class="kpi${det ? ' alerta' : ''}"><span>Detenidos (${DIAS_ALERTA}+ días)</span><b>${num(det)}</b>${det ? '<small><a href="#" data-ver-detenidos>Ver cuáles →</a></small>' : '<small>todo al día ✅</small>'}</div>
            </div>
            ${!puede('pagos') ? '' : `<div class="kpis">
                <div class="kpi"><span>Cotizado (${esc(nP)})</span><b>${esc(rd(cotizado))}</b><small>suma de los precios de los trámites</small></div>
                <div class="kpi dinero"><span>Cobrado (${esc(nP)})</span><b>${esc(rd(cobrado))}</b><small>${pagosP.length} ${pagosP.length === 1 ? 'pago' : 'pagos'} registrados</small></div>
                <div class="kpi"><span>Por cobrar (todos)</span><b style="color:var(--rojo)">${esc(rd(porCobrar))}</b><small><a href="#" data-ir="pagos">Ver pendientes →</a></small></div>
            </div>`}
            <div class="card"><h3>Solicitudes por ${dias ? 'día' : 'mes'}</h3><p class="sub">Formulario de la página + expedientes que creas en el panel. Pasa el dedo o el ratón por las barras.</p>
                <div class="grafica" id="graf">${graficaDias(expedientes, dias)}</div></div>
            <div class="grid-2">
                ${ranking('Trámites más pedidos', 'Cuántas veces se pidió cada trámite', contar(tramitesP, t => t.servicio_id === 'otro' ? `Otro: ${t.titulo}` : t.servicio_id),
                    k => (cat && cat.servicios[k] && cat.servicios[k].title) || k)}
                ${ranking('¿Desde dónde escriben?', 'País donde vive el cliente', contar(enP, e => e.pais || ''), k => `${bandera(k)} ${paisNombre(k)}`)}
                ${ranking('¿Por dónde te encontraron?', 'Instagram, Google, WhatsApp… (desde que se activó esta función)', contar(enP, e => origenDe(e)), k => ORIGEN_N[k] ?? k)}
                ${ranking('¿Desde qué página pidieron?', 'Dónde llenaron el formulario', contar(enP, e => e.pagina || ''), k => PAGINA_N[k] || k)}
                ${ranking('Dispositivo', 'Celular o computadora', contar(enP.filter(e => e.pagina !== 'panel'), e => e.dispositivo || ''), k => DISP_N[k] || k)}
                ${ranking('Idioma', 'En qué idioma llenaron el formulario', contar(enP.filter(e => e.pagina !== 'panel'), e => e.idioma || ''), k => IDIOMA_N[k] || k)}
            </div>
        </div>`;
        conectarTip($('graf'));
    }

    function conectarTip(cont) {
        if (!cont) return;
        const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; cont.appendChild(tip);
        const mover = ev => {
            const p = ev.touches ? ev.touches[0] : ev;
            const el = document.elementFromPoint(p.clientX, p.clientY);
            const t = el && el.dataset && el.dataset.tip;
            if (!t) { tip.hidden = true; return; }
            const r = cont.getBoundingClientRect();
            tip.textContent = t; tip.hidden = false;
            tip.style.left = Math.min(r.width - 60, Math.max(60, p.clientX - r.left)) + 'px'; tip.style.top = (p.clientY - r.top) + 'px';
        };
        cont.addEventListener('mousemove', mover); cont.addEventListener('touchmove', mover, { passive: true }); cont.addEventListener('touchstart', mover, { passive: true });
        cont.addEventListener('mouseleave', () => { tip.hidden = true; });
    }

    // ============================================================ PAGOS
    function pintarPagos() {
        const hoy = hoyRD(), mes = hoy.slice(0, 7);
        const todosConEstado = expedientes.flatMap(e => (e.pagos || []).map(p => ({ ...p, e })));
        const porConfirmar = todosConEstado.filter(p => p.estado === 'pendiente').sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
        const todos = todosConEstado.filter(p => !p.estado || p.estado === 'confirmado');
        const delMes = todos.filter(p => String(p.fecha).startsWith(mes));
        const cobradoMes = delMes.reduce((s, p) => s + p.monto, 0);
        const pendientes = expedientes.filter(e => e.pendiente > 0).sort((a, b) => b.pendiente - a.pendiente);
        const porCobrar = pendientes.reduce((s, e) => s + e.pendiente, 0);
        const sinAnticipo = expedientes.filter(e => e.paso < 4 && !(e.pagado > 0) && e.total_dop > 0);
        const nombreMes = new Date(mes + '-15').toLocaleDateString('es-DO', { month: 'long' });
        const fila = e => {
            const pct = e.total_dop ? Math.round((e.pagado || 0) / e.total_dop * 100) : 0;
            return `<li style="display:grid;gap:6px">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><span><b>${esc(e.nombre || e.cliente)}</b> <span class="codigo">${esc(e.codigo)}</span><br>
                    <small>${esc((e.tramites || []).map(t => t.titulo).join(' · '))}</small></span>
                    <span style="text-align:right;white-space:nowrap"><b style="color:var(--rojo)">${esc(rd(e.pendiente))}</b><br><small>de ${esc(rd(e.total_dop))}</small></span></div>
                <div class="progreso"><i style="width:${pct}%"></i></div>
                <div class="rapidos"><a href="${linkPago(e)}" target="_blank" rel="noopener">${ico('cash', 14)} Recordar por WhatsApp</a>
                    <button type="button" class="link" data-ver="${esc(e.codigo)}">Registrar pago →</button></div></li>`;
        };
        $('tPagos').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Pagos</h2><p>Anticipo del 50% para iniciar y 50% al terminar</p></div></div>
            <div class="kpis">
                <div class="kpi dinero"><span>Cobrado en ${esc(nombreMes)}</span><b>${esc(rd(cobradoMes))}</b><small>${delMes.length} ${delMes.length === 1 ? 'pago' : 'pagos'}</small></div>
                ${porConfirmar.length ? `<div class="kpi alerta"><span>Por confirmar</span><b>${esc(rd(porConfirmar.reduce((s, p) => s + p.monto, 0)))}</b><small>${porConfirmar.length} ${porConfirmar.length === 1 ? 'pago' : 'pagos'} sin confirmar</small></div>` : ''}
                <div class="kpi"><span>Por cobrar</span><b style="color:var(--rojo)">${esc(rd(porCobrar))}</b><small>${pendientes.length} ${pendientes.length === 1 ? 'cliente' : 'clientes'}</small></div>
                <div class="kpi${sinAnticipo.length ? ' alerta' : ''}"><span>Sin anticipo todavía</span><b>${sinAnticipo.length}</b><small>expedientes abiertos sin ningún pago</small></div>
            </div>
            ${porConfirmar.length ? `<div class="card por-confirmar"><h3>${ico('validar_pagos', 18)} Pagos por confirmar (${porConfirmar.length})</h3>
                <p class="sub">${puedeValidar() ? 'Revisa en tu banco o app que el dinero llegó antes de confirmar. Hasta entonces no cuentan como cobrados.' : 'Los registró el equipo; administración o contabilidad debe confirmarlos.'}</p>
                <ul class="filas pagos-lista">${porConfirmar.map(p => filaPago(p.e, p).replace('<li class="pago pend"><span>', `<li class="pago pend"><span><b class="pc-cli">${esc(p.e.nombre || p.e.cliente)}</b> <span class="codigo">${esc(p.e.codigo)}</span><br>`)).join('')}</ul></div>` : ''}
            <div class="card"><h3>Pendientes de cobro</h3><p class="sub">De mayor a menor. Toca «Registrar pago» para anotar lo que recibiste.</p>
                ${pendientes.length ? `<ul class="filas">${pendientes.map(fila).join('')}</ul>` : '<p class="rank-vacio">Nadie te debe nada.</p>'}</div>
            <div class="grid-2">
                <div class="card"><h3>Pagos recientes</h3><p class="sub">Los últimos 20 confirmados</p>
                    ${todos.length ? `<ul class="filas">${todos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id).slice(0, 20).map(p => `<li><span><b>${esc(p.e.nombre || p.e.cliente)}</b><br><small>${esc(diaCorto(p.fecha))} · ${esc(TIPO_PAGO[p.tipo] || p.tipo)}${p.metodo ? ` · ${esc(p.metodo)}` : ''}</small></span><b style="color:var(--verde)">${esc(rd(p.monto))}</b></li>`).join('')}</ul>` : '<p class="rank-vacio">Todavía no has registrado pagos.</p>'}</div>
                ${ranking(`Cómo te pagan (${esc(nombreMes)})`, 'Método de pago de este mes', contar(delMes, p => p.metodo || 'Sin dato'), k => k)}
            </div>
        </div>`;
    }

    // ============================================================ PRECIOS
    async function cargarPrecios() {
        if (!precios) $('tPrecios').innerHTML = '<div class="vacio"><b>Cargando precios…</b></div>';
        try { precios = await api('/admin/precios'); pintarPrecios(); }
        catch (e) { if (e.message !== 'sesion') $('tPrecios').innerHTML = `<div class="vacio"><b>No se pudieron cargar los precios</b>${esc(e.message)}</div>`; }
    }
    function pintarPrecios() {
        const foco = document.activeElement && document.activeElement.id;
        const q = preciosQ.toLowerCase();
        const lista = precios.servicios.filter(s => (!preciosCat || s.category === preciosCat) && (!q || s.title.toLowerCase().includes(q)));
        const porCat = {}; lista.forEach(s => (porCat[s.category] = porCat[s.category] || []).push(s));
        const mods = precios.servicios.filter(s => s.modificado).length;
        $('tPrecios').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Precios</h2><p>Precio al cliente = tasa oficial + tu honorario. Al guardar, la página se actualiza al momento.</p></div></div>
            <div class="card">
                <div class="dos" style="margin-bottom:6px">
                    <div class="buscar" style="margin:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                        <input id="pQ" class="input" type="search" placeholder="Buscar servicio" value="${esc(preciosQ)}"></div>
                    <select id="pCat" class="input"><option value="">Todas las categorías</option>${Object.entries(precios.categorias).map(([k, n]) => `<option value="${esc(k)}"${preciosCat === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
                </div>
                <p class="sub" style="margin:6px 0 4px">${precios.servicios.length} servicios${mods ? ` · ${mods} con precio cambiado` : ''}</p>
                <div class="precio-cab"><span>Servicio</span><span>Tasa oficial</span><span>Honorario</span><span>Total</span><span></span></div>
                ${Object.entries(porCat).map(([c, arr]) => `<p class="cat-t">${esc(precios.categorias[c] || c)}</p>` + arr.map(s => `
                    <form class="precio-fila" data-sid="${esc(s.id)}">
                        <div class="nom"><b>${esc(s.title)}${s.modificado ? '<span class="mod">cambiado</span>' : ''}</b>${s.modificado ? `<small>Original: ${esc(rd(s.tax_base))} + ${esc(rd(s.fee_base))}</small>` : ''}</div>
                        <label class="pin"><small>Tasa oficial</small><input class="input" id="tax-${esc(s.id)}" name="tax" type="number" min="0" step="any" inputmode="decimal" value="${s.tax}" aria-label="Tasa oficial de ${esc(s.title)}" title="Tasa oficial (lo que cobra la institución)"></label>
                        <label class="pin"><small>Honorario</small><input class="input" id="fee-${esc(s.id)}" name="fee" type="number" min="0" step="any" inputmode="decimal" value="${s.fee}" aria-label="Honorario de ${esc(s.title)}" title="Tu honorario"></label>
                        <span class="tot" data-tot>${esc(rd(s.tax + s.fee))}</span>
                        <span class="acc"><button class="btn btn-azul btn-sm" type="submit" disabled>Guardar</button>${s.modificado ? `<button class="btn btn-borde btn-sm" type="button" data-restaurar="${esc(s.id)}" title="Volver al precio original">↺</button>` : ''}</span>
                    </form>`).join('')).join('') || '<p class="rank-vacio" style="margin-top:12px">Ningún servicio coincide.</p>'}
            </div>
            <div class="card"><h3>Historial de cambios</h3><p class="sub">Cada cambio de precio queda anotado</p>
                ${precios.historial.length ? `<ul class="filas">${precios.historial.slice(0, 30).map(h => `<li><span><b>${esc(h.title)}</b><br><small>${esc(fecha(h.fecha))}</small></span>
                    <span style="text-align:right;font-size:13px"><s style="color:var(--suave-2)">${esc(rd((h.tax_antes || 0) + (h.fee_antes || 0)))}</s> → <b>${esc(rd(h.tax + h.fee))}</b><br><small>tasa ${esc(rd(h.tax))} · honorario ${esc(rd(h.fee))}</small></span></li>`).join('')}</ul>` : '<p class="rank-vacio">Todavía no has cambiado ningún precio.</p>'}</div>
        </div>`;
        if (foco && $(foco)) { const el = $(foco); el.focus(); if (el.type === 'search') { const n = el.value.length; el.setSelectionRange(n, n); } }
    }

    // ============================================================ HERRAMIENTAS
    function pintarHerramientas() {
        const base = sitio();
        const enlaces = [['Instagram (enlace de la bio)', 'instagram'], ['Historias y posts de Instagram', 'instagram&utm_campaign=historias'], ['Facebook', 'facebook'],
            ['Estados de WhatsApp', 'whatsapp'], ['Catálogo de WhatsApp Business', 'whatsapp&utm_campaign=catalogo'], ['TikTok', 'tiktok'], ['Google (perfil del negocio)', 'google']];
        $('tHerr').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Herramientas</h2><p>Para el día a día</p></div></div>
            <div class="card"><h3>Enlaces para saber de dónde llegan</h3>
                <p class="sub">Usa estos enlaces en vez del normal. Cuando alguien entre por uno y haga una solicitud, el panel te dirá por dónde llegó (pestaña Resumen → «¿Por dónde te encontraron?»).</p>
                ${enlaces.map(([n, s]) => { const u = `${base}/?utm_source=${s}`; return `<div class="enlace"><span><b>${esc(n)}</b><code>${esc(u)}</code></span><button type="button" class="btn btn-borde btn-sm" data-copiar-txt="${esc(u)}">Copiar</button></div>`; }).join('')}
            </div>
            <div class="card"><h3>Descargas</h3><p class="sub">Guarda una copia de tus datos cuando quieras (además del respaldo automático diario del servidor).</p>
                <div class="herr">
                    <a class="btn btn-borde" href="/api/admin/exportar">Excel de todos los trámites</a>
                    <button type="button" class="btn btn-borde" id="btnExcelTodo">Excel con cobros y origen</button>
                    <a class="btn btn-azul" href="/api/admin/respaldo">Respaldo completo de la base de datos</a>
                </div>
            </div>
            <div class="card"><h3>Alerta de expedientes detenidos</h3><p class="sub">Un expediente se marca en amarillo cuando lleva ${DIAS_ALERTA} días o más sin actualizar su avance y aún no está listo.</p>
                <button type="button" class="btn btn-borde" data-ver-detenidos>Ver detenidos (${expedientes.filter(detenido).length})</button></div>
        </div>`;
    }

    // ============================================================ USUARIOS
    const PRESETS = {
        'Dueño (todo)': Object.keys({ expedientes: 1, pagos: 1, validar_pagos: 1, resumen: 1, precios: 1, herramientas: 1, usuarios: 1 }),
        'Gestor': ['expedientes'],
        'Gestor + cobros': ['expedientes', 'pagos'],
        'Contabilidad': ['pagos', 'validar_pagos', 'resumen', 'herramientas'],
        'Solo lectura': []
    };
    async function cargarUsuarios() {
        if (!usuariosData) $('tUsuarios').innerHTML = '<div class="vacio"><b>Cargando usuarios…</b></div>';
        try { usuariosData = await api('/admin/usuarios'); pintarUsuarios(); }
        catch (e) { if (e.message !== 'sesion') $('tUsuarios').innerHTML = `<div class="vacio"><b>No se pudo cargar</b>${esc(e.message)}</div>`; }
    }
    function formUsuario(u) {
        const nuevo = !u, permisos = new Set(u ? u.permisos : ['expedientes']);
        return `<form class="card pila" id="fUsuario" data-id="${u ? u.id : ''}" style="gap:14px">
            <h3>${nuevo ? 'Nuevo usuario' : `Editar: ${esc(u.usuario)}`}</h3>
            <div class="dos">
                <div><label class="campo" for="uUsuario">Usuario (para entrar)</label><input class="input" id="uUsuario" name="usuario" maxlength="30" autocapitalize="none" spellcheck="false" required ${nuevo ? 'placeholder="Ej.: maria"' : `value="${esc(u.usuario)}"${u.usuario === 'admin' ? ' disabled title="El usuario admin no se puede renombrar"' : ''}`}></div>
                <div><label class="campo" for="uNombre">Nombre</label><input class="input" id="uNombre" name="nombre" maxlength="60" required value="${esc(u ? u.nombre : '')}" placeholder="Ej.: María Pérez"></div>
            </div>
            <div><label class="campo" for="uCorreo">Correo para avisos <span style="font-weight:500;color:var(--suave)">(opcional)</span></label>
                <input class="input" id="uCorreo" name="correo" type="email" maxlength="120" value="${esc(u ? u.correo || '' : '')}" placeholder="Ej.: maria@tramitafacilrd.com">
                <small style="color:var(--suave)">Si tiene permiso de Expedientes, le llegará un correo cada vez que entre una solicitud nueva.</small></div>
            <div><label class="campo" for="uClave">${nuevo ? 'Contraseña temporal' : 'Contraseña temporal nueva (solo si la olvidó; déjala vacía para no cambiarla)'}</label>
                <div class="form-nota"><input class="input" id="uClave" name="clave" type="text" minlength="8" autocomplete="off" ${nuevo ? 'required' : ''} placeholder="Mínimo 8 caracteres"><button type="button" class="btn btn-borde btn-sm" data-generar-clave>Generar</button></div>
                <small style="color:var(--suave)">Dásela a la persona por un medio privado. ${u && yo && u.id === yo.id ? 'Como eres tú, quedará como tu contraseña.' : 'Al entrar, el panel le pedirá crear su propia contraseña; así nadie más la conoce.'}</small></div>
            <div><span class="campo">Permisos <span style="font-weight:500;color:var(--suave)">— atajos:</span></span>
                <div class="chips" style="margin-bottom:8px">${Object.keys(PRESETS).map(n => `<button type="button" class="chip-btn" data-preset="${esc(n)}">${esc(n)}</button>`).join('')}</div>
                <div class="checks">${Object.entries(nombresPermisos).map(([k, d]) => `<label><input type="checkbox" name="perm" value="${esc(k)}"${permisos.has(k) ? ' checked' : ''}><span><b>${esc(k[0].toUpperCase() + k.slice(1))}</b><span>${esc(d)}</span></span></label>`).join('')}</div>
                <small style="color:var(--suave)">Todos pueden ver la lista de expedientes. Sin ningún permiso el usuario es de solo lectura: consulta el estado y no recibe avisos.</small></div>
            ${nuevo ? '' : `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="activo"${u.activo ? ' checked' : ''}> Usuario activo (si lo desmarcas, ya no podrá entrar)</label>`}
            <div id="usuarioError" class="msg-error" hidden></div>
            <div class="acciones"><button class="btn btn-azul" type="submit">${nuevo ? 'Crear usuario' : 'Guardar cambios'}</button><button class="btn btn-borde" type="button" data-cancelar-usuario>Cancelar</button></div>
        </form>`;
    }
    const avatar = (nombre, clase = '') => `<span class="avatar-u ${clase}" style="background:${colorDe(nombre)}">${esc(iniciales(nombre))}</span>`;
    function pintarUsuarios() {
        const d = usuariosData, activos = d.usuarios.filter(u => u.activo);
        const roles = {}; activos.forEach(u => { const r = rolDe(u.permisos).n; roles[r] = (roles[r] || 0) + 1; });
        const nombreDe = Object.fromEntries(d.usuarios.map(u => [u.usuario, u.nombre]));
        $('tUsuarios').innerHTML = `<div class="pila">
            <div class="equipo-banner">
                <div class="eb-txt"><p class="eb-eyebrow">Panel del equipo</p><h2>Equipo de TramitaFácil RD</h2>
                    <p>${activos.length} ${activos.length === 1 ? 'persona activa' : 'personas activas'} · ${Object.entries(roles).map(([n, k]) => `${k} ${n.toLowerCase()}`).join(' · ') || 'sin usuarios'}</p></div>
                ${editandoUsuario === null ? `<button class="btn btn-blanco" type="button" data-nuevo-usuario>${ico('usuario')} Nuevo usuario</button>` : ''}
            </div>
            ${editandoUsuario !== null ? formUsuario(editandoUsuario === 'nuevo' ? null : d.usuarios.find(u => u.id === editandoUsuario)) : ''}
            <div class="personas">${d.usuarios.map(u => { const rol = rolDe(u.permisos);
                const estado = !u.activo ? ['Desactivado', 'off'] : u.cambiar_clave ? ['Pendiente de activar', 'pend'] : ['Activo', 'on'];
                return `<article class="persona${u.activo ? '' : ' inactiva'}">
                    <div class="p-cab">${avatar(u.nombre)}
                        <div class="p-id"><b>${esc(u.nombre)}${u.id === (yo && yo.id) ? ' <small>(tú)</small>' : ''}</b><span>@${esc(u.usuario)}</span></div>
                        <span class="rol ${rol.c}">${esc(rol.n)}</span></div>
                    <dl class="p-datos">
                        <div><dt>Estado</dt><dd><i class="punto ${estado[1]}"></i>${esc(estado[0])}</dd></div>
                        <div><dt>Último acceso</dt><dd>${esc(u.ultimo_acceso ? fecha(u.ultimo_acceso) : 'Nunca')}</dd></div>
                        <div style="grid-column:1/-1"><dt>Correo para avisos</dt><dd>${u.correo ? `${ico('correo', 14)} ${esc(u.correo)}` : '<span class="tenue">Sin correo</span>'}</dd></div>
                    </dl>
                    <div class="p-perm">${Object.keys(nombresPermisos).map(k => `<span class="pp${u.permisos.includes(k) ? ' si' : ''}" title="${esc(nombresPermisos[k])}">${ico(k, 14)}${esc(k[0].toUpperCase() + k.slice(1))}</span>`).join('')}</div>
                    <button type="button" class="btn btn-borde btn-sm p-editar" data-editar-usuario="${u.id}">${ico('editar', 14)} Editar</button>
                </article>`; }).join('')}</div>
            <div class="card"><h3>Actividad del equipo</h3><p class="sub">Quién hizo qué, lo más reciente primero</p>
                ${d.actividad.length ? `<ul class="linea">${d.actividad.slice(0, 60).map(a => `<li>${avatar(nombreDe[a.usuario] || a.usuario, 'mini')}
                    <span class="l-t"><b>${esc(nombreDe[a.usuario] || a.usuario)}</b> ${esc(a.accion.charAt(0).toLowerCase() + a.accion.slice(1))}${a.codigo ? ` <span class="codigo">${esc(a.codigo)}</span>` : ''}${a.detalle ? `<small>${esc(a.detalle)}</small>` : ''}</span>
                    <small class="l-f">${esc(fecha(a.fecha))}</small></li>`).join('')}</ul>` : '<p class="rank-vacio">Todavía no hay actividad.</p>'}
            </div>
        </div>`;
    }
    $('tUsuarios').addEventListener('click', ev => {
        if (ev.target.closest('[data-nuevo-usuario]')) { editandoUsuario = 'nuevo'; pintarUsuarios(); $('uUsuario').focus(); return; }
        const ed = ev.target.closest('[data-editar-usuario]');
        if (ed) { editandoUsuario = Number(ed.dataset.editarUsuario); pintarUsuarios(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (ev.target.closest('[data-cancelar-usuario]')) { editandoUsuario = null; pintarUsuarios(); return; }
        if (ev.target.closest('[data-generar-clave]')) {
            const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', a = new Uint32Array(10); crypto.getRandomValues(a);
            $('uClave').value = Array.from(a, n => abc[n % abc.length]).join(''); $('uClave').select(); return;
        }
        const pr = ev.target.closest('[data-preset]');
        if (pr) { const set = new Set(PRESETS[pr.dataset.preset]); $('fUsuario').querySelectorAll('[name="perm"]').forEach(c => { c.checked = set.has(c.value); }); }
    });
    $('tUsuarios').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
        const err = $('usuarioError'); err.hidden = true;
        try {
            const cuerpo = { nombre: f.nombre.value.trim(), correo: f.correo.value.trim(), clave: f.clave.value, permisos: [...f.querySelectorAll('[name="perm"]:checked')].map(c => c.value) };
            cuerpo.usuario = f.usuario.value.trim().toLowerCase();
            if (f.dataset.id) Object.assign(cuerpo, { id: Number(f.dataset.id), activo: f.activo.checked });
            await post('/admin/usuarios/guardar', cuerpo);
            toast(f.dataset.id ? (cuerpo.clave ? 'Usuario actualizado. Dale la contraseña temporal.' : 'Usuario actualizado') : `Usuario creado: ${cuerpo.usuario}. Dale su contraseña temporal.`);
            editandoUsuario = null; await cargarUsuarios();
            if (f.dataset.id && yo && Number(f.dataset.id) === yo.id) { const s = await api('/admin/sesion'); yo = s.usuario; aplicarPermisos(); }
        } catch (e) { if (e.message !== 'sesion') { err.hidden = false; err.textContent = e.message; } btn.disabled = false; }
    });


    // ------------------------------------------------------------ mensajes preestablecidos (los edita el administrador)
    let mensajes = [], msjServicio = '', editandoMsj = null;
    async function cargarMensajes() {
        try { mensajes = (await api('/admin/mensajes')).mensajes || []; } catch (e) { /* se usan los de siempre */ }
        if (tab === 'mensajes') pintarMensajes();
    }
    const listaMsj = (sid, paso) => mensajes.filter(m => m.servicio_id === (sid || '') && m.paso === paso);
    /** Mensajes para un trámite y paso: los suyos primero, luego los generales. El primero es el de por defecto. */
    function mensajesDe(t, paso) {
        const propios = t && t.servicio_id ? listaMsj(t.servicio_id, paso) : [], generales = listaMsj('', paso);
        return { propios, generales, defecto: (propios[0] || generales[0] || { texto: PLANTILLAS[paso] }).texto };
    }
    function tramiteDe(form) {
        const e = expedientes.find(x => x.codigo === form.dataset.codigo);
        return e && (e.tramites || []).find(x => x.id === Number(form.dataset.tramite));
    }
    function presetsHTML(t, paso) {
        const { propios, generales, defecto } = mensajesDe(t, paso);
        const lista = [...propios.map(m => [m, 'Este trámite']), ...generales.map(m => [m, 'General'])];
        const actual = t && t.paso === paso && t.detalle && !lista.some(([m]) => m.texto === t.detalle) ? t.detalle : '';
        return `<span class="presets-t">Mensajes guardados para «${esc(PASOS[paso])}»</span>
            ${lista.map(([m, de]) => `<button type="button" class="preset${m.texto === defecto ? ' sel' : ''}" data-preset-msj="${m.id}" data-texto="${esc(m.texto)}">
                <small class="${de === 'General' ? 'gen' : ''}">${m.texto === defecto ? 'Por defecto · ' : ''}${de}</small>${esc(m.texto)}</button>`).join('')}
            ${actual ? `<button type="button" class="preset" data-preset-msj="actual" data-texto="${esc(actual)}"><small class="gen">Mensaje actual</small>${esc(actual)}</button>` : ''}
            <button type="button" class="preset propio" data-msj-propio>${ico('editar', 14)} Escribir mi propio mensaje</button>`;
    }
    function opcionesTramites() {
        if (!cat) return '';
        const conPropios = new Set(mensajes.filter(m => m.servicio_id).map(m => m.servicio_id));
        return Object.entries(cat.categorias).map(([k, c]) => `<optgroup label="${esc(c.label)}">${Object.entries(cat.servicios).filter(([, s]) => s.category === k)
            .map(([id, s]) => `<option value="${esc(id)}"${id === msjServicio ? ' selected' : ''}>${esc(s.title)}${conPropios.has(id) ? ' · personalizado' : ''}</option>`).join('')}</optgroup>`).join('');
    }
    function formMsj(paso, m) {
        return `<form class="msj-form" data-paso="${paso}" data-id="${m ? m.id : ''}">
            <textarea class="input" name="texto" maxlength="500" required placeholder="Ej.: Para completar tu E-Ticket necesitamos: foto del pasaporte y el día y la fecha del vuelo.">${esc(m ? m.texto : '')}</textarea>
            <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="defecto"${m ? '' : (listaMsj(msjServicio, paso).length ? '' : ' checked')}> Usar como mensaje por defecto</label>
            <div class="acciones"><button class="btn btn-azul btn-sm" type="submit">Guardar mensaje</button><button class="btn btn-borde btn-sm" type="button" data-msj-cancelar>Cancelar</button></div>
        </form>`;
    }
    function pintarMensajes() {
        const nombre = msjServicio && cat && cat.servicios[msjServicio] ? cat.servicios[msjServicio].title : 'Todos los trámites';
        $('tMensajes').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Mensajes para el cliente</h2><p>Textos listos para cada paso. Al actualizar un trámite sale primero el de por defecto; el gestor puede elegir otro o escribir el suyo.</p></div></div>
            <div class="card"><label class="campo" for="msjSrv">Trámite</label>
                <select class="input" id="msjSrv"><option value="">Todos los trámites (mensajes generales)</option>${opcionesTramites()}</select>
                <small style="color:var(--suave)">Si un trámite no tiene mensajes propios en un paso, se usan los generales.</small></div>
            ${[1, 2, 3, 4].map(paso => { const lista = listaMsj(msjServicio, paso), gen = listaMsj('', paso)[0];
                return `<div class="card msj-paso"><h3><em>${paso}</em>${esc(PASOS[paso])}</h3>
                    <div class="msj-lista">
                        ${lista.map((m, i) => editandoMsj === m.id ? formMsj(paso, m) : `<div class="msj${i === 0 ? ' defecto' : ''}">
                            ${i === 0 ? '<span class="etq-defecto">POR DEFECTO</span>' : ''}<p>${esc(m.texto)}</p>
                            <div class="msj-acc"><button type="button" data-msj-editar="${m.id}">Editar</button>${i > 0 ? `<button type="button" data-msj-defecto="${m.id}">Usar por defecto</button>` : ''}<button type="button" class="rojo" data-msj-quitar="${m.id}">Quitar</button></div>
                        </div>`).join('')}
                        ${!lista.length && msjServicio ? `<p class="ayuda">${esc(nombre)} no tiene mensajes propios en este paso; se usa el general${gen ? `: «${esc(gen.texto)}»` : ''}.</p>` : ''}
                        ${editandoMsj === 'nuevo-' + paso ? formMsj(paso, null) : `<button type="button" class="btn btn-borde btn-sm" style="justify-self:start" data-msj-nuevo="${paso}">+ Agregar mensaje</button>`}
                    </div></div>`; }).join('')}
        </div>`;
    }
    $('tMensajes').addEventListener('change', ev => { if (ev.target.id === 'msjSrv') { msjServicio = ev.target.value; editandoMsj = null; pintarMensajes(); } });
    $('tMensajes').addEventListener('click', async ev => {
        const n = ev.target.closest('[data-msj-nuevo]'), ed = ev.target.closest('[data-msj-editar]');
        if (n) { editandoMsj = 'nuevo-' + n.dataset.msjNuevo; pintarMensajes(); const f = $('tMensajes').querySelector('.msj-form textarea'); if (f) f.focus(); return; }
        if (ed) { editandoMsj = Number(ed.dataset.msjEditar); pintarMensajes(); return; }
        if (ev.target.closest('[data-msj-cancelar]')) { editandoMsj = null; pintarMensajes(); return; }
        const df = ev.target.closest('[data-msj-defecto]'), q = ev.target.closest('[data-msj-quitar]');
        try {
            if (df) { const m = mensajes.find(x => x.id === Number(df.dataset.msjDefecto));
                mensajes = (await post('/admin/mensajes/guardar', { id: m.id, servicio: m.servicio_id, paso: m.paso, texto: m.texto, defecto: true })).mensajes; pintarMensajes(); toast('Ahora es el mensaje por defecto'); }
            if (q) { if (!window.confirm('¿Quitar este mensaje?')) return;
                mensajes = (await post('/admin/mensajes/quitar', { id: Number(q.dataset.msjQuitar) })).mensajes; pintarMensajes(); toast('Mensaje quitado'); }
        } catch (e) { if (e.message !== 'sesion') toast(e.message); }
    });
    $('tMensajes').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
        try {
            mensajes = (await post('/admin/mensajes/guardar', { id: f.dataset.id ? Number(f.dataset.id) : undefined, servicio: msjServicio,
                paso: Number(f.dataset.paso), texto: f.texto.value, defecto: f.defecto.checked })).mensajes;
            editandoMsj = null; pintarMensajes(); toast('Mensaje guardado');
        } catch (e) { if (e.message !== 'sesion') toast(e.message); btn.disabled = false; }
    });

    // ------------------------------------------------------------ zafacón (solo administradores)
    let zafaconData = null;
    async function cargarZafacon() {
        if (!zafaconData) $('tZafacon').innerHTML = '<div class="vacio"><b>Cargando…</b></div>';
        try { zafaconData = (await api('/admin/zafacon')).zafacon; pintarZafacon(); }
        catch (e) { if (e.message !== 'sesion') $('tZafacon').innerHTML = `<div class="vacio"><b>No se pudo cargar</b>${esc(e.message)}</div>`; }
    }
    function pintarZafacon() {
        const lista = zafaconData || [];
        $('numZafacon').hidden = !lista.length; $('numZafacon').textContent = lista.length;
        $('tZafacon').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Zafacón</h2><p>${lista.length ? `${lista.length} ${lista.length === 1 ? 'cliente eliminado' : 'clientes eliminados'}` : 'Clientes eliminados'}</p></div></div>
            <div class="zaf-banner">${ico('zafacon', 22)}<span><b>Se guardan ${DIAS_ZAFACON} días</b>Si el cliente vuelve a aparecer, reactívalo y sigue tal como estaba (trámites, pagos, notas y documentos). Pasados los ${DIAS_ZAFACON} días se borra por completo y no se puede recuperar.</span></div>
            ${lista.length ? `<div class="personas">${lista.map(z => `<article class="persona zaf">
                <div class="p-cab">${avatar(z.nombre)}
                    <div class="p-id"><b>${esc(z.nombre)}</b><span class="codigo">${esc(z.codigo)}</span></div>
                    <span class="vence${z.dias_restantes <= 2 ? ' pronto' : ''}">${z.dias_restantes <= 1 ? 'Se borra en menos de 1 día' : `Se borra en ${z.dias_restantes} días`}</span></div>
                ${z.volvio ? `<div class="volvio">${ico('ok', 16)}<span>Volvió a escribir: llegó una solicitud nueva con su mismo WhatsApp o correo.</span></div>` : ''}
                <dl class="p-datos">
                    <div style="grid-column:1/-1"><dt>${z.tramites.length > 1 ? 'Trámites' : 'Trámite'}</dt><dd>${esc(z.tramites.join(' · '))}</dd></div>
                    <div><dt>Estado</dt><dd>${bandera(z.pais)} ${esc(z.estado)}</dd></div>
                    <div><dt>Eliminado</dt><dd>${esc(fecha(z.eliminado))} · ${esc(z.eliminado_por || '')}</dd></div>
                    ${z.motivo ? `<div style="grid-column:1/-1"><dt>Motivo</dt><dd>${esc(z.motivo)}</dd></div>` : ''}
                </dl>
                <button type="button" class="btn btn-azul" data-restaurar="${esc(z.codigo)}">Reactivar solicitud</button>
            </article>`).join('')}</div>` : '<div class="vacio"><b>El zafacón está vacío</b>Cuando elimines un cliente, aparecerá aquí durante 7 días.</div>'}
        </div>`;
    }
    $('tZafacon').addEventListener('click', async ev => {
        const b = ev.target.closest('[data-restaurar]'); if (!b) return;
        b.disabled = true;
        try {
            const r = await post('/admin/restaurar', { codigo: b.dataset.restaurar });
            reemplazar(r.expediente); zafaconData = zafaconData.filter(z => z.codigo !== b.dataset.restaurar); pintarZafacon();
            toast(`${r.expediente.nombre || r.expediente.cliente} reactivado. Ya está otra vez en Expedientes.`);
        } catch (e) { if (e.message !== 'sesion') toast(e.message); b.disabled = false; }
    });

    // ------------------------------------------------------------ inicio: saludo, mapa y lo que hay que atender
    const iniciales = n => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '··';
    const BURBUJAS = [   // dónde se dibuja cada grupo de clientes alrededor de la isla
        { id: 'us', x: 92, y: 62, l: 'Estados Unidos' },
        { id: 'es', x: 560, y: 58, l: 'España y Europa' },
        { id: 'mundo', x: 84, y: 318, l: 'Otros países' },
        { id: 'ext', x: 586, y: 330, l: 'Extranjeros en RD' }
    ];
    function saludo() {
        const h = Number(new Intl.DateTimeFormat('es-DO', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()));
        return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    }
    function mapaSVG(porPais) {
        const sd = MAPA.ciudades['Santo Domingo'];
        const max = Math.max(1, ...BURBUJAS.map(b => porPais[b.id] || 0));
        const POS = { 'Santiago': [-8, -9, 'end'], 'Puerto Plata': [0, -10, 'middle'], 'Samaná': [8, -6, 'start'], 'Punta Cana': [-6, -12, 'end'], 'Barahona': [-8, 4, 'end'] };
        const ciudades = Object.entries(POS).map(([n, [dx, dy, a]]) => { const [x, y] = MAPA.ciudades[n];
            return `<g class="m-ciudad"><circle cx="${x}" cy="${y}" r="4"/><text x="${x + dx}" y="${y + dy}" text-anchor="${a}">${esc(n)}</text></g>`; }).join('');
        const burbujas = BURBUJAS.map((b, i) => {
            const n = porPais[b.id] || 0, r = 26 + 12 * Math.sqrt(n / max);
            const cx = (b.x + sd[0]) / 2, cy = Math.min(b.y, sd[1]) - 40;
            const flag = (cat && cat.paises[b.id] && cat.paises[b.id].bandera) || '';
            return `<path class="m-arco" style="--i:${i}" d="M${b.x},${b.y} Q${cx},${cy} ${sd[0]},${sd[1]}"/>
                <g class="m-burbuja" style="--i:${i}" data-pais="${b.id}" tabindex="0" role="button" aria-label="${esc(b.l)}: ${n} ${n === 1 ? 'cliente' : 'clientes'}. Ver sus expedientes">
                    <circle cx="${b.x}" cy="${b.y}" r="${r.toFixed(1)}"/>
                    <text class="f" x="${b.x}" y="${b.y - 5}" text-anchor="middle">${flag}</text>
                    <text class="n" x="${b.x}" y="${b.y + 17}" text-anchor="middle">${n}</text>
                    <text class="l" x="${b.x}" y="${b.y + r + 18}" text-anchor="middle">${esc(b.l)}</text>
                </g>`;
        }).join('');
        const nRD = porPais.rd || 0;
        return `<svg viewBox="0 0 640 380" role="group" aria-label="Mapa de clientes de TramitaFácil RD">
            <g class="m-isla">
                <path class="m-ht" d="${MAPA.ht}"/>
                <path class="m-rd" d="${MAPA.rd}" data-pais="rd"><title>República Dominicana: ${nRD} ${nRD === 1 ? 'cliente' : 'clientes'}</title></path>
                ${ciudades}
                <g class="m-ciudad m-sd"><circle class="m-pulso" cx="${sd[0]}" cy="${sd[1]}" r="7"/><circle class="c" cx="${sd[0]}" cy="${sd[1]}" r="5"/>
                    <text class="sd" x="${sd[0]}" y="${sd[1] + 24}" text-anchor="middle">Santo Domingo</text><text class="sd2" x="${sd[0]}" y="${sd[1] + 40}" text-anchor="middle">${nRD} ${nRD === 1 ? 'cliente' : 'clientes'} en RD</text></g>
            </g>
            ${burbujas}
        </svg>`;
    }
    function pintarInicio() {
        const nombre = yo ? String(yo.nombre || yo.usuario).trim().split(/\s+/)[0] : '';
        const hoy = new Intl.DateTimeFormat('es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date()).toLowerCase();
        const porPais = Object.fromEntries(contar(expedientes, e => e.pais || ''));
        const enProceso = expedientes.filter(e => e.paso < 4), det = expedientes.filter(detenido);
        const nuevos = expedientes.filter(e => e.paso === 1);
        const porCobrar = puede('pagos') ? expedientes.filter(e => e.pendiente > 0) : [];
        const pagosConf = puedeValidar() ? expedientes.filter(e => e.por_confirmar > 0).map(e => [e, 'pago']) : [];
        const atender = [...pagosConf, ...det.map(e => [e, 'det']), ...nuevos.filter(e => !detenido(e)).map(e => [e, 'nuevo'])].slice(0, 7);
        const tile = (n, txt, ir, cls = '') => `<button type="button" class="tile ${cls}" data-ini="${ir}"><b>${n}</b><span>${txt}</span></button>`;
        $('tInicio').innerHTML = `
            <div class="hola"><h2>Hola, ${esc(nombre || 'equipo')}</h2><p>${esc(saludo())} · ${esc(hoy)}${yo ? ` <span class="rol ${rolDe(yo.permisos).c}">${esc(rolDe(yo.permisos).n)}</span>` : ''}</p></div>
            ${yo && !puede('expedientes') ? `<div class="aviso-lectura">${ico('escudo', 18)}<span><b>Acceso de consulta</b>Puedes ver los expedientes y su estado. Para hacer cambios, pídele permiso al administrador.</span></div>` : ''}
            <div class="mapa-card${animarMapa ? ' sube' : ''}">
                <h3>Dominicanos que confían en TramitaFácil RD</h3>
                <p class="sub">Toca un país para ver sus expedientes</p>
                ${mapaSVG(porPais)}
                <div class="mapa-pie"><span>${expedientes.length} ${expedientes.length === 1 ? 'cliente' : 'clientes'} en total</span><span>Desde cualquier parte del mundo</span></div>
            </div>
            <div class="tiles">
                ${tile(enProceso.length, 'En proceso', 'proceso')}
                ${tile(nuevos.length, 'Por revisar', 'nuevos')}
                ${tile(det.length, 'Detenidos', 'detenidos', det.length ? 'alerta' : '')}
                ${puede('pagos') ? tile(porCobrar.length, 'Por cobrar', 'cobro', porCobrar.length ? 'cobro' : '') : tile(expedientes.filter(e => e.paso === 4).length, 'Listos', 'listos')}
            </div>
            ${atender.length ? `<div class="bloque-ini"><h4>Para atender <small>· ${puedeValidar() ? 'pagos por confirmar, ' : ''}nuevos y detenidos</small></h4>${atender.map(([e, k]) => `
                <button type="button" class="fila-ini" data-codigo="${esc(e.codigo)}">
                    <span class="ini">${esc(iniciales(e.nombre || e.cliente))}</span>
                    <span class="t"><b>${esc(e.nombre || e.cliente)}</b><small>${bandera(e.pais)} ${esc((e.tramites || []).length > 1 ? `${e.tramites.length} trámites` : (e.servicio_titulo || ((e.tramites || [])[0] || {}).titulo || ''))}</small></span>
                    <span class="etq${k === 'nuevo' ? ' nuevo' : k === 'pago' ? ' pago' : ''}${recien.has(e.codigo) ? ' ahora' : ''}">${k === 'nuevo' ? 'Nuevo' : k === 'pago' ? `Confirmar ${esc(rd(e.por_confirmar))}` : `${diasSin(e)} días`}</span>
                </button>`).join('')}</div>` : `<div class="vacio"><b>Todo al día</b>No hay expedientes nuevos ni detenidos.</div>`}`;
        animarMapa = false;
    }
    function irAExpedientes(cambios) {
        Object.assign(filtro, { paso: 0, detenidos: false, servicio: '', pais: '', origen: '', cobro: '', desde: '', hasta: '' }, cambios);
        [['fServicio', 'servicio'], ['fPais', 'pais'], ['fOrigen', 'origen'], ['fCobro', 'cobro'], ['fDesde', 'desde'], ['fHasta', 'hasta']].forEach(([id, k]) => { $(id).value = filtro[k]; });
        $('q').value = '';
        irATab('exp');
    }
    $('tInicio').addEventListener('click', ev => {
        const pais = ev.target.closest('[data-pais]');
        if (pais) { irAExpedientes({ pais: pais.dataset.pais }); return; }
        const f = ev.target.closest('[data-codigo]');
        if (f) { verExpediente(f.dataset.codigo); return; }
        const t = ev.target.closest('[data-ini]'); if (!t) return;
        const ir = t.dataset.ini;
        if (ir === 'nuevos') irAExpedientes({ paso: 1 });
        else if (ir === 'detenidos') irAExpedientes({ detenidos: true });
        else if (ir === 'listos') irAExpedientes({ paso: 4 });
        else if (ir === 'cobro') irATab('pagos');
        else irAExpedientes({});
    });
    $('tInicio').addEventListener('keydown', ev => {
        if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('.m-burbuja')) { ev.preventDefault(); ev.target.closest('.m-burbuja').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });

    // ---------------- avisos: solicitudes nuevas (no para usuarios de solo lectura)
    let avisosData = { avisos: [], sin_leer: 0, ultimo: 0 }, ultimoVisto = null;
    async function cargarAvisos() {
        const ok = !!(yo && (puede('expedientes') || puedeValidar()));
        $('btnAvisos').hidden = !ok;
        if (!ok || $('vPanel').hidden) return;
        try {
            const r = await api('/admin/avisos');
            const llegaron = ultimoVisto !== null ? r.avisos.filter(a => a.id > ultimoVisto) : [];
            ultimoVisto = r.ultimo; avisosData = r; pintarCampana();
            if (llegaron.length) {
                llegaron.forEach(a => { if (a.codigo) recien.add(a.codigo); });
                await actualizarYa();   // la solicitud nueva aparece en la lista sin recargar
                llegaron.filter(a => a.nuevo).slice(0, 3).reverse().forEach(notificar);
                setTimeout(() => { llegaron.forEach(a => recien.delete(a.codigo)); document.querySelectorAll('.exp.recien').forEach(x => x.classList.remove('recien')); }, 12000);
            }
        } catch (e) { /* sin conexión */ }
    }
    function pintarCampana() {
        const n = avisosData.sin_leer || 0;
        $('numAvisos').hidden = !n; $('numAvisos').textContent = n > 9 ? '9+' : n;
        $('btnAvisos').setAttribute('aria-label', n ? `Avisos: ${n} sin leer` : 'Avisos');
        $('avisosLista').innerHTML = avisosData.avisos.length ? avisosData.avisos.map(a => `
            <button type="button" class="aviso-fila${a.nuevo ? ' nuevo' : ''}" data-aviso-codigo="${esc(a.codigo || '')}">
                <span class="av-ico">${ico('expedientes', 18)}</span>
                <span class="av-t"><b>${esc(a.titulo)}</b><small>${esc(a.detalle || '')}${a.codigo ? ` · ${esc(a.codigo)}` : ''}</small></span>
                <small class="av-f">${esc(fecha(a.creado))}</small>
            </button>`).join('') : '<p class="ayuda" style="text-align:center;padding:18px 0">No hay avisos todavía. Aquí verás cada solicitud nueva.</p>';
        const soporta = 'Notification' in window, permiso = soporta ? Notification.permission : 'denied';
        $('btnNotif').hidden = !soporta || permiso !== 'default';
        $('notifEstado').textContent = !soporta ? 'Este navegador no permite notificaciones; te llegará el aviso en esta campana y por correo.'
            : permiso === 'granted' ? 'Las notificaciones están activadas en este dispositivo mientras el panel esté abierto.'
            : permiso === 'denied' ? 'Las notificaciones están bloqueadas en este navegador. Puedes activarlas en la configuración del sitio.'
            : 'Activa las notificaciones para enterarte al momento, aunque estés en otra pestaña.';
    }
    async function notificar(a) {
        toast(a.titulo);
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const opciones = { body: [a.detalle, a.codigo].filter(Boolean).join(' · '), icon: 'assets/img/app/icon-192.png', tag: 'tf-aviso-' + a.id };
        try {
            const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
            if (reg) { await reg.showNotification(a.titulo, opciones); return; }
            const n = new Notification(a.titulo, opciones);
            n.onclick = () => { window.focus(); if (a.codigo) verExpediente(a.codigo); n.close(); };
        } catch (e) { /* algunos navegadores no lo permiten */ }
    }
    $('btnAvisos').addEventListener('click', async () => {
        pintarCampana(); $('vAvisos').hidden = false;
        if (avisosData.sin_leer) {
            try { await post('/admin/avisos/visto', { hasta: avisosData.ultimo }); } catch (e) { /* sigue */ }
            avisosData.sin_leer = 0; $('numAvisos').hidden = true;
        }
    });
    $('vAvisos').addEventListener('click', async ev => {
        if (ev.target === $('vAvisos') || ev.target.closest('[data-cerrar-avisos]')) { $('vAvisos').hidden = true; avisosData.avisos.forEach(a => { a.nuevo = false; }); return; }
        if (ev.target.closest('#btnNotif')) { try { await Notification.requestPermission(); } catch (e) { /* sin permiso */ } pintarCampana(); return; }
        const f = ev.target.closest('[data-aviso-codigo]');
        if (f) { $('vAvisos').hidden = true; avisosData.avisos.forEach(a => { a.nuevo = false; }); if (f.dataset.avisoCodigo) verExpediente(f.dataset.avisoCodigo); }
    });
    /** Trae los expedientes ya mismo (si está escribiendo, se muestra el aviso «Toca para verlas» y no se le borra nada). */
    async function actualizarYa() {
        if (editando || editandoCliente.size || !$('vNuevo').hidden) { await revisar(); return; }
        try {
            const r = await api('/admin/expedientes');
            expedientes = r.expedientes; conteo = r.conteo; pendiente = null;
            $('avisoNuevas').hidden = true; pintarTodo();
        } catch (e) { /* sin conexión: lo intenta en la próxima vuelta */ }
    }
    setInterval(() => { if (!document.hidden) cargarAvisos(); }, 5000);   // revisa cada 5 s si llegó algo nuevo
    document.addEventListener('visibilitychange', () => { if (!document.hidden) cargarAvisos(); });

    // ---------------- mi cuenta (nombre y contraseña). obligatoria = clave temporal: debe crear la suya
    let cuentaObligatoria = false;
    function pasoCuenta(cual) {   // menu | nombre | seguridad | clave
        $('cuentaMenu').hidden = cual !== 'menu';
        $('perfilPermisos').hidden = cual !== 'menu' || cuentaObligatoria;
        $('fNombre').hidden = cual !== 'nombre';
        $('seguridadPaso').hidden = cual !== 'seguridad';
        $('fCuenta').hidden = cual !== 'clave';
        if (cual === 'nombre') $('cNombre').focus();
        if (cual === 'clave') { $('fCuenta').reset(); $('cuentaError').hidden = true; $('cActual').focus(); }
    }
    function abrirCuenta(obligatoria) {
        cuentaObligatoria = !!obligatoria;
        $('fCuenta').reset(); $('cuentaError').hidden = true;
        $('cuentaInfo').textContent = yo ? `Usuario «${yo.usuario}»` : '';
        $('perfilIniciales').textContent = iniciales(yo && yo.nombre);
        $('cNombre').value = yo ? yo.nombre : ''; $('cCorreo').value = yo ? yo.correo || '' : '';
        const CORTO = { expedientes: 'Expedientes', pagos: 'Pagos', resumen: 'Resumen', precios: 'Precios', herramientas: 'Herramientas', usuarios: 'Usuarios' };
        $('perfilPermisos').innerHTML = yo ? (yo.permisos || []).map(k => `<span class="chip" title="${esc(nombresPermisos[k] || k)}">${esc(CORTO[k] || k)}</span>`).join('') : '';
        $('cuentaAviso').hidden = !cuentaObligatoria;
        $('btnCerrarCuenta').hidden = cuentaObligatoria;
        $('tCuenta').textContent = cuentaObligatoria ? 'Crea tu contraseña' : (yo ? yo.nombre : 'Mi cuenta');
        $('lActual').textContent = cuentaObligatoria ? 'Contraseña temporal (la que te dieron)' : 'Contraseña actual';
        $('btnCambiarClave').textContent = cuentaObligatoria ? 'Guardar y entrar' : 'Cambiar contraseña';
        $('vCuenta').hidden = false;
        pasoCuenta(cuentaObligatoria ? 'clave' : 'menu');
    }
    const cerrarCuenta = () => { if (!cuentaObligatoria) $('vCuenta').hidden = true; };
    $('btnCuenta').addEventListener('click', () => abrirCuenta(false));
    $('vCuenta').addEventListener('click', ev => {
        if (ev.target === $('vCuenta') || ev.target.closest('[data-cerrar-cuenta]')) { cerrarCuenta(); return; }
        if (ev.target.closest('[data-volver-cuenta]') && !cuentaObligatoria) { pasoCuenta('menu'); return; }
        const op = ev.target.closest('[data-cuenta]'); if (op) pasoCuenta(op.dataset.cuenta);
    });
    $('btnSeguirClave').addEventListener('click', () => pasoCuenta('clave'));
    $('btnExcelTop').addEventListener('click', () => { $('vCuenta').hidden = true; });
    $('fCuenta').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = $('cuentaError'); err.hidden = true;
        if ($('cNueva').value !== $('cNueva2').value) { err.hidden = false; err.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
        const btn = $('btnCambiarClave'); btn.disabled = true;
        try {
            await post('/admin/cuenta/clave', { actual: $('cActual').value, nueva: $('cNueva').value });
            const eraObligatoria = cuentaObligatoria;
            cuentaObligatoria = false; $('vCuenta').hidden = true;
            toast(eraObligatoria ? '¡Listo! Ya tienes tu contraseña.' : 'Contraseña cambiada');
            if (eraObligatoria) await mostrarPanel();
        }
        catch (e) { if (e.message !== 'sesion') { err.hidden = false; err.textContent = e.message; } }
        finally { btn.disabled = false; }
    });
    $('fNombre').addEventListener('submit', async ev => {
        ev.preventDefault();
        try {
            await post('/admin/cuenta/nombre', { nombre: $('cNombre').value, correo: $('cCorreo').value.trim() });
            yo.nombre = $('cNombre').value.trim(); yo.correo = $('cCorreo').value.trim().toLowerCase(); aplicarPermisos();
            $('tCuenta').textContent = yo.nombre; $('perfilIniciales').textContent = iniciales(yo.nombre);
            pasoCuenta('menu'); toast('Datos guardados'); if (tab === 'inicio') pintarInicio();
        } catch (e) { if (e.message !== 'sesion') toast(e.message); }
    });
    // «Mostrar contraseña»
    document.addEventListener('change', ev => {
        const c = ev.target.closest && ev.target.closest('[data-ver-clave]'); if (!c) return;
        c.dataset.verClave.split(',').forEach(id => { const i = $(id); if (i) i.type = c.checked ? 'text' : 'password'; });
    });

    // ------------------------------------------------------------ eventos: sesión, pestañas y filtros
    try { $('usuario').value = localStorage.getItem('tf_admin_usuario') || ''; } catch (e) { /* sin almacenamiento */ }
    $('usuario').addEventListener('change', () => { try { localStorage.setItem('tf_admin_usuario', $('usuario').value.trim().toLowerCase()); } catch (e) { /* sin almacenamiento */ } });
    $('fLogin').addEventListener('submit', async ev => {
        ev.preventDefault();
        const btn = $('btnLogin'); btn.disabled = true; btn.textContent = 'Entrando…';
        try {
            await post('/admin/login', { usuario: $('usuario').value.trim().toLowerCase(), clave: $('clave').value });
            $('clave').value = '';
            await mostrarPanel();
        } catch (e) {
            const err = $('loginError'); err.hidden = false; err.textContent = e.message;
        } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
    });

    $('btnSalir').addEventListener('click', async () => {
        try { await post('/admin/logout', {}); } catch (e) { /* igual salimos */ }
        expedientes = []; precios = null; usuariosData = null; zafaconData = null; borrando = null; yo = null; ultimoVisto = null; $('vAvisos').hidden = true; tab = 'inicio'; editandoUsuario = null; $('vCuenta').hidden = true; $('vMas').hidden = true; abiertos.clear(); editando = null; editandoCliente.clear(); mostrarLogin();
    });

    $('tabs').addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) irATab(b.dataset.tab); });
    $('bottomnav').addEventListener('click', ev => {
        const b = ev.target.closest('.bn'); if (!b) return;
        if (b.hasAttribute('data-mas')) $('vMas').hidden = false; else irATab(b.dataset.tab);
    });
    $('vMas').addEventListener('click', ev => {
        const b = ev.target.closest('[data-tab]');
        if (b) irATab(b.dataset.tab); else if (ev.target === $('vMas')) $('vMas').hidden = true;
    });

    $('filtros').addEventListener('click', ev => {
        const b = ev.target.closest('[data-paso]'); if (!b) return;
        filtro.paso = Number(b.dataset.paso); pintar();
    });
    $('q').addEventListener('input', pintar);
    $('btnDetenidos').addEventListener('click', () => { filtro.detenidos = !filtro.detenidos; pintar(); });
    $('btnMas').addEventListener('click', () => { $('masFiltros').hidden = !$('masFiltros').hidden; pintarFiltros(); });
    [['fServicio', 'servicio'], ['fPais', 'pais'], ['fOrigen', 'origen'], ['fCobro', 'cobro'], ['fDesde', 'desde'], ['fHasta', 'hasta']].forEach(([id, k]) =>
        $(id).addEventListener('change', ev => { filtro[k] = ev.target.value; pintar(); }));
    $('btnExcelFiltro').addEventListener('click', () => {
        const lista = filtrados();
        if (!lista.length) { toast('No hay expedientes en esta lista'); return; }
        excel(lista, `expedientes-${hoyRD()}.csv`);
    });

    // clics generales del panel (resumen, pagos, herramientas)
    $('vPanel').addEventListener('click', async ev => {
        const per = ev.target.closest('[data-periodo]');
        if (per) { periodo = Number(per.dataset.periodo); pintarResumen(); return; }
        const ir = ev.target.closest('[data-ir]');
        if (ir) { ev.preventDefault(); irATab(ir.dataset.ir); return; }
        if (ev.target.closest('[data-ver-detenidos]')) { ev.preventDefault(); filtro.detenidos = true; filtro.paso = 0; $('q').value = ''; irATab('exp'); return; }
        if (ev.target.closest('#tPagos')) {   // confirmar, rechazar o borrar pagos desde la pestaña Pagos
            const vp = ev.target.closest('[data-validar-pago]'), rp2 = ev.target.closest('[data-rechazar-pago]');
            if (vp || rp2) { await validarPago(vp || rp2, vp ? 'confirmar' : 'rechazar'); pintarPagos(); return; }
            const qp = ev.target.closest('[data-quitar-pago]');
            if (qp) {
                if (!window.confirm('¿Borrar este pago?')) return;
                try { reemplazar((await post('/admin/pago/quitar', { codigo: qp.dataset.codigo, id: Number(qp.dataset.quitarPago) })).expediente); pintarPagos(); toast('Pago borrado'); }
                catch (e) { if (e.message !== 'sesion') toast(e.message); }
                return;
            }
        }
        const ver = ev.target.closest('[data-ver]');
        if (ver) { verExpediente(ver.dataset.ver); return; }
        const cp = ev.target.closest('[data-copiar-txt]');
        if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copiarTxt); toast('Enlace copiado'); } catch (e) { toast(cp.dataset.copiarTxt); } return; }
        if (ev.target.closest('#btnExcelTodo')) { excel(expedientes, `expedientes-completo-${hoyRD()}.csv`); }
    });

    // ------------------------------------------------------------ eventos: tarjetas
    $('lista').addEventListener('change', async ev => {
        if (ev.target.matches('[data-f="servicio"]')) { alCambiarServicio(ev.target); return; }
        if (ev.target.matches('.form-pago [name="tipo"]')) {
            const f = ev.target.form, total = Number(f.dataset.total), pend = Number(f.dataset.pendiente);
            if (total) f.monto.value = ev.target.value === 'anticipo' ? Math.round(total / 2) : (ev.target.value === 'saldo' ? pend || '' : '');
            return;
        }
        const docs = ev.target.closest('[data-docs]');
        if (docs && ev.target.type === 'checkbox') {
            ev.target.closest('label').classList.toggle('ok', ev.target.checked);
            const lista = [...docs.querySelectorAll('input:checked')].map(i => i.value);
            try { reemplazar((await post('/admin/docs', { codigo: docs.dataset.codigo, tramite: Number(docs.dataset.tramite), docs: lista })).expediente); pintar(); }
            catch (e) { if (e.message !== 'sesion') toast(e.message); }
        }
    });

    // Documentos: al elegirlos quedan en espera; se suben al tocar «Guardar documentos»
    $('lista').addEventListener('change', ev => {
        const inp = ev.target.closest && ev.target.closest('[data-subir]');
        if (!inp || !inp.files.length) return;
        const codigo = inp.dataset.subir, lista = porSubir.get(codigo) || [];
        for (const f of inp.files) {
            if (!/\.(pdf|jpe?g|png|webp)$/i.test(f.name)) { toast(`«${f.name}»: solo PDF, JPG, PNG o WEBP`); continue; }
            if (f.size > 10 * 1024 * 1024) { toast(`«${f.name}» pesa más de 10 MB`); continue; }
            if (!lista.some(x => x.name === f.name && x.size === f.size)) lista.push(f);
        }
        if (lista.length) porSubir.set(codigo, lista);
        pintar();
    });
    async function guardarDocumentos(btn) {
        const codigo = btn.dataset.guardarDocs, lista = porSubir.get(codigo) || [];
        if (!lista.length) return;
        const fd = new FormData(); fd.append('codigo', codigo);
        lista.forEach(f => fd.append('archivo', f, f.name));
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
            const r = await fetch('/api/admin/archivo', { method: 'POST', body: fd, credentials: 'same-origin' });
            let d = {}; try { d = await r.json(); } catch (e) { /* sin JSON */ }
            if (r.status === 401) { mostrarLogin('Tu sesión terminó. Vuelve a entrar.'); return; }
            if (!r.ok || d.ok === false) throw new Error(d.error || (r.status === 413 ? 'Los archivos pesan demasiado.' : 'No se pudo guardar.'));
            porSubir.delete(codigo); reemplazar(d.expediente); pintar();
            toast(`${lista.length > 1 ? 'Documentos guardados' : 'Documento guardado'}. El cliente ya puede descargarlo en Rastrear.`);
        } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Guardar documentos'; }
    }

    $('lista').addEventListener('click', async ev => {
        const cab = ev.target.closest('.exp-cab');
        if (cab) {
            const c = cab.closest('.exp').dataset.codigo;
            abiertos.has(c) ? abiertos.delete(c) : abiertos.add(c);
            pintar(); return;
        }
        const ec = ev.target.closest('[data-editar-cliente]');
        if (ec) { editandoCliente.add(ec.dataset.editarCliente); pintar(); const i = document.getElementById('cw-' + ec.dataset.editarCliente); if (i) i.focus(); return; }
        const cc = ev.target.closest('[data-cancelar-cliente]');
        if (cc) { editandoCliente.delete(cc.dataset.cancelarCliente); pintar(); return; }
        const da = ev.target.closest('[data-docs-abrir]');
        if (da) { const k = da.dataset.docsAbrir; docsAbiertos.has(k) ? docsAbiertos.delete(k) : docsAbiertos.add(k); pintar(); return; }
        const ed = ev.target.closest('[data-editar]');
        if (ed) { editando = ed.dataset.editar; pintar(); const ta = document.getElementById('d-' + editando); if (ta) ta.focus(); return; }
        if (ev.target.closest('[data-cancelar]')) { editando = null; pintar(); return; }
        const paso = ev.target.closest('.paso');
        if (paso) {
            const form = paso.closest('form'), p = Number(paso.dataset.p);
            form.querySelectorAll('.paso').forEach(b => b.classList.toggle('sel', b === paso));
            const tr = tramiteDe(form);
            form.paso.value = p; form.detalle.value = mensajesDe(tr, p).defecto;
            form.querySelector('[data-presets]').innerHTML = presetsHTML(tr, p); form.detalle.focus();
            return;
        }
        const rp = ev.target.closest('[data-rp]');
        if (rp) {
            const f = rp.closest('form'), p = Number(rp.dataset.rp), actual = Number(f.dataset.actual);
            f.querySelectorAll('.rp').forEach(b => { b.classList.toggle('sel', b === rp); b.setAttribute('aria-checked', b === rp); });
            f.paso.value = p;
            f.querySelector('.rp-guardar').disabled = p === actual;
            f.querySelector('[data-rp-msg]').textContent = p === actual ? 'Paso actual. Elige otro para cambiarlo.'
                : `El cliente verá: «${mensajesDe(tramiteDe(f), p).defecto}»`;
            return;
        }
        const pr = ev.target.closest('[data-preset-msj]');
        if (pr) {
            const form = pr.closest('form');
            form.detalle.value = pr.dataset.texto; form.querySelectorAll('.preset').forEach(b => b.classList.toggle('sel', b === pr));
            form.detalle.focus(); return;
        }
        if (ev.target.closest('[data-msj-propio]')) {
            const form = ev.target.closest('form');
            form.detalle.value = ''; form.querySelectorAll('.preset').forEach(b => b.classList.remove('sel')); form.detalle.focus(); return;
        }
        const quitar = ev.target.closest('[data-quitar]');
        if (quitar) {
            if (!window.confirm('¿Quitar este trámite del código? El cliente dejará de verlo.')) return;
            try { reemplazar((await post('/admin/quitar', { codigo: quitar.dataset.codigo, tramite: Number(quitar.dataset.quitar) })).expediente); pintar(); toast('Trámite quitado'); }
            catch (e) { if (e.message !== 'sesion') toast(e.message); }
            return;
        }
        const qp = ev.target.closest('[data-quitar-pago]');
        if (qp) {
            if (!window.confirm('¿Borrar este pago?')) return;
            try { reemplazar((await post('/admin/pago/quitar', { codigo: qp.dataset.codigo, id: Number(qp.dataset.quitarPago) })).expediente); pintar(); toast('Pago borrado'); }
            catch (e) { if (e.message !== 'sesion') toast(e.message); }
            return;
        }
        const gd = ev.target.closest('[data-guardar-docs]');
        if (gd) { await guardarDocumentos(gd); return; }
        const sc = ev.target.closest('[data-sacar]');
        if (sc) { const l = porSubir.get(sc.dataset.codigo) || []; l.splice(Number(sc.dataset.sacar), 1); l.length ? porSubir.set(sc.dataset.codigo, l) : porSubir.delete(sc.dataset.codigo); pintar(); return; }
        const cs = ev.target.closest('[data-cancelar-subir]');
        if (cs) { porSubir.delete(cs.dataset.cancelarSubir); pintar(); return; }
        const ag = ev.target.closest('[data-abrir-agregar]');
        if (ag) { agregando.add(ag.dataset.abrirAgregar); pintar(); const s = document.querySelector(`form.agregar[data-codigo="${ag.dataset.abrirAgregar}"] select`); if (s) s.focus(); return; }
        const cg = ev.target.closest('[data-cerrar-agregar]');
        if (cg) { agregando.delete(cg.dataset.cerrarAgregar); pintar(); return; }
        const qa = ev.target.closest('[data-quitar-archivo]');
        if (qa) {
            if (!window.confirm('¿Quitar este documento? El cliente ya no podrá descargarlo.')) return;
            try { reemplazar((await post('/admin/archivo/quitar', { codigo: qa.dataset.codigo, id: Number(qa.dataset.quitarArchivo) })).expediente); pintar(); toast('Documento quitado'); }
            catch (e) { if (e.message !== 'sesion') toast(e.message); }
            return;
        }
        const el = ev.target.closest('[data-eliminar]');
        if (el) { borrando = el.dataset.eliminar; pintar(); const f = document.querySelector(`[data-borrar="${borrando}"] [name=motivo]`); if (f) f.focus(); return; }
        if (ev.target.closest('[data-cancelar-borrar]')) { borrando = null; pintar(); return; }
        const av = ev.target.closest('[data-avisar-correo]');
        if (av) {
            av.disabled = true;
            try { const r = await post('/admin/avisar', { codigo: av.dataset.avisarCorreo }); reemplazar(r.expediente); pintar(); toast(`Aviso enviado por correo a ${r.para}`); }
            catch (e) { if (e.message !== 'sesion') toast(e.message); av.disabled = false; }
            return;
        }
        const ed2 = ev.target.closest('[data-enviar-docs]');
        if (ed2) {
            ed2.disabled = true;
            try { const r = await post('/admin/archivo/enviar', { codigo: ed2.dataset.enviarDocs }); reemplazar(r.expediente); pintar(); toast(`Documentos enviados por correo a ${r.para}`); }
            catch (e) { if (e.message !== 'sesion') toast(e.message); ed2.disabled = false; }
            return;
        }
        const vp = ev.target.closest('[data-validar-pago]'), rp2 = ev.target.closest('[data-rechazar-pago]');
        if (vp || rp2) { await validarPago(vp || rp2, vp ? 'confirmar' : 'rechazar'); pintarTodo(); return; }
        const qn = ev.target.closest('[data-quitar-nota]');
        if (qn) {
            try { reemplazar((await post('/admin/nota/quitar', { codigo: qn.dataset.codigo, id: Number(qn.dataset.quitarNota) })).expediente); pintar(); toast('Nota borrada'); }
            catch (e) { if (e.message !== 'sesion') toast(e.message); }
            return;
        }
        const copiar = ev.target.closest('[data-copiar]');
        if (copiar) {
            try { await navigator.clipboard.writeText(copiar.dataset.copiar); toast('Código copiado'); } catch (e) { toast(copiar.dataset.copiar); }
        }
    });

    $('lista').addEventListener('submit', async ev => {
        const form = ev.target; ev.preventDefault();
        const btn = form.querySelector('[type=submit]'), txt = btn.textContent; btn.disabled = true; btn.textContent = 'Guardando…';
        try {
            if (form.classList.contains('avance')) {
                const porCorreo = !!(form.avisarCorreo && form.avisarCorreo.checked), porWa = !!(form.avisarWa && form.avisarWa.checked);
                // la pestaña de WhatsApp se abre ya (si se abre después de guardar, el navegador la bloquea)
                const ventana = porWa ? window.open('about:blank', '_blank') : null;
                let r;
                try {
                    r = await post('/admin/estado', { codigo: form.dataset.codigo, tramite: Number(form.dataset.tramite),
                        paso: Number(form.paso.value), detalle: form.detalle.value, estado: form.estado.value, avisar: porCorreo });
                } catch (e) { if (ventana) ventana.close(); throw e; }
                editando = null; reemplazar(r.expediente); pintar();
                if (ventana) ventana.location.href = linkAvance(r.expediente, Number(form.dataset.tramite));
                const avisos = [r.correo === 'enviando' ? `correo a ${r.expediente.correo_cliente}` : '', ventana ? 'WhatsApp abierto' : ''].filter(Boolean);
                toast(avisos.length ? `Estado guardado · aviso por ${avisos.join(' y ')}` : 'Estado guardado (sin aviso). El cliente lo verá en Rastrear.');
            } else if (form.classList.contains('agregar')) {
                const r = await post('/admin/agregar', { codigo: form.dataset.codigo, ...leerServicio(form) });
                agregando.delete(form.dataset.codigo); reemplazar(r.expediente); pintar();
                toast('Trámite agregado al mismo código.');
            } else if (form.classList.contains('form-pago')) {
                const r = await post('/admin/pago', { codigo: form.dataset.codigo, tipo: form.tipo.value, monto: Number(form.monto.value),
                    metodo: form.metodo.value, fecha: form.fecha.value });
                document.activeElement && document.activeElement.blur();
                reemplazar(r.expediente); pintarTodo();
                toast(r.estado === 'pendiente' ? 'Pago registrado. Queda por confirmar por administración o contabilidad.'
                    : r.expediente.pendiente === 0 ? '¡Pagado completo!' : `Pago registrado. Pendiente: ${rd(r.expediente.pendiente)}`);
            } else if (form.classList.contains('form-cliente')) {
                const contacto = [form.wa.value.trim(), form.email.value.trim()].filter(Boolean).join(' · ');
                const r = await post('/admin/cliente', { codigo: form.dataset.codigo, nombre: form.nombre.value, contacto, pais: form.pais.value });
                editandoCliente.delete(form.dataset.codigo);
                document.activeElement && document.activeElement.blur();
                reemplazar(r.expediente); pintar(); toast('Datos del cliente actualizados');
            } else if (form.classList.contains('rapido-f')) {
                const p = Number(form.paso.value), tid = Number(form.dataset.tramite);
                const r = await post('/admin/estado', { codigo: form.dataset.codigo, tramite: tid, paso: p, detalle: mensajesDe(tramiteDe(form), p).defecto,
                    estado: PASOS[p], avisar: false });
                reemplazar(r.expediente); pintar();
                toast(`Estado cambiado a «${PASOS[p]}». Si quieres, avísale al cliente abajo.`);
            } else if (form.classList.contains('confirmar-borrar')) {
                const codigo = form.dataset.borrar;
                await post('/admin/eliminar', { codigo, motivo: form.motivo.value });
                borrando = null; abiertos.delete(codigo);
                expedientes = expedientes.filter(x => x.codigo !== codigo); recontar(); pintarTodo(); zafaconData = null;
                toast(`Movido al zafacón. Puedes reactivarlo durante ${DIAS_ZAFACON} días.`);
            } else if (form.classList.contains('form-nota')) {
                const r = await post('/admin/nota', { codigo: form.dataset.codigo, texto: form.texto.value });
                document.activeElement && document.activeElement.blur();
                reemplazar(r.expediente); pintar(); toast('Nota guardada');
            }
        } catch (e) {
            if (e.message !== 'sesion') toast(e.message);
            btn.disabled = false; btn.textContent = txt;
        }
    });

    // ------------------------------------------------------------ eventos: precios
    $('tPrecios').addEventListener('input', ev => {
        if (ev.target.id === 'pQ') { preciosQ = ev.target.value; pintarPrecios(); return; }
        const f = ev.target.closest('.precio-fila'); if (!f) return;
        const s = precios.servicios.find(x => x.id === f.dataset.sid);
        const tax = Number(f.tax.value || 0), fee = Number(f.fee.value || 0);
        f.querySelector('[data-tot]').textContent = rd(tax + fee);
        f.querySelector('[type=submit]').disabled = f.tax.value === '' || f.fee.value === '' || (tax === s.tax && fee === s.fee);
    });
    $('tPrecios').addEventListener('change', ev => { if (ev.target.id === 'pCat') { preciosCat = ev.target.value; pintarPrecios(); } });
    async function guardarPrecio(sid, cuerpo) {
        const r = await post('/admin/precio', { servicio: sid, ...cuerpo });
        const s = precios.servicios.find(x => x.id === sid);
        Object.assign(s, { tax: r.servicio.tax, fee: r.servicio.fee, modificado: r.servicio.modificado });
        if (cat && cat.servicios[sid]) { cat.servicios[sid].tax = r.servicio.tax; cat.servicios[sid].fee = r.servicio.fee; }
        try { precios = await api('/admin/precios'); } catch (e) { /* se queda con lo local */ }
        document.activeElement && document.activeElement.blur();
        pintarPrecios();
        toast(`${s.title}: ahora ${rd(r.servicio.tax + r.servicio.fee)} en la página`);
    }
    $('tPrecios').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target, btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = '…';
        try { await guardarPrecio(f.dataset.sid, { tax: Number(f.tax.value), fee: Number(f.fee.value) }); }
        catch (e) { if (e.message !== 'sesion') toast(e.message); btn.disabled = false; btn.textContent = 'Guardar'; }
    });
    $('tPrecios').addEventListener('click', async ev => {
        const r = ev.target.closest('[data-restaurar]'); if (!r) return;
        if (!window.confirm('¿Volver al precio original del catálogo?')) return;
        try { await guardarPrecio(r.dataset.restaurar, { restaurar: true }); } catch (e) { if (e.message !== 'sesion') toast(e.message); }
    });

    // ------------------------------------------------------------ nuevo expediente (uno o varios trámites)
    function filaNueva(conQuitar) {
        const div = document.createElement('div');
        div.className = 'item-nuevo';
        div.innerHTML = campoServicio() + (conQuitar ? '<button type="button" class="quitar" aria-label="Quitar este trámite">×</button>' : '');
        $('nItems').appendChild(div);
        return div;
    }
    function abrirNuevo() {
        $('fNuevo').reset(); $('nuevoError').hidden = true;
        $('nItems').innerHTML = ''; filaNueva(false);
        if (cat && cat.paises.rd) $('nPais').value = 'rd';
        $('nuevoForm').hidden = false; $('nuevoListo').hidden = true;
        $('vNuevo').hidden = false; $('nNombre').focus();
    }
    const cerrarNuevo = () => { $('vNuevo').hidden = true; };
    $('avisoNuevas').addEventListener('click', () => {
        if (pendiente) { expedientes = pendiente.expedientes; conteo = pendiente.conteo; pendiente = null; }
        editando = null; $('avisoNuevas').hidden = true; pintarTodo();
    });
    $('btnRecargar').addEventListener('click', async () => {
        const b = $('btnRecargar'); b.disabled = true;
        editando = null; await cargar(); b.disabled = false; toast('Lista actualizada');
    });
    $('btnNuevo').addEventListener('click', () => {
        if (cat && !$('nPais').options.length) $('nPais').innerHTML = Object.entries(cat.paises).map(([id, p]) => `<option value="${esc(id)}">${p.bandera} ${esc(p.nombre)}</option>`).join('');
        abrirNuevo();
    });
    $('btnMasItem').addEventListener('click', () => { if ($('nItems').children.length < 15) filaNueva(true).querySelector('select').focus(); });
    $('nItems').addEventListener('change', ev => { if (ev.target.matches('[data-f="servicio"]')) alCambiarServicio(ev.target); });
    $('nItems').addEventListener('click', ev => { const q = ev.target.closest('.quitar'); if (q) q.closest('.item-nuevo').remove(); });
    $('vNuevo').addEventListener('click', ev => { if (ev.target === $('vNuevo') || ev.target.closest('[data-cerrar]')) cerrarNuevo(); });
    document.addEventListener('keydown', ev => { if (ev.key !== 'Escape') return; $('vMas').hidden = true; $('vAvisos').hidden = true; if (!$('vNuevo').hidden) cerrarNuevo(); cerrarCuenta(); });

    $('fNuevo').addEventListener('submit', async ev => {
        ev.preventDefault();
        const btn = $('btnCrear'); btn.disabled = true; btn.textContent = 'Creando…';
        try {
            const servicios = [...$('nItems').querySelectorAll('.item-nuevo')].map(leerServicio);
            const r = await post('/admin/nuevo', { nombre: $('nNombre').value, contacto: $('nContacto').value,
                pais: $('nPais').value, mensaje: $('nMensaje').value, origen: $('nOrigen').value, servicios });
            const e = r.expediente;
            reemplazar(e); abiertos.add(e.codigo); pintarTodo();
            $('nuevoForm').hidden = true; $('nuevoListo').hidden = false;
            $('nuevoListo').innerHTML = `<div class="creado"><div style="font-weight:700;color:#065F46">Expediente creado</div>
                <span class="codigo">${esc(e.codigo)}</span><div style="font-size:14px;color:#334155">${esc(e.nombre)} · ${e.tramites.length > 1 ? `${e.tramites.length} trámites` : esc(e.servicio_titulo)}</div></div>
                <div class="acciones"><a class="btn btn-wa" href="${linkWhatsApp(e)}" target="_blank" rel="noopener" style="flex:1 1 200px">Enviar código por WhatsApp</a>
                <button class="btn btn-borde" type="button" data-cerrar>Listo</button></div>`;
        } catch (e) {
            if (e.message !== 'sesion') { const err = $('nuevoError'); err.hidden = false; err.textContent = e.message; }
        } finally { btn.disabled = false; btn.textContent = 'Crear expediente'; }
    });

    // ------------------------------------------------------------ inicio
    // ------------------------------------------------------------ botón «atrás»: nunca sale del panel
    // Atrás (navegador, celular o gesto) cierra primero la ventana abierta, luego vuelve a la sección
    // anterior y, al final, se queda en Inicio. Para salir a la página está «Ver la página web».
    let historialListo = false;
    function marcarHistorial(estado) {
        if (!historialListo) return;
        try { history.pushState({ tf: 'panel', ...estado }, ''); } catch (e) { /* sin historial */ }
    }
    function prepararHistorial() {
        if (historialListo) return;
        historialListo = true;
        try {
            history.replaceState({ tf: 'raiz' }, '');
            history.pushState({ tf: 'panel', tab }, '');
        } catch (e) { /* sin historial */ }
    }
    // se arma con el primer toque (los navegadores ignoran entradas creadas sin que la persona haya tocado la página)
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, prepararHistorial, { capture: true, once: true, passive: true }));
    // al abrir una ventana (Mi cuenta, Avisos, Más, Nuevo expediente) «atrás» la cierra
    let cerrandoPorAtras = false;
    document.querySelectorAll('.modal').forEach(m => new MutationObserver(() => {
        if (!m.hidden) marcarHistorial({ tab, modal: m.id });
        else if (!cerrandoPorAtras && historialListo && history.state && history.state.modal === m.id) history.back();   // cerrada con la X: se quita su paso
    }).observe(m, { attributes: true, attributeFilter: ['hidden'] }));
    window.addEventListener('popstate', ev => {
        if (!historialListo) return;
        const abierta = [...document.querySelectorAll('.modal')].find(m => !m.hidden);
        if (abierta) {
            cerrandoPorAtras = true; setTimeout(() => { cerrandoPorAtras = false; }, 0);
            if (abierta.id === 'vCuenta') cerrarCuenta();
            else if (abierta.id === 'vNuevo') cerrarNuevo();
            else abierta.hidden = true;
        } else if (!$('vPanel').hidden) {
            const destino = ev.state && ev.state.tf === 'panel' && ev.state.tab ? ev.state.tab : 'inicio';
            if (editando || editandoCliente.size) { editando = null; editandoCliente.clear(); pintarTodo(); }
            else if (destino !== tab) irATab(destino, true);
        }
        // si llegó al principio, se vuelve a poner un paso para que el siguiente «atrás» tampoco salga
        if (!ev.state || ev.state.tf === 'raiz') { try { history.pushState({ tf: 'panel', tab }, ''); } catch (e) { /* sin historial */ } }
    });

    (async function iniciar() {
        try {
            const s = await api('/admin/sesion');
            if (!s.configurado) { mostrarLogin('El panel aún no está activado. En la terminal del servidor escribe: tramita clave'); return; }
            s.admin ? mostrarPanel() : mostrarLogin();
        } catch (e) {
            mostrarLogin('El panel necesita el servidor de TramitaFácil RD (VPS). Aquí no está disponible.');
            $('btnLogin').disabled = true;
        }
    })();
})();
