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
        renderForm();
        TF.cotizador.mount('cotizadorApp', { onSolicitar: irAFormulario, formSelect: 'kServicio' });
        if (CASOS[0]) TF.cotizador.seleccionar(CASOS[0].servicio);

        TF.carrusel.mount('casosCarrusel', {
            onCalcular: k => { TF.cotizador.seleccionar(k); $('cotizador').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
            onIniciar: irAFormulario
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
        ['lang', 'pais'].forEach(ev => TF.on(ev, renderForm));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
