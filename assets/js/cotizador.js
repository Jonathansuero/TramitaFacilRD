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
                        <div id="calcCesta" class="cesta-lista" aria-live="polite"></div>
            <p id="calcAddMsg" class="hidden text-xs font-semibold text-red-600 mt-2" role="alert"></p>
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
            <p id="calcUnaVez" class="hidden text-[11px] text-slate-500 mt-1.5" data-i18n="cart.unaVez">Se cobra una sola vez para todos tus trámites</p>
        </div>
    </div>
    <div id="quoteSummary" class="lg:col-span-5 lg:sticky lg:top-24 bg-gradient-to-br from-domBlue to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-lg">
        <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-4 gap-3">
            <h3 id="resH3" class="text-lg font-bold">Resumen</h3>
            <div class="flex rounded-lg bg-white/10 p-1 text-[11px] font-bold" role="radiogroup" data-i18n-aria="calc.moneda" id="monedaToggle">
                <button data-moneda="DOP">RD$</button><button data-moneda="USD">US$</button><button data-moneda="EUR">€</button>
            </div>
        </div>
        <p id="resTitulo" class="text-sm font-semibold text-sky-200 mb-3"></p>
        <div class="space-y-3 text-sm">
            <div id="resMulti" class="hidden"></div>
            <div id="resTaxRow" class="flex justify-between gap-3 text-slate-300"><span data-i18n="calc.tasas">Tasas oficiales / consulares</span><span id="resTax" class="font-bold text-white whitespace-nowrap">—</span></div>
            <div id="resFeeRow" class="flex justify-between gap-3 text-slate-300"><span data-i18n="calc.hon">Honorarios de gestoría</span><span id="resFee" class="font-bold text-white whitespace-nowrap">—</span></div>
            <div id="resItbisRow" class="flex justify-between gap-3 text-slate-300"><span id="resItbisLbl">ITBIS (18%)</span><span id="resItbis" class="font-bold text-white whitespace-nowrap">—</span></div>
            <div id="resExtrasRow" class="hidden flex justify-between gap-3 text-sky-300"><span data-i18n="calc.recargos">Recargos (Express/Envío)</span><span id="resExtras" class="font-bold whitespace-nowrap">—</span></div>
        </div>
        <div class="mt-6 pt-4 border-t border-white/20">
            <div class="text-xs text-slate-400 uppercase font-bold tracking-wider" data-i18n="calc.total">Total estimado</div>
            <div id="resTotal" class="text-3xl font-black text-domGold my-1 tabular-nums">—</div>
            <p class="text-[11px] text-slate-400 italic" data-i18n="calc.nota">*Montos estimados sujetos a confirmación.</p>
            <p id="rateNote" class="text-[11px] text-slate-400 mt-1"></p>
        </div>
        <div class="pago-5050" aria-labelledby="pagoT">
            <div id="pagoT" class="pago-t"><i class="fa-solid fa-handshake" aria-hidden="true"></i><span data-i18n="pago.t">Cómo pagas y qué pasa después</span></div>
            <div class="pago-fila"><span><b>1</b><span data-i18n="pago.inicio">Pago inicial para empezar</span></span><strong id="pagoInicio" class="tabular-nums">—</strong></div>
            <div class="pago-fila"><span><b>2</b><span data-i18n="pago.entrega">El resto cuando te entregamos</span></span><strong id="pagoEntrega" class="tabular-nums">—</strong></div>
            <p id="pagoNota" class="pago-nota" data-i18n="pago.nota">Para empezar pagas lo que cubre la tasa oficial; el resto, al recibir tu trámite terminado.</p>
        </div>
        <div id="resIncluye"></div>
        <div id="resTiempo"></div>
        <div class="grid gap-2 mt-5">
            <button id="quoteFormBtn" type="button" class="bg-domRed hover:bg-red-700 text-white text-center font-bold py-3 rounded-xl text-sm">Solicitar este trámite</button>
            <a id="quoteWaBtn" href="#" target="_blank" rel="noopener" class="bg-emerald-500 hover:bg-emerald-600 text-white text-center font-bold py-3 rounded-xl text-sm"><i class="fa-brands fa-whatsapp mr-1"></i> <span data-i18n="serv.wa">Consultar por WhatsApp</span></a>
            <button id="quoteCopyBtn" type="button" class="bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-2.5 rounded-xl text-xs"><i class="fa-solid fa-share-nodes mr-1"></i> <span id="quoteCopyLbl">Compartir este trámite</span></button>
        </div>
        <a id="quotePageLink" href="#" class="block text-center text-xs text-sky-200 hover:text-white mt-3 underline" data-i18n="calc.detalle">Ver detalles y requisitos del servicio</a>
    </div>
</div>`;

    let opts = {};
    const montado = () => !!$('calcServiceSelect');
    // ---- varios trámites bajo un solo código: el selector es un "elegidor"; cada trámite que eliges se agrega a `cart`
    let cart = [];
    const esCert = k => /^(certificacion_|cert_)/.test(k);
    const ids = () => cart.filter(k => SERV[k]);
    /** Lista de trámites con la cantidad de personas de cada uno, en el orden en que se eligieron. */
    const grupos = () => { const m = new Map(); ids().forEach(k => m.set(k, (m.get(k) || 0) + 1)); return [...m]; };
    /** La apostilla va después de la certificación que se apostilla; cada trámite junta a sus personas. */
    function ordenar() {
        let g = grupos();
        if (g.some(([k]) => esCert(k))) g = g.filter(([k]) => k !== 'apostilla_documentos').concat(g.filter(([k]) => k === 'apostilla_documentos'));
        cart = g.flatMap(([k, n]) => Array(n).fill(k));
    }
    const aviso = msg => { $('calcAddMsg').textContent = msg || ''; $('calcAddMsg').classList.toggle('hidden', !msg); };
    function agregar(k) {
        if (!SERV[k] || cart.includes(k)) return;
        if (grupos().length >= TF.MAX_TIPOS) { aviso(t('cart.max', { n: TF.MAX_TIPOS })); buildServiceSelect($('calcServiceSearch').value); return; }
        if (cart.length >= TF.MAX_CESTA) { aviso(t('cart.maxtotal', { n: TF.MAX_CESTA })); buildServiceSelect($('calcServiceSearch').value); return; }
        aviso(''); cart.push(k); ordenar();
        $('calcServiceSearch').value = ''; buildServiceSelect('');
        restart($('quoteSummary'), 'flash-ring');
    }
    /** Suma o resta una persona en un trámite (cada persona es un trámite aparte bajo el mismo código). */
    function personas(k, delta) {
        const n = cart.filter(x => x === k).length;
        if (delta > 0) {
            if (n >= TF.MAX_PERSONAS) { aviso(t('cart.maxp', { n: TF.MAX_PERSONAS })); return; }
            if (cart.length >= TF.MAX_CESTA) { aviso(t('cart.maxtotal', { n: TF.MAX_CESTA })); return; }
            cart.push(k);
        } else if (n > 1) cart.splice(cart.lastIndexOf(k), 1); else return;
        aviso(''); ordenar(); calcular();
    }
    function quitar(k) {
        cart = cart.filter(x => x !== k); aviso('');
        buildServiceSelect($('calcServiceSearch').value);
    }
    function renderCesta() {
        const g = grupos(), box = $('calcCesta');
        if (!g.length) { box.innerHTML = `<p class="cesta-vacia">${esc(t('cart.vacio'))}</p>`; return; }
        const iCert = g.findIndex(([k]) => esCert(k));
        box.innerHTML = `<span class="form-label">${esc(t('cart.titulo'))}</span>` + g.map(([k, n], i) => {
            const mismoDoc = k === 'apostilla_documentos' && iCert > -1 && iCert < i;
            return `<div class="cesta-item"><span class="cesta-n">${i + 1}</span><div class="cesta-t"><b>${esc(tc('servicios', k).title)}</b>
                ${mismoDoc ? `<span class="cesta-doc"><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(t('cart.mismoDoc', { n: iCert + 1 }))}</span>` : ''}
                <div class="cesta-pers"><span>${esc(t('cart.personas'))}</span>
                    <button type="button" data-menos="${k}" aria-label="${esc(t('cart.menos'))}"${n < 2 ? ' disabled' : ''}>−</button><b>${n}</b>
                    <button type="button" data-mas="${k}" aria-label="${esc(t('cart.mas'))}">+</button></div>
                ${n > 1 ? `<span class="cesta-doc"><i class="fa-solid fa-users" aria-hidden="true"></i> ${esc(t('cart.separado'))}</span>` : ''}
                <button type="button" class="cesta-quitar" data-quitar="${k}">${esc(t('cart.quitar'))}</button></div>
                <span class="cesta-precio">${money(TF.precio(SERV[k], false, false).total * n)}</span></div>`;
        }).join('') + `<p class="cesta-ayuda">${esc(t('cart.ayuda'))}</p>`;
    }

    function buildServiceSelect(filter = '') {
        const select = $('calcServiceSelect'), q = normal(filter.trim()), usados = new Set(cart);
        let html = '';
        Object.keys(D.categorias).forEach(cat => {
            const items = Object.keys(SERV).filter(k => SERV[k].category === cat && !usados.has(k) && (!q || normal(tc('servicios', k).title + ' ' + SERV[k].title).includes(q)));
            if (items.length) html += `<optgroup label="${D.categorias[cat].emoji} ${esc(tc('categorias', cat).label)}">` + items.map(k => `<option value="${k}">${esc(tc('servicios', k).title)}</option>`).join('') + '</optgroup>';
        });
        select.innerHTML = `<option value="" disabled selected>${esc(t('cart.elegir'))}</option>` + (html || `<option value="" disabled>${esc(t('calc.sinres'))}</option>`);
        select.value = '';
        calcular();
    }
    function renderPais() {
        $('calcPais').innerHTML = Object.keys(PAISES).map(k => `<button type="button" class="pais-pill ${k === state.pais ? 'is-active' : ''}" data-pais="${k}" aria-pressed="${k === state.pais}">${PAISES[k].bandera} ${esc(tc('paises', k).corto)}</button>`).join('');
    }
    const digital = () => { const l = ids(); return !!l.length && l.every(k => SERV[k].digital); };   // si TODOS son digitales no hay Express ni courier
    const opciones = () => montado() && !digital()
        ? { express: document.querySelector('input[name="speed"]:checked').value === 'express', envio: $('calcDelivery').checked }
        : { express: false, envio: false };

    const cambios = [];
    function calcular() {
        const lista = ids(), k = lista[0], s = SERV[k];
        const vacio = !s;
        $$('#quoteSummary .pago-5050').forEach(x => x.classList.toggle('hidden', vacio));
        if (vacio) {
            $$('#monedaToggle button').forEach(b => b.classList.toggle('is-active', b.dataset.moneda === state.moneda));
            ['calcPrioridad', 'calcEntrega'].forEach(x => $(x).classList.add('hidden'));
            $('resH3').textContent = t('calc.resumen');
            $('resTitulo').textContent = t('cart.vacio');
            ['resTaxRow', 'resFeeRow', 'resItbisRow', 'resExtrasRow', 'resMulti', 'resIncluye', 'resTiempo', 'quotePageLink', 'calcUnaVez'].forEach(x => $(x).classList.add('hidden'));
            ['resTotal', 'pagoInicio', 'pagoEntrega'].forEach(x => $(x).textContent = '—');
            $('rateNote').textContent = '';
            ['quoteFormBtn', 'quoteCopyBtn'].forEach(x => { $(x).disabled = true; $(x).classList.add('opacity-50', 'cursor-not-allowed'); });
            $('quoteWaBtn').href = waLink(t('wa.cot.hola') + '\n' + t('wa.cot.desde', { lugar: TF.lugar() }));
            renderCesta(); cambios.forEach(f => f()); return;
        }
        ['quoteFormBtn', 'quoteCopyBtn'].forEach(x => { $(x).disabled = false; $(x).classList.remove('opacity-50', 'cursor-not-allowed'); });
        $('resItbisRow').classList.remove('hidden');
        const m = lista.length > 1, n = lista.length;
        const { express, envio } = opciones(), c = TF.cesta(lista, express, envio);
        // Trámite 100 % digital: no hay prioridad Express ni entrega física.
        ['calcPrioridad', 'calcEntrega'].forEach(x => $(x).classList.toggle('hidden', digital()));
        $('calcUnaVez').classList.toggle('hidden', !m);
        $$('#monedaToggle button').forEach(b => b.classList.toggle('is-active', b.dataset.moneda === state.moneda));
        $$('[data-express-fee]').forEach(el => el.textContent = money(TF.precio(s, true, false).express));
        $$('[data-delivery-fee]').forEach(el => el.textContent = money(C.delivery_fee));
        $('resH3').textContent = m ? t('cart.resumen', { n }) : t('calc.resumen');
        $('resTitulo').textContent = m ? t('cart.titulos', { n }) : tc('servicios', k).title;
        ['resTaxRow', 'resFeeRow', 'resIncluye', 'resTiempo', 'quotePageLink'].forEach(x => $(x).classList.toggle('hidden', m));
        $('resMulti').classList.toggle('hidden', !m);
        const gf = [...c.filas.reduce((mp, f) => { const a = mp.get(f.k) || { n: 0, tax: 0, fee: 0 }; a.n++; a.tax += f.pr.tax; a.fee += f.pr.fee; return mp.set(f.k, a); }, new Map())];
        $('resMulti').innerHTML = m ? gf.map(([fk, a], i) => `<div class="res-tr"><div class="h">${i + 1} · ${esc(tc('servicios', fk).title)}${a.n > 1 ? ` × ${esc(t('cart.xn', { n: a.n }))}` : ''}</div>
            <div class="l"><span>${esc(t('cart.tasa'))}</span><span>${money(a.tax)}</span></div>
            <div class="l"><span>${esc(t('cart.hon'))}</span><span>${money(a.fee)}</span></div></div>`).join('') : '';
        if (!m) { $('resIncluye').innerHTML = TF.incluyeHtml(k); $('resTiempo').innerHTML = TF.tiempoHtml(k, 'tiempo-oscuro'); }
        $('resTax').textContent = money(c.tax);
        $('resFee').textContent = money(c.fee);
        $('resItbisLbl').textContent = m ? t('cart.itbis') : t('calc.itbis');
        $('resItbis').textContent = money(c.itbis);
        $('resExtrasRow').classList.toggle('hidden', c.extras === 0);
        $('resExtras').textContent = money(c.extras);
        $('resTotal').textContent = money(c.total);
        $('pagoInicio').textContent = money(c.hoy);
        $('pagoEntrega').textContent = money(c.fin);
        $('pagoNota').textContent = m ? t('cart.pagoNota') : t('pago.nota');
        $('quoteFormBtn').textContent = m ? t('cart.solicitar', { n }) : t('serv.solicitar');
        $('quoteCopyLbl').textContent = m ? t('cart.compartir') : t('serv.compartir');
        renderCesta();
        restart($('resTotal'), 'bump');
        const cur = state.moneda;
        $('rateNote').textContent = cur === 'DOP' ? t('calc.pesos') : t('calc.tasa', { cur, v: (1 / state.rates[cur]).toFixed(2), fecha: state.ratesInfo.fecha });
        $('quotePageLink').href = servUrl(k);
        $('quoteWaBtn').href = waLink(mensaje());
        if (opts.formSelect && $(opts.formSelect)) $(opts.formSelect).value = k;
        cambios.forEach(f => f());
    }

    /** Mensaje de WhatsApp: corto, una idea por línea. */
    function mensaje() {
        const lista = ids(), k = lista[0], { express, envio } = opciones();
        return [
            t('wa.cot.hola'),
            t('wa.cot.desde', { lugar: TF.lugar() }),
            '',
            lista.length > 1 ? `${t('wa.cot.servicios')}:\n${grupos().map(([x, n], i) => `${i + 1}. *${tc('servicios', x).title}*${n > 1 ? ` × ${t('cart.xn', { n })}` : ''}`).join('\n')}` : `${t('wa.cot.servicio')}: *${tc('servicios', k).title}*`,
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
        cart = [k]; aviso('');
        $('calcServiceSearch').value = '';
        buildServiceSelect('');
        restart($('quoteSummary'), 'flash-ring');
    }

    function mount(hostId, o = {}) {
        const host = $(hostId); if (!host) return;
        opts = o;
        host.innerHTML = PLANTILLA;
        TF.applyI18n(host);
        renderPais();
        cart = [];
        buildServiceSelect('');
        $('calcServiceSearch').addEventListener('input', e => buildServiceSelect(e.target.value));
        $('calcServiceSelect').addEventListener('change', e => { if (e.target.value) agregar(e.target.value); });
        $$('input[name="speed"]').forEach(r => r.addEventListener('change', calcular));
        $('calcDelivery').addEventListener('change', calcular);
        $('calcPais').addEventListener('click', e => { const b = e.target.closest('[data-pais]'); if (b) TF.setPais(b.dataset.pais, { animate: false }); });
        $('monedaToggle').addEventListener('click', e => { const b = e.target.closest('[data-moneda]'); if (b) TF.setMoneda(b.dataset.moneda); });
        $('calcCesta').addEventListener('click', e => {
            const q = e.target.closest('[data-quitar]'), mas = e.target.closest('[data-mas]'), menos = e.target.closest('[data-menos]');
            if (q) quitar(q.dataset.quitar); else if (mas) personas(mas.dataset.mas, 1); else if (menos) personas(menos.dataset.menos, -1);
        });
        $('quoteFormBtn').addEventListener('click', () => {
            const lista = ids(), k = lista[0];
            if (opts.onSolicitar) opts.onSolicitar(k, lista); else location.href = lista.length > 1 ? TF.enlaceCesta(lista, opciones()) : `/#solicitar=${encodeURIComponent(k)}`;
        });
        $('quoteCopyBtn').addEventListener('click', async () => {
            const lista = ids(), k = lista[0];
            const url = lista.length > 1 ? TF.enlaceCesta(lista, opciones()) : TF.enlaceCliente(k, opciones());
            if (!url) { TF.toast(t('calc.elige')); $('calcServiceSearch').focus(); return; }
            TF.compartirTramite(lista.length > 1 ? lista.map(x => tc('servicios', x).title).join(' + ') : tc('servicios', k).title, url);
        });
        TF.on('lang', () => buildServiceSelect($('calcServiceSearch').value));
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

    /** Carga varios trámites a la vez (desde un enlace compartido o desde la ficha de un trámite). */
    function cargarCesta(lista) {
        if (!montado()) return;
        const v = []; lista.filter(k => SERV[k]).forEach(k => { if (v.length < TF.MAX_CESTA && v.filter(x => x === k).length < TF.MAX_PERSONAS && (v.includes(k) || new Set(v).size < TF.MAX_TIPOS)) v.push(k); });
        if (!v.length) return;
        cart = v; ordenar(); aviso('');
        $('calcServiceSearch').value = ''; buildServiceSelect('');
    }
    TF.cotizador = { mount, seleccionar, opciones, fijar, ids, cargarCesta, onCambio: f => cambios.push(f) };
})();
