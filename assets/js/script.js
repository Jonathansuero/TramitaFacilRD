/* ==========================================================
   TramitaFácil RD — portada (index.html)
   Usa window.TF (core.js). Se redibuja al cambiar idioma, país o moneda.
   Enlaces que llegan desde otras páginas:
     index.html#cotizar=<servicio>  #requisitos=<servicio>  #solicitar=<servicio>  #pais=<rd|us|es|ext|mundo>
   ========================================================== */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, C, PAISES, SERV, SYM, state, $, $$, esc, t, tc, money, waLink, saludo, toast, restart, normal, goTo, flagOf, countryName } = TF;

    const ui = { cat: 'todos', catPais: 'mio', catQuery: '', catPage: 0, catPaginas: 0, catTotal: 0, quizKey: null, checklistKey: null };
    const servUrl = k => `servicio.html?id=${encodeURIComponent(k)}`;
    const flagsOf = k => SERV[k].paises.map(p => PAISES[p].bandera).join(' ');

    // ============================================================
    // PAÍS Y PRESENCIA
    // ============================================================
    function renderPais(animate = true) {
        const p = state.pais, P = tc('paises', p);
        $('heroFlag').textContent = P.bandera;
        $('heroEyebrow').textContent = P.eyebrow;
        $('heroPitch').textContent = P.pitch;
        $('heroPaises').innerHTML = Object.keys(PAISES).map(k => `<button class="hero-chip ${k === p ? 'is-active' : ''}" data-pais="${k}">${PAISES[k].bandera} ${esc(tc('paises', k).corto)}</button>`).join('');
        $('paisTabs').innerHTML = Object.keys(PAISES).map(k => { const Q = tc('paises', k); return `<button role="tab" class="pais-tab ${k === p ? 'is-active' : ''}" data-pais="${k}" aria-selected="${k === p}"><span class="flag">${Q.bandera}</span><span class="nm">${esc(Q.nombre)}</span><span class="sub">${esc(Q.ciudad)}</span></button>`; }).join('');
        renderHeroQuick();
        renderMapa();
        renderPanel(animate);
        $('fPais').innerHTML = Object.keys(PAISES).map(k => `<option value="${k}">${PAISES[k].bandera} ${esc(tc('paises', k).nombre)}</option>`).join('');
        $('fPais').value = p;
        $('foreignCard').classList.toggle('hidden', p !== 'ext');
        if (p === 'ext') { $('foreignText').textContent = PAISES.ext.pitch_en || ''; $('foreignWa').href = waLink(t('wa.saludo.ext')); }
        $('asesoriaWa').href = waLink(saludo(t('wa.asesoria')));
        tickClocks();
    }

    function renderHeroQuick() {
        const P = tc('paises', state.pais);
        $('heroQuickBadge').textContent = `${P.bandera} ${P.corto}`;
        $('heroQuick').innerHTML = PAISES[state.pais].destacados.map(k => {
            const s = tc('servicios', k), cat = D.categorias[SERV[k].category];
            return `<a class="quick-btn group" href="${servUrl(k)}">
                <span class="flex items-center gap-3"><span class="ico"><i class="fa-solid ${cat.icono}"></i></span>
                <span><span class="block font-bold text-xs text-slate-800">${esc(s.title)}</span><span class="block text-[10px] text-slate-500">${esc(t('precio.desde'))} ${money(SERV[k].tax + SERV[k].fee)}</span></span></span>
                <i class="fa-solid fa-chevron-right text-slate-400 text-xs"></i></a>`;
        }).join('');
        $('verTodos').textContent = t('quick.todos', { n: Object.keys(SERV).length });
    }

    function renderMapa() {
        const p = state.pais;
        $$('#mapa .nodo').forEach(n => n.classList.toggle('is-active', n.dataset.pais === p || (p === 'ext' && n.dataset.pais === 'rd')));
        $$('#mapa .ruta').forEach(r => r.classList.remove('is-active'));
        const ruta = { us: 'ruta-us', es: 'ruta-es', mundo: 'ruta-mundo' }[p];
        if (ruta) $(ruta).classList.add('is-active');
        if (p === 'ext') $$('#mapa [data-pais="ext"] .ruta').forEach(r => r.classList.add('is-active'));
        $('anilloExt').classList.toggle('is-on', p === 'ext');
        const avion = $('avion');
        if (ruta) { avion.querySelector('mpath').setAttribute('href', '#' + ruta); avion.style.display = ''; } else avion.style.display = 'none';
    }

    function renderPanel(animate) {
        const p = state.pais, P = tc('paises', p);
        const detalle = state.detalle && state.detalle !== 'DO' ? `<span class="inline-flex items-center gap-1 text-xs font-bold bg-white border border-slate-200 rounded-full px-2.5 py-1 mt-3">${flagOf(state.detalle)} ${esc(countryName(state.detalle))}</span>` : '';
        const enMsg = p === 'ext' && PAISES.ext.pitch_en && state.lang !== 'en' ? `<p class="text-xs text-slate-500 italic mt-2" lang="en">${esc(PAISES.ext.pitch_en)}</p>` : '';
        const panel = $('paisPanel');
        panel.innerHTML = `
            <div class="flex items-center gap-3"><span class="text-4xl">${P.bandera}</span>
                <div><p class="text-[10px] font-bold uppercase tracking-wider text-domRed">${esc(P.eyebrow)}</p><h3 class="text-xl font-extrabold text-slate-900">${esc(P.titulo)}</h3></div></div>
            ${detalle}
            <p class="text-sm text-slate-600 mt-4">${esc(P.pitch)}</p>${enMsg}
            <ul class="space-y-2.5 mt-5">${P.beneficios.map(b => `<li class="beneficio"><i class="fa-solid fa-circle-check"></i><span>${esc(b)}</span></li>`).join('')}</ul>
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-6 mb-2">${esc(t('pres.mas', { lugar: P.corto }))}</p>
            <div class="flex flex-wrap gap-2">${PAISES[p].destacados.map(k => `<a class="mini-serv" href="${servUrl(k)}"><i class="fa-solid ${D.categorias[SERV[k].category].icono}"></i>${esc(shortTitle(tc('servicios', k).title))}</a>`).join('')}</div>
            <div class="mt-auto pt-6 grid sm:grid-cols-2 gap-2">
                ${p === 'mundo' || p === 'us' || p === 'es'
                    ? `<a href="diaspora.html" class="bg-domBlue hover:bg-domBlueHover text-white text-xs font-bold py-3 rounded-xl text-center">${esc(t('pres.guia'))} →</a>`
                    : `<button class="bg-domBlue hover:bg-domBlueHover text-white text-xs font-bold py-3 rounded-xl" data-ver-catalogo>${esc(t('pres.ver', { lugar: P.corto }))} →</button>`}
                <a class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-xl text-center" target="_blank" rel="noopener" href="${waLink(saludo())}"><i class="fa-brands fa-whatsapp mr-1"></i>${esc(t('pres.escribir'))}</a>
            </div>`;
        if (animate) restart(panel, 'panel-anim');
    }
    const shortTitle = s => s.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+\/.*$/, '').trim();

    // relojes: RD, EE.UU., España y el país exacto si eligió otro
    function relojes() {
        const list = [{ tz: TF.RD_TZ, c: 'Santo Domingo' }, { tz: 'America/New_York', c: 'NY · Miami' }, { tz: 'Europe/Madrid', c: 'Madrid' }];
        const row = state.detalle && D.paises_mundo.find(r => r[0] === state.detalle);
        if (row && !list.some(l => l.tz === row[1])) list[2] = { tz: row[1], c: countryName(row[0]) };
        else if (state.pais === 'mundo' && !row) list[2] = { tz: PAISES.mundo.tz, c: 'Toronto' };
        return list;
    }
    function tickClocks() {
        const active = (state.detalle && D.paises_mundo.find(r => r[0] === state.detalle)?.[1]) || PAISES[state.pais].tz;
        $('relojes').innerHTML = relojes().map(r => {
            const off = TF.offsetMin(r.tz), h = off / 60;
            const diff = off === 0 ? t('reloj.igual') : t('reloj.diff', { h: `${h > 0 ? '+' : ''}${Number.isInteger(h) ? h : h.toFixed(1)}` });
            return `<div class="reloj ${r.tz === active ? 'is-active' : ''}"><div class="c">${esc(r.c)}</div><div class="t">${TF.fmtHora(r.tz)}</div><div class="d">${diff}</div></div>`;
        }).join('');
        $('rdHora2').textContent = TF.fmtHora(TF.RD_TZ);
        $('tuHora').textContent = new Intl.DateTimeFormat(state.lang === 'en' ? 'en-US' : state.lang === 'fr' ? 'fr-FR' : 'es-DO', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    }

    function initPresencia() {
        const pick = e => { const b = e.target.closest('[data-pais]'); if (b) TF.setPais(b.dataset.pais, { toast: true }); return b; };
        $('heroPaises').addEventListener('click', e => { if (pick(e)) goTo('presencia'); });
        $('paisTabs').addEventListener('click', pick);
        $$('#mapa .nodo').forEach(n => {
            const go = () => TF.setPais(n.dataset.pais, { toast: true });
            n.addEventListener('click', go);
            n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
        setInterval(tickClocks, 15000);
    }

    // ============================================================
    // DOMINICANOS EN CUALQUIER PAÍS
    // ============================================================
    function renderMundo() {
        const rows = D.paises_mundo.filter(r => r[0] !== 'DO');
        $('mundoList').innerHTML = rows.map(r => `<option value="${esc(countryName(r[0]))}"></option>`).join('');
        const chip = r => `<a class="flag-chip" href="diaspora.html?c=${r[0]}" tabindex="-1">${flagOf(r[0])} ${esc(countryName(r[0]))}</a>`;
        const half = Math.ceil(rows.length / 2);
        const a = rows.slice(0, half).map(chip).join(''), b = rows.slice(half).map(chip).join('');
        $('mundoMarquee').innerHTML = a + a;   // duplicado para que el desplazamiento sea continuo
        $('mundoMarquee2').innerHTML = b + b;
        $('mundoCount').textContent = rows.length;
    }
    function initMundo() {
        $('mundoForm').addEventListener('submit', e => {
            e.preventDefault();
            const q = normal($('mundoInput').value.trim());
            const row = D.paises_mundo.find(r => normal(countryName(r[0])) === q) || D.paises_mundo.find(r => q && normal(countryName(r[0])).startsWith(q));
            if (!row) { restart($('mundoInput'), 'shake'); toast(t('mundo.noencontrado')); return; }
            location.href = `diaspora.html?c=${row[0]}`;
        });
    }

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
            ${s.inst.length ? `<div class="flex flex-wrap gap-1 mt-3">${s.inst.map(id => `<a href="instituciones.html#${id}" class="inst-tag">${esc(D.instituciones[id].sigla)}</a>`).join('')}</div>` : ''}
            <div class="flex items-end justify-between gap-2 mt-4">
                <div class="cat-precio">${esc(t('precio.desde'))}<strong>${money(s.tax + s.fee)}</strong></div>
                <div class="flex gap-1.5"><a class="cat-btn cat-btn-ghost" href="${servUrl(k)}">${esc(t('cat.ver'))}</a><button class="cat-btn cat-btn-primary" data-quick="${k}">${esc(t('cat.cotizar'))}</button></div>
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
        const filtrar = () => { ui.catPage = 0; renderCatalogo(); };
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

    // ============================================================
    // ASISTENTE
    // ============================================================
    const quizDots = n => $$('.quiz-dot').forEach(d => d.classList.toggle('is-on', +d.dataset.dot <= n));
    function renderQuizCats() {
        $('quizCats').innerHTML = Object.keys(D.categorias).map(k => { const c = tc('categorias', k);
            return `<button class="quiz-card group" data-qcat="${k}"><i class="fa-solid ${D.categorias[k].icono} text-domBlue text-2xl mb-2 group-hover:scale-110 transition-transform"></i>
             <div class="font-bold text-slate-800 text-sm">${esc(c.label)}</div><div class="text-xs text-slate-500 mt-1">${esc(c.resumen)}</div></button>`; }).join('');
    }
    function selectQuizCategory(cat) {
        const keys = Object.keys(SERV).filter(k => SERV[k].category === cat)
            .sort((a, b) => SERV[b].paises.includes(state.pais) - SERV[a].paises.includes(state.pais));
        $('quizOptionsContainer').innerHTML = keys.map(k => `<button class="quiz-card text-xs font-bold text-slate-800" data-qserv="${k}">${esc(tc('servicios', k).title)}
             ${SERV[k].paises.includes(state.pais) ? `<span class="block mt-1 text-[10px] font-semibold text-emerald-700">${PAISES[state.pais].bandera} ${esc(t('quiz.recomendado'))}</span>` : ''}</button>`).join('');
        $('quizStep1').classList.add('hidden'); $('quizStep3').classList.add('hidden'); $('quizStep2').classList.remove('hidden'); quizDots(2);
    }
    function showQuizResult(k) {
        ui.quizKey = k;
        const s = SERV[k], tr = tc('servicios', k);
        $('quizResultBox').innerHTML = `
            <span class="text-[10px] font-bold uppercase text-domBlue bg-sky-100 px-2 py-0.5 rounded">${esc(t('quiz.encontrada'))}</span>
            <h4 class="font-extrabold text-slate-900 text-base mt-2">${esc(tr.title)}</h4>
            <p class="text-xs text-slate-600 mt-1">${esc(tr.desc)}</p>
            <p class="text-xs text-slate-500 mt-2">${esc(t('serv.ideal'))}: ${s.paises.map(p => `${PAISES[p].bandera} ${esc(tc('paises', p).corto)}`).join(' · ')}</p>
            ${s.inst.length ? `<p class="text-xs text-slate-500 mt-1">${esc(t('serv.ante'))}: ${s.inst.map(i => `<a class="font-bold text-domBlue hover:underline" href="instituciones.html#${i}">${esc(D.instituciones[i].sigla)}</a>`).join(', ')}</p>` : ''}
            <div class="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">${esc(t('quiz.base'))} ${money(s.tax + s.fee)}</div>`;
        $('quizPageBtn').href = servUrl(k);
        $('quizStep2').classList.add('hidden'); $('quizStep3').classList.remove('hidden'); quizDots(3);
    }
    function resetQuiz() { $('quizStep2').classList.add('hidden'); $('quizStep3').classList.add('hidden'); $('quizStep1').classList.remove('hidden'); quizDots(1); }
    function initQuiz() {
        $('quizCats').addEventListener('click', e => { const b = e.target.closest('[data-qcat]'); if (b) selectQuizCategory(b.dataset.qcat); });
        $('quizOptionsContainer').addEventListener('click', e => { const b = e.target.closest('[data-qserv]'); if (b) showQuizResult(b.dataset.qserv); });
        $('quizBack').addEventListener('click', resetQuiz);
        $('quizReset').addEventListener('click', resetQuiz);
        $('quizCalcBtn').addEventListener('click', () => ui.quizKey && quickSelect(ui.quizKey));
    }

    // ============================================================
    // COTIZADOR (módulo compartido: assets/js/cotizador.js)
    // ============================================================
    function buildFormServicios() {
        const cur = $('fServicio').value;
        $('fServicio').innerHTML = Object.keys(D.categorias).map(cat => `<optgroup label="${D.categorias[cat].emoji} ${esc(tc('categorias', cat).label)}">` +
            Object.keys(SERV).filter(k => SERV[k].category === cat).map(k => `<option value="${k}">${esc(tc('servicios', k).title)}</option>`).join('') + '</optgroup>').join('');
        if (cur) $('fServicio').value = cur;
    }
    function quickSelect(k) {
        TF.cotizador.seleccionar(k);
        goTo('cotizador');
    }
    function irASolicitud(k) {
        if (k) $('fServicio').value = k;
        goTo('solicitud');
        setTimeout(() => $('fNombre').focus({ preventScroll: true }), 650);
    }

    // ============================================================
    // REQUISITOS
    // ============================================================
    const CK_STORE = 'tf_checklist_v2';
    function renderChecklistTabs() {
        $('checklistTabs').innerHTML = Object.keys(D.checklists).map(k => `<button role="tab" class="req-tab ${k === ui.checklistKey ? 'req-tab-active' : ''}" data-key="${k}">${esc(tc('checklists', k).label)}</button>`).join('');
    }
    function openChecklist(k) { loadChecklist(k); goTo('requisitos'); }
    function loadChecklist(k) {
        if (!D.checklists[k]) return;
        ui.checklistKey = k;
        $$('#checklistTabs .req-tab').forEach(tab => {
            const on = tab.dataset.key === k; tab.classList.toggle('req-tab-active', on); tab.setAttribute('aria-selected', on);
            if (on) { const strip = $('checklistTabs'); strip.scrollTo({ left: tab.offsetLeft - strip.clientWidth / 2 + tab.clientWidth / 2, behavior: 'smooth' }); }
        });
        const saved = TF.store.get(CK_STORE, {})[k] || [];
        $('checklistItemsContainer').innerHTML = tc('checklists', k).items.map((text, i) =>
            `<label class="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 hover:translate-x-1 transition-all pop" style="animation-delay:${i * 40}ms">
                <input type="checkbox" class="mt-0.5 rounded text-domBlue check-item" ${saved[i] ? 'checked' : ''}><span class="text-xs font-semibold text-slate-700">${esc(text)}</span></label>`).join('');
        $$('#checklistItemsContainer .check-item').forEach(cb => cb.addEventListener('change', updateChecklistProgress));
        updateChecklistProgress();
    }
    function updateChecklistProgress() {
        const boxes = $$('#checklistItemsContainer .check-item'), checked = boxes.filter(c => c.checked).length, total = boxes.length;
        const pct = total ? Math.round(checked / total * 100) : 0;
        $('checklistBar').style.width = pct + '%';
        $('checklistPercentage').textContent = t('req.listo', { pct });
        const all = TF.store.get(CK_STORE, {}); all[ui.checklistKey] = boxes.map(c => c.checked); TF.store.set(CK_STORE, all);
        const done = $('checklistDone');
        if (total && checked === total) {
            const title = tc('servicios', ui.checklistKey).title;
            done.className = 'mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex flex-col sm:flex-row items-center justify-between gap-3 pop';
            done.innerHTML = `<span class="font-semibold">🎉 ${esc(t('req.completo'))}</span>
                <span class="flex gap-2"><button class="bg-domBlue text-white font-bold px-4 py-2 rounded-lg" data-solicitar="${ui.checklistKey}">${esc(t('calc.iniciar'))}</button>
                <a href="${waLink(saludo(t('wa.docs', { s: title })))}" target="_blank" rel="noopener" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg whitespace-nowrap"><i class="fa-brands fa-whatsapp mr-1"></i>WhatsApp</a></span>`;
        } else { done.className = 'hidden'; done.innerHTML = ''; }
    }

    // ============================================================
    // SOLICITUD
    // ============================================================
    function datosForm() {
        const f = $('solicitudForm');
        return { nombre: f.nombre.value.trim(), contacto: f.contacto.value.trim(), pais: f.pais.value, servicio: f.servicio.value,
            mensaje: f.mensaje.value.trim(), acepta: f.acepta.checked, web: f.web.value, moneda: state.moneda,
            idioma: state.lang, pais_detalle: state.detalle || '', ...TF.cotizador.opciones() };
    }
    function validar(d) {
        const err = [];
        $$('#solicitudForm .input').forEach(i => i.classList.remove('is-invalid'));
        if (d.nombre.length < 2) { err.push(t('sol.e.nombre')); $('fNombre').classList.add('is-invalid'); }
        if (d.contacto.length < 6) { err.push(t('sol.e.contacto')); $('fContacto').classList.add('is-invalid'); }
        if (!d.acepta) err.push(t('sol.e.acepta'));
        return err.length ? t('sol.e.falta', { lista: err.join(', ') }) : '';
    }
    function mensajeSolicitud(d, codigo) {
        return [
            t('wa.cot.hola'),
            '',
            codigo ? `${t('wa.sol.codigo')}: *${codigo}*` : null,
            `${t('wa.cot.servicio')}: *${tc('servicios', d.servicio).title}*`,
            `${t('wa.sol.nombre')}: ${d.nombre}`,
            `${t('wa.sol.reside')}: ${TF.lugar()}`,
            `${t('wa.sol.contacto')}: ${d.contacto}`,
            d.mensaje ? `${t('wa.sol.detalles')}: ${d.mensaje}` : null
        ].filter(x => x !== null).join('\n');
    }
    function initSolicitud() {
        const form = $('solicitudForm'), errBox = $('formError');
        const showErr = msg => { errBox.textContent = msg; errBox.classList.toggle('hidden', !msg); if (msg) restart(errBox, 'shake'); };
        $('fPais').addEventListener('change', e => TF.setPais(e.target.value, { animate: false }));
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const d = datosForm(), msg = validar(d);
            showErr(msg); if (msg) return;
            const btn = $('formSubmit'); btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t('sol.enviando'))}`;
            try {
                if (!state.api) { window.open(waLink(mensajeSolicitud(d)), '_blank', 'noopener'); showOk(null, d); return; }
                const r = await TF.api('/solicitud', { method: 'POST', body: JSON.stringify(d) });
                showOk(r.codigo, d);
            } catch (err) { showErr(err.message === 'offline' ? t('sol.e.offline') : err.message); }
            finally { btn.disabled = false; btn.textContent = t('sol.enviar'); }
        });
        $('formWa').addEventListener('click', () => {
            const d = datosForm(), msg = validar({ ...d, acepta: true });
            showErr(msg); if (msg) return;
            window.open(waLink(mensajeSolicitud(d)), '_blank', 'noopener');
        });
    }
    function showOk(codigo, d) {
        const ok = $('formOk'); ok.classList.remove('hidden');
        ok.innerHTML = codigo
            ? `<div class="font-bold text-base">✅ ${esc(t('ok.t'))}</div>
               <p class="mt-1">${esc(t('ok.codigo'))} <strong class="font-mono text-lg">${esc(codigo)}</strong>. ${esc(t('ok.guarda'))}</p>
               <div class="flex flex-wrap gap-2 mt-3"><a class="bg-domBlue text-white text-xs font-bold px-4 py-2 rounded-lg" href="rastreo.html?c=${encodeURIComponent(codigo)}">${esc(t('ok.estado'))}</a>
               <button class="border border-emerald-300 text-xs font-bold px-4 py-2 rounded-lg" data-copy="${esc(codigo)}">${esc(t('ok.copiar'))}</button>
               <a class="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg" target="_blank" rel="noopener" href="${waLink(mensajeSolicitud(d, codigo))}"><i class="fa-brands fa-whatsapp mr-1"></i>${esc(t('ok.confirmar'))}</a></div>`
            : `<div class="font-bold">✅ ${esc(t('ok.wa.t'))}</div><p class="mt-1">${esc(t('ok.wa.d'))}</p>`;
        restart(ok, 'pop');
        $('solicitudForm').reset(); $('fPais').value = state.pais; $('fServicio').value = d.servicio;
    }

    // ============================================================
    // DATOS ESTRUCTURADOS (Google)
    // ============================================================
    function empresaSchema() {
        const s = document.createElement('script'); s.type = 'application/ld+json';
        s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ProfessionalService', name: 'TramitaFácil RD', telephone: '+' + C.whatsapp, email: C.email,
            availableLanguage: ['es', 'en', 'fr'], areaServed: D.paises_mundo.map(r => r[0]),
            address: { '@type': 'PostalAddress', addressLocality: 'Santo Domingo', addressCountry: 'DO' } });
        document.head.appendChild(s);
    }

    // ============================================================
    // NAVEGACIÓN, EFECTOS, ENLACES PROFUNDOS
    // ============================================================
    function runCounter(el) {
        const target = parseFloat(el.dataset.count), dec = +(el.dataset.decimals || 0), pre = el.dataset.prefix || '', suf = el.dataset.suffix || '', t0 = performance.now();
        const step = now => { const p = Math.min((now - t0) / 1400, 1), v = target * (1 - Math.pow(1 - p, 3));
            el.textContent = pre + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf; if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }
    function initScrollSpy() {
        // incluye el menú móvil: al abrirlo, queda sombreada la sección que se está viendo
        const links = $$('nav a.nav-link, nav a.mobile-link').filter(a => a.getAttribute('href').startsWith('#')), map = {};
        links.forEach(a => (map[a.getAttribute('href').slice(1)] ||= []).push(a));
        if (!('IntersectionObserver' in window)) return;
        const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { links.forEach(l => l.classList.remove('nav-active')); (map[e.target.id] || []).forEach(l => l.classList.add('nav-active')); } }), { rootMargin: '-45% 0px -50% 0px' });
        Object.keys(map).forEach(id => $(id) && io.observe($(id)));
    }
    function initDelegacion() {
        document.addEventListener('click', e => {
            const q = e.target.closest('[data-quick]'); if (q) { e.preventDefault(); quickSelect(q.dataset.quick); return; }
            const r = e.target.closest('[data-req]'); if (r) { openChecklist(r.dataset.req); return; }
            const s = e.target.closest('[data-solicitar]'); if (s) { irASolicitud(s.dataset.solicitar); return; }
            const c = e.target.closest('[data-copy]'); if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => toast(t('toast.copiado'))); return; }
            if (e.target.closest('[data-ver-catalogo]')) { ui.catPais = 'mio'; ui.cat = 'todos'; ui.catPage = 0; renderCatalogo(); goTo('servicios'); return; }
            if (e.target.closest('[data-reset-cat]')) { ui.cat = 'todos'; ui.catPais = 'todos'; ui.catQuery = ''; ui.catPage = 0; $('catSearch').value = ''; renderCatalogo(); }
        });
    }
    function handleHash() {
        const m = location.hash.match(/^#(cotizar|requisitos|solicitar|pais)=([\w-]+)$/); if (!m) return;
        const [, tipo, val] = m;
        if (tipo === 'cotizar' && SERV[val]) quickSelect(val);
        if (tipo === 'requisitos' && D.checklists[val]) openChecklist(val);
        if (tipo === 'solicitar' && SERV[val]) irASolicitud(val);
        if (tipo === 'pais' && PAISES[val]) { TF.setPais(val); goTo('presencia'); }
    }

    /** Todo lo que depende de idioma/moneda/país. */
    function renderTodo(animate = false) {
        renderPais(animate);
        renderMundo();
        renderCatalogo();
        renderQuizCats();
        if (ui.quizKey && !$('quizStep3').classList.contains('hidden')) showQuizResult(ui.quizKey);
        buildFormServicios();
        renderChecklistTabs();
        loadChecklist(ui.checklistKey);
    }

    document.addEventListener('DOMContentLoaded', () => {
        ui.checklistKey = PAISES[state.pais].destacados.find(k => D.checklists[k]) || Object.keys(D.checklists)[0];
        TF.cotizador.mount('cotizadorApp', { onSolicitar: irASolicitud, formSelect: 'fServicio' });
        initPresencia(); initMundo(); initCatalogo(); initQuiz(); initSolicitud(); initDelegacion();
        $('checklistTabs').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) loadChecklist(b.dataset.key); });
        renderTodo(false);
        empresaSchema();

        TF.on('lang', () => renderTodo(false));
        TF.on('pais', d => renderTodo(d.animate !== false));
        TF.on('moneda', () => { renderHeroQuick(); renderCatalogo(); });

        TF.observe($$('[data-count]'), runCounter, { threshold: 0.5 });
        initScrollSpy();
        handleHash();
        window.addEventListener('hashchange', handleHash);
    });
})();
