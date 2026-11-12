/* TramitaFácil RD — página de detalle: /servicios/<palabras> (la vieja servicio?id=<clave> redirige) */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, C, PAISES, SERV, state, $, $$, esc, t, tc, money, waLink, saludo, toast, restart } = TF;
    const ct = TF.contacto;

    let keys = Object.keys(SERV);   // se actualiza si el panel oculta algún trámite
    let otros = null;               // bloque «Otros servicios» del final
    /** El trámite sale de la dirección: /servicios/<palabras>, o del ?id= de los enlaces viejos. */
    const porSlug = s => Object.keys(SERV).find(k => SERV[k].slug === s);
    const idDeUrl = () => porSlug(decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || ''))
        || new URLSearchParams(location.search).get('id');
    let id = idDeUrl();
    if (!SERV[id]) id = PAISES[state.pais].destacados[0];
    const CK_STORE = 'tf_checklist_v2';

    function render() {
        const s = SERV[id], tr = tc('servicios', id), cat = tc('categorias', s.category);
        // En español manda el título pensado para Google; en otros idiomas, el nombre traducido
        document.title = (state.lang === 'es' && s.seo_titulo) || tr.title;
        pintarExtra();
        $('sTiempo').innerHTML = TF.tiempoHtml(id, 'tiempo-oscuro');
        $('bcCat').textContent = cat.label;
        $('sCat').innerHTML = `<i class="fa-solid ${D.categorias[s.category].icono} mr-1"></i>${esc(cat.label)}`;
        $('sFlags').textContent = s.paises.map(p => PAISES[p].bandera).join(' ');
        $('sFlags').title = t('serv.ideal');
        $('sTitle').textContent = tr.title;
        $('sDesc').textContent = tr.desc;
        $('sInstHero').innerHTML = s.inst.map(i => `<a href="/instituciones#${i}" class="inst-chip-dark">${esc(D.instituciones[i].sigla)} · ${esc(tc('instituciones', i).nombre)}</a>`).join('');

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
            return `<a href="/instituciones#${i}" class="flex items-start gap-3 p-3 rounded-2xl border border-slate-200 hover:border-domBlue hover:bg-sky-50 transition-colors">${TF.instBadge(i, 'sm')}<span><strong class="block text-sm text-slate-900">${esc(it.nombre)}</strong><span class="block text-xs text-slate-500">${esc(it.desc)}</span></span></a>`; }).join('')
            : `<p class="text-sm text-slate-500">${esc(t('serv.sininst'))}</p>`;

        precio();
        $('cTitulo').textContent = tr.title;

        if (otros) otros.refrescar();   // «Otros servicios»: que no se liste la ficha abierta
    }

    // ---------------- Confirmar la solicitud sin salir de la ficha
    function irAConfirmar(suave = true) {
        $('confirmar').scrollIntoView({ behavior: suave ? 'smooth' : 'instant', block: 'start' });
        setTimeout(() => $('cNombre').focus({ preventScroll: true }), suave ? 450 : 0);
    }
    function renderConfirmar() {
        ct.llenar($('cPrefijo'), $('cTel'), ct.prefijoInicial());   // sincronizado con "¿Dónde resides?"
        const actual = state.pais;
        $('cPais').innerHTML = Object.keys(PAISES).map(k => `<option value="${k}">${PAISES[k].bandera} ${esc(tc('paises', k).nombre)}</option>`).join('');
        $('cPais').value = PAISES[actual] ? actual : state.pais;
    }
    function datosConfirmar() {
        const wa = ct.whatsapp($('cPrefijo').value, $('cTel').value), email = $('cEmail').value.trim();
        return { nombre: $('cNombre').value.trim(), whatsapp: wa, email, contacto: [wa, email].filter(Boolean).join(' · '),
            pais: $('cPais').value, servicio: id, mensaje: $('cMensaje').value.trim(), acepta: $('cAcepta').checked, web: $('cWeb').value,
            express: $('pExp').checked, envio: $('pEnv').checked, moneda: state.moneda, idioma: state.lang, pais_detalle: state.detalle || '' };
    }
    function validarConfirmar(d) {
        const err = [];
        $$('#cForm .input').forEach(i => i.classList.remove('is-invalid'));
        if (d.nombre.length < 2) { err.push(t('sol.e.nombre')); $('cNombre').classList.add('is-invalid'); }
        if (!d.whatsapp && !d.email) { err.push(t('sol.e.contacto')); $('cTel').classList.add('is-invalid'); $('cEmail').classList.add('is-invalid'); }
        else {
            if (d.whatsapp && !ct.waValido(d.whatsapp)) { err.push(t('sol.e.wa')); $('cTel').classList.add('is-invalid'); }
            if (d.email && !ct.correoValido(d.email)) { err.push(t('sol.e.email')); $('cEmail').classList.add('is-invalid'); }
        }
        if (!d.acepta) err.push(t('sol.e.acepta'));
        return err.length ? t('sol.e.falta', { lista: err.join(', ') }) : '';
    }
    function mensajeConfirmar(d, codigo) {
        return [t('wa.cot.hola'), '',
            codigo ? `${t('wa.sol.codigo')}: *${codigo}*` : null,
            `${t('wa.cot.servicio')}: *${tc('servicios', d.servicio).title}*`,
            `${t('calc.total')}: ${$('pTotal').textContent}${(d.express || d.envio) ? ` (${[d.express && t('calc.exp'), d.envio && t('calc.envio')].filter(Boolean).join(' + ')})` : ''}`,
            `${t('wa.sol.nombre')}: ${d.nombre}`,
            `${t('wa.sol.reside')}: ${TF.lugar()}`,
            d.whatsapp ? `${t('wa.sol.whatsapp')}: ${d.whatsapp}` : null,
            d.email ? `${t('wa.sol.email')}: ${d.email}` : null,
            d.mensaje ? `${t('wa.sol.detalles')}: ${d.mensaje}` : null].filter(x => x !== null).join('\n');
    }
    function mostrarError(msg) { const e = $('cError'); e.textContent = msg; e.classList.toggle('hidden', !msg); if (msg) restart(e, 'shake'); }
    function mostrarCodigo(codigo, d) {
        const ok = $('cOk'); ok.classList.remove('hidden');
        ok.innerHTML = codigo
            ? `<div class="font-bold text-base">✅ ${esc(t('ok.t'))}</div>
               <p class="mt-1">${esc(t('ok.codigo'))}</p>
               <div class="conf-codigo">${esc(codigo)}</div>
               <p class="text-xs text-emerald-800">${esc(t('ok.guarda'))}</p>
               <div class="flex flex-wrap gap-2 mt-3"><a class="bg-domBlue text-white text-xs font-bold px-4 py-2 rounded-lg" href="/rastreo?c=${encodeURIComponent(codigo)}">${esc(t('ok.estado'))}</a>
               <button type="button" class="border border-emerald-300 bg-white text-xs font-bold px-4 py-2 rounded-lg" data-copiar-codigo="${esc(codigo)}">${esc(t('ok.copiar'))}</button>
               <a class="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg" target="_blank" rel="noopener" href="${waLink(mensajeConfirmar(d, codigo))}"><i class="fa-brands fa-whatsapp mr-1"></i>${esc(t('ok.confirmar'))}</a></div>`
            : `<div class="font-bold">✅ ${esc(t('ok.wa.t'))}</div><p class="mt-1">${esc(t('ok.wa.d'))}</p>`;
        ok.insertAdjacentHTML('beforeend', TF.avisoOficial('mt-3'));
        restart(ok, 'pop');
        ['cNombre', 'cTel', 'cEmail', 'cMensaje'].forEach(i => { $(i).value = ''; }); $('cAcepta').checked = false;
        mostrarError(''); ok.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function initConfirmar() {
        renderConfirmar();
        $('sSolicitar').addEventListener('click', e => { e.preventDefault(); irAConfirmar(); });
        $('cPrefijo').addEventListener('change', e => { ct.elegirPrefijo(e.target.value); $('cTel').focus(); });
        $('cPais').addEventListener('change', e => TF.setPais(e.target.value, { animate: false }));
        $('cForm').addEventListener('input', e => { if (e.target.classList.contains('is-invalid')) { e.target.classList.remove('is-invalid'); if (!$('cForm').querySelector('.is-invalid')) mostrarError(''); } });
        $('cForm').addEventListener('click', async e => {
            const b = e.target.closest('[data-copiar-codigo]'); if (!b) return;
            try { await navigator.clipboard.writeText(b.dataset.copiarCodigo); toast(t('toast.copiado')); } catch (err) { toast(b.dataset.copiarCodigo); }
        });
        $('cForm').addEventListener('submit', async e => {
            e.preventDefault();
            const d = datosConfirmar(), msg = validarConfirmar(d);
            mostrarError(msg); if (msg) return;
            const btn = $('cEnviar'); btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t('sol.enviando'))}`;
            try {
                if (!state.api) { window.open(waLink(mensajeConfirmar(d)), '_blank', 'noopener'); mostrarCodigo(null, d); return; }
                const r = await TF.api('/solicitud', { method: 'POST', body: JSON.stringify(d) });
                mostrarCodigo(r.codigo, d);
            } catch (err) { mostrarError(err.message === 'offline' ? t('sol.e.offline') : err.message); }
            finally { btn.disabled = false; btn.textContent = t('conf.enviar'); }
        });
        $('cWa').addEventListener('click', () => {
            const d = datosConfirmar(), msg = validarConfirmar({ ...d, acepta: true });
            mostrarError(msg); if (msg) return;
            window.open(waLink(mensajeConfirmar(d)), '_blank', 'noopener');
        });
    }

    function progreso() {
        const boxes = $$('.s-check'), c = boxes.filter(b => b.checked).length, pct = boxes.length ? Math.round(c / boxes.length * 100) : 0;
        $('sReqBar').style.width = pct + '%'; $('sReqPct').textContent = t('req.listo', { pct });
        const all = TF.store.get(CK_STORE, {}); all[id] = boxes.map(b => b.checked); TF.store.set(CK_STORE, all);
        if (boxes.length && c === boxes.length) toast('🎉 ' + t('req.completo'));
    }

    /** Lo que incluye el precio (catálogo o panel), debajo del total. */
    function incluye() {
        const box = $('sIncluye'); if (!box) return;
        const html = TF.incluyeHtml(id);
        box.hidden = !html; box.innerHTML = html ? html.replace(/^<div class="serv-incluye">|<\/div>$/g, '') : '';
    }

    function precio() {
        incluye();
        const s = SERV[id], exp = $('pExp').checked, env = $('pEnv').checked;
        $$('#monedaToggle button').forEach(b => b.classList.toggle('is-active', b.dataset.moneda === state.moneda));
        $('pTax').textContent = money(s.tax); $('pFee').textContent = money(s.fee);
        $('pExpV').textContent = '+ ' + money(C.express_fee); $('pEnvV').textContent = '+ ' + money(C.delivery_fee);
        $('pTotal').textContent = money(s.tax + s.fee + (exp ? C.express_fee : 0) + (env ? C.delivery_fee : 0));
        restart($('pTotal'), 'bump');
        $('sWa').href = waLink(saludo(t('wa.servicio', { s: tc('servicios', id).title, total: $('pTotal').textContent })));
        // resumen del bloque "Confirma tu solicitud"
        $('cTotal').textContent = $('pTotal').textContent;
        const extras = [exp && t('calc.exp'), env && t('calc.envio')].filter(Boolean);
        $('cExtras').textContent = extras.length ? t('conf.extras', { lista: extras.join(' + ') }) : t('conf.sinextras');
    }

    /** Cambia de servicio sin recargar la página (relacionados, anterior/siguiente y botón atrás). */
    /* ----------------------------------------------------------
       Contenido propio del trámite (qué es, cómo lo hacemos, qué recibes, preguntas).
       En la primera carga ya viene escrito en el HTML desde el servidor; al cambiar de
       trámite sin recargar, se pide a /api/servicio/<id> y se vuelve a pintar.
       ---------------------------------------------------------- */
    const extraCache = {};
    let extraPuesto = id;   // en la primera carga, el bloque lo escribió el servidor para este trámite

    function extraHtml(d) {
        const caja = (titulo, dentro) => `<div class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8"><h2 class="text-lg font-extrabold text-slate-900">${esc(titulo)}</h2>${dentro}</div>`;
        const corto = String(d.titulo || '').replace(/\s*\([^)]*\)/g, '').trim();
        let html = '';
        if (d.intro) html += caja('¿Qué es y cuándo te lo piden?', `<p class="mt-3 text-slate-600 text-sm leading-relaxed">${esc(d.intro)}</p>`);
        if ((d.como || []).length) html += caja('Cómo lo hacemos, estés donde estés', `<ol class="serv-como mt-4">${d.como.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`);
        if (d.entrega) html += caja('Qué recibes', `<p class="mt-3 text-slate-600 text-sm leading-relaxed">${esc(d.entrega)}</p>`);
        const rel = ((SERV[d.id] || {}).relacionados || []).filter(k => SERV[k]);
        if (rel.length) html += caja('Trámites que suelen ir con este',
            `<p class="mt-2 text-slate-500 text-sm">Quien pide este trámite normalmente necesita también:</p>
             <ul class="serv-rel mt-3">${rel.map(k => `<li><a href="${TF.servUrl(k)}">${esc(tc('servicios', k).title)}</a></li>`).join('')}</ul>`);
        if ((d.faq || []).length) html += caja(`Preguntas frecuentes sobre ${corto}`,
            `<div class="mt-4">${d.faq.map(f => `<details class="serv-faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`);
        return html ? `<div class="space-y-6 mt-6">${html}</div>` : '';
    }

    async function pintarExtra() {
        const caja = $('sExtra'); if (!caja) return;
        caja.hidden = state.lang !== 'es';          // está escrito en español
        if (id === extraPuesto) return;             // ya está en pantalla (lo puso el servidor o una pasada anterior)
        if (extraCache[id]) { caja.innerHTML = extraHtml(extraCache[id]); extraPuesto = id; return; }
        caja.innerHTML = '';                        // que no se quede el del trámite anterior
        if (!state.api) return;
        const pedido = id;
        try {
            const d = await TF.api('/servicio/' + encodeURIComponent(pedido));
            extraCache[pedido] = d;
            if (id !== pedido) return;              // cambió de trámite mientras cargaba
            caja.innerHTML = extraHtml(d); extraPuesto = pedido;
            mantenerAncla();                        // este texto va arriba: no debe empujar la página
        } catch (e) { /* sin contenido: la página funciona igual */ }
    }

    /** Sube al principio de la página y lo repite en los cuadros siguientes: al cambiar la
     *  dirección, algunos navegadores (Safari) devuelven la página a donde estaba. */
    function subirArriba() {
        const arriba = () => {
            try { saltar(0); } catch (e) { /* navegador antiguo */ }
            document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
        };
        arriba();
        requestAnimationFrame(() => { arriba(); requestAnimationFrame(arriba); });
        setTimeout(arriba, 150);
    }

    /** Mueve la página al instante: la hoja de estilos pide desplazamiento suave y aquí estorba. */
    function saltar(y) {
        const raiz = document.documentElement, antes = raiz.style.scrollBehavior;
        raiz.style.scrollBehavior = 'auto';
        window.scrollTo(0, y);
        raiz.style.scrollBehavior = antes;
    }

    function irA(nuevo, { guardar = true, subir = true } = {}) {
        if (!SERV[nuevo] || nuevo === id) return;
        id = nuevo;
        $('pExp').checked = false; $('pEnv').checked = false;
        if (subir) subirArriba();       // antes de pushState: el navegador guarda esta posición
        render();
        if (guardar) history.pushState({ id }, '', TF.servUrl(id));
        if (subir) subirArriba();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const dePedido = TF.leerEnlace();      // enlace del gestor: opciones ya elegidas
        render();
        initConfirmar();
        if (dePedido) { $('pExp').checked = dePedido.express; $('pEnv').checked = dePedido.envio; }
        if (dePedido) {                        // llega por el enlace del gestor: abre arriba, con aviso y botón al formulario
            $('sCotizacion').classList.remove('hidden');
            $('sCotizacionIr').addEventListener('click', () => irAConfirmar());
        }
        precio();
        history.replaceState({ id }, '', location.href);
        otros = TF.catalogo ? TF.catalogo({ excluir: () => id }) : null;
        document.addEventListener('click', e => {
            const a = e.target.closest('a[href^="/servicios/"], a[href^="servicio?id="]');
            if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
            const href = a.getAttribute('href');
            const nuevo = href.startsWith('/servicios/') ? porSlug(href.split('/').pop())
                : new URLSearchParams(href.split('?')[1]).get('id');
            if (!SERV[nuevo]) return;
            e.preventDefault(); e.stopPropagation();
            irA(nuevo);
        }, true);
        window.addEventListener('popstate', e => { const nuevo = (e.state && e.state.id) || idDeUrl(); if (nuevo) irA(nuevo, { guardar: false }); });
        ['pExp', 'pEnv'].forEach(i => $(i).addEventListener('change', precio));
        $('monedaToggle').addEventListener('click', e => { const b = e.target.closest('[data-moneda]'); if (b) TF.setMoneda(b.dataset.moneda); });
        $('sShare').addEventListener('click', async () => {
            const url = (location.protocol.startsWith('http') && TF.enlaceCliente(id, { express: $('pExp').checked, envio: $('pEnv').checked })) || location.href;
            const title = tc('servicios', id).title;
            try { if (navigator.share) await navigator.share({ title, url }); else { await navigator.clipboard.writeText(url); toast(t('toast.enlace')); } } catch (e) { /* cancelado */ }
        });
        TF.on('lang', () => { render(); renderConfirmar(); }); TF.on('pais', () => { render(); renderConfirmar(); }); TF.on('moneda', () => { const n = keys.length; keys = Object.keys(SERV); if (keys.length !== n && SERV[id]) { render(); } precio(); });
        if (location.hash === '#confirmar') setTimeout(() => irAConfirmar(false), 50);
    });
})();
