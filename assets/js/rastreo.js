/* TramitaFácil RD — rastreo de expedientes: rastreo?c=<CÓDIGO> */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, state, $, esc, t, waLink, saludo, restart } = TF;

    const TONOS = { amber: 'bg-amber-100 text-amber-800', emerald: 'bg-emerald-100 text-emerald-800', sky: 'bg-sky-100 text-sky-800' };
    let ultimo = null, docsDe = null, compDe = null;

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
        $('trackItemsList').innerHTML = items.length < 2 ? '' : items.map(it => `
            <li class="ti">
                <div class="ti-top"><strong>${esc(it.service)}</strong><span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap ${TONOS[it.tone] || TONOS.sky}">${esc(it.statusText)}</span></div>
                <div class="ti-bar" aria-label="${esc(t('track.s' + it.step))}">${[1, 2, 3, 4].map(i => `<i class="${i <= it.step ? (it.step === 4 ? 'on ok' : 'on') : ''}"></i>`).join('')}</div>
                <p>${esc(it.detail)}</p>
            </li>`).join('');
        // Estado del pago: el equipo lo confirma antes de darlo por recibido
        const pago = data.pago || '';
        $('trackPago').classList.toggle('hidden', !pago || data.demo);
        $('trackPago').classList.toggle('ok', pago === 'confirmado');
        $('trackPago').querySelector('i').className = `fa-solid ${pago === 'confirmado' ? 'fa-circle-check' : 'fa-hourglass-half'}`;
        $('trackPagoT').textContent = pago === 'confirmado' ? t('track.pago.ok') : t('track.pago.pend');
        $('trackPagoD').textContent = pago === 'confirmado' ? t('track.pago.ok.d') : t('track.pago.pend.d');
        // Comprobante de pago (opcional)
        $('trackComp').classList.toggle('hidden', !!data.demo || !state.api);
        if (compDe !== code) { $('trackCompForm').classList.add('hidden'); $('trackCompOk').classList.add('hidden'); $('trackCompAbrir').setAttribute('aria-expanded', 'false'); compDe = code; }
        // Documentos listos para descargar (se piden los últimos 4 del WhatsApp o el correo)
        const nDocs = Number(data.archivos || 0);
        $('trackDocs').classList.toggle('hidden', !nDocs || data.demo);
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
