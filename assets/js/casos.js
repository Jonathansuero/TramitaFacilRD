/* ==========================================================
   TramitaFácil RD — Casos reales (problema → solución)
   Usa window.TF (core.js) y TF.cotizador (cotizador.js).
   Los casos viven en data/catalogo.json → "casos" (es / en / fr).
   ========================================================== */
(function () {
    const TF = window.TF; if (!TF) return;
    const { D, PAISES, SERV, state, $, $$, esc, t, tc, money, waLink, toast, restart } = TF;
    const ct = TF.contacto;
    const CASOS = D.casos || [];
    const tx = o => (o && (o[state.lang] || o.es)) || '';

    // ---------------- ilustraciones de chat
    const ICO_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const ICO_OK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
    const ICO_LEIDO = '<svg width="16" height="10" viewBox="0 0 20 12" fill="none" stroke="#2A9DF4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6l3.5 3.5L11 3M8 9.5L9 10.5 17 2"/></svg>';

    function chatProblema(c) {
        const burbujas = c.problema.chat.map(([de, m]) => de === 'nota'
            ? `<div class="chat-nota">${esc(tx(m))}</div>`
            : `<div class="chat-b ${de === 'yo' ? 'chat-yo-gris' : 'chat-otro'}">${esc(tx(m))}</div>`).join('');
        return `<div class="chat chat-gris" aria-hidden="true">
            <div class="chat-cab chat-cab-gris"><span class="chat-avatar"></span><strong>${esc(tx(c.problema.contacto))}</strong></div>
            <div class="chat-cuerpo">${burbujas}</div></div>`;
    }
    function chatSolucion(c) {
        let min = 42;
        const burbujas = c.solucion.chat.map(([de, m]) => {
            const hora = `10:${String(min++).padStart(2, '0')}`;
            return de === 'tf'
                ? `<div class="chat-b chat-tf">${esc(tx(m))}<span class="chat-hora">${hora}</span></div>`
                : `<div class="chat-b chat-yo-verde">${esc(tx(m))}<span class="chat-hora">${hora} ${ICO_LEIDO}</span></div>`;
        }).join('');
        return `<div class="chat chat-wa" aria-hidden="true">
            <div class="chat-cab chat-cab-wa"><span class="chat-tf-logo">TF</span><span><strong>TramitaFácil RD</strong><small>${esc(t('casos.enlinea'))}</small></span></div>
            <div class="chat-cuerpo">${burbujas}</div></div>`;
    }

    function casoHtml(c, i) {
        const s = SERV[c.servicio], tr = tc('servicios', c.servicio), tiempo = TF.tiempo(c.servicio);
        return `<article class="caso" id="caso-${esc(c.id)}" style="animation-delay:${i * 60}ms">
            <div class="caso-mitad caso-problema">
                <div class="caso-texto">
                    <span class="caso-tag caso-tag-rojo">${ICO_X}${esc(t('casos.problema'))}</span>
                    <h2>${esc(tx(c.problema.titulo))}</h2>
                    <p>${esc(tx(c.problema.texto))}</p>
                </div>
                ${chatProblema(c)}
            </div>
            <div class="caso-flecha" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#002D62" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M5 12l7 7 7-7"/></svg></div>
            <div class="caso-mitad caso-solucion">
                <div class="caso-texto">
                    <span class="caso-tag caso-tag-verde">${ICO_OK}${esc(t('casos.solucion'))}</span>
                    <h2>${esc(tx(c.solucion.titulo))}</h2>
                    <p>${esc(tx(c.solucion.texto))}</p>
                </div>
                ${chatSolucion(c)}
            </div>
            <div class="caso-pie">
                <div class="caso-servicio">
                    <span class="caso-serv-label">${esc(t('casos.servicio'))}</span>
                    <a href="servicio?id=${encodeURIComponent(c.servicio)}" class="caso-serv-nombre">${esc(tr.title)}</a>
                    <span class="caso-serv-meta">${esc(t('precio.desde'))} <strong>${money(s.tax + s.fee)}</strong>${tiempo ? ` · <i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(tiempo.txt)}` : ''}</span>
                </div>
                <div class="caso-botones">
                    <button type="button" class="caso-btn caso-btn-borde" data-calcular="${esc(c.servicio)}"><i class="fa-solid fa-calculator" aria-hidden="true"></i> ${esc(t('casos.calcular'))}</button>
                    <button type="button" class="caso-btn caso-btn-rojo" data-iniciar="${esc(c.servicio)}">${esc(t('casos.inicia'))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                </div>
            </div>
        </article>`;
    }

    function renderCasos() {
        $('casosChips').innerHTML = CASOS.map(c => `<a href="#caso-${esc(c.id)}" class="casos-chip">${esc(tc('servicios', c.servicio).title.split(' (')[0])}</a>`).join('');
        $('casosLista').innerHTML = CASOS.map(casoHtml).join('');
    }

    // ---------------- formulario "Inicia Solicitud"
    function renderForm() {
        const sel = $('kServicio'), actual = sel.value;
        sel.innerHTML = Object.keys(D.categorias).map(cat => `<optgroup label="${esc(tc('categorias', cat).label)}">${
            Object.keys(SERV).filter(k => SERV[k].category === cat).map(k => `<option value="${k}">${esc(tc('servicios', k).title)}</option>`).join('')}</optgroup>`).join('');
        sel.value = actual && SERV[actual] ? actual : (CASOS[0] ? CASOS[0].servicio : Object.keys(SERV)[0]);
        ct.llenar($('kPrefijo'), $('kTel'), ct.prefijoInicial());
        $('kPais').innerHTML = Object.keys(PAISES).map(k => `<option value="${k}">${PAISES[k].bandera} ${esc(tc('paises', k).nombre)}</option>`).join('');
        $('kPais').value = state.pais;
    }
    function datos() {
        const wa = ct.whatsapp($('kPrefijo').value, $('kTel').value), email = $('kEmail').value.trim();
        return { nombre: $('kNombre').value.trim(), whatsapp: wa, email, contacto: [wa, email].filter(Boolean).join(' · '),
            pais: $('kPais').value, servicio: $('kServicio').value, mensaje: $('kMensaje').value.trim(), acepta: $('kAcepta').checked,
            web: $('kWeb').value, moneda: state.moneda, idioma: state.lang, pais_detalle: state.detalle || '' };
    }
    function validar(d) {
        const err = [];
        $$('#kForm .input').forEach(i => i.classList.remove('is-invalid'));
        if (d.nombre.length < 2) { err.push(t('sol.e.nombre')); $('kNombre').classList.add('is-invalid'); }
        if (!d.whatsapp && !d.email) { err.push(t('sol.e.contacto')); $('kTel').classList.add('is-invalid'); $('kEmail').classList.add('is-invalid'); }
        else {
            if (d.whatsapp && !ct.waValido(d.whatsapp)) { err.push(t('sol.e.wa')); $('kTel').classList.add('is-invalid'); }
            if (d.email && !ct.correoValido(d.email)) { err.push(t('sol.e.email')); $('kEmail').classList.add('is-invalid'); }
        }
        if (!d.acepta) err.push(t('sol.e.acepta'));
        return err.length ? t('sol.e.falta', { lista: err.join(', ') }) : '';
    }
    function mensajeWa(d, codigo) {
        return [t('wa.cot.hola'), '',
            codigo ? `${t('wa.sol.codigo')}: *${codigo}*` : null,
            `${t('wa.cot.servicio')}: *${tc('servicios', d.servicio).title}*`,
            `${t('wa.sol.nombre')}: ${d.nombre}`,
            `${t('wa.sol.reside')}: ${TF.lugar()}`,
            d.whatsapp ? `${t('wa.sol.whatsapp')}: ${d.whatsapp}` : null,
            d.email ? `${t('wa.sol.email')}: ${d.email}` : null,
            d.mensaje ? `${t('wa.sol.detalles')}: ${d.mensaje}` : null].filter(x => x !== null).join('\n');
    }
    function error(msg) { const e = $('kError'); e.textContent = msg; e.classList.toggle('hidden', !msg); if (msg) restart(e, 'shake'); }
    function exito(codigo, d) {
        const ok = $('kOk'); ok.classList.remove('hidden');
        ok.innerHTML = codigo
            ? `<div class="font-bold text-base">✅ ${esc(t('ok.t'))}</div>
               <p class="mt-1">${esc(t('ok.codigo'))}</p>
               <div class="conf-codigo">${esc(codigo)}</div>
               <p class="text-xs text-emerald-800">${esc(t('ok.guarda'))}</p>
               <div class="flex flex-wrap gap-2 mt-3"><a class="bg-domBlue text-white text-xs font-bold px-4 py-2 rounded-lg" href="rastreo?c=${encodeURIComponent(codigo)}">${esc(t('ok.estado'))}</a>
               <button type="button" class="border border-emerald-300 bg-white text-xs font-bold px-4 py-2 rounded-lg" data-copiar-codigo="${esc(codigo)}">${esc(t('ok.copiar'))}</button>
               <a class="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg" target="_blank" rel="noopener" href="${waLink(mensajeWa(d, codigo))}"><i class="fa-brands fa-whatsapp mr-1"></i>${esc(t('ok.confirmar'))}</a></div>`
            : `<div class="font-bold">✅ ${esc(t('ok.wa.t'))}</div><p class="mt-1">${esc(t('ok.wa.d'))}</p>`;
        ok.insertAdjacentHTML('beforeend', TF.avisoOficial('mt-3'));
        restart(ok, 'pop');
        ['kNombre', 'kTel', 'kEmail', 'kMensaje'].forEach(i => { $(i).value = ''; }); $('kAcepta').checked = false;
        error(''); ok.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function irAFormulario(servicio) {
        if (servicio && SERV[servicio]) $('kServicio').value = servicio;
        $('inicia').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $('kNombre').focus({ preventScroll: true }), 450);
    }

    function init() {
        renderCasos();
        renderForm();
        TF.cotizador.mount('cotizadorApp', { onSolicitar: irAFormulario, formSelect: 'kServicio' });
        if (CASOS[0]) TF.cotizador.seleccionar(CASOS[0].servicio);

        $('casosLista').addEventListener('click', e => {
            const calc = e.target.closest('[data-calcular]'), ini = e.target.closest('[data-iniciar]');
            if (calc) { TF.cotizador.seleccionar(calc.dataset.calcular); $('cotizador').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            if (ini) irAFormulario(ini.dataset.iniciar);
        });
        $('kPrefijo').addEventListener('change', e => { ct.elegirPrefijo(e.target.value); $('kTel').focus(); });
        $('kPais').addEventListener('change', e => TF.setPais(e.target.value, { animate: false }));
        $('kForm').addEventListener('input', e => { if (e.target.classList.contains('is-invalid')) { e.target.classList.remove('is-invalid'); if (!$('kForm').querySelector('.is-invalid')) error(''); } });
        $('kForm').addEventListener('click', async e => {
            const b = e.target.closest('[data-copiar-codigo]'); if (!b) return;
            try { await navigator.clipboard.writeText(b.dataset.copiarCodigo); toast(t('toast.copiado')); } catch (err) { toast(b.dataset.copiarCodigo); }
        });
        $('kForm').addEventListener('submit', async e => {
            e.preventDefault();
            const d = datos(), msg = validar(d);
            error(msg); if (msg) return;
            const btn = $('kEnviar'); btn.disabled = true;
            try {
                await TF.apiLista;
                if (!state.api) { window.open(waLink(mensajeWa(d)), '_blank', 'noopener'); exito(null, d); return; }
                const r = await TF.api('/solicitud', { method: 'POST', body: JSON.stringify(d) });
                exito(r.codigo, d);
            } catch (err) { error(err.message === 'offline' ? t('sol.e.offline') : err.message); }
            finally { btn.disabled = false; }
        });
        // al cambiar idioma, país o moneda se vuelve a dibujar
        ['lang', 'pais', 'moneda'].forEach(ev => TF.on(ev, () => { renderCasos(); renderForm(); }));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
