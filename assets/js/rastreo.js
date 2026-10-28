/* TramitaFácil RD — rastreo de expedientes: rastreo.html?c=<CÓDIGO> */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, state, $, esc, t, waLink, saludo, restart } = TF;

    const TONOS = { amber: 'bg-amber-100 text-amber-800', emerald: 'bg-emerald-100 text-emerald-800', sky: 'bg-sky-100 text-sky-800' };
    let ultimo = null;

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
        $('trackLineFill').style.width = '0%';
        requestAnimationFrame(() => $('trackLineFill').style.width = ((data.step - 1) / 3 * 100) + '%');
        for (let i = 1; i <= 4; i++) {
            const st = $(`step${i}`), on = i <= data.step, dot = st.querySelector('div');
            st.classList.toggle('is-done', on); dot.innerHTML = on ? '<i class="fa-solid fa-check"></i>' : i;
            if (on) setTimeout(() => restart(dot, 'pop'), i * 150);
        }
    }

    function actualizarWa() {
        const code = $('trackInput').value.trim().toUpperCase();
        $('trackWa').href = waLink(saludo(code ? t('wa.rastreo', { code }) : t('wa.rastreo.sin')));
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('trackForm').addEventListener('submit', e => { e.preventDefault(); consultar(); });
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
