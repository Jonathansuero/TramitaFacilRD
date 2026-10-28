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
        renderRelacionados();
        const i = keys.indexOf(id);
        $('sPrev').href = `servicio.html?id=${keys[(i - 1 + keys.length) % keys.length]}`;
        $('sNext').href = `servicio.html?id=${keys[(i + 1) % keys.length]}`;
        $('sPrev').setAttribute('aria-label', t('serv.anterior')); $('sNext').setAttribute('aria-label', t('serv.siguiente'));
    }

    // ---------------- Trámites relacionados: todos los del área, con detalle desplegable aquí mismo
    let abierto = null;
    function renderRelacionados() {
        const s = SERV[id], rel = keys.filter(k => k !== id && SERV[k].category === s.category);
        if (!rel.includes(abierto)) abierto = null;
        $('sRelSub').textContent = t(rel.length === 1 ? 'serv.rel.sub1' : 'serv.rel.sub', { n: rel.length, area: tc('categorias', s.category).label });
        $('sRel').innerHTML = rel.map(k => `
            <button type="button" class="cat-card rel-card ${k === abierto ? 'is-open' : ''}" data-rel="${k}" aria-expanded="${k === abierto}">
                <h3>${esc(tc('servicios', k).title)}</h3><p>${esc(tc('servicios', k).desc)}</p>
                <div class="flex items-end justify-between gap-2 mt-3 w-full">
                    <div class="cat-precio">${esc(t('precio.desde'))}<strong>${money(SERV[k].tax + SERV[k].fee)}</strong></div>
                    <span class="rel-mas" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></span>
                </div>
            </button>`).join('');
        if (abierto) colocarDetalle(false);
    }
    function detalleHtml(k) {
        const s = SERV[k], tr = tc('servicios', k), ck = D.checklists[k] ? tc('checklists', k).items : null;
        const total = money(s.tax + s.fee);
        return `<div class="rel-detalle" role="region" aria-label="${esc(tr.title)}">
            <div class="flex items-start justify-between gap-3">
                <div><p class="text-[11px] font-bold uppercase tracking-wider text-domRed"><i class="fa-solid ${D.categorias[s.category].icono} mr-1"></i>${esc(tc('categorias', s.category).label)} <span class="text-slate-400 ml-1">${s.paises.map(p => PAISES[p].bandera).join(' ')}</span></p>
                    <h3 class="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">${esc(tr.title)}</h3></div>
                <button type="button" class="rel-cerrar" data-rel-cerrar aria-label="${esc(t('serv.rel.cerrar'))}"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p class="text-sm text-slate-600 mt-2">${esc(tr.desc)}</p>
            <div class="rel-cuerpo">
                <div class="space-y-4">
                    ${s.inst.length ? `<div><p class="rel-t">${esc(t('serv.ante'))}</p><div class="flex flex-wrap gap-1.5">${s.inst.map(i => `<a href="instituciones.html#${i}" class="inst-tag">${esc(D.instituciones[i].sigla)}</a>`).join('')}</div></div>` : ''}
                    ${ck ? `<div><p class="rel-t">${esc(t('serv.rel.req'))}</p><ul class="rel-req">${ck.map(x => `<li><i class="fa-solid fa-circle-check"></i><span>${esc(x)}</span></li>`).join('')}</ul></div>` : ''}
                </div>
                <div class="rel-precio">
                    <div class="flex justify-between gap-3"><span>${esc(t('calc.tasas'))}</span><strong>${money(s.tax)}</strong></div>
                    <div class="flex justify-between gap-3"><span>${esc(t('calc.hon'))}</span><strong>${money(s.fee)}</strong></div>
                    <div class="rel-total"><span>${esc(t('calc.total'))}</span><strong>${total}</strong></div>
                </div>
            </div>
            <div class="rel-acciones">
                <a class="rel-btn rel-btn-rojo" href="index.html#solicitar=${encodeURIComponent(k)}">${esc(t('serv.solicitar'))}</a>
                <a class="rel-btn rel-btn-verde" target="_blank" rel="noopener" href="${waLink(saludo(t('wa.servicio', { s: tr.title, total })))}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
                <a class="rel-btn rel-btn-borde" href="index.html#cotizar=${encodeURIComponent(k)}">${esc(t('cat.cotizar'))}</a>
                <button type="button" class="rel-btn rel-btn-azul" data-rel-ficha="${k}">${esc(t('serv.rel.ficha'))} <i class="fa-solid fa-arrow-right"></i></button>
            </div>
        </div>`;
    }
    /** Pone el detalle debajo de la fila de la tarjeta elegida (sin mover la página hacia arriba). */
    function colocarDetalle(desplazar = true) {
        $$('#sRel .rel-detalle').forEach(n => n.remove());
        const card = document.querySelector(`#sRel [data-rel="${abierto}"]`); if (!card) return;
        const cards = $$('#sRel .rel-card'), fila = cards.filter(c => c.offsetTop === card.offsetTop);
        fila[fila.length - 1].insertAdjacentHTML('afterend', detalleHtml(abierto));
        const panel = $('sRel').querySelector('.rel-detalle');
        if (desplazar) requestAnimationFrame(() => {
            const r = panel.getBoundingClientRect(), alto = window.innerHeight;
            // solo baja lo justo para que se vea el detalle; nunca sube la página
            const bajar = Math.min(r.bottom - alto + 24, r.top - 90);
            if (bajar > 0) window.scrollBy({ top: bajar, behavior: 'smooth' });
        });
    }
    function abrirRelacionado(k) {
        abierto = abierto === k ? null : k;
        $$('#sRel .rel-card').forEach(c => { const on = c.dataset.rel === abierto; c.classList.toggle('is-open', on); c.setAttribute('aria-expanded', String(on)); });
        if (abierto) colocarDetalle(true); else $$('#sRel .rel-detalle').forEach(n => n.remove());
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
        $('sRel').addEventListener('click', e => {
            const f = e.target.closest('[data-rel-ficha]'); if (f) { abierto = null; irA(f.dataset.relFicha); return; }
            if (e.target.closest('[data-rel-cerrar]')) { abrirRelacionado(abierto); return; }
            const c = e.target.closest('[data-rel]'); if (c) abrirRelacionado(c.dataset.rel);
        });
        let anchoPrevio = window.innerWidth;
        window.addEventListener('resize', () => { if (abierto && window.innerWidth !== anchoPrevio) { anchoPrevio = window.innerWidth; colocarDetalle(false); } });
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
