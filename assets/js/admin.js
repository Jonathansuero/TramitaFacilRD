/* TramitaFácil RD — panel de administración (admin)
   Pestañas: Expedientes · Resumen · Pagos · Precios · Herramientas.
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
    const DIAS_ALERTA = 5;   // días sin moverse para marcar un expediente como detenido
    const TZ = 'America/Santo_Domingo';
    const ORIGEN_N = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', google: 'Google', tiktok: 'TikTok', youtube: 'YouTube',
        bing: 'Bing', x: 'X (Twitter)', referido: 'Recomendado', app: 'App instalada', directo: 'Directo (escribió la dirección)', otro: 'Otro sitio web', '': 'Sin dato' };
    const PAGINA_N = { inicio: 'Inicio', servicio: 'Página de un servicio', servicios: 'Catálogo', casos: 'Casos reales', calculadora: 'Calculadora',
        diaspora: 'Diáspora', instituciones: 'Instituciones', preguntas: 'Preguntas', rastreo: 'Rastreo', panel: 'Creado por ti en el panel', otra: 'Otra', '': 'Sin dato' };
    const DISP_N = { movil: '📱 Celular', escritorio: '💻 Computadora', tablet: '📟 Tablet', '': 'Sin dato' };
    const IDIOMA_N = { es: 'Español', en: 'Inglés', fr: 'Francés', '': 'Sin dato' };
    const TIPO_PAGO = { anticipo: 'Anticipo 50%', saldo: 'Saldo 50%', otro: 'Otro pago' };
    const METODOS = ['Transferencia', 'Zelle', 'Efectivo', 'Remesa', 'PayPal', 'Tarjeta', 'Otro'];

    let expedientes = [], conteo = {}, cat = null;
    let yo = null, nombresPermisos = {};       // usuario con sesión y descripción de cada permiso
    const puede = p => !!(yo && (yo.permisos || []).includes(p));
    const editandoCliente = new Set();         // códigos con el formulario de datos del cliente abierto
    let usuariosData = null, editandoUsuario = null;
    const PERM_TAB = { resumen: 'resumen', pagos: 'pagos', precios: 'precios', herr: 'herramientas', usuarios: 'usuarios' };
    const filtro = { paso: 0, detenidos: false, servicio: '', pais: '', origen: '', cobro: '', desde: '', hasta: '' };
    let tab = 'exp', periodo = 30;
    let precios = null, preciosQ = '', preciosCat = '';
    const abiertos = new Set();      // códigos con la tarjeta abierta
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
        const listos = (e.tramites || []).filter(t => t.paso === 4);
        const lineas = [`Hola ${primerNombre(e)} 🎉`, '', `¡Buenas noticias! ${listos.length > 1 || !listos.length ? 'Tus trámites están listos' : `Tu trámite *${listos[0].titulo}* está listo`} (código *${e.codigo}*).`];
        if (e.pendiente) lineas.push('', `Para la entrega queda pendiente el saldo de *${rd(e.pendiente)}*.`);
        lineas.push('', 'Escríbenos para coordinar la entrega. ¡Gracias por confiar en nosotros! 🇩🇴', '— TramitaFácil RD');
        return wa(e, lineas);
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
        try { const s = await api('/admin/sesion'); yo = s.usuario; nombresPermisos = s.permisos || {}; } catch (e) { /* sigue */ }
        aplicarPermisos();
        $('vLogin').hidden = true; $('vPanel').hidden = false;
        if (!cat) { try { cat = await api('/catalogo'); } catch (e) { /* el panel funciona igual */ } }
        llenarFiltros();
        await cargar();
        irATab(tab);
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
    const ocupado = () => editando || editandoCliente.size || !$('vNuevo').hidden || !$('vCuenta').hidden || (document.activeElement && document.activeElement.closest('#vPanel main form, #tPrecios'));
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
    setInterval(revisar, 15000);
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
        if (tab === 'exp') pintar();
        else if (tab === 'resumen') pintarResumen();
        else if (tab === 'pagos') pintarPagos();
        else if (tab === 'herr') pintarHerramientas();
    }

    /** Muestra solo lo que el usuario puede usar. */
    function aplicarPermisos() {
        $('yoNombre').textContent = yo ? yo.nombre : 'Mi cuenta';
        document.querySelectorAll('#tabs .tab').forEach(b => { const p = PERM_TAB[b.dataset.tab]; b.hidden = !!p && !puede(p); });
        $('btnExcelTop').hidden = !puede('herramientas');
        $('btnExcelFiltro').hidden = !puede('herramientas');
        $('btnNuevo').hidden = !puede('expedientes');
        if (PERM_TAB[tab] && !puede(PERM_TAB[tab])) tab = 'exp';
    }

    function irATab(nuevo) {
        tab = nuevo;
        document.querySelectorAll('#tabs .tab').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
        ['exp', 'resumen', 'pagos', 'precios', 'herr', 'usuarios'].forEach(t => { $({ exp: 'tExp', resumen: 'tResumen', pagos: 'tPagos', precios: 'tPrecios', herr: 'tHerr', usuarios: 'tUsuarios' }[t]).hidden = t !== tab; });
        if (tab === 'precios') cargarPrecios(); else if (tab === 'usuarios') cargarUsuarios(); else pintarTodo();
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
        $('btnDetenidos').textContent = `⚠️ Detenidos${det ? ` (${det})` : ''}`;
        const extras = ['servicio', 'pais', 'origen', 'cobro', 'desde', 'hasta'].filter(k => filtro[k]).length;
        $('btnMas').classList.toggle('on', !$('masFiltros').hidden || extras > 0);
        $('btnMas').textContent = extras ? `Más filtros (${extras})` : 'Más filtros';
    }

    function bloqueDocs(e, t) {
        const clave = `${e.codigo}:${t.id}`, lista = checklist(t), tengo = new Set(t.docs || []);
        const listos = lista.filter(d => tengo.has(d)).length;
        const abierto = docsAbiertos.has(clave);
        return `<button type="button" class="link" data-docs-abrir="${esc(clave)}">📎 Documentos ${listos}/${lista.length} ${abierto ? '▴' : '▾'}</button>
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
                    <textarea class="input" id="d-${clave}" name="detalle" maxlength="500" required>${esc(t.detalle)}</textarea></div>
                <div><label class="campo" for="s-${clave}">Estado (opcional)</label>
                    <input class="input" id="s-${clave}" name="estado" maxlength="60" placeholder="Ej.: Esperando firma del notario"></div>
                <div class="acciones"><button class="btn btn-azul" type="submit">Guardar</button><button class="btn btn-borde" type="button" data-cancelar>Cancelar</button></div>
            </form>`;
        return `<div class="tr">
            <div class="tr-top"><div><b>${esc(t.titulo)}</b><small>${esc(rd(t.precio))} · ${esc(fecha(t.actualizado))}</small></div><span class="chip ${tono(t.paso)}">${esc(t.paso === 3 ? 'En institución' : PASOS[t.paso])}</span></div>
            ${barra(t.paso)}
            <p>${esc(t.detalle)}</p>
            ${abierto ? form : (puede('expedientes') ? `<div class="tr-acc"><button type="button" class="link" data-editar="${esc(clave)}">Actualizar avance</button>${bloqueDocs(e, t)}${varios ? `<button type="button" class="link rojo" data-quitar="${t.id}" data-codigo="${esc(e.codigo)}">Quitar</button>` : ''}</div>` : '')}
        </div>`;
    }

    function bloqueCobro(e) {
        const pagos = e.pagos || [], total = e.total_dop, pagado = e.pagado || 0;
        const pct = total ? Math.min(100, Math.round(pagado / total * 100)) : 0;
        const tipo = !pagado ? 'anticipo' : 'saldo';
        const sugerido = total == null ? '' : (tipo === 'anticipo' ? Math.round(total / 2) : e.pendiente || '');
        return `<div class="bloque">
            <div class="bloque-t"><span>💵 Cobro 50% / 50%</span><span>${total ? `${pct}% cobrado` : ''}</span></div>
            <div class="cobro-nums">
                <div><small>Total</small><b>${esc(rd(total))}</b></div>
                <div class="ok"><small>Recibido</small><b>${esc(rd(pagado))}</b></div>
                <div class="${e.pendiente > 0 ? 'pend' : 'ok'}"><small>Pendiente</small><b>${esc(total == null ? '—' : rd(e.pendiente))}</b></div>
            </div>
            ${total ? `<div class="progreso"><i style="width:${pct}%"></i></div>` : '<small style="color:var(--suave)">Este expediente tiene un trámite sin precio; ponle precio para calcular lo pendiente.</small>'}
            ${pagos.length ? `<ul class="filas">${pagos.map(p => `<li><span><b>${esc(rd(p.monto))}</b> · ${esc(TIPO_PAGO[p.tipo] || p.tipo)}${p.metodo ? ` · ${esc(p.metodo)}` : ''}<br><small>${esc(diaCorto(p.fecha))}${p.nota ? ` · ${esc(p.nota)}` : ''}</small></span>
                <button type="button" class="x" data-quitar-pago="${p.id}" data-codigo="${esc(e.codigo)}" title="Borrar este pago" aria-label="Borrar este pago">×</button></li>`).join('')}</ul>` : ''}
            ${e.pendiente === 0 && pagado > 0 ? '<small style="color:var(--verde);font-weight:700">✅ Pagado completo</small>' : `
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
            <div class="bloque-t"><span>📝 Notas internas</span><span style="text-transform:none;letter-spacing:0">el cliente no las ve</span></div>
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
        if (!editandoCliente.has(e.codigo)) return `<div><button type="button" class="link" data-editar-cliente="${esc(e.codigo)}">✏️ Editar datos del cliente (nombre, WhatsApp, correo, país)</button></div>`;
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
    function bloqueHistorial(e) {
        const act = e.actividad || [];
        if (!act.length) return '';
        return `<details class="bloque hist"><summary>🕘 Historial del expediente (${act.length})</summary>
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
                <dl class="datos">
                    <div><dt>Contacto</dt><dd>${contacto}</dd></div>
                    <div><dt>País</dt><dd>${bandera(e.pais)} ${esc(paisNombre(e.pais, e.pais_detalle))}</dd></div>
                    <div><dt>Llegó por</dt><dd>${esc(llego || 'Sin dato')}</dd></div>
                    <div><dt>Creado</dt><dd>${esc(fecha(creado(e)))}${e.idioma && e.idioma !== 'es' ? ` · ${esc(IDIOMA_N[e.idioma] || e.idioma)}` : ''}</dd></div>
                    ${e.mensaje ? `<div style="grid-column:1/-1"><dt>Nota del cliente</dt><dd>${esc(e.mensaje)}</dd></div>` : ''}
                </dl>
                ${puede('expedientes') ? bloqueDatosCliente(e) : ''}
                <div class="actual"><small>Lo que ve el cliente arriba · ${esc(fecha(e.actualizado))}</small><b>${esc(e.estado)}:</b> ${esc(e.detalle)}</div>
                <div class="tramites">
                    <p class="tramites-t">Trámites en este código (${items.length})</p>
                    ${items.map(t => bloqueTramite(e, t, items.length > 1)).join('')}
                    ${puede('expedientes') ? `<form class="agregar" data-codigo="${esc(e.codigo)}">
                        <span class="campo" style="margin:0">Agregar otro trámite a este código</span>
                        ${campoServicio()}
                        <button class="btn btn-borde btn-sm" type="submit">+ Agregar trámite</button>
                    </form>` : ''}
                </div>
                ${puede('pagos') ? bloqueCobro(e) : ''}
                ${puede('expedientes') ? bloqueNotas(e) : ''}
                ${bloqueHistorial(e)}
                <div class="bloque">
                    <div class="bloque-t"><span>💬 Mensajes rápidos por WhatsApp</span></div>
                    <div class="rapidos">
                        <a href="${linkDocs(e)}" target="_blank" rel="noopener">📎 Pedir documentos</a>
                        ${puede('pagos') ? `<a href="${linkPago(e)}" target="_blank" rel="noopener">💵 Recordar pago</a>` : ''}
                        <a href="${linkListo(e)}" target="_blank" rel="noopener">🎉 Trámite listo</a>
                    </div>
                </div>
                <div class="acciones">
                    <a class="btn btn-wa" href="${linkWhatsApp(e)}" target="_blank" rel="noopener" style="flex:1 1 200px">Avisar por WhatsApp</a>
                    <button class="btn btn-borde" type="button" data-copiar="${esc(e.codigo)}">Copiar código</button>
                </div>
            </div>`;
        const cobroChip = !puede('pagos') ? '' : e.pendiente > 0 ? (e.pagado > 0 ? `<span class="chip cobro">Debe ${esc(rd(e.pendiente))}</span>` : (e.paso < 4 ? '<span class="chip cobro">Sin anticipo</span>' : `<span class="chip cobro">Debe ${esc(rd(e.pendiente))}</span>`))
            : (e.pagado > 0 && e.pendiente === 0 ? '<span class="chip pagado">Pagado</span>' : '');
        return `<article class="exp" data-codigo="${esc(e.codigo)}">
            <button type="button" class="exp-cab" aria-expanded="${abierto}">
                <span class="exp-nombre">${esc(e.nombre || e.cliente)}</span>
                <span class="chip ${tono(e.paso)}">${esc(items.length > 1 ? e.estado : (e.paso === 3 ? 'En institución' : PASOS[e.paso] || e.estado))}</span>
                <span class="exp-serv">${esc(titulo)}</span>
                <span class="exp-meta"><span class="codigo">${esc(e.codigo)}</span>${items.length > 1 ? `<span>${items.length} trámites</span>` : ''}${bandera(e.pais)} <span>· ${esc(fecha(e.actualizado))}</span>
                    ${detenido(e) ? `<span class="chip alerta">⚠️ ${dias} días sin moverse</span>` : ''}${cobroChip}</span>
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
        const pagosP = expedientes.flatMap(e => (e.pagos || []).filter(p => enPeriodo(p.fecha, dias)));
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
        const todos = expedientes.flatMap(e => (e.pagos || []).map(p => ({ ...p, e })));
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
                <div class="rapidos"><a href="${linkPago(e)}" target="_blank" rel="noopener">💵 Recordar por WhatsApp</a>
                    <button type="button" class="link" data-ver="${esc(e.codigo)}">Registrar pago →</button></div></li>`;
        };
        $('tPagos').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Pagos</h2><p>Anticipo del 50% para iniciar y 50% al terminar</p></div></div>
            <div class="kpis">
                <div class="kpi dinero"><span>Cobrado en ${esc(nombreMes)}</span><b>${esc(rd(cobradoMes))}</b><small>${delMes.length} ${delMes.length === 1 ? 'pago' : 'pagos'}</small></div>
                <div class="kpi"><span>Por cobrar</span><b style="color:var(--rojo)">${esc(rd(porCobrar))}</b><small>${pendientes.length} ${pendientes.length === 1 ? 'cliente' : 'clientes'}</small></div>
                <div class="kpi${sinAnticipo.length ? ' alerta' : ''}"><span>Sin anticipo todavía</span><b>${sinAnticipo.length}</b><small>expedientes abiertos sin ningún pago</small></div>
            </div>
            <div class="card"><h3>Pendientes de cobro</h3><p class="sub">De mayor a menor. Toca «Registrar pago» para anotar lo que recibiste.</p>
                ${pendientes.length ? `<ul class="filas">${pendientes.map(fila).join('')}</ul>` : '<p class="rank-vacio">Nadie te debe nada. 🎉</p>'}</div>
            <div class="grid-2">
                <div class="card"><h3>Pagos recientes</h3><p class="sub">Los últimos 20 que registraste</p>
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
            <div class="card"><h3>🔗 Enlaces para saber de dónde llegan</h3>
                <p class="sub">Usa estos enlaces en vez del normal. Cuando alguien entre por uno y haga una solicitud, el panel te dirá por dónde llegó (pestaña Resumen → «¿Por dónde te encontraron?»).</p>
                ${enlaces.map(([n, s]) => { const u = `${base}/?utm_source=${s}`; return `<div class="enlace"><span><b>${esc(n)}</b><code>${esc(u)}</code></span><button type="button" class="btn btn-borde btn-sm" data-copiar-txt="${esc(u)}">Copiar</button></div>`; }).join('')}
            </div>
            <div class="card"><h3>⬇ Descargas</h3><p class="sub">Guarda una copia de tus datos cuando quieras (además del respaldo automático diario del servidor).</p>
                <div class="herr">
                    <a class="btn btn-borde" href="/api/admin/exportar">Excel de todos los trámites</a>
                    <button type="button" class="btn btn-borde" id="btnExcelTodo">Excel con cobros y origen</button>
                    <a class="btn btn-azul" href="/api/admin/respaldo">Respaldo completo de la base de datos</a>
                </div>
            </div>
            <div class="card"><h3>⚠️ Alerta de expedientes detenidos</h3><p class="sub">Un expediente se marca en amarillo cuando lleva ${DIAS_ALERTA} días o más sin actualizar su avance y aún no está listo.</p>
                <button type="button" class="btn btn-borde" data-ver-detenidos>Ver detenidos (${expedientes.filter(detenido).length})</button></div>
        </div>`;
    }

    // ============================================================ USUARIOS
    const PRESETS = {
        'Dueño (todo)': Object.keys({ expedientes: 1, pagos: 1, resumen: 1, precios: 1, herramientas: 1, usuarios: 1 }),
        'Gestor': ['expedientes'],
        'Gestor + cobros': ['expedientes', 'pagos'],
        'Contabilidad': ['pagos', 'resumen', 'herramientas'],
        'Solo ver': []
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
                <div><label class="campo" for="uUsuario">Usuario (para entrar)</label><input class="input" id="uUsuario" name="usuario" maxlength="30" autocapitalize="none" spellcheck="false" ${nuevo ? 'required placeholder="Ej.: maria"' : `value="${esc(u.usuario)}" disabled`}></div>
                <div><label class="campo" for="uNombre">Nombre</label><input class="input" id="uNombre" name="nombre" maxlength="60" required value="${esc(u ? u.nombre : '')}" placeholder="Ej.: María Pérez"></div>
            </div>
            <div><label class="campo" for="uClave">${nuevo ? 'Contraseña inicial' : 'Nueva contraseña (déjala vacía para no cambiarla)'}</label>
                <input class="input" id="uClave" name="clave" type="text" minlength="8" autocomplete="off" ${nuevo ? 'required' : ''} placeholder="Mínimo 8 caracteres">
                <small style="color:var(--suave)">Dásela a la persona por un medio privado. Luego ella la puede cambiar en «Mi cuenta».</small></div>
            <div><span class="campo">Permisos <span style="font-weight:500;color:var(--suave)">— atajos:</span></span>
                <div class="chips" style="margin-bottom:8px">${Object.keys(PRESETS).map(n => `<button type="button" class="chip-btn" data-preset="${esc(n)}">${esc(n)}</button>`).join('')}</div>
                <div class="checks">${Object.entries(nombresPermisos).map(([k, d]) => `<label><input type="checkbox" name="perm" value="${esc(k)}"${permisos.has(k) ? ' checked' : ''}><span><b>${esc(k[0].toUpperCase() + k.slice(1))}</b><span>${esc(d)}</span></span></label>`).join('')}</div>
                <small style="color:var(--suave)">Todos pueden ver la lista de expedientes. Sin «Pagos» no ven los montos cobrados.</small></div>
            ${nuevo ? '' : `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" name="activo"${u.activo ? ' checked' : ''}> Usuario activo (si lo desmarcas, ya no podrá entrar)</label>`}
            <div id="usuarioError" class="msg-error" hidden></div>
            <div class="acciones"><button class="btn btn-azul" type="submit">${nuevo ? 'Crear usuario' : 'Guardar cambios'}</button><button class="btn btn-borde" type="button" data-cancelar-usuario>Cancelar</button></div>
        </form>`;
    }
    function pintarUsuarios() {
        const d = usuariosData;
        const nombreP = k => k[0].toUpperCase() + k.slice(1);
        $('tUsuarios').innerHTML = `<div class="pila">
            <div class="cabecera" style="margin:0"><div><h2>Usuarios</h2><p>Cada persona entra con su usuario y su clave, y solo ve lo que le permites</p></div>
                ${editandoUsuario === null ? '<button class="btn btn-rojo" type="button" data-nuevo-usuario>+ Nuevo usuario</button>' : ''}</div>
            ${editandoUsuario !== null ? formUsuario(editandoUsuario === 'nuevo' ? null : d.usuarios.find(u => u.id === editandoUsuario)) : ''}
            <div class="card"><h3>Equipo (${d.usuarios.length})</h3>
                ${d.usuarios.map(u => `<div class="usr">
                    <span><b>${esc(u.nombre)}</b> <span class="codigo">${esc(u.usuario)}</span>${u.id === (yo && yo.id) ? ' <small>(tú)</small>' : ''}<br>
                        <small>${u.activo ? `Último acceso: ${esc(u.ultimo_acceso ? fecha(u.ultimo_acceso) : 'nunca')}` : '<b style="color:var(--rojo)">Desactivado</b>'}</small></span>
                    <button type="button" class="btn btn-borde btn-sm" data-editar-usuario="${u.id}">Editar</button>
                    <span class="chips">${u.permisos.length ? u.permisos.map(p => `<span class="perm">${esc(nombreP(p))}</span>`).join('') : '<span class="perm off">Solo ver expedientes</span>'}</span>
                </div>`).join('')}
            </div>
            <div class="card"><h3>Actividad del equipo</h3><p class="sub">Quién hizo qué, lo más reciente primero</p>
                ${d.actividad.length ? `<ul class="filas">${d.actividad.slice(0, 60).map(a => `<li><span><b>${esc(a.usuario)}</b> · ${esc(a.accion)}${a.codigo ? ` <span class="codigo">${esc(a.codigo)}</span>` : ''}${a.detalle ? `<br><small>${esc(a.detalle)}</small>` : ''}</span><small style="white-space:nowrap">${esc(fecha(a.fecha))}</small></li>`).join('')}</ul>` : '<p class="rank-vacio">Todavía no hay actividad.</p>'}
            </div>
        </div>`;
    }
    $('tUsuarios').addEventListener('click', ev => {
        if (ev.target.closest('[data-nuevo-usuario]')) { editandoUsuario = 'nuevo'; pintarUsuarios(); $('uUsuario').focus(); return; }
        const ed = ev.target.closest('[data-editar-usuario]');
        if (ed) { editandoUsuario = Number(ed.dataset.editarUsuario); pintarUsuarios(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        if (ev.target.closest('[data-cancelar-usuario]')) { editandoUsuario = null; pintarUsuarios(); return; }
        const pr = ev.target.closest('[data-preset]');
        if (pr) { const set = new Set(PRESETS[pr.dataset.preset]); $('fUsuario').querySelectorAll('[name="perm"]').forEach(c => { c.checked = set.has(c.value); }); }
    });
    $('tUsuarios').addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = ev.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
        const err = $('usuarioError'); err.hidden = true;
        try {
            const cuerpo = { nombre: f.nombre.value.trim(), clave: f.clave.value, permisos: [...f.querySelectorAll('[name="perm"]:checked')].map(c => c.value) };
            if (f.dataset.id) Object.assign(cuerpo, { id: Number(f.dataset.id), activo: f.activo.checked }); else cuerpo.usuario = f.usuario.value.trim().toLowerCase();
            await post('/admin/usuarios/guardar', cuerpo);
            toast(f.dataset.id ? 'Usuario actualizado' : `Usuario creado: ${cuerpo.usuario}`);
            editandoUsuario = null; await cargarUsuarios();
            if (f.dataset.id && yo && Number(f.dataset.id) === yo.id) { const s = await api('/admin/sesion'); yo = s.usuario; aplicarPermisos(); }
        } catch (e) { if (e.message !== 'sesion') { err.hidden = false; err.textContent = e.message; } btn.disabled = false; }
    });

    // ---------------- mi cuenta
    $('btnCuenta').addEventListener('click', () => {
        $('fCuenta').reset(); $('cuentaError').hidden = true;
        $('cuentaInfo').textContent = yo ? `${yo.nombre} · usuario «${yo.usuario}»` : '';
        $('vCuenta').hidden = false; $('cActual').focus();
    });
    $('vCuenta').addEventListener('click', ev => { if (ev.target === $('vCuenta') || ev.target.closest('[data-cerrar-cuenta]')) $('vCuenta').hidden = true; });
    $('fCuenta').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = $('cuentaError'); err.hidden = true;
        if ($('cNueva').value !== $('cNueva2').value) { err.hidden = false; err.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
        const btn = $('btnCambiarClave'); btn.disabled = true;
        try { await post('/admin/cuenta/clave', { actual: $('cActual').value, nueva: $('cNueva').value }); $('vCuenta').hidden = true; toast('Contraseña cambiada'); }
        catch (e) { if (e.message !== 'sesion') { err.hidden = false; err.textContent = e.message; } }
        finally { btn.disabled = false; }
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
        expedientes = []; precios = null; usuariosData = null; yo = null; tab = 'exp'; editandoUsuario = null; abiertos.clear(); editando = null; editandoCliente.clear(); mostrarLogin();
    });

    $('tabs').addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) irATab(b.dataset.tab); });

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
            form.paso.value = p; form.detalle.value = PLANTILLAS[p]; form.detalle.focus();
            return;
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
                const r = await post('/admin/estado', { codigo: form.dataset.codigo, tramite: Number(form.dataset.tramite),
                    paso: Number(form.paso.value), detalle: form.detalle.value, estado: form.estado.value });
                editando = null; reemplazar(r.expediente); pintar();
                toast('Guardado. El cliente ya lo ve en Rastrear.');
            } else if (form.classList.contains('agregar')) {
                const r = await post('/admin/agregar', { codigo: form.dataset.codigo, ...leerServicio(form) });
                reemplazar(r.expediente); pintar();
                toast('Trámite agregado al mismo código.');
            } else if (form.classList.contains('form-pago')) {
                const r = await post('/admin/pago', { codigo: form.dataset.codigo, tipo: form.tipo.value, monto: Number(form.monto.value),
                    metodo: form.metodo.value, fecha: form.fecha.value });
                document.activeElement && document.activeElement.blur();
                reemplazar(r.expediente); pintarTodo();
                toast(r.expediente.pendiente === 0 ? '¡Pagado completo! ✅' : `Pago registrado. Pendiente: ${rd(r.expediente.pendiente)}`);
            } else if (form.classList.contains('form-cliente')) {
                const contacto = [form.wa.value.trim(), form.email.value.trim()].filter(Boolean).join(' · ');
                const r = await post('/admin/cliente', { codigo: form.dataset.codigo, nombre: form.nombre.value, contacto, pais: form.pais.value });
                editandoCliente.delete(form.dataset.codigo);
                document.activeElement && document.activeElement.blur();
                reemplazar(r.expediente); pintar(); toast('Datos del cliente actualizados');
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
    document.addEventListener('keydown', ev => { if (ev.key !== 'Escape') return; if (!$('vNuevo').hidden) cerrarNuevo(); $('vCuenta').hidden = true; });

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
