/* ==========================================================
   TramitaFácil RD — Carrusel de casos reales
   TF.carrusel.mount('idDelContenedor', { onCalcular(servicio), onIniciar(servicio), limite, simple })
   simple: true → abajo solo el botón «Iniciar solicitud» (inicio); sin simple → servicio, precio y calculadora (página Casos reales).
   Cada caso son dos conversaciones de WhatsApp: la del familiar que no resuelve y la nuestra.
   Desliza con el dedo, flechas, teclado o solo (cada 8 s; se detiene al tocarlo).
   ========================================================== */
(function () {
    const TF = window.TF; if (!TF) return;
    const { D, SERV, state, $, esc, t, tc, money } = TF;
    const tx = o => (o && (o[state.lang] || o.es)) || '';
    const LEIDO = '<svg width="16" height="10" viewBox="0 0 20 12" fill="none" stroke="#2A9DF4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6l3.5 3.5L11 3M8 9.5L9 10.5 17 2"/></svg>';
    const X = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const OK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
    const reducido = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Una burbuja del chat. `nota` es el separador gris («2 semanas después»). */
    function burbuja(quien, texto, hora, verde) {
        if (quien === 'nota') return `<span class="chat-nota">${esc(texto)}</span>`;
        const clase = quien === 'yo' ? (verde ? 'chat-yo-verde' : 'chat-yo-gris') : quien === 'tf' ? 'chat-tf' : 'chat-otro';
        const visto = quien === 'yo' && verde ? ' ' + LEIDO : '';
        return `<div class="chat-b ${clase}">${esc(texto)}${hora ? `<span class="chat-hora">${esc(hora)}${visto}</span>` : ''}</div>`;
    }

    /** Una conversación completa: cabecera con el contacto y las burbujas. */
    function chat(mensajes, de, verde, horas) {
        const reales = mensajes.filter(m => m[0] !== 'nota');
        const ultimo = reales.length ? reales[reales.length - 1] : null;
        return `<div class="chat ${verde ? 'chat-wa' : 'chat-gris'}">
            <div class="chat-cab ${verde ? 'chat-cab-wa' : 'chat-cab-gris'}">
                ${verde ? '<span class="chat-tf-logo">TF</span>' : '<span class="chat-avatar"></span>'}
                <span><b>${esc(de)}</b>${verde ? `<small>${esc(t('crs.enlinea'))}</small>` : ''}</span>
            </div>
            <div class="chat-cuerpo">${mensajes.map(m =>
            burbuja(m[0], tx(m[1]), m === ultimo ? horas : '', verde)).join('')}</div>
        </div>`;
    }

    function slide(c, i, total, simple) {
        const s = SERV[c.servicio], tr = tc('servicios', c.servicio), tiempo = TF.tiempo(c.servicio);
        const antes = c.problema.chat || [], despues = c.solucion.chat || [];
        return `<article class="crs-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${total}" data-i="${i}">
            <div class="crs-cuerpo">
                <div class="crs-chats${antes.length ? '' : ' crs-chats-uno'}">
                    ${antes.length ? `<div class="crs-chat">
                        <span class="caso-tag caso-tag-rojo">${X}${esc(t('casos.problema'))}</span>
                        ${chat(antes, tx(c.problema.contacto) || t('crs.contacto'), false, '9:14')}
                        <p class="crs-p">${esc(tx(c.problema.texto))}</p>
                    </div>` : ''}
                    <div class="crs-chat">
                        <span class="caso-tag caso-tag-verde">${OK}${esc(t('casos.solucion'))}</span>
                        ${chat(despues, 'TramitaFácil RD', true, '10:42')}
                        <p class="crs-p">${esc(tx(c.solucion.titulo))}</p>
                    </div>
                </div>
                ${simple ? `<div class="crs-pie crs-pie-simple">
                    <button type="button" class="crs-btn crs-btn-rojo crs-btn-grande" data-iniciar="${esc(c.servicio)}">${esc(t('crs.iniciar'))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                </div>` : `                <div class="crs-pie">
                    <div class="crs-serv"><a href="${TF.servUrl(c.servicio)}">${esc(tr.title)}</a>
                        <span>${esc(t('precio.desde'))} <strong>${money(s.tax + s.fee)}</strong>${tiempo ? ` · <i class="fa-regular fa-clock" aria-hidden="true"></i> ${esc(tiempo.txt)}` : ''}</span></div>
                    <div class="crs-botones">
                        <button type="button" class="crs-btn crs-btn-borde" data-calcular="${esc(c.servicio)}"><i class="fa-solid fa-calculator" aria-hidden="true"></i> ${esc(t('casos.calcular'))}</button>
                        <button type="button" class="crs-btn crs-btn-rojo" data-iniciar="${esc(c.servicio)}">${esc(t('casos.inicia'))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
                    </div>
                </div>`}
            </div>
        </article>`;
    }

    function mount(id, opts = {}) {
        const raiz = $(id); if (!raiz) return;
        // Si el trámite del caso está oculto desde el panel, el caso no se muestra.
        const casos = (D.casos || []).filter(c => SERV[c.servicio]).slice(0, opts.limite || 99);
        let actual = 0, timer = null, pausado = false;

        raiz.classList.add('crs');
        raiz.setAttribute('role', 'region');
        raiz.setAttribute('aria-roledescription', 'carousel');

        function dibujar() {
            raiz.setAttribute('aria-label', t('casos.eyebrow'));
            raiz.innerHTML = `<div class="crs-marco">
                    <button type="button" class="crs-flecha crs-prev" aria-label="${esc(t('crs.ant'))}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                    <div class="crs-pista" tabindex="0" aria-live="off">${casos.map((c, i) => slide(c, i, casos.length, !!opts.simple)).join('')}</div>
                    <button type="button" class="crs-flecha crs-next" aria-label="${esc(t('crs.sig'))}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
                </div>
                <div class="crs-controles">
                    <span class="crs-num"><b>1</b> / ${casos.length}</span>
                    <div class="crs-barra" aria-hidden="true"><span></span></div>
                    <button type="button" class="crs-pausa" aria-label="${esc(t('crs.pausa'))}"><i class="fa-solid fa-pause" aria-hidden="true"></i></button>
                </div>`;
            const pista = raiz.querySelector('.crs-pista');
            pista.addEventListener('scroll', () => {
                const i = Math.round(pista.scrollLeft / pista.clientWidth);
                if (i !== actual) { actual = i; marcar(); }
            }, { passive: true });
            ir(actual, false);
        }
        function marcar() {
            raiz.querySelector('.crs-num b').textContent = actual + 1;
            raiz.querySelector('.crs-barra span').style.width = `${((actual + 1) / casos.length) * 100}%`;
            raiz.querySelectorAll('.crs-slide').forEach((s, i) => s.setAttribute('aria-hidden', String(i !== actual)));
        }
        function ir(i, suave = true) {
            const pista = raiz.querySelector('.crs-pista');
            actual = (i + casos.length) % casos.length;
            pista.scrollTo({ left: actual * pista.clientWidth, behavior: suave && !reducido() ? 'smooth' : 'instant' });
            marcar();
        }
        function auto() {
            clearInterval(timer);
            if (pausado || reducido()) return;
            timer = setInterval(() => { if (!document.hidden) ir(actual + 1); }, 8000);
        }
        function pausar(si) {
            pausado = si; auto();
            const b = raiz.querySelector('.crs-pausa');
            b.innerHTML = `<i class="fa-solid fa-${si ? 'play' : 'pause'}" aria-hidden="true"></i>`;
            b.setAttribute('aria-label', t(si ? 'crs.seguir' : 'crs.pausa'));
        }

        raiz.addEventListener('click', e => {
            if (e.target.closest('.crs-prev')) { ir(actual - 1); pausar(true); }
            else if (e.target.closest('.crs-next')) { ir(actual + 1); pausar(true); }
            else if (e.target.closest('.crs-pausa')) pausar(!pausado);
            const calc = e.target.closest('[data-calcular]'), ini = e.target.closest('[data-iniciar]');
            if (calc && opts.onCalcular) opts.onCalcular(calc.dataset.calcular);
            if (ini && opts.onIniciar) opts.onIniciar(ini.dataset.iniciar);
        });
        raiz.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight') { e.preventDefault(); ir(actual + 1); pausar(true); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); ir(actual - 1); pausar(true); }
        });
        ['pointerdown', 'focusin'].forEach(ev => raiz.addEventListener(ev, () => { if (!pausado) pausar(true); }));
        raiz.addEventListener('mouseenter', () => clearInterval(timer));
        raiz.addEventListener('mouseleave', () => auto());
        window.addEventListener('resize', () => ir(actual, false));

        dibujar(); auto();
        ['lang', 'moneda'].forEach(ev => TF.on(ev, () => { dibujar(); }));
    }

    TF.carrusel = { mount };
})();
