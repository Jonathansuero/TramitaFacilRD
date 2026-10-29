/* ==========================================================
   TramitaFácil RD — catálogo completo (servicios)
   Búsqueda, filtros por área y ubicación, y páginas de 6 servicios.
   Enlaces: servicios?cat=<área>&pais=<mio|todos>&q=<texto>
   ========================================================== */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, PAISES, SERV, SYM, state, $, $$, esc, t, tc, money, waLink, saludo, restart, normal } = TF;

    const params = new URLSearchParams(location.search);
    const ui = {
        cat: D.categorias[params.get('cat')] ? params.get('cat') : 'todos',
        catPais: params.get('pais') === 'mio' ? 'mio' : 'todos',
        catQuery: (params.get('q') || '').slice(0, 60), catPage: 0, catPaginas: 0, catTotal: 0
    };
    const servUrl = k => `servicio?id=${encodeURIComponent(k)}`;
    const flagsOf = k => SERV[k].paises.map(p => PAISES[p].bandera).join(' ');

    // ============================================================
    // CATÁLOGO
    // ============================================================
    const POR_PAGINA = 6;
    function tarjeta(k, i) {
        const s = SERV[k], tr = tc('servicios', k), cat = tc('categorias', s.category);
        return `<article class="cat-card" style="animation-delay:${i * 40}ms">
            <div class="flex items-start justify-between gap-2 mb-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400"><i class="fa-solid ${D.categorias[s.category].icono} mr-1 text-domBlue"></i>${esc(cat.label)}</span>
                <span class="cat-flags" title="${esc(t('serv.ideal'))}">${flagsOf(k)}</span></div>
            <h3><a href="${servUrl(k)}" class="hover:text-domBlue">${esc(tr.title)}</a></h3><p>${esc(tr.desc)}</p>
            ${TF.tiempo(k) ? `<div class="tiempo-chip"><i class="fa-regular fa-clock" aria-hidden="true"></i>${esc(TF.tiempo(k).txt)}</div>` : ''}
            ${s.inst.length ? `<div class="flex flex-wrap gap-1 mt-3">${s.inst.map(id => `<a href="instituciones#${id}" class="inst-tag">${esc(D.instituciones[id].sigla)}</a>`).join('')}</div>` : ''}
            <div class="flex items-end justify-between gap-2 mt-4">
                <div class="cat-precio">${esc(t('precio.desde'))}<strong>${money(s.tax + s.fee)}</strong></div>
                <div class="flex gap-1.5"><a class="cat-btn cat-btn-ghost" href="${servUrl(k)}">${esc(t('cat.ver'))}</a><a class="cat-btn cat-btn-primary" href="/#cotizar=${encodeURIComponent(k)}">${esc(t('cat.cotizar'))}</a></div>
            </div></article>`;
    }
    function renderCatalogo() {
        $('catChips').innerHTML = `<button class="chip ${ui.cat === 'todos' ? 'is-active' : ''}" data-cat="todos">${esc(t('cat.todos'))}</button>` +
            Object.keys(D.categorias).map(k => `<button class="chip ${ui.cat === k ? 'is-active' : ''}" data-cat="${k}">${D.categorias[k].emoji} ${esc(tc('categorias', k).label)}</button>`).join('');
        const P = tc('paises', state.pais);
        $('catPaisFilter').innerHTML = `<button class="chip ${ui.catPais === 'mio' ? 'is-active' : ''}" data-cpais="mio">${P.bandera} ${esc(t('cat.para', { lugar: P.corto }))}</button><button class="chip ${ui.catPais === 'todos' ? 'is-active' : ''}" data-cpais="todos">🌐 ${esc(t('cat.todos'))}</button>`;
        $('catMonedaLabel').textContent = SYM[state.moneda];
        const q = normal(ui.catQuery.trim());
        const items = Object.keys(SERV).filter(k => {
            const s = SERV[k], tr = tc('servicios', k);
            return (ui.cat === 'todos' || s.category === ui.cat) && (ui.catPais === 'todos' || s.paises.includes(state.pais)) &&
                (!q || normal(tr.title + ' ' + tr.desc + ' ' + s.title + ' ' + s.inst.map(i => D.instituciones[i].sigla).join(' ')).includes(q));
        });
        ui.catTotal = items.length;
        if (!items.length) {
            ui.catPaginas = 0; ui.catPage = 0;
            $('catGrid').style.transform = '';
            $('catGrid').innerHTML = `<div class="cat-page"><div class="text-center py-10 text-sm text-slate-500">${esc(t('cat.vacio'))} <button class="text-domBlue font-bold underline" data-reset-cat>${esc(t('cat.vertodos'))}</button> · <a class="text-emerald-700 font-bold underline" target="_blank" rel="noopener" href="${waLink(saludo(t('wa.buscar', { q: ui.catQuery })))}">${esc(t('cat.preguntar'))}</a></div></div>`;
            $('catPager').innerHTML = '';
            $('catCount').textContent = t('cat.count', { n: 0 });
            ajustarAlto();
            return;
        }
        const paginas = [];
        for (let i = 0; i < items.length; i += POR_PAGINA) paginas.push(items.slice(i, i + POR_PAGINA));
        ui.catPaginas = paginas.length;
        ui.catPage = Math.min(ui.catPage, paginas.length - 1);
        $('catGrid').innerHTML = paginas.map((pg, n) => `<div class="cat-page grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-pagina="${n}">${pg.map(tarjeta).join('')}</div>`).join('');
        irAPagina(ui.catPage, { animar: false });
    }

    /** Muestra la página n del catálogo deslizándola desde la derecha (o izquierda). */
    function irAPagina(n, { animar = true } = {}) {
        const total = ui.catPaginas; if (!total) return;
        n = Math.max(0, Math.min(total - 1, n));
        ui.catPage = n;
        const track = $('catGrid');
        if (!animar) { track.style.transition = 'none'; requestAnimationFrame(() => { track.style.transition = ''; }); }
        track.style.transform = `translateX(-${n * 100}%)`;
        $$('#catGrid .cat-page').forEach(pg => {
            const activa = +pg.dataset.pagina === n;
            pg.inert = !activa; pg.setAttribute('aria-hidden', String(!activa));
            if (activa && animar) pg.querySelectorAll('.cat-card').forEach(c => restart(c, 'cat-card'));
        });
        // números debajo: ‹ 1 2 3 … ›
        $('catPager').innerHTML = total < 2 ? '' :
            `<button type="button" class="cat-arrow" data-cat-page="${n - 1}" ${n === 0 ? 'disabled' : ''} aria-label="${esc(t('cat.anterior'))}"><i class="fa-solid fa-chevron-left"></i></button>` +
            Array.from({ length: total }, (_, i) => `<button type="button" class="cat-num ${i === n ? 'is-active' : ''}" data-cat-page="${i}" aria-label="${esc(t('cat.pagina', { n: i + 1 }))}" ${i === n ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('') +
            `<button type="button" class="cat-arrow" data-cat-page="${n + 1}" ${n === total - 1 ? 'disabled' : ''} aria-label="${esc(t('cat.siguiente'))}"><i class="fa-solid fa-chevron-right"></i></button>`;
        const desde = n * POR_PAGINA + 1, hasta = Math.min(ui.catTotal, (n + 1) * POR_PAGINA);
        $('catCount').textContent = t(ui.catTotal === 1 ? 'cat.count1' : 'cat.count', { n: ui.catTotal }) + (total > 1 ? ` · ${desde}–${hasta}` : '');
        ajustarAlto();
        if (animar) {   // si el inicio del catálogo quedó arriba de la pantalla, lo trae a la vista
            const top = $('catViewport').getBoundingClientRect().top;
            if (top < 80) window.scrollBy({ top: top - 140, behavior: 'smooth' });
        }
    }
    /** La ventana del catálogo toma la altura de la página visible. */
    function ajustarAlto() {
        const pg = $$('#catGrid .cat-page')[ui.catPaginas ? ui.catPage : 0];
        $('catViewport').style.height = pg ? pg.offsetHeight + 'px' : '';
    }
    function initCatalogo() {
        const filtrar = () => { ui.catPage = 0; renderCatalogo(); guardarFiltros(); };
        $('catChips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { ui.cat = b.dataset.cat; filtrar(); } });
        $('catPaisFilter').addEventListener('click', e => { const b = e.target.closest('[data-cpais]'); if (b) { ui.catPais = b.dataset.cpais; filtrar(); } });
        $('catSearch').addEventListener('input', e => { ui.catQuery = e.target.value; filtrar(); });
        $('catPager').addEventListener('click', e => { const b = e.target.closest('[data-cat-page]'); if (b && !b.disabled) irAPagina(+b.dataset.catPage); });
        $('catPager').addEventListener('keydown', e => {
            if (e.key === 'ArrowRight') { e.preventDefault(); irAPagina(ui.catPage + 1); $('catPager').querySelector('.is-active')?.focus(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); irAPagina(ui.catPage - 1); $('catPager').querySelector('.is-active')?.focus(); }
        });
        // deslizar con el dedo
        let x0 = null, y0 = null;
        $('catViewport').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
        $('catViewport').addEventListener('touchend', e => {
            if (x0 === null) return;
            const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) irAPagina(ui.catPage + (dx < 0 ? 1 : -1));
        }, { passive: true });
        window.addEventListener('resize', ajustarAlto);
        if ('ResizeObserver' in window) new ResizeObserver(ajustarAlto).observe($('catViewport'));
        document.fonts?.ready.then(ajustarAlto);
    }

    /** Deja los filtros en la dirección para poder compartir o volver al mismo listado. */
    function guardarFiltros() {
        const p = new URLSearchParams();
        if (ui.cat !== 'todos') p.set('cat', ui.cat);
        if (ui.catPais === 'mio') p.set('pais', 'mio');
        if (ui.catQuery.trim()) p.set('q', ui.catQuery.trim());
        history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('catSearch').value = ui.catQuery;
        initCatalogo();
        renderCatalogo();
        $('catWa').href = waLink(saludo(t('wa.asesoria')));
        document.addEventListener('click', e => {
            if (e.target.closest('[data-reset-cat]')) { ui.cat = 'todos'; ui.catPais = 'todos'; ui.catQuery = ''; ui.catPage = 0; $('catSearch').value = ''; renderCatalogo(); guardarFiltros(); }
        });
        TF.on('lang', () => { renderCatalogo(); $('catWa').href = waLink(saludo(t('wa.asesoria'))); });
        TF.on('pais', renderCatalogo);
        TF.on('moneda', renderCatalogo);
    });
})();
