/* ==========================================================
   TramitaFácil RD — núcleo compartido por todas las páginas
   - Idioma (ES / EN / FR), país, moneda y tasas
   - Encabezado, pie de página, botones flotantes (se dibujan aquí una sola vez)
   - Utilidades: t(), money(), waLink(), toast(), api()...
   Las páginas usan window.TF y escuchan los eventos 'tf:pais', 'tf:lang', 'tf:moneda'.
   ========================================================== */
(function () {
    'use strict';
    const D = window.TF_DATA;
    if (!D) { console.error('Falta assets/js/data.js — ejecuta: python manage.py build'); return; }
    const C = D.config, PAISES = D.paises, SERV = D.servicios, I18N = D.i18n;
    const LANGS = C.idiomas || ['es', 'en', 'fr'];
    const RD_TZ = 'America/Santo_Domingo';
    const SYM = { DOP: 'RD$', USD: 'US$', EUR: '€' };
    const PAGE = document.body.dataset.page || 'home';
    const IS_HOME = PAGE === 'home';

    // ---------------- utilidades
    const $ = id => document.getElementById(id);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } }
    };
    const restart = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const normal = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const goTo = id => $(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    /** Enlace a una sección de la portada desde cualquier página. */
    const homeLink = hash => (IS_HOME ? '' : 'index.html') + '#' + hash;
    const flagOf = code => code.toUpperCase().replace(/./g, ch => String.fromCodePoint(127397 + ch.charCodeAt(0)));

    // ---------------- estado
    const state = {
        lang: store.get('tf_lang', null) || detectarIdioma(),
        pais: store.get('tf_pais', null) || detectarPais(),
        detalle: store.get('tf_pais_detalle', null),   // código ISO del país exacto (IT, CA, PR...)
        moneda: null,
        rates: { DOP: 1, ...C.tasas_respaldo },
        ratesInfo: { fuente: 'respaldo', fecha: C.tasas_fecha },
        api: false
    };
    if (!PAISES[state.pais]) state.pais = 'rd';
    state.moneda = store.get('tf_moneda', null) || PAISES[state.pais].moneda;

    /** El sitio arranca en español; si el navegador está en inglés o francés, se sugiere (ver sugerirIdioma). */
    function detectarIdioma() { return 'es'; }
    const idiomaNavegador = () => { const l = (navigator.language || 'es').slice(0, 2).toLowerCase(); return LANGS.includes(l) ? l : 'es'; };
    function detectarPais() {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            const hit = D.paises_mundo.find(([, z]) => z === tz);
            if (hit) { store.set('tf_pais_detalle', hit[0]); return hit[3]; }
            if (/^America\/(New_York|Chicago|Los_Angeles|Denver|Phoenix|Detroit|Indiana|Kentucky|Boise|Anchorage)/.test(tz)) return 'us';
            if (tz.startsWith('Europe/')) return 'es';
            if (tz && tz !== RD_TZ) return 'mundo';
        } catch (e) { /* sin Intl */ }
        return 'rd';
    }

    // ---------------- traducción
    /** Texto de interfaz: t('nav.servicios'), t('cat.count', {n: 3}) */
    function t(key, vars) {
        const row = I18N.ui[key];
        const idx = LANGS.indexOf(state.lang);
        let s = row ? (row[idx] || row[0]) : key;
        if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
        return s;
    }
    /** Contenido traducido (servicios, países, etc.) con respaldo al español del catálogo. */
    function tc(tipo, key) {
        const tr = state.lang === 'es' ? null : I18N.contenido[state.lang]?.[tipo]?.[key];
        switch (tipo) {
            case 'servicios': { const s = SERV[key]; return { title: tr?.[0] || s.title, desc: tr?.[1] || s.desc }; }
            case 'categorias': { const c = D.categorias[key]; return { label: tr?.[0] || c.label, resumen: tr?.[1] || c.resumen }; }
            case 'checklists': { const c = D.checklists[key]; return { label: tr?.[0] || c.label, items: tr?.[1] || c.items }; }
            case 'instituciones': { const i = D.instituciones[key]; return { nombre: tr?.[0] || i.nombre, desc: tr?.[1] || i.desc }; }
            case 'paises': return { ...PAISES[key], ...(tr || {}) };
            case 'faq': { const f = D.faq[key]; return { q: tr?.[0] || f.q, a: tr?.[1] || f.a }; }
        }
        return {};
    }
    const countryName = code => {
        try { return new Intl.DisplayNames([state.lang], { type: 'region' }).of(code); } catch (e) { return code; }
    };

    /** Aplica data-i18n, data-i18n-html, data-i18n-ph, data-i18n-aria, data-i18n-title al DOM. */
    function applyI18n(root = document) {
        $$('[data-i18n]', root).forEach(el => el.textContent = t(el.dataset.i18n));
        $$('[data-i18n-html]', root).forEach(el => el.innerHTML = t(el.dataset.i18nHtml));
        $$('[data-i18n-ph]', root).forEach(el => el.placeholder = t(el.dataset.i18nPh));
        $$('[data-i18n-aria]', root).forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
        $$('[data-i18n-title]', root).forEach(el => el.title = t(el.dataset.i18nTitle));
        document.documentElement.lang = state.lang;
        const mt = I18N.ui['meta.' + PAGE + '.title'];
        if (mt) document.title = t('meta.' + PAGE + '.title');
        const md = document.querySelector('meta[name="description"]');
        if (md && I18N.ui['meta.' + PAGE + '.desc']) md.content = t('meta.' + PAGE + '.desc');
    }

    // ---------------- dinero y WhatsApp
    function money(dop, cur = state.moneda) {
        const v = dop * (state.rates[cur] || 1), dec = cur === 'DOP' ? 0 : 2;
        return `${SYM[cur]} ${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
    }
    // api.whatsapp.com conserva los emojis; la redirección de wa.me los daña en algunos navegadores y en WhatsApp Web.
    const waLink = text => `https://api.whatsapp.com/send?phone=${C.whatsapp}&text=${encodeURIComponent(String(text).normalize('NFC'))}`;
    /** Nombre del lugar desde donde escribe el visitante (país exacto si lo eligió). */
    function lugar() {
        if (state.detalle && state.detalle !== 'DO') return `${countryName(state.detalle)} ${flagOf(state.detalle)}`;
        const P = tc('paises', state.pais);
        return `${P.nombre} ${P.bandera}`;
    }
    function saludo(extra = '') {
        if (state.pais === 'ext' && !extra) return t('wa.saludo.ext');
        return t('wa.saludo', { lugar: lugar(), extra: extra || t('wa.info') });
    }

    // ---------------- eventos
    const emit = (name, detail) => document.dispatchEvent(new CustomEvent('tf:' + name, { detail }));
    const on = (name, fn) => document.addEventListener('tf:' + name, e => fn(e.detail));

    function setLang(lang) {
        if (!LANGS.includes(lang)) return;
        state.lang = lang; store.set('tf_lang', lang);
        applyI18n();
        renderHeaderDinamico();
        emit('lang', lang);
    }
    function setPais(p, opts = {}) {
        if (!PAISES[p]) return;
        state.pais = p; store.set('tf_pais', p);
        if (opts.detalle !== undefined) { state.detalle = opts.detalle; store.set('tf_pais_detalle', opts.detalle); }
        else if (!opts.keepDetalle) {
            const d = state.detalle && D.paises_mundo.find(r => r[0] === state.detalle);
            if (!d || d[3] !== p) { state.detalle = null; store.set('tf_pais_detalle', null); }
        }
        if (!opts.keepMoneda) {
            const d = state.detalle && D.paises_mundo.find(r => r[0] === state.detalle);
            state.moneda = d ? d[2] : PAISES[p].moneda; store.set('tf_moneda', state.moneda);
        }
        renderHeaderDinamico();
        emit('pais', { pais: p, ...opts });
        if (opts.toast) toast(t('toast.pais', { lugar: lugar(), sym: SYM[state.moneda] }));
    }
    /** Elegir un país concreto (IT, CA...) → perfil + país exacto. */
    function setCountry(code, opts = {}) {
        const row = D.paises_mundo.find(r => r[0] === code);
        if (!row) return;
        setPais(row[3], { ...opts, detalle: code });
    }
    function setMoneda(cur) { state.moneda = cur; store.set('tf_moneda', cur); emit('moneda', cur); }

    // ---------------- API (opcional, solo con app.py)
    async function api(path, opts = {}) {
        if (!state.api) throw new Error('offline');
        const r = await fetch('/api' + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(j.error || 'Error'); e.status = r.status; throw e; }
        return j;
    }
    // Promesa que se cumple cuando ya se sabe si hay servidor (las páginas que consultan al cargar la esperan)
    let apiDetectada;
    const apiLista = new Promise(r => { apiDetectada = r; });
    async function detectarApi() {
        if (!location.protocol.startsWith('http')) { apiDetectada(false); return; }
        try { state.api = (await fetch('/api/salud', { cache: 'no-store' })).ok; } catch (e) { state.api = false; }
        apiDetectada(state.api);
        if (!state.api) return;
        emit('api', true);
        try {
            const r = await api('/tasas');
            state.rates = { DOP: 1, USD: r.USD, EUR: r.EUR };
            state.ratesInfo = { fuente: r.fuente, fecha: r.fecha };
            emit('moneda', state.moneda);
        } catch (e) { /* tasas de respaldo */ }
    }

    // ---------------- toast
    let toastTimer;
    function toast(msg) {
        const el = $('toast'); if (!el) return;
        el.textContent = msg; el.classList.add('show');
        clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    // ---------------- horario
    const fmtHora = (tz, lang = state.lang) => new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : lang === 'fr' ? 'fr-FR' : 'es-DO', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date());
    function offsetMin(tz) {
        const d = new Date(), at = z => new Date(d.toLocaleString('en-US', { timeZone: z }));
        return Math.round((at(tz) - at(RD_TZ)) / 60000);
    }
    function abierto() {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: RD_TZ, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date());
        const dia = parts.find(x => x.type === 'weekday').value, hora = parseInt(parts.find(x => x.type === 'hour').value, 10) % 24;
        if (dia === 'Sun') return false;
        const [a, b] = dia === 'Sat' ? C.horario.sabado : C.horario.lun_vie;
        return hora >= a && hora < b;
    }
    function tickTopbar() {
        const open = abierto();
        $('rdClock').textContent = fmtHora(RD_TZ);
        $('openText').textContent = open ? t('top.abierto') : t('top.cerrado');
        $('openDot').className = `w-2 h-2 rounded-full ${open ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`;
    }

    // ============================================================
    // ENCABEZADO Y PIE (iguales en todas las páginas)
    // ============================================================
    const NAV = [
        { href: 'servicios.html', key: 'nav.servicios', page: 'servicios' },
        { href: 'calculadora.html', key: 'nav.calculadoras', page: 'calculadora' },
        { href: 'instituciones.html', key: 'nav.instituciones', page: 'instituciones' },
        { href: 'diaspora.html', key: 'nav.diaspora', page: 'diaspora' },
        { href: 'rastreo.html', key: 'nav.rastrear', page: 'rastreo' },
        { href: 'preguntas.html', key: 'nav.faq', page: 'preguntas' }
    ];
    const MOBILE = [
        ['presencia', 'fa-earth-americas', 'm.presencia'], ['cotizador', 'fa-calculator', 'm.cotizador'],
        ['asistente', 'fa-wand-magic-sparkles', 'm.asistente'], ['requisitos', 'fa-list-check', 'm.requisitos'],
        ['solicitud', 'fa-file-pen', 'm.solicitud']
    ];
    /** Enlace del menú móvil: ícono sobrio + texto + flecha que aparece al pasar o tocar. */
    const mobileLink = (href, icono, key, extra = '') =>
        `<a href="${href}" class="mobile-link${extra}"><span class="ml-ico" aria-hidden="true"><i class="fa-solid ${icono}"></i></span><span class="ml-txt" data-i18n="${key}"></span><i class="fa-solid fa-chevron-right ml-go" aria-hidden="true"></i></a>`;

    function renderHeader() {
        const host = $('tf-header'); if (!host) return;
        host.innerHTML = `
<a href="#main" class="skip-link" data-i18n="a11y.skip"></a>
<div id="scrollProgress" class="fixed top-0 left-0 h-[3px] w-0 bg-gradient-to-r from-domRed via-domGold to-domBlue z-[60]"></div>
<div class="bg-domBlue text-white text-[11px] sm:text-xs py-1.5 px-4">
  <div class="max-w-7xl mx-auto flex items-center justify-between gap-3">
    <div class="flex items-center gap-2 min-w-0">
      <span class="bg-domRed text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full tracking-wider shrink-0" data-i18n="top.diaspora"></span>
      <a href="diaspora.html" class="truncate hover:text-domGold"><span class="hidden md:inline" data-i18n="top.mundo"></span><span class="md:hidden" data-i18n="top.mundo.corto"></span> <span class="topbar-flags" aria-hidden="true">🇺🇸🇪🇸🇮🇹🇵🇷🇨🇦🇨🇭🌎</span></a>
    </div>
    <div class="flex items-center gap-3 shrink-0">
      <span class="hidden lg:flex items-center gap-2 text-slate-200"><span id="openDot" class="w-2 h-2 rounded-full bg-slate-400"></span><span><span id="openText"></span> · <strong id="rdClock" class="font-semibold text-white tabular-nums">--:--</strong></span></span>
      <div class="lang-switch" role="group" data-i18n-aria="top.idioma" id="langSwitch">
        ${LANGS.map(l => `<button data-lang="${l}" lang="${l}" title="${{ es: 'Español', en: 'English', fr: 'Français' }[l]}">${l.toUpperCase()}</button>`).join('')}
      </div>
    </div>
  </div>
</div>
<nav class="site-nav sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
    <a href="${IS_HOME ? '#inicio' : 'index.html'}" class="flex items-center gap-2 group shrink-0">
      <div class="w-10 h-10 rounded-xl bg-domBlue flex items-center justify-center text-white text-xl font-black shadow-md group-hover:bg-domRed transition-colors">TF</div>
      <div><span class="text-xl font-extrabold text-domBlue tracking-tight">TramitaFácil<span class="text-domRed">RD</span></span>
        <span class="block text-[10px] text-slate-500 font-medium tracking-widest uppercase -mt-1" data-i18n="brand.sub"></span></div>
    </a>
    <div class="hidden xl:flex items-center gap-5 text-sm font-semibold text-slate-600">
      ${NAV.map(n => `<a href="${n.href}" class="nav-link ${n.page === PAGE ? 'nav-active' : ''}" data-i18n="${n.key}"></a>`).join('')}
    </div>
    <div class="flex items-center gap-2">
      <div class="relative">
        <button id="paisBtn" aria-haspopup="listbox" aria-expanded="false" class="flex items-center gap-2 border border-slate-200 hover:border-domBlue rounded-xl px-3 py-2 text-xs font-bold text-slate-700 transition-colors">
          <span id="paisBtnFlag" class="text-base leading-none"></span>
          <span class="hidden sm:inline"><span data-i18n="nav.estoy"></span> <span id="paisBtnName"></span></span>
          <i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i>
        </button>
        <div id="paisMenu" role="listbox" class="hidden absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50"></div>
      </div>
      <button id="instalarBtn" type="button" hidden class="install-btn hidden md:inline-flex"><i class="fa-solid fa-mobile-screen-button"></i><span data-i18n="app.instalar"></span></button>
      <a id="navWa" href="#" target="_blank" rel="noopener" class="hidden md:inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all"><i class="fa-brands fa-whatsapp text-lg"></i><span>WhatsApp</span></a>
      <button id="mobileMenuBtn" class="xl:hidden text-slate-700 p-2 text-xl" data-i18n-aria="nav.menu" aria-expanded="false" aria-controls="mobileMenu"><i class="fa-solid fa-bars"></i></button>
    </div>
  </div>
  <div id="mobileMenu" class="hidden xl:hidden bg-white border-t border-slate-200 px-4 pt-3 pb-4 text-sm max-h-[75vh] overflow-y-auto">
    <button type="button" id="instalarMenu" hidden class="mobile-link ml-install w-full text-left"><span class="ml-ico" aria-hidden="true"><i class="fa-solid fa-mobile-screen-button"></i></span><span class="ml-txt"><span class="block" data-i18n="app.instalar"></span><span class="block text-[11px] font-medium text-slate-500" data-i18n="app.menu.d"></span></span><i class="fa-solid fa-chevron-right ml-go" aria-hidden="true"></i></button>
    ${mobileLink('servicios.html', 'fa-layer-group', 'm.servicios', ` ml-page${PAGE === 'servicios' ? ' nav-active' : ''}`)}
    ${mobileLink('instituciones.html', 'fa-building-columns', 'nav.instituciones', ` ml-page${PAGE === 'instituciones' ? ' nav-active' : ''}`)}
    ${mobileLink('diaspora.html', 'fa-globe', 'nav.diaspora', ` ml-page${PAGE === 'diaspora' ? ' nav-active' : ''}`)}
    ${mobileLink('calculadora.html', 'fa-calculator', 'nav.calculadoras', ` ml-page${PAGE === 'calculadora' ? ' nav-active' : ''}`)}
    ${mobileLink('rastreo.html', 'fa-location-crosshairs', 'm.rastreo', ` ml-page${PAGE === 'rastreo' ? ' nav-active' : ''}`)}
    ${mobileLink('preguntas.html', 'fa-circle-question', 'm.faq', ` ml-page${PAGE === 'preguntas' ? ' nav-active' : ''}`)}
    <div class="ml-sep" role="presentation"></div>
    ${MOBILE.map(([id, ico, key]) => mobileLink(homeLink(id), ico, key)).join('')}
  </div>
</nav>`;
    }

    function renderFooter() {
        const host = $('tf-footer'); if (!host) return;
        host.innerHTML = `
<footer class="bg-slate-900 text-white pt-12 pb-8 mt-auto">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 md:grid-cols-5 gap-8 pb-12 border-b border-slate-800">
      <div class="space-y-3 md:col-span-2">
        <div class="flex items-center gap-2"><div class="w-8 h-8 rounded-lg bg-domRed flex items-center justify-center font-black text-sm">TF</div><span class="text-lg font-bold">TramitaFácil<span class="text-domRed">RD</span></span></div>
        <p class="text-xs text-slate-400 leading-relaxed" data-i18n="foot.desc"></p>
        <div class="flex gap-2 text-lg" id="footFlags"></div>
        <div class="lang-switch lang-switch-dark" role="group" data-i18n-aria="top.idioma">${LANGS.map(l => `<button data-lang="${l}" lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>
      </div>
      <div><h4 class="foot-h" data-i18n="foot.paginas"></h4><ul class="foot-ul">
        <li><a href="index.html" data-i18n="foot.inicio"></a></li>
        <li><a href="instituciones.html" data-i18n="nav.instituciones"></a></li>
        <li><a href="calculadora.html" data-i18n="nav.calculadoras"></a></li>
        <li><a href="diaspora.html" data-i18n="nav.diaspora"></a></li>
        <li><a href="rastreo.html" data-i18n="m.rastreo"></a></li>
        <li><a href="preguntas.html" data-i18n="m.faq"></a></li>
        <li><a href="servicio.html?id=apostilla_documentos" data-i18n="foot.ejemplo"></a></li></ul></div>
      <div><h4 class="foot-h" data-i18n="foot.navega"></h4><ul class="foot-ul">
        <li><a href="servicios.html" data-i18n="m.servicios"></a></li>
        <li><a href="${homeLink('cotizador')}" data-i18n="m.cotizador"></a></li>
        <li><a href="${homeLink('solicitud')}" data-i18n="m.solicitud"></a></li>
        <li><a href="calculadora.html#herramientas-dgii" data-i18n="m.dgii"></a></li></ul></div>
      <div><h4 class="foot-h" data-i18n="foot.contacto"></h4><ul class="foot-ul">
        <li><i class="fa-brands fa-whatsapp text-emerald-400 mr-2"></i><a id="footWa" href="#" target="_blank" rel="noopener" data-wa-display></a></li>
        <li><i class="fa-solid fa-envelope text-amber-400 mr-2"></i><a id="footMail" href="mailto:${esc(C.email)}">${esc(C.email)}</a></li>
        <li><i class="fa-solid fa-location-dot mr-2"></i>Santo Domingo, R.D.</li></ul></div>
    </div>
    <p class="mt-8 text-[11px] text-slate-400 leading-relaxed max-w-4xl mx-auto text-center" data-i18n="foot.legal"></p>
    <div class="mt-4 text-center text-xs text-slate-500">© ${new Date().getFullYear()} TramitaFácil RD. <span data-i18n="foot.derechos"></span></div>
  </div>
</footer>
<a id="floatWa" href="#" target="_blank" rel="noopener" data-i18n-aria="a11y.wa" class="wa-pulse fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center text-3xl shadow-xl transition-transform hover:scale-110"><i class="fa-brands fa-whatsapp"></i></a>
<button id="toTop" data-i18n-aria="a11y.top" class="fixed bottom-24 right-6 z-50 w-10 h-10 rounded-full bg-domBlue text-white shadow-lg opacity-0 pointer-events-none transition-opacity hover:bg-domRed"><i class="fa-solid fa-arrow-up"></i></button>
<div id="toast" role="status" aria-live="polite" class="toast"></div>
${ES_APP ? renderTabbar() : ''}`;
        const p = C.whatsapp;
        $$('[data-wa-display]').forEach(el => el.textContent = `+${p[0]} (${p.slice(1, 4)}) ${p.slice(4, 7)}-${p.slice(7)}`);
    }

    /** Partes del encabezado que dependen del idioma o del país. */
    function renderHeaderDinamico() {
        const P = tc('paises', state.pais);
        const flag = state.detalle && state.detalle !== 'DO' ? flagOf(state.detalle) : P.bandera;
        const name = state.detalle && state.detalle !== 'DO' && !['US', 'ES'].includes(state.detalle) ? countryName(state.detalle) : P.corto;
        if ($('paisBtnFlag')) { $('paisBtnFlag').textContent = flag; $('paisBtnName').textContent = name; }
        if ($('paisMenu')) {
            $('paisMenu').innerHTML = `<p class="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">${esc(t('nav.desde'))}</p>` +
                Object.keys(PAISES).map(k => { const Q = tc('paises', k); return `<button class="pais-opt" role="option" data-pais="${k}" aria-selected="${k === state.pais}"><span class="flag">${Q.bandera}</span><span><span class="block">${esc(Q.nombre)}</span><span class="block text-[10px] text-slate-400 font-medium">${esc(t('nav.precios', { sym: SYM[PAISES[k].moneda] }))}</span></span></button>`; }).join('') +
                `<a href="diaspora.html" class="pais-opt text-domBlue"><span class="flag">🔎</span><span>${esc(t('nav.buscarpais'))}</span></a>`;
        }
        $$('[data-lang]').forEach(b => { const on = b.dataset.lang === state.lang; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on); });
        if ($('footFlags')) $('footFlags').innerHTML = Object.keys(PAISES).map(k => `<button class="foot-flag ${k === state.pais ? 'is-active' : ''}" data-set-pais="${k}" title="${esc(tc('paises', k).nombre)}">${PAISES[k].bandera}</button>`).join('');
        const general = waLink(saludo());
        ['navWa', 'floatWa', 'footWa', 'tabWa'].forEach(id => { if ($(id)) $(id).href = general; });
        if ($('rdClock')) tickTopbar();
    }

    function initHeaderEventos() {
        const btn = $('paisBtn'), menu = $('paisMenu');
        const close = () => { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
        btn.addEventListener('click', e => { e.stopPropagation(); const open = menu.classList.toggle('hidden') === false; btn.setAttribute('aria-expanded', open); });
        document.addEventListener('click', e => { if (!menu.contains(e.target)) close(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
        menu.addEventListener('click', e => { const b = e.target.closest('[data-pais]'); if (b) { setPais(b.dataset.pais, { toast: true }); close(); } });

        document.addEventListener('click', e => {
            const l = e.target.closest('[data-lang]'); if (l) { setLang(l.dataset.lang); toast(t('toast.idioma')); return; }
            const p = e.target.closest('[data-set-pais]');
            if (p) { setPais(p.dataset.setPais, { toast: true }); if (IS_HOME) goTo('presencia'); }
        });

        const m = $('mobileMenu'), mb = $('mobileMenuBtn');
        const set = open => { m.classList.toggle('hidden', !open); mb.setAttribute('aria-expanded', open); mb.innerHTML = `<i class="fa-solid ${open ? 'fa-xmark' : 'fa-bars'}"></i>`; };
        mb.addEventListener('click', () => set(m.classList.contains('hidden')));
        m.addEventListener('click', e => { if (e.target.closest('a')) set(false); });

        const bar = $('scrollProgress'), top = $('toTop'), h = document.documentElement;
        const onScroll = () => { const max = h.scrollHeight - h.clientHeight; bar.style.width = (max > 0 ? h.scrollTop / max * 100 : 0) + '%'; top.classList.toggle('show', h.scrollTop > 600); };
        window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
        top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // ---------------- animaciones comunes
    function observe(els, cb, opts) {
        if (!('IntersectionObserver' in window)) { els.forEach(e => cb(e)); return; }
        const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { cb(en.target); io.unobserve(en.target); } }), opts);
        els.forEach(e => io.observe(e));
    }
    function reveal(root = document) {
        // excluye capas decorativas (p. ej. la cuadrícula del encabezado), que tienen su propia opacidad
        const secs = $$('main section > div', root).filter(el => !el.classList.contains('reveal') && !el.classList.contains('hero-grid') && !el.classList.contains('pointer-events-none'));
        secs.forEach(el => el.classList.add('reveal'));
        observe(secs, el => el.classList.add('is-visible'), { threshold: 0.06 });
    }

    /** Aviso discreto (una sola vez) para ver el sitio en el idioma del navegador. */
    function sugerirIdioma() {
        const nav = idiomaNavegador();
        if (nav === 'es' || store.get('tf_lang', null) || store.get('tf_lang_sugerido', false)) return;
        store.set('tf_lang_sugerido', true);
        const txt = { en: ['View this site in English?', 'Yes', 'No, thanks'], fr: ['Voir ce site en français ?', 'Oui', 'Non, merci'] }[nav];
        const el = document.createElement('div');
        el.className = 'lang-hint'; el.setAttribute('role', 'dialog'); el.lang = nav;
        el.innerHTML = `<span>🌐 ${txt[0]}</span><button data-lang="${nav}" class="lang-hint-yes">${txt[1]}</button><button class="lang-hint-no">${txt[2]}</button>`;
        el.addEventListener('click', e => { if (e.target.closest('button')) el.remove(); });
        document.body.appendChild(el);
    }

    /** Sello visual propio de una institución (no reproduce logos oficiales). */
    function instBadge(id, size = 'md') {
        const i = D.instituciones[id]; if (!i) return '';
        if (i.logo) return `<img src="${esc(i.logo)}" alt="${esc(i.nombre)}" class="inst-logo inst-${size}">`;
        return `<span class="inst-seal inst-${size} inst-${i.tipo}${i.sigla.length > 7 ? ' inst-long' : ''}" aria-hidden="true"><span>${esc(i.sigla)}</span></span>`;
    }

    // ============================================================
    // APP INSTALABLE (se instala desde el navegador en Android, iPhone y computadora)
    // ============================================================
    const ES_APP = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
    const ES_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const ES_MOVIL = matchMedia('(pointer: coarse)').matches;
    let avisoInstalar = null;   // evento beforeinstallprompt (Android / Chrome / Edge)
    if (ES_APP) document.documentElement.classList.add('is-app');

    /** Barra de navegación inferior, como en una app (solo cuando se abre instalada). */
    function renderTabbar() {
        const tabs = [
            ['index.html', 'fa-house', 'tab.inicio', PAGE === 'home'],
            ['servicios.html', 'fa-layer-group', 'tab.servicios', PAGE === 'servicios' || PAGE === 'servicio'],
            ['calculadora.html', 'fa-calculator', 'tab.calc', PAGE === 'calculadora'],
            ['rastreo.html', 'fa-location-crosshairs', 'tab.rastrear', PAGE === 'rastreo']
        ];
        return `<nav id="tabbar" class="tabbar" data-i18n-aria="nav.menu">
            ${tabs.map(([href, ico, key, on]) => `<a href="${href}" class="tab ${on ? 'is-active' : ''}" ${on ? 'aria-current="page"' : ''}><i class="fa-solid ${ico}" aria-hidden="true"></i><span data-i18n="${key}"></span></a>`).join('')}
            <a id="tabWa" href="#" target="_blank" rel="noopener" class="tab tab-wa"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span></a>
        </nav>`;
    }

    const puedeInstalar = () => !ES_APP && (avisoInstalar || ES_IOS || ES_MOVIL);
    function mostrarBotonesInstalar() {
        if ($('instalarBtn')) $('instalarBtn').hidden = !(avisoInstalar && !ES_APP);
        if ($('instalarMenu')) $('instalarMenu').hidden = !puedeInstalar();
    }

    async function instalar() {
        if (avisoInstalar) {
            avisoInstalar.prompt();
            const r = await avisoInstalar.userChoice.catch(() => null);
            avisoInstalar = null; mostrarBotonesInstalar(); cerrarAvisoApp();
            if (r && r.outcome === 'accepted') toast(t('app.instalada'));
            return;
        }
        mostrarInstrucciones();
    }

    /** Hoja con los pasos para instalar cuando el navegador no tiene botón propio (iPhone, Firefox…). */
    function mostrarInstrucciones() {
        cerrarAvisoApp();
        $('appSheet')?.remove();
        const pasos = ES_IOS
            ? [['fa-arrow-up-from-bracket', 'app.ios.p1'], ['fa-square-plus', 'app.ios.p2'], ['fa-circle-check', 'app.ios.p3']]
            : [['fa-ellipsis-vertical', 'app.otro.p1'], ['fa-mobile-screen-button', 'app.otro.p2'], ['fa-circle-check', 'app.ios.p3']];
        const el = document.createElement('div');
        el.id = 'appSheet'; el.className = 'app-sheet';
        el.innerHTML = `<div class="app-sheet-fondo" data-cerrar></div>
            <div class="app-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="appSheetT">
                <div class="flex items-center gap-3">
                    <img src="assets/img/app/icon-192.png" alt="" class="app-sheet-ico">
                    <div><h2 id="appSheetT" class="font-extrabold text-slate-900" data-i18n="app.ios.t"></h2><p class="text-xs text-slate-500" data-i18n="app.hint.d"></p></div>
                </div>
                <ol class="app-pasos">${pasos.map(([ico, key], i) => `<li><span class="app-paso-n">${i + 1}</span><i class="fa-solid ${ico}" aria-hidden="true"></i><span data-i18n="${key}"></span></li>`).join('')}</ol>
                <button type="button" class="app-sheet-ok" data-cerrar data-i18n="app.entendido"></button>
            </div>`;
        applyI18n(el);
        el.addEventListener('click', e => { if (e.target.closest('[data-cerrar]')) el.remove(); });
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); } });
        document.body.appendChild(el);
        el.querySelector('.app-sheet-ok').focus();
    }

    /** Aviso discreto en el teléfono (como mucho una vez cada 14 días). */
    function sugerirApp() {
        if (ES_APP || !ES_MOVIL || !(avisoInstalar || ES_IOS) || $('appHint') || document.querySelector('.lang-hint')) return;
        if (Date.now() - store.get('tf_app_aviso', 0) < 14 * 864e5) return;
        store.set('tf_app_aviso', Date.now());
        const el = document.createElement('div');
        el.id = 'appHint'; el.className = 'app-hint'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'appHintT');
        el.innerHTML = `<img src="assets/img/app/icon-192.png" alt="" class="app-hint-ico">
            <div class="min-w-0 flex-1"><strong id="appHintT" class="block text-sm" data-i18n="app.hint.t"></strong><span class="block text-xs text-slate-300" data-i18n="app.hint.d"></span></div>
            <div class="flex flex-col gap-1.5"><button type="button" class="app-hint-si" data-instalar data-i18n="app.hint.si"></button><button type="button" class="app-hint-no" data-cerrar data-i18n="app.hint.no"></button></div>`;
        applyI18n(el);
        el.addEventListener('click', e => { if (e.target.closest('[data-instalar]')) instalar(); else if (e.target.closest('[data-cerrar]')) cerrarAvisoApp(); });
        document.body.appendChild(el);
    }
    const cerrarAvisoApp = () => $('appHint')?.remove();

    /** Registra el service worker y avisa cuando hay una versión nueva. */
    function iniciarApp() {
        window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); avisoInstalar = e; mostrarBotonesInstalar(); setTimeout(sugerirApp, 4000); });
        window.addEventListener('appinstalled', () => { avisoInstalar = null; mostrarBotonesInstalar(); cerrarAvisoApp(); toast(t('app.instalada')); });
        $('instalarBtn')?.addEventListener('click', instalar);
        $('instalarMenu')?.addEventListener('click', instalar);
        mostrarBotonesInstalar();
        if (ES_IOS) setTimeout(sugerirApp, 4000);
        if (ES_APP) {
            window.addEventListener('offline', () => toast(t('app.offline')));
            window.addEventListener('online', () => toast(t('app.online')));
        }

        if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
        let recargando = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargando) { recargando = true; location.reload(); } });
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(reg => {
                const ofrecer = w => {
                    if (!w || !navigator.serviceWorker.controller) return;   // primera instalación: nada que actualizar
                    avisoActualizar(() => w.postMessage('actualizar'));
                };
                if (reg.waiting) ofrecer(reg.waiting);
                reg.addEventListener('updatefound', () => {
                    const w = reg.installing;
                    w?.addEventListener('statechange', () => { if (w.state === 'installed') ofrecer(w); });
                });
            }).catch(() => { /* sin service worker: el sitio funciona igual, solo sin modo sin conexión */ });
        });
    }
    function avisoActualizar(accion) {
        if ($('appUpdate')) return;
        const el = document.createElement('div');
        el.id = 'appUpdate'; el.className = 'app-update'; el.setAttribute('role', 'status');
        el.innerHTML = `<i class="fa-solid fa-rotate" aria-hidden="true"></i><span data-i18n="app.nueva"></span><button type="button" data-i18n="app.actualizar"></button>`;
        applyI18n(el);
        el.querySelector('button').addEventListener('click', () => { el.querySelector('button').disabled = true; accion(); });
        document.body.appendChild(el);
    }

    // ---------------- API pública
    window.TF = {
        D, C, PAISES, SERV, SYM, LANGS, RD_TZ, PAGE, IS_HOME, state,
        $, $$, esc, store, restart, normal, goTo, homeLink, flagOf, countryName,
        t, tc, applyI18n, money, waLink, saludo, lugar, toast, api, apiLista,
        setLang, setPais, setCountry, setMoneda, on, emit,
        fmtHora, offsetMin, abierto, observe, reveal, instBadge, ES_APP, instalar
    };

    /** Cambio de página rápido: al pasar el dedo o el mouse sobre un enlace, la página siguiente se prepara antes del clic
        (Chrome/Edge la dejan lista con Speculation Rules; los demás la descargan con prefetch). Sin animación de transición. */
    function precargarPaginas() {
        const internas = a => {
            if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
            const url = new URL(a.href, location.href);
            if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname) || /admin/.test(url.pathname)) return null;
            if (url.pathname === location.pathname && url.hash) return null;
            return url;
        };
        if (window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
            const reglas = document.createElement('script');
            reglas.type = 'speculationrules';
            reglas.textContent = JSON.stringify({
                prerender: [{ where: { and: [{ href_matches: '/*' }, { not: { href_matches: '/admin*' } }, { not: { href_matches: '/api/*' } }] }, eagerness: 'moderate' }],
                prefetch: [{ where: { and: [{ href_matches: '/*.html' }, { not: { href_matches: '/admin*' } }] }, eagerness: 'conservative' }]
            });
            document.head.appendChild(reglas);
        } else {
            const hechas = new Set();
            const precargar = e => {
                const url = internas(e.target.closest && e.target.closest('a[href]'));
                if (!url || hechas.has(url.pathname + url.search)) return;
                hechas.add(url.pathname + url.search);
                const l = document.createElement('link'); l.rel = 'prefetch'; l.href = url.href; document.head.appendChild(l);
            };
            ['pointerover', 'touchstart', 'focusin'].forEach(ev => document.addEventListener(ev, precargar, { passive: true }));
        }
    }

    // Se dibuja de inmediato (el script va al final del body) para que la página pueda usar los elementos.
    renderHeader();
    renderFooter();
    applyI18n();
    renderHeaderDinamico();
    initHeaderEventos();
    iniciarApp();
    setInterval(tickTopbar, 15000);
    document.addEventListener('DOMContentLoaded', () => { reveal(); detectarApi(); setTimeout(sugerirIdioma, 1200); });
    precargarPaginas();
})();
