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
        // Estado del pago: amarillo mientras falte algo, verde cuando está completo
        const pago = data.pago || '', saldo = data.saldo || {};
        const completo = pago === 'confirmado' && data.falta_pagar === false;
        const parcial = pago === 'confirmado' && !completo;
        const estado = pago === 'rechazado' ? 'mal' : completo ? 'ok' : 'aviso';
        const caja = $('trackPago');
        caja.classList.toggle('hidden', !!data.demo || !state.api);
        caja.classList.toggle('ok', estado === 'ok');
        caja.classList.toggle('mal', estado === 'mal');
        caja.classList.toggle('aviso', estado === 'aviso');
        caja.querySelector('.tp-ico i').className = 'fa-solid ' + (estado === 'ok' ? 'fa-circle-check'
            : estado === 'mal' ? 'fa-triangle-exclamation' : pago === 'por_confirmar' ? 'fa-hourglass-half' : 'fa-circle-exclamation');
        $('trackPagoT').textContent = pago === 'rechazado' ? t('track.pago.mal')
            : completo ? t('track.pago.full')
            : parcial ? t('track.pago.parcial', { pct: saldo.pct != null ? saldo.pct : '' })
            : pago === 'por_confirmar' ? t('track.pago.pend') : t('track.pago.falta');
        $('trackPagoD').textContent = pago === 'rechazado'
                ? (data.pago_motivo ? t('track.pago.mal.d.motivo', { motivo: data.pago_motivo }) : t('track.pago.mal.d'))
            : completo ? t('track.pago.full.d')
            : parcial ? (saldo.falta != null ? t('track.pago.parcial.d', { pct: saldo.pct, falta: rd(saldo.falta) }) : t('track.pago.ok.d'))
            : pago === 'por_confirmar' ? t('track.pago.pend.d') : t('track.pago.falta.d');
        // El desglose de montos solo si lo pide
        const hayMontos = saldo.total != null;
        $('trackPagoVer').classList.toggle('hidden', !hayMontos);
        $('trackPagoDesglose').innerHTML = !hayMontos ? '' : `
            <div><dt>${esc(t('track.pago.total'))}</dt><dd>${esc(rd(saldo.total))}</dd></div>
            <div><dt>${esc(t('track.pago.pagado'))}</dt><dd>${esc(rd(saldo.pagado))}</dd></div>
            ${saldo.falta > 0 ? `<div class="falta"><dt>${esc(t('track.pago.resta'))}</dt><dd>${esc(rd(saldo.falta))}</dd></div>` : ''}`;
        if (pagoDe !== code) { $('trackPagoDesglose').classList.add('hidden'); $('trackPagoVer').setAttribute('aria-expanded', 'false'); pagoDe = code; }
        $('trackCompAbrir').classList.toggle('falta', estado !== 'ok');
        // Documentos que le pedimos: puede subirlos desde aquí
        const pide = Array.isArray(data.pide_docs) ? data.pide_docs : [];
        const todosDocs = (Array.isArray(data.items) ? data.items : []).flatMap(it => it.docs || []);
        $('trackDocsPide').classList.toggle('hidden', !!data.demo || !state.api || !todosDocs.length);
        if (todosDocs.length) {
            const faltan = todosDocs.filter(d => !d.recibido && !d.enviado);
            $('trackPideSub').textContent = faltan.length ? t('track.pide.sub', { n: faltan.length }) : t('track.pide.ok.todos');
            $('trackPideLista').innerHTML = todosDocs.map(d => {
                const est = d.recibido ? 'ok' : d.enviado ? 'env' : '';
                const ico = d.recibido ? 'fa-circle-check' : d.enviado ? 'fa-clock' : 'fa-circle';
                return `<li class="${est}"><i class="fa-solid ${ico}"></i><span>${esc(d.nombre)}
                    ${d.recibido ? `<b>${esc(t('track.pide.tenemos'))}</b>` : d.enviado ? `<b>${esc(t('track.pide.revision'))}</b>` : ''}</span></li>`;
            }).join('');
            $('trackDocCual').innerHTML = (faltan.length ? faltan.map(d => d.nombre) : todosDocs.map(d => d.nombre))
                .map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + `<option value="">${esc(t('track.pide.otro'))}</option>`;
            $('trackPideAbrir').classList.toggle('urge', faltan.length > 0 && !data.docs_enviados);
            if (pideDe !== code) { $('trackPideCuerpo').classList.add('hidden'); $('trackDocOk').classList.add('hidden'); $('trackPideAbrir').setAttribute('aria-expanded', 'false'); pideDe = code; }
        }
        // Comprobante de pago (opcional). Si ya está todo pagado, no se le pide nada más.
        const yaPago = pago === 'confirmado' && data.falta_pagar === false;
        $('trackComp').classList.toggle('hidden', !!data.demo || !state.api || yaPago);
        if (compDe !== code) { $('trackCompForm').classList.add('hidden'); $('trackCompOk').classList.add('hidden'); $('trackCompAbrir').setAttribute('aria-expanded', 'false'); compDe = code; }
        if (pago === 'rechazado') { $('trackCompForm').classList.remove('hidden'); $('trackCompOk').classList.add('hidden'); $('trackCompAbrir').setAttribute('aria-expanded', 'true'); }
        $('trackCompWaBtn').href = waLink(saludo(t('wa.comp', { code })));
        // Documentos listos para descargar (se piden los últimos 4 del WhatsApp o el correo)
        const nDocs = Number(data.archivos || 0);
        $('trackDocs').classList.toggle('hidden', !nDocs || data.demo);
        $('trackEspera').classList.toggle('hidden', !!nDocs || !!data.demo || !state.api);
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
            const err = $('trackDocsError'); err.textContent = e.status === 429 ? e.message : t('track.docs.error');
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
            fd.append('metodo', $('trackCompMetodo').value); fd.append('dato', dato); fd.append('nota', $('trackCompNota').value.trim());
            const r = await fetch('/api/rastreo/' + encodeURIComponent(code) + '/comprobante', { method: 'POST', body: fd });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) throw Object.assign(new Error(window.TF_IMAGEN.errorSubida(r.status, j)), { status: r.status });
            $('trackCompForm').classList.add('hidden'); $('trackCompOk').classList.remove('hidden'); $('trackCompForm').reset();
            try { const d = await TF.api('/rastreo/' + encodeURIComponent(code)); ultimo = { code, data: d }; mostrar(code, d); $('trackCompOk').classList.remove('hidden'); } catch (e) { /* sigue */ }
        } catch (e) {
            err.textContent = e.status === 403 ? t('track.docs.error') : e.message; err.classList.remove('hidden'); restart(err, 'shake');
        } finally { btn.disabled = false; btn.textContent = t('track.comp.btn'); }
    }

    /** El cliente dice que enviará el pago por WhatsApp: se avisa al equipo y se abre el chat. */
    async function avisarPagoWa() {
        const code = ultimo && ultimo.code;
        if (!code || !state.api) return;
        try { await fetch('/api/rastreo/' + encodeURIComponent(code) + '/pago-whatsapp', { method: 'POST' }); } catch (e) { /* igual se abre el chat */ }
    }

    async function enviarDocumento() {
        const code = ultimo && ultimo.code, err = $('trackDocError'), btn = $('trackDocBtn');
        const archivo = $('trackDocArchivo').files[0], dato = $('trackDocDato').value.trim();
        if (!archivo || !dato) { err.textContent = !archivo ? t('track.comp.e.archivo') : t('track.docs.aria'); err.classList.remove('hidden'); restart(err, 'shake'); return; }
        if (archivo.size > 10 * 1024 * 1024) { err.textContent = t('track.comp.e.peso'); err.classList.remove('hidden'); return; }
        btn.disabled = true; btn.textContent = t('track.comp.enviando'); err.classList.add('hidden');
        try {
            const chico = await window.TF_IMAGEN.achicar(archivo);
            const fd = new FormData();
            fd.append('archivo', chico, chico.name); fd.append('dato', dato); fd.append('cual', $('trackDocCual').value);
            const r = await fetch('/api/rastreo/' + encodeURIComponent(code) + '/documento', { method: 'POST', body: fd });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) throw Object.assign(new Error(window.TF_IMAGEN.errorSubida(r.status, j)), { status: r.status });
            $('trackDocForm').reset(); $('trackDocOk').classList.remove('hidden');
            try { const d = await TF.api('/rastreo/' + encodeURIComponent(code)); ultimo = { code, data: d }; mostrar(code, d); } catch (e) { /* sigue */ }
            $('trackPideCuerpo').classList.remove('hidden'); $('trackDocOk').classList.remove('hidden'); $('trackPideAbrir').setAttribute('aria-expanded', 'true');
        } catch (e) {
            err.textContent = e.status === 403 ? t('track.docs.error') : e.message; err.classList.remove('hidden'); restart(err, 'shake');
        } finally { btn.disabled = false; btn.textContent = t('track.pide.btn'); }
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
        $('trackCompWaBtn').addEventListener('click', () => avisarPagoWa());
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
            if (abre) $('trackDocArchivo').focus();
        });
        $('trackDocForm').addEventListener('submit', e => { e.preventDefault(); enviarDocumento(); });
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
