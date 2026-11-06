/* TramitaFácil RD — rastreo de expedientes: rastreo?c=<CÓDIGO> */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, state, $, esc, t, waLink, saludo, restart } = TF;

    const TONOS = { amber: 'bg-amber-100 text-amber-800', emerald: 'bg-emerald-100 text-emerald-800', sky: 'bg-sky-100 text-sky-800' };
    let ultimo = null, docsDe = null, compDe = null, pideDe = null, pagoDe = null, itemsDe = null;
    const rd = n => 'RD$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

    async function consultar() {
        const input = $('trackInput'), code = input.value.trim().toUpperCase();
        if (!code) { input.focus(); restart(input, 'shake'); return; }
        const btn = $('trackBtn');
        btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t('track.cargando'))}`;
        let data = null;
        try {
            await TF.apiLista;   // al abrir un enlace con ?c=, esperar a saber si hay servidor
            if (state.api) { try { data = await TF.api('/rastreo/' + encodeURIComponent(code)); } catch (e) { if (e.status !== 404) data = D.rastreo_demo[code] || null; } }
            else { await new Promise(r => setTimeout(r, 450)); data = D.rastreo_demo[code] || null; }
        } finally { btn.disabled = false; btn.textContent = t('track.btn'); }
        ultimo = { code, data };
        history.replaceState(null, '', `?c=${encodeURIComponent(code)}`);
        mostrar(code, data);
        actualizarWa();
    }

    function mostrar(code, data) {
        $('trackResultContainer').classList.remove('hidden');
        if (!data) { $('trackSuccess').classList.add('hidden'); $('trackError').classList.remove('hidden'); restart($('trackError'), 'shake'); return; }
        $('trackError').classList.add('hidden'); $('trackSuccess').classList.remove('hidden');
        $('trackCodeDisplay').textContent = code;
        $('trackServiceDisplay').textContent = data.service;
        $('trackClientDisplay').textContent = `${t('track.cliente')}: ${data.client}`;
        $('trackBadge').textContent = data.statusText;
        $('trackBadge').className = `text-xs font-bold px-3 py-1 rounded-full ${TONOS[data.tone] || TONOS.sky}`;
        $('trackDetailDisplay').textContent = data.detail;
        // Desglose cuando el código agrupa varios trámites
        const items = Array.isArray(data.items) ? data.items : [];
        $('trackItems').classList.toggle('hidden', items.length < 2);
        $('trackItemsN').textContent = items.length < 2 ? '' : String(items.length);
        if (itemsDe !== code) { $('trackItemsList').classList.add('hidden'); $('trackItemsVer').setAttribute('aria-expanded', 'false'); itemsDe = code; }
        $('trackItemsList').innerHTML = items.length < 2 ? '' : items.map(it => `
            <li class="ti">
                <div class="ti-top"><strong>${esc(it.service)}</strong><span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${TONOS[it.tone] || TONOS.sky}">${esc(it.statusText)}</span></div>
                <div class="ti-bar" aria-label="${esc(t('track.s' + it.step))}">${[1, 2, 3, 4].map(i => `<i class="${i <= it.step ? (it.step === 4 ? 'on ok' : 'on') : ''}"></i>`).join('')}</div>
                <p>${esc(it.detail)}</p>
            </li>`).join('');
        // Tres espacios: 1) pagos y recibos · 2) documentos que enviamos y pedimos · 3) archivos finales
        const demo = !!data.demo || !state.api;
        ['trackSecPagos', 'trackSecDocs', 'trackSecArchivos'].forEach(id => $(id).classList.toggle('hidden', demo));
        const pago = data.pago || '', saldo = data.saldo || {};
        const hayTotal = saldo.total != null;
        const completo = pago === 'confirmado' && data.falta_pagar === false;
        const inicialOk = completo || (hayTotal ? Number(saldo.pagado) >= Number(saldo.mitad) - 0.01 : pago === 'confirmado');
        const listo = Number(data.step) === 4;
        const verificando = pago === 'por_confirmar';
        // Los dos pagos del trámite: 50% para empezar y 50% cuando esté listo
        const mitad = hayTotal ? rd(saldo.mitad) : '';
        const hito = (nombre, est, texto) => `<li class="${est}"><i class="fa-solid ${{ ok: 'fa-circle-check', ver: 'fa-hourglass-half', pend: 'fa-circle-exclamation', espera: 'fa-clock' }[est]}"></i>
            <div><b>${esc(t(nombre))}</b>${mitad ? `<span>${esc(mitad)}</span>` : ''}</div><em>${esc(t(texto))}</em></li>`;
        $('trackHitos').innerHTML =
            hito('track.hito.ini', inicialOk ? 'ok' : verificando ? 'ver' : 'pend', inicialOk ? 'track.hito.conf' : verificando ? 'track.hito.ver' : 'track.hito.pend') +
            hito('track.hito.fin', completo ? 'ok' : inicialOk && verificando ? 'ver' : inicialOk && listo ? 'pend' : 'espera',
                completo ? 'track.hito.conf' : inicialOk && verificando ? 'track.hito.ver' : inicialOk && listo ? 'track.hito.ahora' : 'track.hito.espera');
        // El aviso grande: amarillo solo cuando falta el primer 50% o cuando el trámite ya está listo y falta el resto
        let estado, titulo, detalle;
        if (pago === 'rechazado' && listo) {      // el aviso de rechazo solo aparece cuando el trámite llega a LISTO
            estado = 'mal'; titulo = t('track.pago.mal');
            detalle = data.pago_motivo ? t('track.pago.mal.d.motivo', { motivo: data.pago_motivo }) : t('track.pago.mal.d');
        } else if (completo) { estado = 'ok'; titulo = t('track.pago.full'); detalle = t('track.pago.full.d'); }
        else if (verificando) { estado = 'info'; titulo = t('track.pago.pend'); detalle = t('track.pago.pend.d'); }
        else if (!inicialOk) {
            estado = 'aviso'; titulo = t('track.pago.ini');
            detalle = hayTotal ? t('track.pago.ini.d', { monto: rd(Math.max(0, saldo.falta_mitad)) }) : t('track.pago.ini.d0');
        } else if (listo) {
            estado = 'aviso'; titulo = t('track.pago.listo');
            detalle = hayTotal ? t('track.pago.listo.d', { monto: rd(saldo.falta) }) : t('track.pago.listo.d0');
        } else { estado = 'ok'; titulo = t('track.pago.inok'); detalle = t('track.pago.inok.d'); }
        const caja = $('trackPago');
        ['ok', 'mal', 'aviso', 'info'].forEach(c => caja.classList.toggle(c, estado === c));
        caja.classList.toggle('hidden', inicialOk && !listo);   // pagado el primer 50%, no hay aviso hasta que el trámite llegue a LISTO
        caja.querySelector('.tp-ico i').className = 'fa-solid ' + { ok: 'fa-circle-check', mal: 'fa-triangle-exclamation', info: 'fa-hourglass-half', aviso: 'fa-circle-exclamation' }[estado];
        $('trackPagoT').textContent = titulo;
        $('trackPagoD').textContent = detalle;
        // El desglose de montos solo si lo pide
        $('trackPagoVer').classList.toggle('hidden', !hayTotal);
        $('trackPagoDesglose').innerHTML = !hayTotal ? '' : `
            <div><dt>${esc(t('track.pago.total'))}</dt><dd>${esc(rd(saldo.total))}</dd></div>
            <div><dt>${esc(t('track.pago.pagado'))}</dt><dd>${esc(rd(saldo.pagado))}</dd></div>
            ${saldo.falta > 0 ? `<div class="falta"><dt>${esc(t('track.pago.resta'))}</dt><dd>${esc(rd(saldo.falta))}</dd></div>` : ''}`;
        if (pagoDe !== code) { $('trackPagoDesglose').classList.add('hidden'); $('trackPagoVer').setAttribute('aria-expanded', 'false'); pagoDe = code; }
        $('trackCompAbrir').classList.toggle('falta', estado === 'aviso' || estado === 'mal');
        // Recibo de pago: solo se pide mientras falte algo por pagar
        $('trackComp').classList.toggle('hidden', demo || completo);
        // Tres botones: el inicial se bloquea cuando ya está confirmado
        const ini = document.querySelector('.tc-tipo[data-concepto="inicial"]');
        ini.disabled = inicialOk; $('tcTipoIni').textContent = t(inicialOk ? 'track.comp.c.ini.ok' : 'track.comp.c.ini.d');
        if (compDe !== code || (inicialOk && $('trackCompConcepto').value === 'inicial')) elegirConcepto(inicialOk ? 'final' : 'inicial');
        else elegirConcepto($('trackCompConcepto').value);
        if (compDe !== code) { $('trackCompForm').classList.add('hidden'); $('trackCompOk').classList.add('hidden'); $('trackCompAbrir').setAttribute('aria-expanded', 'false'); compDe = code; }
        if (pago === 'rechazado' && listo) { $('trackCompForm').classList.remove('hidden'); $('trackCompOk').classList.add('hidden'); $('trackCompAbrir').setAttribute('aria-expanded', 'true'); }
        // Documentos que le pedimos: cada uno tiene su propio espacio para adjuntar (uno o varios archivos)
        const extra = Array.isArray(data.docs_extra) ? data.docs_extra : [], subidos = Array.isArray(data.docs_subidos) ? data.docs_subidos : [];
        const baseDocs = (Array.isArray(data.items) ? data.items : []).flatMap(it => it.docs || []);
        const todosDocs = [...baseDocs, ...extra].filter((d, i, a) => a.findIndex(x => x.nombre === d.nombre) === i);
        const faltan = todosDocs.filter(d => !d.recibido && !d.enviado);
        $('trackPideSub').textContent = !todosDocs.length ? t('track.pide.vacio') : faltan.length ? t('track.pide.sub', { n: faltan.length }) : t('track.pide.ok.todos');
        const nombres = new Set(todosDocs.map(d => d.nombre));
        const slot = (nombre, d, propios) => {
            const rec = d && d.recibido, env = propios.length > 0;
            const est = rec ? 'ok' : env ? 'env' : '';
            const ico = rec ? 'fa-circle-check' : env ? 'fa-clock' : 'fa-circle';
            const txt = rec ? t('track.pide.tenemos') : env ? t('track.pide.revision') : t('track.slot.pend');
            return `<div class="slot ${est}"><div class="slot-cab"><i class="fa-solid ${ico}"></i><b>${esc(nombre || t('track.slot.otro'))}</b><em>${esc(txt)}</em></div>
                ${propios.length ? `<ul class="td-enviados">${propios.map(p => `<li class="ok"><i class="fa-solid fa-circle-check"></i><span>${esc(p.nombre)}</span><b>${esc(t('track.pide.regis'))}</b></li>`).join('')}</ul>` : ''}
                ${rec ? '' : `<label class="slot-add"><input type="file" multiple data-slot="${esc(nombre)}" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf">
                    <i class="fa-solid fa-paperclip"></i><span>${esc(t(propios.length ? 'track.slot.mas' : 'track.slot.adj'))}</span></label>`}</div>`;
        };
        $('trackSlots').innerHTML = todosDocs.map(d => slot(d.nombre, d, subidos.filter(x => x.cual === d.nombre))).join('')
            + slot('', null, subidos.filter(x => !nombres.has(x.cual)));
        $('trackPideAbrir').classList.toggle('urge', faltan.length > 0 && !data.docs_enviados);
        if (pideDe !== code) { $('trackPideCuerpo').classList.add('hidden'); $('trackDocOk').classList.add('hidden'); $('trackPideAbrir').setAttribute('aria-expanded', 'false'); pideDe = code; }
        // Archivos finales: bloqueados hasta que administración confirme el 50% restante (o los desbloquee)
        const nDocs = Number(data.archivos || 0), bloqueados = !!data.archivos_bloqueados;
        $('trackBloq').classList.toggle('hidden', demo || !nDocs || !bloqueados);
        $('trackBloqN').textContent = nDocs === 1 ? t('track.lock.n1') : t('track.lock.n', { n: nDocs });
        $('trackBloqD').textContent = hayTotal && inicialOk ? t('track.lock.d', { monto: rd(saldo.falta) }) : t('track.lock.d0');
        $('trackDocs').classList.toggle('hidden', !nDocs || demo || bloqueados);
        $('trackEspera').classList.toggle('hidden', !!nDocs || demo);
        $('trackDocsN').textContent = !nDocs ? '' : nDocs === 1 ? t('track.docs.n1') : t('track.docs.n', { n: nDocs });
        if (!docsDe || docsDe !== code) { $('trackDocsList').innerHTML = ''; $('trackDocsForm').classList.remove('hidden'); $('trackDocsVence').classList.add('hidden'); $('trackDocsError').classList.add('hidden'); docsDe = null; }
        $('trackLineFill').style.width = '0%';
        requestAnimationFrame(() => $('trackLineFill').style.width = ((data.step - 1) / 3 * 100) + '%');
        for (let i = 1; i <= 4; i++) {
            const st = $(`step${i}`), on = i <= data.step, dot = st.querySelector('div');
            st.classList.toggle('is-done', on); dot.innerHTML = on ? '<i class="fa-solid fa-check"></i>' : i;
            if (on) setTimeout(() => restart(dot, 'pop'), i * 150);
        }
    }

    async function verDocumentos() {
        const code = ultimo && ultimo.code, dato = $('trackDocsDato').value.trim(), btn = $('trackDocsForm').querySelector('button');
        if (!code || !dato) return;
        btn.disabled = true; $('trackDocsError').classList.add('hidden');
        try {
            const r = await TF.api('/rastreo/' + encodeURIComponent(code) + '/archivos', { method: 'POST', body: JSON.stringify({ dato }) });
            const kb = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
            $('trackDocsList').innerHTML = r.archivos.map(a => `<li><a href="${esc(a.url)}" rel="nofollow noopener" download>
                <i class="fa-solid ${/\.pdf$/i.test(a.nombre) ? 'fa-file-pdf' : 'fa-file-image'}"></i><span>${esc(a.nombre)}<small>${kb(a.tamano)}</small></span><i class="fa-solid fa-download"></i></a></li>`).join('');
            $('trackDocsForm').classList.add('hidden'); $('trackDocsVence').classList.remove('hidden'); docsDe = code;
        } catch (e) {
            const err = $('trackDocsError'); err.textContent = e.status === 429 ? e.message : e.status === 423 ? t('track.docs.bloq') : t('track.docs.error');
            err.classList.remove('hidden'); restart(err, 'shake');
        } finally { btn.disabled = false; }
    }

    async function enviarComprobante() {
        const code = ultimo && ultimo.code, err = $('trackCompError'), btn = $('trackCompBtn');
        const archivo = $('trackCompArchivo').files[0], monto = Number($('trackCompMonto').value), dato = $('trackCompDato').value.trim();
        const falta = !archivo ? t('track.comp.e.archivo') : !(monto > 0) ? t('track.comp.e.monto') : !dato ? t('track.docs.aria') : '';
        if (falta) { err.textContent = falta; err.classList.remove('hidden'); restart(err, 'shake'); return; }
        if (archivo.size > 10 * 1024 * 1024) { err.textContent = t('track.comp.e.peso'); err.classList.remove('hidden'); return; }
        btn.disabled = true; btn.textContent = t('track.comp.enviando'); err.classList.add('hidden');
        try {
            const chico = await window.TF_IMAGEN.achicar(archivo);
            const fd = new FormData();
            fd.append('archivo', chico, chico.name); fd.append('monto', String(monto)); fd.append('moneda', $('trackCompMoneda').value);
            fd.append('metodo', $('trackCompMetodo').value); fd.append('concepto', $('trackCompConcepto').value); fd.append('dato', dato); fd.append('nota', $('trackCompNota').value.trim());
            const r = await fetch('/api/rastreo/' + encodeURIComponent(code) + '/comprobante', { method: 'POST', body: fd });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) throw Object.assign(new Error(window.TF_IMAGEN.errorSubida(r.status, j)), { status: r.status });
            $('trackCompForm').classList.add('hidden'); $('trackCompOk').classList.remove('hidden'); $('trackCompForm').reset();
            try { const d = await TF.api('/rastreo/' + encodeURIComponent(code)); ultimo = { code, data: d }; mostrar(code, d); $('trackCompOk').classList.remove('hidden'); } catch (e) { /* sigue */ }
        } catch (e) {
            err.textContent = e.status === 403 ? t('track.docs.error') : e.message; err.classList.remove('hidden'); restart(err, 'shake');
        } finally { btn.disabled = false; btn.textContent = t('track.comp.btn'); }
    }

    function elegirConcepto(v) {
        $('trackCompConcepto').value = v;
        document.querySelectorAll('.tc-tipo').forEach(b => { const on = b.dataset.concepto === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    }

    /** Sube los archivos de un espacio (un documento pedido): uno por uno, y cada uno queda registrado. */
    async function enviarDocumento(input) {
        const code = ultimo && ultimo.code, err = $('trackDocError'), dato = $('trackDocDato').value.trim();
        const archivos = Array.from(input.files || []), cual = input.dataset.slot || '';
        if (!archivos.length) return;
        if (!dato) { err.textContent = t('track.docs.aria'); err.classList.remove('hidden'); restart(err, 'shake'); $('trackDocDato').focus(); input.value = ''; return; }
        if (archivos.some(a => a.size > 10 * 1024 * 1024)) { err.textContent = t('track.comp.e.peso'); err.classList.remove('hidden'); input.value = ''; return; }
        err.classList.add('hidden'); $('trackDocOk').classList.add('hidden');
        const rotulo = input.parentElement.querySelector('span'); input.disabled = true;
        let enviados = 0;
        for (let i = 0; i < archivos.length; i++) {
            rotulo.textContent = t('track.pide.enviando', { i: i + 1, n: archivos.length });
            try {
                const chico = await window.TF_IMAGEN.achicar(archivos[i]);
                const fd = new FormData();
                fd.append('archivo', chico, chico.name); fd.append('dato', dato); fd.append('cual', cual);
                const r = await fetch('/api/rastreo/' + encodeURIComponent(code) + '/documento', { method: 'POST', body: fd });
                const j = await r.json().catch(() => ({}));
                if (!r.ok || j.ok === false) throw Object.assign(new Error(window.TF_IMAGEN.errorSubida(r.status, j)), { status: r.status });
                enviados++;
            } catch (e) {
                err.textContent = (e.status === 403 ? t('track.docs.error') : e.message) + ' · ' + archivos[i].name; err.classList.remove('hidden'); restart(err, 'shake');
                if (e.status === 403) break;
            }
        }
        try { const d = await TF.api('/rastreo/' + encodeURIComponent(code)); ultimo = { code, data: d }; mostrar(code, d); } catch (e) { /* sigue */ }
        if (enviados) $('trackDocOk').classList.remove('hidden');
        $('trackPideCuerpo').classList.remove('hidden'); $('trackPideAbrir').setAttribute('aria-expanded', 'true');
    }

    function actualizarWa() {
        const code = $('trackInput').value.trim().toUpperCase();
        $('trackWa').href = waLink(saludo(code ? t('wa.rastreo', { code }) : t('wa.rastreo.sin')));
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('trackForm').addEventListener('submit', e => { e.preventDefault(); consultar(); });
        $('trackDocsForm').addEventListener('submit', e => { e.preventDefault(); verDocumentos(); });
        $('trackCompAbrir').addEventListener('click', () => {
            const f = $('trackCompForm'), abre = f.classList.contains('hidden');
            f.classList.toggle('hidden', !abre); $('trackCompOk').classList.add('hidden');
            $('trackCompAbrir').setAttribute('aria-expanded', String(abre));
            if (abre) $('trackCompArchivo').focus();
        });
        $('trackCompForm').addEventListener('submit', e => { e.preventDefault(); enviarComprobante(); });
        $('trackPagoVer').addEventListener('click', () => {
            const d = $('trackPagoDesglose'), abre = d.classList.contains('hidden');
            d.classList.toggle('hidden', !abre); $('trackPagoVer').setAttribute('aria-expanded', String(abre));
            $('trackPagoVer').textContent = t(abre ? 'track.pago.ocultar' : 'track.pago.ver');
        });
        $('trackItemsVer').addEventListener('click', () => {
            const l = $('trackItemsList'), abre = l.classList.contains('hidden');
            l.classList.toggle('hidden', !abre); $('trackItemsVer').setAttribute('aria-expanded', String(abre));
        });
        $('trackPideAbrir').addEventListener('click', () => {
            const cu = $('trackPideCuerpo'), abre = cu.classList.contains('hidden');
            cu.classList.toggle('hidden', !abre); $('trackPideAbrir').setAttribute('aria-expanded', String(abre));
            if (abre) $('trackDocDato').focus();
        });
        document.querySelectorAll('.tc-tipo').forEach(b => b.addEventListener('click', () => { if (!b.disabled) elegirConcepto(b.dataset.concepto); }));
        $('trackSlots').addEventListener('change', e => { if (e.target.matches('input[data-slot]')) enviarDocumento(e.target); });
        $('trackInput').addEventListener('input', actualizarWa);
        document.addEventListener('click', e => {
            const b = e.target.closest('[data-demo-code]');
            if (b) { $('trackInput').value = b.dataset.demoCode; consultar(); }
        });
        const inicial = new URLSearchParams(location.search).get('c');
        if (inicial) { $('trackInput').value = inicial.toUpperCase(); consultar(); }
        actualizarWa();
        TF.on('lang', () => { actualizarWa(); if (ultimo) mostrar(ultimo.code, ultimo.data); });
        TF.on('pais', actualizarWa);
    });
})();
