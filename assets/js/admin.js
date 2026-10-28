/* TramitaFácil RD — panel de administración (admin)
   Un código por cliente con uno o varios trámites; cada trámite avanza por su cuenta.
   Ver solicitudes, mover cada trámite paso a paso, agregar trámites al mismo código,
   crear expedientes para clientes de WhatsApp y avisarles. Requiere el servidor (app.py). */
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
    let filtroPaso = 0;
    const abiertos = new Set();      // códigos con la tarjeta abierta
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
    const rd = v => (v == null || v === '') ? '—' : 'RD$' + Number(v).toLocaleString('es-DO', { maximumFractionDigits: 2 });

    /** Número de WhatsApp a partir del contacto (si parece un teléfono). */
    function telefono(contacto) {
        const parte = String(contacto || '').split('·').map(x => x.trim()).find(x => x && !x.includes('@'));
        if (!parte) return '';
        let n = parte.replace(/\D/g, '');
        if (n.length < 8) return '';
        if (n.length === 10 && /^(809|829|849)/.test(n)) n = '1' + n;   // número dominicano sin el 1
        return n;
    }

    function linkWhatsApp(e) {
        const nombre = (e.nombre || e.cliente || '').split(' ')[0];
        const enlace = `${location.origin}/rastreo?c=${encodeURIComponent(e.codigo)}`;
        const items = e.tramites || [];
        const lineas = [`Hola ${nombre} 👋`, '', 'Te escribimos de *TramitaFácil RD*.', `🔎 Tu código: *${e.codigo}*`];
        if (items.length > 1) {
            lineas.push('', `📄 Tus trámites (${items.length}):`);
            items.forEach(t => lineas.push(`• ${t.titulo} — ${t.paso === 4 ? 'Listo ✅' : (t.estado || PASOS[t.paso])}`));
        } else {
            lineas.push(`📄 Trámite: ${e.servicio_titulo}`, `📍 Estado: ${e.estado} — ${e.detalle}`);
        }
        lineas.push('', 'Consulta el avance cuando quieras aquí:', enlace);
        const tel = telefono(e.contacto);
        return `https://api.whatsapp.com/send?${tel ? 'phone=' + tel + '&' : ''}text=${encodeURIComponent(lineas.join('\n').normalize('NFC'))}`;
    }

    const bandera = pais => (cat && cat.paises[pais] && cat.paises[pais].bandera) || '';
    const paisNombre = (pais, det) => ((cat && cat.paises[pais] && cat.paises[pais].nombre) || pais || '—') + (det ? ` (${det})` : '');
    const tono = paso => ({ 1: 'sky', 2: 'sky', 3: 'amber', 4: 'emerald' }[paso] || 'sky');
    const barra = paso => `<span class="barra">${[1, 2, 3, 4].map(i => `<i class="${i <= paso ? 'on' : ''}${paso === 4 ? ' listo' : ''}"></i>`).join('')}</span>`;
    const precioCatalogo = id => (cat && cat.servicios[id]) ? cat.servicios[id].tax + cat.servicios[id].fee : null;

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

    // ------------------------------------------------------------ vistas
    function mostrarLogin(msg) {
        $('vPanel').hidden = true; $('vNuevo').hidden = true; $('vLogin').hidden = false;
        const err = $('loginError');
        err.hidden = !msg; err.textContent = msg || '';
        setTimeout(() => $('clave').focus(), 50);
    }

    async function mostrarPanel() {
        $('vLogin').hidden = true; $('vPanel').hidden = false;
        if (!cat) { try { cat = await api('/catalogo'); } catch (e) { /* el panel funciona igual */ } }
        await cargar();
    }

    async function cargar() {
        try {
            const r = await api('/admin/expedientes');
            expedientes = r.expedientes; conteo = r.conteo; pendiente = null;
            $('avisoNuevas').hidden = true;
            pintar();
        } catch (e) {
            if (e.message !== 'sesion') $('lista').innerHTML = `<div class="vacio"><b>No se pudo cargar</b>${esc(e.message)}</div>`;
        }
    }

    // ---------------- actualización automática: las solicitudes nuevas aparecen solas
    let pendiente = null, revisando = false;
    const huella = lista => lista.map(e => e.codigo + '@' + e.actualizado).join('|');
    /** ¿Está escribiendo o con una ventana abierta? Entonces no le cambiamos la lista de golpe. */
    const ocupado = () => editando || !$('vNuevo').hidden || (document.activeElement && document.activeElement.closest('#lista form'));
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
                expedientes = r.expedientes; conteo = r.conteo; pintar();
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
        if (i >= 0) expedientes.splice(i, 1);
        expedientes.unshift(exp); recontar();
    }

    function pintarFiltros() {
        const total = expedientes.length;
        const items = [[0, 'Todos', total], ...Object.entries(PASOS).map(([p, n]) => [Number(p), n, conteo[p] || 0])];
        $('filtros').innerHTML = items.map(([p, n, c]) =>
            `<button type="button" class="filtro${filtroPaso === p ? ' on' : ''}" data-paso="${p}" role="tab" aria-selected="${filtroPaso === p}"><b>${c}</b><span>${esc(n)}</span></button>`).join('');
        const pendientes = total - (conteo['4'] || 0);
        $('resumen').textContent = total ? `${total} ${total === 1 ? 'cliente' : 'clientes'} · ${pendientes} en proceso` : 'Todavía no hay expedientes';
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
            ${abierto ? form : `<div class="tr-acc"><button type="button" class="link" data-editar="${esc(clave)}">Actualizar avance</button>${varios ? `<button type="button" class="link rojo" data-quitar="${t.id}" data-codigo="${esc(e.codigo)}">Quitar</button>` : ''}</div>`}
        </div>`;
    }

    function tarjeta(e) {
        const abierto = abiertos.has(e.codigo);
        const items = e.tramites || [];
        const contacto = e.contacto
            ? String(e.contacto).split('·').map(x => x.trim()).filter(Boolean).map(x =>
                x.includes('@') ? `<a href="mailto:${esc(x)}">${esc(x)}</a>` : (telefono(x) ? `<a href="tel:+${telefono(x)}">${esc(x)}</a>` : esc(x))).join('<br>')
            : '—';
        const titulo = items.length > 1 ? items.map(t => t.titulo).join(' · ') : e.servicio_titulo;
        const cuerpo = !abierto ? '' : `
            <div class="exp-cuerpo">
                <dl class="datos">
                    <div><dt>Contacto</dt><dd>${contacto}</dd></div>
                    <div><dt>País</dt><dd>${bandera(e.pais)} ${esc(paisNombre(e.pais, e.pais_detalle))}</dd></div>
                    <div><dt>Total</dt><dd>${esc(rd(e.total_dop))}</dd></div>
                    <div><dt>Creado</dt><dd>${esc(fecha(e.creado || e.actualizado))}</dd></div>
                    ${e.mensaje ? `<div style="grid-column:1/-1"><dt>Nota</dt><dd>${esc(e.mensaje)}</dd></div>` : ''}
                </dl>
                <div class="actual"><small>Lo que ve el cliente arriba · ${esc(fecha(e.actualizado))}</small><b>${esc(e.estado)}:</b> ${esc(e.detalle)}</div>
                <div class="tramites">
                    <p class="tramites-t">Trámites en este código (${items.length})</p>
                    ${items.map(t => bloqueTramite(e, t, items.length > 1)).join('')}
                    <form class="agregar" data-codigo="${esc(e.codigo)}">
                        <span class="campo" style="margin:0">Agregar otro trámite a este código</span>
                        ${campoServicio()}
                        <button class="btn btn-borde btn-sm" type="submit">+ Agregar trámite</button>
                    </form>
                </div>
                <div class="acciones">
                    <a class="btn btn-wa" href="${linkWhatsApp(e)}" target="_blank" rel="noopener" style="flex:1 1 200px">Avisar por WhatsApp</a>
                    <button class="btn btn-borde" type="button" data-copiar="${esc(e.codigo)}">Copiar código</button>
                </div>
            </div>`;
        return `<article class="exp" data-codigo="${esc(e.codigo)}">
            <button type="button" class="exp-cab" aria-expanded="${abierto}">
                <span class="exp-nombre">${esc(e.nombre || e.cliente)}</span>
                <span class="chip ${tono(e.paso)}">${esc(items.length > 1 ? e.estado : (e.paso === 3 ? 'En institución' : PASOS[e.paso] || e.estado))}</span>
                <span class="exp-serv">${esc(titulo)}</span>
                <span class="exp-meta"><span class="codigo">${esc(e.codigo)}</span>${items.length > 1 ? `<span>${items.length} trámites</span>` : ''}${bandera(e.pais)} <span>· ${esc(fecha(e.actualizado))}</span></span>
                ${barra(e.paso)}
            </button>${cuerpo}
        </article>`;
    }

    function pintar() {
        pintarFiltros();
        const q = $('q').value.trim().toLowerCase();
        const lista = expedientes.filter(e =>
            (!filtroPaso || e.paso === filtroPaso) &&
            (!q || [e.codigo, e.nombre, e.cliente, e.contacto, e.servicio_titulo, ...(e.tramites || []).map(t => t.titulo)]
                .some(v => String(v || '').toLowerCase().includes(q))));
        $('lista').innerHTML = lista.length ? lista.map(tarjeta).join('')
            : `<div class="vacio"><b>${expedientes.length ? 'Sin resultados' : 'Aún no hay expedientes'}</b>${expedientes.length ? 'Prueba con otra búsqueda o filtro.' : 'Las solicitudes del formulario de tu página aparecerán aquí. También puedes crear una con «Nuevo expediente».'}</div>`;
    }

    // ------------------------------------------------------------ eventos: sesión y filtros
    $('fLogin').addEventListener('submit', async ev => {
        ev.preventDefault();
        const btn = $('btnLogin'); btn.disabled = true; btn.textContent = 'Entrando…';
        try {
            await post('/admin/login', { clave: $('clave').value });
            $('clave').value = '';
            await mostrarPanel();
        } catch (e) {
            const err = $('loginError'); err.hidden = false; err.textContent = e.message;
        } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
    });

    $('btnSalir').addEventListener('click', async () => {
        try { await post('/admin/logout', {}); } catch (e) { /* igual salimos */ }
        expedientes = []; abiertos.clear(); editando = null; mostrarLogin();
    });

    $('filtros').addEventListener('click', ev => {
        const b = ev.target.closest('[data-paso]'); if (!b) return;
        filtroPaso = Number(b.dataset.paso); pintar();
    });
    $('q').addEventListener('input', pintar);

    // ------------------------------------------------------------ eventos: tarjetas
    $('lista').addEventListener('change', ev => { if (ev.target.matches('[data-f="servicio"]')) alCambiarServicio(ev.target); });

    $('lista').addEventListener('click', async ev => {
        const cab = ev.target.closest('.exp-cab');
        if (cab) {
            const c = cab.closest('.exp').dataset.codigo;
            abiertos.has(c) ? abiertos.delete(c) : abiertos.add(c);
            pintar(); return;
        }
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
            }
        } catch (e) {
            if (e.message !== 'sesion') toast(e.message);
            btn.disabled = false; btn.textContent = txt;
        }
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
        editando = null; $('avisoNuevas').hidden = true; pintar();
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
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('vNuevo').hidden) cerrarNuevo(); });

    $('fNuevo').addEventListener('submit', async ev => {
        ev.preventDefault();
        const btn = $('btnCrear'); btn.disabled = true; btn.textContent = 'Creando…';
        try {
            const servicios = [...$('nItems').querySelectorAll('.item-nuevo')].map(leerServicio);
            const r = await post('/admin/nuevo', { nombre: $('nNombre').value, contacto: $('nContacto').value,
                pais: $('nPais').value, mensaje: $('nMensaje').value, servicios });
            const e = r.expediente;
            reemplazar(e); abiertos.add(e.codigo); pintar();
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
