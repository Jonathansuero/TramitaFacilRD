/* TramitaFácil RD — panel de administración (admin.html)
   Ver solicitudes, mover el seguimiento paso a paso, crear expedientes para
   clientes de WhatsApp y avisarles por WhatsApp. Requiere el servidor (app.py). */
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

    let expedientes = [], conteo = {}, cat = null;
    let filtroPaso = 0, abiertos = new Set();

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

    function dinero(total, moneda) {
        if (total == null || total === '') return '—';
        const sim = { DOP: 'RD$', USD: 'US$', EUR: '€' }[moneda] || '';
        return sim + Number(total).toLocaleString('es-DO', { maximumFractionDigits: 2 });
    }

    /** Número de WhatsApp a partir del contacto (si parece un teléfono). */
    function telefono(contacto) {
        if (!contacto || contacto.includes('@')) return '';
        let n = contacto.replace(/\D/g, '');
        if (n.length < 8) return '';
        if (n.length === 10 && /^(809|829|849)/.test(n)) n = '1' + n;   // número dominicano sin el 1
        return n;
    }

    function linkWhatsApp(e) {
        const nombre = (e.nombre || e.cliente || '').split(' ')[0];
        const enlace = `${location.origin}/rastreo.html?c=${encodeURIComponent(e.codigo)}`;
        const texto = [
            `Hola ${nombre} 👋`,
            '',
            'Te escribimos de *TramitaFácil RD*.',
            `📄 Trámite: ${e.servicio_titulo}`,
            `🔎 Tu código: *${e.codigo}*`,
            `📍 Estado: ${e.estado} — ${e.detalle}`,
            '',
            'Consulta el avance cuando quieras aquí:',
            enlace
        ].join('\n');
        const tel = telefono(e.contacto);
        return `https://api.whatsapp.com/send?${tel ? 'phone=' + tel + '&' : ''}text=${encodeURIComponent(texto.normalize('NFC'))}`;
    }

    const bandera = pais => (cat && cat.paises[pais] && cat.paises[pais].bandera) || '';
    const paisNombre = (pais, det) => ((cat && cat.paises[pais] && cat.paises[pais].nombre) || pais || '—') + (det ? ` (${det})` : '');
    const tono = paso => ({ 1: 'sky', 2: 'sky', 3: 'amber', 4: 'emerald' }[paso] || 'sky');

    // ------------------------------------------------------------ vistas
    function mostrarLogin(msg) {
        $('vPanel').hidden = true; $('vNuevo').hidden = true; $('vLogin').hidden = false;
        const err = $('loginError');
        err.hidden = !msg; err.textContent = msg || '';
        setTimeout(() => $('clave').focus(), 50);
    }

    async function mostrarPanel() {
        $('vLogin').hidden = true; $('vPanel').hidden = false;
        if (!cat) {
            try { cat = await api('/catalogo'); llenarSelects(); } catch (e) { /* el panel funciona igual */ }
        }
        await cargar();
    }

    async function cargar() {
        try {
            const r = await api('/admin/expedientes');
            expedientes = r.expedientes; conteo = r.conteo;
            pintar();
        } catch (e) {
            if (e.message !== 'sesion') $('lista').innerHTML = `<div class="vacio"><b>No se pudo cargar</b>${esc(e.message)}</div>`;
        }
    }

    function pintarFiltros() {
        const total = expedientes.length;
        const items = [[0, 'Todos', total], ...Object.entries(PASOS).map(([p, n]) => [Number(p), n, conteo[p] || 0])];
        $('filtros').innerHTML = items.map(([p, n, c]) =>
            `<button type="button" class="filtro${filtroPaso === p ? ' on' : ''}" data-paso="${p}" role="tab" aria-selected="${filtroPaso === p}"><b>${c}</b><span>${esc(n)}</span></button>`).join('');
        const pendientes = total - (conteo['4'] || 0);
        $('resumen').textContent = total ? `${total} en total · ${pendientes} en proceso` : 'Todavía no hay expedientes';
    }

    function tarjeta(e) {
        const abierto = abiertos.has(e.codigo);
        const barra = [1, 2, 3, 4].map(i => `<i class="${i <= e.paso ? 'on' : ''}${e.paso === 4 ? ' listo' : ''}"></i>`).join('');
        const contacto = e.contacto
            ? (telefono(e.contacto) ? `<a href="tel:+${telefono(e.contacto)}">${esc(e.contacto)}</a>` : (e.contacto.includes('@') ? `<a href="mailto:${esc(e.contacto)}">${esc(e.contacto)}</a>` : esc(e.contacto)))
            : '—';
        const cuerpo = !abierto ? '' : `
            <div class="exp-cuerpo">
                <dl class="datos">
                    <div><dt>Contacto</dt><dd>${contacto}</dd></div>
                    <div><dt>País</dt><dd>${bandera(e.pais)} ${esc(paisNombre(e.pais, e.pais_detalle))}</dd></div>
                    <div><dt>Total estimado</dt><dd>${esc(dinero(e.total_estimado, e.moneda))}</dd></div>
                    <div><dt>Creado</dt><dd>${esc(fecha(e.creado || e.actualizado))}</dd></div>
                    ${e.mensaje ? `<div style="grid-column:1/-1"><dt>Nota del cliente</dt><dd>${esc(e.mensaje)}</dd></div>` : ''}
                </dl>
                <div class="actual"><small>Lo que ve el cliente ahora · ${esc(fecha(e.actualizado))}</small><b>${esc(e.estado)}:</b> ${esc(e.detalle)}</div>
                <form class="actualizar" data-codigo="${esc(e.codigo)}" style="display:grid;gap:12px">
                    <div>
                        <span class="campo" style="display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:6px">Mover a</span>
                        <div class="pasos">${[1, 2, 3, 4].map(i => `<button type="button" class="paso${i === e.paso ? ' sel' : ''}" data-p="${i}"><em>${i}</em>${esc(PASOS[i])}</button>`).join('')}</div>
                        <input type="hidden" name="paso" value="${e.paso}">
                    </div>
                    <div>
                        <label class="campo" for="d-${esc(e.codigo)}">Mensaje para el cliente</label>
                        <textarea class="input" id="d-${esc(e.codigo)}" name="detalle" maxlength="500" required>${esc(e.detalle)}</textarea>
                    </div>
                    <div>
                        <label class="campo" for="s-${esc(e.codigo)}">Estado (opcional)</label>
                        <input class="input" id="s-${esc(e.codigo)}" name="estado" maxlength="60" placeholder="Ej.: Esperando firma del notario">
                    </div>
                    <div class="acciones">
                        <button class="btn btn-azul" type="submit">Guardar cambios</button>
                        <a class="btn btn-wa" href="${linkWhatsApp(e)}" target="_blank" rel="noopener">Avisar por WhatsApp</a>
                        <button class="btn btn-borde" type="button" data-copiar="${esc(e.codigo)}">Copiar código</button>
                    </div>
                </form>
            </div>`;
        return `<article class="exp" data-codigo="${esc(e.codigo)}">
            <button type="button" class="exp-cab" aria-expanded="${abierto}">
                <span class="exp-nombre">${esc(e.nombre || e.cliente)}</span>
                <span class="chip ${tono(e.paso)}">${esc(e.paso === 3 ? 'En institución' : PASOS[e.paso] || e.estado)}</span>
                <span class="exp-serv">${esc(e.servicio_titulo)}</span>
                <span class="exp-meta"><span class="codigo">${esc(e.codigo)}</span>${bandera(e.pais)} <span>· ${esc(fecha(e.actualizado))}</span></span>
                <span class="barra">${barra}</span>
            </button>${cuerpo}
        </article>`;
    }

    function pintar() {
        pintarFiltros();
        const q = $('q').value.trim().toLowerCase();
        const lista = expedientes.filter(e =>
            (!filtroPaso || e.paso === filtroPaso) &&
            (!q || [e.codigo, e.nombre, e.cliente, e.contacto, e.servicio_titulo].some(v => String(v || '').toLowerCase().includes(q))));
        $('lista').innerHTML = lista.length ? lista.map(tarjeta).join('')
            : `<div class="vacio"><b>${expedientes.length ? 'Sin resultados' : 'Aún no hay expedientes'}</b>${expedientes.length ? 'Prueba con otra búsqueda o filtro.' : 'Las solicitudes del formulario de tu página aparecerán aquí. También puedes crear una con «Nuevo expediente».'}</div>`;
    }

    function llenarSelects() {
        const porCat = {};
        Object.entries(cat.servicios).forEach(([id, s]) => (porCat[s.category] = porCat[s.category] || []).push([id, s.title]));
        $('nServicio').innerHTML = '<option value="">Elige el trámite…</option>' + Object.entries(porCat).map(([c, arr]) =>
            `<optgroup label="${esc((cat.categorias[c] || {}).label || c)}">${arr.sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([id, t]) => `<option value="${esc(id)}">${esc(t)}</option>`).join('')}</optgroup>`).join('');
        $('nPais').innerHTML = Object.entries(cat.paises).map(([id, p]) => `<option value="${esc(id)}">${p.bandera} ${esc(p.nombre)}</option>`).join('');
    }

    // ------------------------------------------------------------ eventos
    $('fLogin').addEventListener('submit', async ev => {
        ev.preventDefault();
        const btn = $('btnLogin'); btn.disabled = true; btn.textContent = 'Entrando…';
        try {
            await api('/admin/login', { method: 'POST', body: JSON.stringify({ clave: $('clave').value }) });
            $('clave').value = '';
            await mostrarPanel();
        } catch (e) {
            const err = $('loginError'); err.hidden = false; err.textContent = e.message;
        } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
    });

    $('btnSalir').addEventListener('click', async () => {
        try { await api('/admin/logout', { method: 'POST' }); } catch (e) { /* igual salimos */ }
        expedientes = []; abiertos.clear(); mostrarLogin();
    });

    $('filtros').addEventListener('click', ev => {
        const b = ev.target.closest('[data-paso]'); if (!b) return;
        filtroPaso = Number(b.dataset.paso); pintar();
    });
    $('q').addEventListener('input', pintar);

    $('lista').addEventListener('click', async ev => {
        const cab = ev.target.closest('.exp-cab');
        if (cab) {
            const c = cab.closest('.exp').dataset.codigo;
            abiertos.has(c) ? abiertos.delete(c) : abiertos.add(c);
            pintar(); return;
        }
        const paso = ev.target.closest('.paso');
        if (paso) {
            const form = paso.closest('form'), p = Number(paso.dataset.p);
            form.querySelectorAll('.paso').forEach(b => b.classList.toggle('sel', b === paso));
            form.paso.value = p;
            form.detalle.value = PLANTILLAS[p];
            form.detalle.focus();
            return;
        }
        const copiar = ev.target.closest('[data-copiar]');
        if (copiar) {
            try { await navigator.clipboard.writeText(copiar.dataset.copiar); toast('Código copiado'); } catch (e) { toast(copiar.dataset.copiar); }
        }
    });

    $('lista').addEventListener('submit', async ev => {
        const form = ev.target.closest('form.actualizar'); if (!form) return;
        ev.preventDefault();
        const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Guardando…';
        try {
            const r = await api('/admin/estado', { method: 'POST', body: JSON.stringify({
                codigo: form.dataset.codigo, paso: Number(form.paso.value), detalle: form.detalle.value, estado: form.estado.value }) });
            const i = expedientes.findIndex(e => e.codigo === r.expediente.codigo);
            if (i >= 0) expedientes.splice(i, 1);
            expedientes.unshift(r.expediente);
            conteo = {}; expedientes.forEach(e => { conteo[e.paso] = (conteo[e.paso] || 0) + 1; });
            pintar();
            toast('Guardado. El cliente ya lo ve en Rastrear.');
        } catch (e) {
            if (e.message !== 'sesion') toast(e.message);
            btn.disabled = false; btn.textContent = 'Guardar cambios';
        }
    });

    // Nuevo expediente
    function abrirNuevo() {
        $('fNuevo').reset(); $('nuevoError').hidden = true;
        $('nuevoForm').hidden = false; $('nuevoListo').hidden = true;
        if (cat && cat.paises.rd) $('nPais').value = 'rd';
        $('vNuevo').hidden = false; $('nNombre').focus();
    }
    const cerrarNuevo = () => { $('vNuevo').hidden = true; };
    $('btnNuevo').addEventListener('click', abrirNuevo);
    $('vNuevo').addEventListener('click', ev => { if (ev.target === $('vNuevo') || ev.target.closest('[data-cerrar]')) cerrarNuevo(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('vNuevo').hidden) cerrarNuevo(); });

    $('fNuevo').addEventListener('submit', async ev => {
        ev.preventDefault();
        const btn = $('btnCrear'); btn.disabled = true; btn.textContent = 'Creando…';
        try {
            const r = await api('/admin/nuevo', { method: 'POST', body: JSON.stringify({
                nombre: $('nNombre').value, contacto: $('nContacto').value, servicio: $('nServicio').value,
                pais: $('nPais').value, mensaje: $('nMensaje').value }) });
            const e = r.expediente;
            expedientes.unshift(e); conteo['1'] = (conteo['1'] || 0) + 1; abiertos.add(e.codigo); pintar();
            $('nuevoForm').hidden = true; $('nuevoListo').hidden = false;
            $('nuevoListo').innerHTML = `<div class="creado"><div style="font-weight:700;color:#065F46">Expediente creado</div>
                <span class="codigo">${esc(e.codigo)}</span><div style="font-size:14px;color:#334155">${esc(e.nombre)} · ${esc(e.servicio_titulo)}</div></div>
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
