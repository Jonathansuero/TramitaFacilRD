/* TramitaFácil RD — página de detalle: servicio.html?id=<clave> */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, C, PAISES, SERV, state, $, $$, esc, t, tc, money, waLink, saludo, toast, restart } = TF;

    const keys = Object.keys(SERV);
    let id = new URLSearchParams(location.search).get('id');
    if (!SERV[id]) id = PAISES[state.pais].destacados[0];
    const CK_STORE = 'tf_checklist_v2';

    function render() {
        const s = SERV[id], tr = tc('servicios', id), cat = tc('categorias', s.category);
        document.title = `${tr.title} | TramitaFácil RD`;
        $('bcCat').textContent = cat.label;
        $('sCat').innerHTML = `<i class="fa-solid ${D.categorias[s.category].icono} mr-1"></i>${esc(cat.label)}`;
        $('sFlags').textContent = s.paises.map(p => PAISES[p].bandera).join(' ');
        $('sFlags').title = t('serv.ideal');
        $('sTitle').textContent = tr.title;
        $('sDesc').textContent = tr.desc;
        $('sInstHero').innerHTML = s.inst.map(i => `<a href="instituciones.html#${i}" class="inst-chip-dark">${esc(D.instituciones[i].sigla)} · ${esc(tc('instituciones', i).nombre)}</a>`).join('');

        // pasos genéricos del proceso
        $('sSteps').innerHTML = [1, 2, 3, 4].map(n => { const k = 'serv.p' + n + (n === 3 && !s.inst.length ? 'b' : ''); return `<li><span>${n}</span><div><strong>${esc(t(k + '.t'))}</strong><p>${esc(t(k + '.d', { inst: s.inst.map(i => D.instituciones[i].sigla).join(', ') }))}</p></div></li>`; }).join('');

        // requisitos
        const ck = D.checklists[id];
        $('sReqBox').classList.toggle('hidden', !ck);
        if (ck) {
            const saved = TF.store.get(CK_STORE, {})[id] || [];
            $('sReq').innerHTML = tc('checklists', id).items.map((txt, i) => `<label class="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100"><input type="checkbox" class="mt-0.5 rounded s-check" ${saved[i] ? 'checked' : ''}><span class="text-xs font-semibold text-slate-700">${esc(txt)}</span></label>`).join('');
            $$('.s-check').forEach(cb => cb.addEventListener('change', progreso));
            progreso();
        }

        // instituciones
        $('sInst').innerHTML = s.inst.length ? s.inst.map(i => { const it = tc('instituciones', i);
            return `<a href="instituciones.html#${i}" class="flex items-start gap-3 p-3 rounded-2xl border border-slate-200 hover:border-domBlue hover:bg-sky-50 transition-colors">${TF.instBadge(i, 'sm')}<span><strong class="block text-sm text-slate-900">${esc(it.nombre)}</strong><span class="block text-xs text-slate-500">${esc(it.desc)}</span></span></a>`; }).join('')
            : `<p class="text-sm text-slate-500">${esc(t('serv.sininst'))}</p>`;

        precio();
        $('sSolicitar').href = `index.html#solicitar=${id}`;

        // relacionados y navegación anterior/siguiente
        const rel = keys.filter(k => k !== id && SERV[k].category === s.category).slice(0, 6);
        $('sRel').innerHTML = rel.map(k => `<a href="servicio.html?id=${k}" class="cat-card"><h3>${esc(tc('servicios', k).title)}</h3><p>${esc(tc('servicios', k).desc)}</p><div class="cat-precio mt-3">${esc(t('precio.desde'))}<strong>${money(SERV[k].tax + SERV[k].fee)}</strong></div></a>`).join('');
        const i = keys.indexOf(id);
        $('sPrev').href = `servicio.html?id=${keys[(i - 1 + keys.length) % keys.length]}`;
        $('sNext').href = `servicio.html?id=${keys[(i + 1) % keys.length]}`;
        $('sPrev').setAttribute('aria-label', t('serv.anterior')); $('sNext').setAttribute('aria-label', t('serv.siguiente'));
    }

    function progreso() {
        const boxes = $$('.s-check'), c = boxes.filter(b => b.checked).length, pct = boxes.length ? Math.round(c / boxes.length * 100) : 0;
        $('sReqBar').style.width = pct + '%'; $('sReqPct').textContent = t('req.listo', { pct });
        const all = TF.store.get(CK_STORE, {}); all[id] = boxes.map(b => b.checked); TF.store.set(CK_STORE, all);
        if (boxes.length && c === boxes.length) toast('🎉 ' + t('req.completo'));
    }

    function precio() {
        const s = SERV[id], exp = $('pExp').checked, env = $('pEnv').checked;
        $$('#monedaToggle button').forEach(b => b.classList.toggle('is-active', b.dataset.moneda === state.moneda));
        $('pTax').textContent = money(s.tax); $('pFee').textContent = money(s.fee);
        $('pExpV').textContent = '+ ' + money(C.express_fee); $('pEnvV').textContent = '+ ' + money(C.delivery_fee);
        $('pTotal').textContent = money(s.tax + s.fee + (exp ? C.express_fee : 0) + (env ? C.delivery_fee : 0));
        restart($('pTotal'), 'bump');
        $('sWa').href = waLink(saludo(t('wa.servicio', { s: tc('servicios', id).title, total: $('pTotal').textContent })));
    }

    /** Cambia de servicio sin recargar la página (relacionados, anterior/siguiente y botón atrás). */
    function irA(nuevo, { guardar = true } = {}) {
        if (!SERV[nuevo] || nuevo === id) return;
        id = nuevo;
        $('pExp').checked = false; $('pEnv').checked = false;
        render();
        if (guardar) history.pushState({ id }, '', `servicio.html?id=${encodeURIComponent(id)}`);
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    document.addEventListener('DOMContentLoaded', () => {
        render();
        history.replaceState({ id }, '', location.href);
        document.addEventListener('click', e => {
            const a = e.target.closest('a[href^="servicio.html?id="]');
            if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
            const nuevo = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('id');
            if (SERV[nuevo]) { e.preventDefault(); e.stopPropagation(); irA(nuevo); }
        }, true);
        window.addEventListener('popstate', e => { const nuevo = (e.state && e.state.id) || new URLSearchParams(location.search).get('id'); if (nuevo) irA(nuevo, { guardar: false }); });
        ['pExp', 'pEnv'].forEach(i => $(i).addEventListener('change', precio));
        $('monedaToggle').addEventListener('click', e => { const b = e.target.closest('[data-moneda]'); if (b) TF.setMoneda(b.dataset.moneda); });
        $('sShare').addEventListener('click', async () => {
            const url = location.origin && location.protocol.startsWith('http') ? `${location.origin}${location.pathname}?id=${id}` : location.href;
            const title = tc('servicios', id).title;
            try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); toast(t('toast.enlace')); } } catch (e) { /* cancelado */ }
        });
        TF.on('lang', render); TF.on('pais', render); TF.on('moneda', precio);
    });
})();
