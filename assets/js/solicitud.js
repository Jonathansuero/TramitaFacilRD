/* TramitaFácil RD — formulario «Datos del solicitante» de la página de calculadoras.
   Misma lógica y mismos textos que el formulario del inicio, conectado a la calculadora de esta página. */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, SERV, PAISES, state, $, $$, esc, t, tc, money, waLink, restart } = TF;

    const renderPrefijos = () => TF.contacto.llenar($('fPrefijo'), $('fTel'), TF.contacto.prefijoInicial());
    function buildServicios() {
        const cur = $('fServicio').value;
        $('fServicio').innerHTML = Object.keys(D.categorias).map(cat => `<optgroup label="${D.categorias[cat].emoji} ${esc(tc('categorias', cat).label)}">` +
            Object.keys(SERV).filter(k => SERV[k].category === cat).map(k => `<option value="${k}">${esc(tc('servicios', k).title)}</option>`).join('') + '</optgroup>').join('');
        if (cur) $('fServicio').value = cur;
    }
    function buildPaises() {
        $('fPais').innerHTML = Object.keys(PAISES).map(k => `<option value="${k}">${PAISES[k].bandera} ${esc(tc('paises', k).nombre)}</option>`).join('');
        $('fPais').value = state.pais;
    }
    /** Con 2 o más trámites el formulario muestra la lista en lugar del selector de un solo trámite. */
    function renderCesta() {
        const lista = TF.cotizador.ids(), m = lista.length > 1;
        $('fServicioBox').classList.toggle('hidden', m);
        $('fCesta').classList.toggle('hidden', !m);
        if (!lista.length) { $('fServicio').selectedIndex = -1; }
        if (!m) { $('fCesta').innerHTML = ''; if (lista.length === 1) $('fServicio').value = lista[0]; return; }
        const o = TF.cotizador.opciones(), c = TF.cesta(lista, o.express, o.envio);
        $('fCesta').innerHTML = `<span class="form-label">${esc(t('cart.formulario'))}</span><ol>${[...lista.reduce((mp, k) => mp.set(k, (mp.get(k) || 0) + 1), new Map())].map(([k, n]) => `<li>${esc(tc('servicios', k).title)}${n > 1 ? ` × ${esc(t('cart.xn', { n }))}` : ''}</li>`).join('')}</ol>
            ${lista.length > new Set(lista).size ? `<p class="cesta-ayuda">${esc(t('cart.familia'))}</p>` : ''}
            <small>${esc(t('calc.total'))}: <b>${esc(money(c.total))}</b> · ${esc(t('pago.inicio'))}: <b>${esc(money(c.hoy))}</b></small>`;
    }
    function datos() {
        const f = $('solicitudForm');
        const wa = TF.contacto.whatsapp($('fPrefijo').value, $('fTel').value), email = f.email.value.trim();
        const lista = TF.cotizador.ids(), varios = lista.length > 1;
        return { nombre: f.nombre.value.trim(), whatsapp: wa, email, contacto: [wa, email].filter(Boolean).join(' · '), pais: f.pais.value, servicio: varios ? lista[0] : f.servicio.value,
            ...(varios ? { servicios: lista } : {}),
            mensaje: f.mensaje.value.trim(), acepta: f.acepta.checked, web: f.web.value, moneda: state.moneda,
            idioma: state.lang, pais_detalle: state.detalle || '', ...TF.cotizador.opciones() };
    }
    function validar(d) {
        const err = [];
        $$('#solicitudForm .input').forEach(i => i.classList.remove('is-invalid'));
        if (d.nombre.length < 2) { err.push(t('sol.e.nombre')); $('fNombre').classList.add('is-invalid'); }
        const dig = d.whatsapp.replace(/\D/g, '');
        if (!d.whatsapp || dig.length < 8 || dig.length > 15) { err.push(t('sol.e.wa')); $('fTel').classList.add('is-invalid'); }
        if (!d.email || !TF.contacto.correoValido(d.email)) { err.push(t('sol.e.email')); $('fEmail').classList.add('is-invalid'); }
        if (!d.servicio || !SERV[d.servicio]) err.push(t('calc.elige'));
        if (!d.acepta) err.push(t('sol.e.acepta'));
        return err.length ? t('sol.e.falta', { lista: err.join(', ') }) : '';
    }
    function mensaje(d, codigo) {
        return [
            t('wa.cot.hola'), '',
            codigo ? `${t('wa.sol.codigo')}: *${codigo}*` : null,
            d.servicios ? `${t('wa.cot.servicios')}:\n${d.servicios.map((x, i) => `${i + 1}. *${tc('servicios', x).title}*`).join('\n')}` : `${t('wa.cot.servicio')}: *${tc('servicios', d.servicio).title}*`,
            `${t('wa.sol.nombre')}: ${d.nombre}`,
            `${t('wa.sol.reside')}: ${TF.lugar()}`,
            d.whatsapp ? `${t('wa.sol.whatsapp')}: ${d.whatsapp}` : null,
            d.email ? `${t('wa.sol.email')}: ${d.email}` : null,
            d.mensaje ? `${t('wa.sol.detalles')}: ${d.mensaje}` : null
        ].filter(x => x !== null).join('\n');
    }
    function ok(codigo, d) {
        const box = $('formOk'); box.classList.remove('hidden');
        box.innerHTML = codigo
            ? `<div class="font-bold text-base">✅ ${esc(t('ok.t'))}</div>
               <p class="mt-1">${esc(t('ok.codigo'))} <strong class="font-mono text-lg">${esc(codigo)}</strong>. ${esc(t('ok.guarda'))}</p>
               <div class="flex flex-wrap gap-2 mt-3"><a class="bg-domBlue text-white text-xs font-bold px-4 py-2 rounded-lg" href="/rastreo?c=${encodeURIComponent(codigo)}">${esc(t('ok.estado'))}</a>
               <a class="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg" target="_blank" rel="noopener" href="${waLink(mensaje(d, codigo))}"><i class="fa-brands fa-whatsapp mr-1"></i>WhatsApp</a></div>`
            : `<div class="font-bold">✅ ${esc(t('ok.wa.t'))}</div><p class="mt-1">${esc(t('ok.wa.d'))}</p>`;
        box.insertAdjacentHTML('beforeend', TF.avisoOficial('mt-3'));
        restart(box, 'pop');
        $('solicitudForm').reset(); buildPaises(); renderCesta(); renderPrefijos();
        $('formError').classList.add('hidden');
    }
    function iniciar() {
        const form = $('solicitudForm'), errBox = $('formError');
        if (!form) return;
        const err = m => { errBox.textContent = m; errBox.classList.toggle('hidden', !m); if (m) restart(errBox, 'shake'); };
        buildServicios(); buildPaises(); renderPrefijos(); renderCesta();
        TF.applyI18n(form);
        $('fPais').addEventListener('change', e => TF.setPais(e.target.value, { animate: false }));
        $('fPrefijo').addEventListener('change', e => { TF.contacto.elegirPrefijo(e.target.value); $('fTel').focus(); });
        form.addEventListener('input', e => { if (e.target.classList.contains('is-invalid')) { e.target.classList.remove('is-invalid'); if (!form.querySelector('.is-invalid')) err(''); } });
        $('fServicio').addEventListener('change', e => { if (e.target.value && TF.cotizador.ids().length <= 1) TF.cotizador.seleccionar(e.target.value); });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const d = datos(), m = validar(d); err(m); if (m) return;
            const btn = $('formSubmit'); btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t('sol.enviando'))}`;
            try {
                if (!state.api) { window.open(waLink(mensaje(d)), '_blank', 'noopener'); ok(null, d); return; }
                const r = await TF.api('/solicitud', { method: 'POST', body: JSON.stringify(d) });
                ok(r.codigo, d);
            } catch (x) { err(x.message === 'offline' ? t('sol.e.offline') : x.message); }
            finally { btn.disabled = false; btn.textContent = t('sol.enviar'); }
        });
        $('formWa').addEventListener('click', () => {
            const d = datos(), m = validar({ ...d, acepta: true }); err(m); if (m) return;
            window.open(waLink(mensaje(d)), '_blank', 'noopener');
        });
        TF.cotizador.onCambio(renderCesta);
        ['lang', 'pais'].forEach(ev => TF.on(ev, () => { buildServicios(); buildPaises(); renderPrefijos(); renderCesta(); TF.applyI18n(form); }));
        TF.on('moneda', renderCesta);
    }
    // «Solicitar este trámite» de la calculadora baja directo al formulario
    window.TF_IR_A_SOLICITUD = k => { if (k && $('fServicio')) $('fServicio').value = k; TF.goTo('solicitud'); setTimeout(() => $('fNombre') && $('fNombre').focus({ preventScroll: true }), 650); };
    document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 0));
})();
