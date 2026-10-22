/* ==========================================================
   TramitaFácil RD — Formas de pago (ESPACIO DE PRUEBA)
   pagos.html?s=<servicio>&c=<CÓDIGO>
   Ningún cobro es real: los botones simulan el resultado.
   Para activar pagos reales, completa CONFIG y cambia modoPrueba a false
   (PayPal: enlace PayPal.me o botones oficiales; tarjeta: página segura de AZUL/CardNET).
   ========================================================== */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, SERV, PAISES, state, $, $$, esc, tc, money, waLink, toast, restart } = TF;

    // ---------------- datos de cobro (EJEMPLO: reemplazar por los reales)
    const CONFIG = {
        modoPrueba: true,
        paypalMe: '',   // ej. 'https://www.paypal.me/TramitaFacilRD'
        cuentaUSD: { banco: 'Banco Popular Dominicano (EJEMPLO)', titular: 'TramitaFácil RD (EJEMPLO)', tipo: 'Cuenta de ahorro en US$', numero: '000-000000-1', swift: 'XXXXDOSD (EJEMPLO)' },
        cuentaDOP: { banco: 'Banreservas (EJEMPLO)', titular: 'TramitaFácil RD (EJEMPLO)', tipo: 'Cuenta corriente en RD$', numero: '000-000000-2' }
    };

    const METODOS = [
        { id: 'paypal', ico: 'fa-brands fa-paypal', titulo: 'PayPal', desc: 'Con tu saldo PayPal o con tarjeta, desde cualquier país. Se cobra en US$.', tag: ['Recomendado', 'tag-reco'] },
        { id: 'tarjeta', ico: 'fa-solid fa-credit-card', titulo: 'Tarjeta (AZUL / CardNET)', desc: 'Visa o Mastercard en la página segura del banco dominicano.', tag: ['Próximamente', 'tag-pronto'] },
        { id: 'transferencia', ico: 'fa-solid fa-building-columns', titulo: 'Transferencia o remesa', desc: 'Desde tu banco, WorldRemit, Remesas Reservas, Xoom o Western Union.' },
        { id: 'familiar', ico: 'fa-solid fa-people-arrows', titulo: 'Un familiar paga en RD', desc: 'Transferencia local o depósito en pesos desde una cuenta dominicana.' }
    ];
    const ui = { metodo: 'paypal', servicio: null, codigo: 'RD-PRUEBA', pagado: null };

    // ---------------- utilidades
    const total = () => { const s = SERV[ui.servicio]; return s.tax + s.fee; };
    const titulo = () => tc('servicios', ui.servicio).title;
    const refPrueba = () => 'PRUEBA-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    function mensaje(metodo, monto, extra) {
        return [
            CONFIG.modoPrueba && '🧪 MENSAJE DE PRUEBA',
            '👋 ¡Hola, TramitaFácil RD!',
            '',
            `🔖 Código: *${ui.codigo}*`,
            `📄 Trámite: *${titulo()}*`,
            `💳 Método: ${metodo}`,
            `💰 Monto: *${monto}*`,
            extra
        ].filter(x => typeof x === 'string').join('\n');
    }
    async function copiar(texto) {
        try { await navigator.clipboard.writeText(texto); toast('Copiado 📋'); }
        catch (e) { toast(texto); }
    }
    const dato = (etiqueta, valor, copiable = true) => `<div class="dato"><div class="min-w-0"><span>${esc(etiqueta)}</span><strong>${esc(valor)}</strong></div>${copiable ? `<button type="button" class="copiar" data-copiar="${esc(valor)}"><i class="fa-regular fa-copy mr-1"></i>Copiar</button>` : ''}</div>`;
    const pasoActual = n => {
        $('paso2').className = 'pay-step ' + (n > 2 ? 'is-done' : 'is-on');
        $('paso3').className = 'pay-step ' + (n >= 3 ? 'is-on' : '');
    };

    // ---------------- resumen
    function renderResumen() {
        $('pServicio').innerHTML = Object.keys(D.categorias).map(cat => `<optgroup label="${esc(tc('categorias', cat).label)}">` +
            Object.keys(SERV).filter(k => SERV[k].category === cat).map(k => `<option value="${k}">${esc(tc('servicios', k).title)}</option>`).join('') + '</optgroup>').join('');
        $('pServicio').value = ui.servicio;
        $('pCodigo').textContent = ui.codigo;
        const s = SERV[ui.servicio];
        $('pTax').textContent = money(s.tax);
        $('pFee').textContent = money(s.fee);
        $('pTotal').textContent = money(total());
        restart($('pTotal'), 'bump');
        $$('#monedaToggle button').forEach(b => b.classList.toggle('is-active', b.dataset.moneda === state.moneda));
        $('pNota').textContent = state.moneda === 'DOP' ? 'Monto en pesos dominicanos.' : `Referencia; el monto final se confirma en pesos (${money(total(), 'DOP')}).`;
    }

    // ---------------- métodos
    function renderMetodos() {
        $('metodos').innerHTML = METODOS.map(m => `
            <button type="button" class="metodo" role="radio" aria-checked="${m.id === ui.metodo}" data-metodo="${m.id}">
                <span class="metodo-ico"><i class="${m.ico}"></i></span>
                <span class="min-w-0"><strong class="block text-sm text-slate-900">${esc(m.titulo)}${m.tag ? `<span class="metodo-tag ${m.tag[1]}">${esc(m.tag[0])}</span>` : ''}</strong>
                <span class="block text-xs text-slate-500 mt-1">${esc(m.desc)}</span></span>
            </button>`).join('');
    }

    function renderPanel() {
        const p = $('panel');
        const usd = money(total(), 'USD'), dop = money(total(), 'DOP');
        if (ui.metodo === 'paypal') {
            p.innerHTML = `
                <h2 class="text-lg font-extrabold text-slate-900"><i class="fa-brands fa-paypal text-domBlue mr-1"></i> Pagar con PayPal</h2>
                <p class="text-sm text-slate-600 mt-2">Pagas con tu saldo PayPal o con tarjeta de débito o crédito, sin necesidad de crear cuenta. PayPal cobra en dólares.</p>
                <div class="grid sm:grid-cols-2 gap-3 mt-4">${dato('Monto en US$', usd, false)}${dato('Referencia', ui.codigo)}</div>
                <button type="button" class="pay-btn bg-domBlue hover:bg-domBlueHover text-white mt-5" data-simular="PayPal" data-monto="${esc(usd)}"><i class="fa-brands fa-paypal"></i> Pagar ${esc(usd)} con PayPal</button>
                <p class="text-[11px] text-slate-400 mt-3"><i class="fa-solid fa-flask mr-1"></i>Prueba: este botón simula el pago. En vivo abrirá PayPal${CONFIG.paypalMe ? ` (${esc(CONFIG.paypalMe)})` : ' (tu enlace PayPal.me o los botones oficiales)'}.</p>`;
        } else if (ui.metodo === 'tarjeta') {
            p.innerHTML = `
                <h2 class="text-lg font-extrabold text-slate-900"><i class="fa-solid fa-credit-card text-domBlue mr-1"></i> Tarjeta en la página del banco</h2>
                <p class="text-sm text-slate-600 mt-2">Te llevamos a la página segura de AZUL o CardNET. Allí escribes los datos de tu tarjeta y vuelves aquí con el resultado. Nuestro sitio nunca ve ni guarda tu tarjeta.</p>
                <div class="grid sm:grid-cols-2 gap-3 mt-4">${dato('Monto', money(total()), false)}${dato('Referencia', ui.codigo)}</div>
                <button type="button" class="pay-btn bg-domBlue hover:bg-domBlueHover text-white mt-5" data-simular="Tarjeta" data-monto="${esc(money(total()))}"><i class="fa-solid fa-lock"></i> Continuar a la página segura</button>
                <p class="text-[11px] text-slate-400 mt-3"><i class="fa-solid fa-flask mr-1"></i>Prueba: se activa cuando firmes el contrato de comercio con AZUL o CardNET.</p>`;
        } else if (ui.metodo === 'transferencia') {
            const c = CONFIG.cuentaUSD;
            p.innerHTML = `
                <h2 class="text-lg font-extrabold text-slate-900"><i class="fa-solid fa-building-columns text-domBlue mr-1"></i> Transferencia o remesa</h2>
                <p class="text-sm text-slate-600 mt-2">Envía el monto a nuestra cuenta en dólares y escribe tu código como referencia.</p>
                <div class="grid gap-2 mt-4">
                    ${dato('Monto a enviar', usd)}${dato('Referencia / concepto', ui.codigo)}
                    ${dato('Banco', c.banco)}${dato('Titular', c.titular)}${dato('Tipo de cuenta', c.tipo, false)}${dato('Número de cuenta', c.numero)}${dato('Código SWIFT (desde el exterior)', c.swift)}
                </div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mt-6 mb-2">Formas de enviarlo</h3>
                <ul class="grid sm:grid-cols-2 gap-2 text-xs text-slate-600">
                    <li class="dato"><div><span>Transferencia internacional</span><strong>Desde tu banco · 1 a 3 días</strong></div></li>
                    <li class="dato"><div><span>Remesa a cuenta</span><strong>WorldRemit, Xoom, Western Union · suele llegar el mismo día</strong></div></li>
                    <li class="dato"><div><span>Remesas Reservas</span><strong>App de Banreservas</strong></div></li>
                    <li class="dato"><div><span>Importante</span><strong>Las comisiones de envío las cubre quien envía</strong></div></li>
                </ul>
                ${botonComprobante('Transferencia / remesa', usd)}`;
        } else {
            const c = CONFIG.cuentaDOP;
            p.innerHTML = `
                <h2 class="text-lg font-extrabold text-slate-900"><i class="fa-solid fa-people-arrows text-domBlue mr-1"></i> Un familiar paga en RD</h2>
                <p class="text-sm text-slate-600 mt-2">Tu familiar transfiere o deposita en pesos desde cualquier banco dominicano. Pídele que use tu código como referencia.</p>
                <div class="grid gap-2 mt-4">
                    ${dato('Monto en pesos', dop)}${dato('Referencia / concepto', ui.codigo)}
                    ${dato('Banco', c.banco)}${dato('Titular', c.titular)}${dato('Tipo de cuenta', c.tipo, false)}${dato('Número de cuenta', c.numero)}
                </div>
                ${botonComprobante('Pago local en RD', dop)}`;
        }
        if (ui.pagado) mostrarOk(ui.pagado.metodo, ui.pagado.monto, ui.pagado.ref);
    }

    function botonComprobante(metodo, monto) {
        return `<a class="pay-btn bg-emerald-600 hover:bg-emerald-700 text-white mt-5" target="_blank" rel="noopener" data-comprobante href="${waLink(mensaje(metodo, monto, '🧾 Te envío el comprobante de pago.'))}"><i class="fa-brands fa-whatsapp"></i> Ya pagué: enviar comprobante por WhatsApp</a>
                <p class="text-[11px] text-slate-400 mt-3 text-center">Confirmamos el pago y te avisamos por el mismo chat.</p>`;
    }

    function mostrarOk(metodo, monto, ref) {
        const box = document.createElement('div');
        box.className = 'ok-box mt-5 pop';
        box.innerHTML = `<div class="font-extrabold text-sm"><i class="fa-solid fa-circle-check mr-1"></i> Pago de prueba aprobado</div>
            <p class="mt-1">Referencia <strong class="font-mono">${esc(ref)}</strong> · ${esc(monto)} · ${esc(metodo)}. Ningún cobro fue real.</p>
            <a class="pay-btn bg-emerald-600 hover:bg-emerald-700 text-white mt-3" target="_blank" rel="noopener" href="${waLink(mensaje(metodo, monto, `✅ Referencia de pago: *${ref}*`))}"><i class="fa-brands fa-whatsapp"></i> Avisar el pago por WhatsApp</a>`;
        $('panel').querySelector('.ok-box')?.remove();
        $('panel').appendChild(box);
        pasoActual(3);
    }

    function simular(btn) {
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando prueba…';
        setTimeout(() => {
            btn.disabled = false; btn.innerHTML = original;
            ui.pagado = { metodo: btn.dataset.simular, monto: btn.dataset.monto, ref: refPrueba() };
            mostrarOk(ui.pagado.metodo, ui.pagado.monto, ui.pagado.ref);
        }, 1200);
    }

    function render() { renderResumen(); renderMetodos(); renderPanel(); }

    document.addEventListener('DOMContentLoaded', () => {
        const q = new URLSearchParams(location.search);
        ui.servicio = SERV[q.get('s')] ? q.get('s') : PAISES[state.pais].destacados[0];
        if (q.get('c')) ui.codigo = q.get('c').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) || ui.codigo;
        render();

        $('pServicio').addEventListener('change', e => { ui.servicio = e.target.value; ui.pagado = null; pasoActual(2); render(); });
        $('monedaToggle').addEventListener('click', e => { const b = e.target.closest('[data-moneda]'); if (b) TF.setMoneda(b.dataset.moneda); });
        $('metodos').addEventListener('click', e => {
            const b = e.target.closest('[data-metodo]'); if (!b) return;
            ui.metodo = b.dataset.metodo; ui.pagado = null; pasoActual(2);
            renderMetodos(); renderPanel();
            if (window.innerWidth < 1024) $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        $('metodos').addEventListener('keydown', e => {
            if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
            e.preventDefault();
            const i = METODOS.findIndex(m => m.id === ui.metodo), d = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1;
            ui.metodo = METODOS[(i + d + METODOS.length) % METODOS.length].id; ui.pagado = null;
            renderMetodos(); renderPanel(); $('metodos').querySelector('[aria-checked="true"]').focus();
        });
        $('panel').addEventListener('click', e => {
            const c = e.target.closest('[data-copiar]'); if (c) { copiar(c.dataset.copiar); return; }
            const s = e.target.closest('[data-simular]'); if (s) { simular(s); return; }
            if (e.target.closest('[data-comprobante]')) pasoActual(3);
        });
        TF.on('moneda', render);
        TF.on('lang', render);
        TF.on('pais', render);
    });
})();
