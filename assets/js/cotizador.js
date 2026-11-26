/* ==========================================================
   TramitaFácil RD — calculadora desglosada de costos (compartida)
   Se usa en la portada (/#cotizador) y en la pestaña calculadora.
   Uso: TF.cotizador.mount('cotizadorApp', { onSolicitar: k => ..., formSelect: 'fServicio' })
   ========================================================== */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, C, PAISES, SERV, state, $, $$, esc, t, tc, money, waLink, restart, normal } = TF;
    const servUrl = TF.servUrl;

    const PLANTILLA = `
<div class="grid lg:grid-cols-12 gap-8 items-start">
    <div class="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div>
            <label for="calcServiceSelect" class="form-label" data-i18n="calc.l1">1. Servicio a cotizar</label>
            <input type="search" id="calcServiceSearch" data-i18n-ph="calc.ph" data-i18n-aria="calc.ph" class="w-full mb-2 bg-white border border-slate-300 text-sm rounded-xl p-3 focus:ring-2 focus:ring-domBlue outline-none">
            <select id="calcServiceSelect" class="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl p-3.5 focus:ring-2 focus:ring-domBlue font-semibold outline-none"></select>
        </div>
        <div><span class="form-label" data-i18n="calc.l2">2. ¿Desde dónde nos escribes?</span><div id="calcPais" class="grid grid-cols-2 sm:grid-cols-5 gap-2"></div></div>
        <div id="calcPrioridad">
            <span class="form-label" data-i18n="calc.l3">3. Prioridad de gestión</span>
            <div class="grid grid-cols-2 gap-3">
                <label class="opcion"><input type="radio" name="speed" value="standard" checked><div><span class="block text-xs font-bold text-slate-800" data-i18n="calc.std">Estándar</span><span class="block text-[11px] text-slate-500" data-i18n="calc.std.d">Tiempo regular</span></div></label>
                <label class="opcion"><input type="radio" name="speed" value="express"><div><span class="block text-xs font-bold text-slate-800"><span data-i18n="calc.exp">Express</span> 🔥</span><span class="block text-[11px] text-slate-500">+ <span data-express-fee></span></span></div></label>
            </div>
        </div>
        <div id="calcEntrega">
            <span class="form-label" data-i18n="calc.l4">4. Entrega</span>
            <label class="opcion bg-slate-50"><input type="checkbox" id="calcDelivery"><span class="text-xs font-semibold text-slate-700"><span data-i18n="calc.envio">Envío físico por mensajería / courier</span> (+ <span data-delivery-fee></span>)</span></label>
        </div>
    </div>
    <div id="quoteSummary" class="lg:col-span-5 lg:sticky lg:top-24 bg-gradient-to-br from-domBlue to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-lg">
        <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-4 gap-3">
            <h3 class="text-lg font-bold" data-i18n="calc.resumen">Resumen</h3>
            <div class="flex rounded-lg bg-white/10 p-1 text-[11px] font-bold" role="radiogroup" data-i18n-aria="calc.moneda" id="monedaToggle">
                <button data-moneda="DOP">RD$</button><button data-moneda="USD">US$</button><button data-moneda="EUR">€</button>
            </div>
        </div>
        <p id="resTitulo" class="text-sm font-semibold text-sky-200 mb-3"></p>
        <div class="space-y-3 text-sm">
            <div id="resTaxRow" class="flex justify-between gap-3 text-slate-300"><span data-i18n="calc.tasas">Tasas oficiales / consulares</span><span id="resTax" class="font-bold text-white whitespace-nowrap">—</span></div>
            <div id="resFeeRow" class="flex justify-between gap-3 text-slate-300"><span data-i18n="calc.hon">Honorarios de gestoría</span><span id="resFee" class="font-bold text-white whitespace-nowrap">—</span></div>
            <div id="resItbisRow" class="flex justify-between gap-3 text-slate-300"><span data-i18n="calc.itbis">ITBIS (18%)</span><span id="resItbis" class="font-bold text-white whitespace-nowrap">—</span></div>
            <div id="resExtrasRow" class="hidden flex justify-between gap-3 text-sky-300"><span data-i18n="calc.recargos">Recargos (Express/Envío)</span><span id="resExtras" class="font-bold whitespace-nowrap">—</span></div>
        </div>
        <div class="mt-6 pt-4 border-t border-white/20">
            <div class="text-xs text-slate-400 uppercase font-bold tracking-wider" data-i18n="calc.total">Total estimado</div>
            <div id="resTotal" class="text-3xl font-black text-domGold my-1 tabular-nums">—</div>
            <div class="pago-mitades">
                <div><span data-i18n="pago.hoy">Hoy (al iniciar)</span><strong id="pagoInicio" class="tabular-nums">—</strong></div>
                <div><span data-i18n="pago.fin">Al entregar</span><strong id="pagoEntrega" class="tabular-nums">—</strong></div>
            </div>
            <p class="text-[11px] text-slate-400 italic mt-2" data-i18n="calc.nota">*Montos estimados sujetos a confirmación.</p>
            <p id="rateNote" class="text-[11px] text-slate-400 mt-1"></p>
        </div>
        <div id="resIncluye"></div>
        <div id="resTiempo"></div>
        <div class="grid gap-2 mt-5">
            <button id="quoteFormBtn" type="button" class="bg-domRed hover:bg-red-700 text-white text-center font-bold py-3 rounded-xl text-sm" data-i18n="serv.solicitar">Solicitar este trámite</button>
            <a id="quoteWaBtn" href="#" target="_blank" rel="noopener" class="bg-emerald-500 hover:bg-emerald-600 text-white text-center font-bold py-3 rounded-xl text-sm"><i class="fa-brands fa-whatsapp mr-1"></i> <span data-i18n="serv.wa">Consultar por WhatsApp</span></a>
            <button id="quoteCopyBtn" type="button" class="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-2.5 rounded-xl text-xs"><i class="fa-solid fa-share-nodes mr-1"></i> <span data-i18n="serv.compartir">Compartir este trámite</span></button>
        </div>
        <a id="quotePageLink" href="#" class="block text-center text-xs text-sky-200 hover:text-white mt-3 underline" data-i18n="calc.detalle">Ver detalles y requisitos del servicio</a>
    </div>
</div>`;

    let opts = {};
    const montado = () => !!$('calcServiceSelect');

    function buildServiceSelect(filter = '') {
        const select = $('calcServiceSelect'), q = normal(filter.trim());
        const current = select.value || PAISES[state.pais].destacados[0];
        let html = '', first = null, keep = false;
        Object.keys(D.categorias).forEach(cat => {
            const items = Object.keys(SERV).filter(k => SERV[k].category === cat && (!q || normal(tc('servicios', k).title + ' ' + SERV[k].title).includes(q)));
            if (!items.length) return;
            html += `<optgroup label="${D.categorias[cat].emoji} ${esc(tc('categorias', cat).label)}">` + items.map(k => { first = first || k; keep = keep || k === current; return `<option value="${k}">${esc(tc('servicios', k).title)}</option>`; }).join('') + '</optgroup>';
        });
        select.innerHTML = html || `<option value="" disabled>${esc(t('calc.sinres'))}</option>`;
        if (html) select.value = keep ? current : first;
        calcular();
    }
    function renderPais() {
        $('calcPais').innerHTML = Object.keys(PAISES).map(k => `<button type="button" class="pais-pill ${k === state.pais ? 'is-active' : ''}" data-pais="${k}" aria-pressed="${k === state.pais}">${PAISES[k].bandera} ${esc(tc('paises', k).corto)}</button>`).join('');
    }
    const digital = () => { const s = SERV[$('calcServiceSelect').value]; return !!(s && s.digital); };
    const opciones = () => montado() && !digital()
        ? { express: document.querySelector('input[name="speed"]:checked').value === 'express', envio: $('calcDelivery').checked }
        : { express: false, envio: false };

    function calcular() {
        const k = $('calcServiceSelect').value, s = SERV[k]; if (!s) return;
        const { express, envio } = opciones(), pr = TF.precio(s, express, envio), extras = pr.express + pr.envio;
        // Trámite 100 % digital: no hay prioridad Express ni entrega física.
        ['calcPrioridad', 'calcEntrega'].forEach(x => $(x).classList.toggle('hidden', !!s.digital));
        $$('#monedaToggle button').forEach(b => b.classList.toggle('is-active', b.dataset.moneda === state.moneda));
        $$('[data-express-fee]').forEach(el => el.textContent = money(TF.precio(s, true, false).express));
        $$('[data-delivery-fee]').forEach(el => el.textContent = money(C.delivery_fee));
        $('resTitulo').textContent = tc('servicios', k).title;
        $('resIncluye').innerHTML = TF.incluyeHtml(k);
        $('resTiempo').innerHTML = TF.tiempoHtml(k, 'tiempo-oscuro');
        $('resTax').textContent = money(s.tax);
        $('resFee').textContent = money(s.fee);
        $('resItbis').textContent = money(pr.itbis);
        $('resExtrasRow').classList.toggle('hidden', extras === 0);
        $('resExtras').textContent = money(extras);
        $('resTotal').textContent = money(pr.total);
        $('pagoInicio').textContent = money(pr.hoy);
        $('pagoEntrega').textContent = money(pr.fin);
        restart($('resTotal'), 'bump');
        const cur = state.moneda;
        $('rateNote').textContent = cur === 'DOP' ? t('calc.pesos') : t('calc.tasa', { cur, v: (1 / state.rates[cur]).toFixed(2), fecha: state.ratesInfo.fecha });
        $('quotePageLink').href = servUrl(k);
        $('quoteWaBtn').href = waLink(mensaje());
        if (opts.formSelect && $(opts.formSelect)) $(opts.formSelect).value = k;
    }

    /** Mensaje de WhatsApp: corto, una idea por línea. */
    function mensaje() {
        const k = $('calcServiceSelect').value, { express, envio } = opciones();
        return [
            t('wa.cot.hola'),
            t('wa.cot.desde', { lugar: TF.lugar() }),
            '',
            `${t('wa.cot.servicio')}: *${tc('servicios', k).title}*`,
            express && t('wa.express'),
            envio && t('wa.envio'),
            `${t('wa.cot.total')}: *${$('resTotal').textContent}*`,
            t('wa.cot.pago', { inicio: $('pagoInicio').textContent, entrega: $('pagoEntrega').textContent }),
            '',
            t('wa.cot.cierre')
        ].filter(x => x !== false).join('\n');
    }

    /** Elige un servicio en la calculadora (desde el catálogo, el asistente o un enlace). */
    function seleccionar(k) {
        if (!montado() || !SERV[k]) return;
        $('calcServiceSearch').value = '';
        buildServiceSelect('');
        $('calcServiceSelect').value = k;
        calcular();
        restart($('quoteSummary'), 'flash-ring');
    }

    function mount(hostId, o = {}) {
        const host = $(hostId); if (!host) return;
        opts = o;
        host.innerHTML = PLANTILLA;
        TF.applyI18n(host);
        renderPais();
        buildServiceSelect('');
        $('calcServiceSearch').addEventListener('input', e => buildServiceSelect(e.target.value));
        $('calcServiceSelect').addEventListener('change', calcular);
        $$('input[name="speed"]').forEach(r => r.addEventListener('change', calcular));
        $('calcDelivery').addEventListener('change', calcular);
        $('calcPais').addEventListener('click', e => { const b = e.target.closest('[data-pais]'); if (b) TF.setPais(b.dataset.pais, { animate: false }); });
        $('monedaToggle').addEventListener('click', e => { const b = e.target.closest('[data-moneda]'); if (b) TF.setMoneda(b.dataset.moneda); });
        $('quoteFormBtn').addEventListener('click', () => {
            const k = $('calcServiceSelect').value;
            if (opts.onSolicitar) opts.onSolicitar(k); else location.href = `/#solicitar=${encodeURIComponent(k)}`;
        });
        $('quoteCopyBtn').addEventListener('click', async () => {
            const url = TF.enlaceCliente($('calcServiceSelect').value, opciones());
            if (!url) { TF.toast(t('calc.elige')); $('calcServiceSearch').focus(); return; }
            TF.compartirTramite(tc('servicios', $('calcServiceSelect').value).title, url);
        });
        TF.on('lang', () => buildServiceSelect($('calcServiceSearch').value));
        TF.on('moneda', () => { const v = $('calcServiceSelect').value; if (v && !SERV[v]) buildServiceSelect($('calcServiceSearch').value); });
        TF.on('pais', () => { renderPais(); calcular(); });
        TF.on('moneda', calcular);
    }

    /** Marca Express / envío (desde un enlace). */
    function fijar({ express, envio }) {
        if (!montado()) return;
        document.querySelector(`input[name="speed"][value="${express ? 'express' : 'standard'}"]`).checked = true;
        $('calcDelivery').checked = !!envio;
        calcular();
    }

    TF.cotizador = { mount, seleccionar, opciones, fijar };
})();
