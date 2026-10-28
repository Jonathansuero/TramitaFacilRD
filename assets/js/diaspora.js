/* TramitaFácil RD — guía para la diáspora: diaspora?c=<ISO> */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, C, PAISES, SERV, state, $, esc, t, tc, money, waLink, saludo, normal, flagOf, countryName, restart, toast } = TF;
    const rows = D.paises_mundo.filter(r => r[0] !== 'DO');
    const SYM = TF.SYM;

    let code = new URLSearchParams(location.search).get('c');
    if (!rows.some(r => r[0] === code)) code = state.detalle && rows.some(r => r[0] === state.detalle) ? state.detalle : ({ us: 'US', es: 'ES' }[state.pais] || 'US');

    const row = () => rows.find(r => r[0] === code);
    const locale = () => ({ en: 'en-US', fr: 'fr-FR' }[state.lang] || 'es-DO');
    const horaTxt = h => new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, ((h % 24) + 24) % 24, Math.round((h % 1) * 60))));

    function elegir(c, scroll) {
        code = c;
        TF.setCountry(c, { animate: false });   // sincroniza país, moneda y WhatsApp en todo el sitio
        history.replaceState(null, '', `?c=${c}`);
        render();
        if (scroll) $('dCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function render(animate = true) {
        const [c, tz, moneda, perfil] = row();
        const off = TF.offsetMin(tz) / 60, P = PAISES[perfil];
        const diff = off === 0 ? t('reloj.igual') : t('reloj.diff', { h: `${off > 0 ? '+' : ''}${Number.isInteger(off) ? off : off.toFixed(1)}` });
        $('dList').innerHTML = rows.map(r => `<option value="${esc(countryName(r[0]))}"></option>`).join('');
        $('dInput').value = '';
        $('dCard').innerHTML = `
            <div class="flex items-center gap-4"><span class="text-5xl leading-none">${flagOf(c)}</span>
              <div><p class="text-[10px] font-bold uppercase tracking-wider text-domRed">${esc(t('dia.card.eyebrow'))}</p><h2 class="text-2xl font-extrabold text-slate-900">${esc(countryName(c))}</h2></div></div>
            <div class="grid grid-cols-3 gap-2 mt-5 text-center">
              <div class="dia-stat"><span>${esc(t('dia.tuhora'))}</span><strong>${TF.fmtHora(tz)}</strong></div>
              <div class="dia-stat"><span>${esc(t('dia.rd'))}</span><strong>${TF.fmtHora(TF.RD_TZ)}</strong></div>
              <div class="dia-stat"><span>${esc(t('dia.diferencia'))}</span><strong class="text-sm">${esc(diff)}</strong></div>
            </div>
            <p class="text-xs text-slate-500 mt-4">${esc(t('dia.moneda', { sym: SYM[moneda] }))}</p>
            <p class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-5 mb-2">${esc(t('dia.populares'))}</p>
            <div class="space-y-2">${P.destacados.map(k => `<a href="servicio?id=${k}" class="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 hover:border-domBlue hover:bg-sky-50 text-xs font-semibold"><span>${esc(tc('servicios', k).title)}</span><span class="text-domBlue whitespace-nowrap">${money(SERV[k].tax + SERV[k].fee, moneda)}</span></a>`).join('')}</div>
            <div class="grid grid-cols-2 gap-2 mt-5">
              <a href="/#pais=${perfil}" class="bg-domBlue hover:bg-domBlueHover text-white text-xs font-bold py-3 rounded-xl text-center">${esc(t('dia.cotizar'))}</a>
              <a href="${waLink(saludo())}" target="_blank" rel="noopener" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3 rounded-xl text-center"><i class="fa-brands fa-whatsapp mr-1"></i>WhatsApp</a>
            </div>`;
        if (animate) restart($('dCard'), 'panel-anim');
        renderHorario(tz);
        $('dGrid').innerHTML = rows.slice().sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0]), state.lang))
            .map(r => `<button class="pais-tile ${r[0] === c ? 'is-active' : ''}" data-c="${r[0]}"><span class="text-2xl">${flagOf(r[0])}</span><span>${esc(countryName(r[0]))}</span></button>`).join('');
        $('dOtro').href = waLink(t('wa.otro'));
    }

    /** Barra de 24 h en la hora local del visitante con el horario de oficina de RD marcado. */
    function renderHorario(tz) {
        const off = TF.offsetMin(tz) / 60, [a, b] = C.horario.lun_vie, [sa, sb] = C.horario.sabado;
        const nowLocal = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()), 10) % 24;
        const cells = [];
        for (let h = 0; h < 24; h++) {
            const rd = ((h - off) % 24 + 24) % 24, open = rd >= a && rd < b;
            cells.push(`<div class="h-cell ${open ? 'is-open' : ''} ${h === nowLocal ? 'is-now' : ''}" title="${horaTxt(h)}"><span>${h % 3 === 0 ? horaTxt(h).replace(/:00/, '') : ''}</span></div>`);
        }
        $('dHorario').innerHTML = cells.join('');
        $('dHorarioTxt').textContent = t('dia.horario.txt', { lugar: countryName(code), a: horaTxt(a + off), b: horaTxt(b + off), sa: horaTxt(sa + off), sb: horaTxt(sb + off) });
    }

    function buscar(e) {
        e.preventDefault();
        const q = normal($('dInput').value.trim());
        const r = rows.find(x => normal(countryName(x[0])) === q) || rows.find(x => q && normal(countryName(x[0])).startsWith(q));
        if (!r) { restart($('dInput'), 'shake'); toast(t('mundo.noencontrado')); return; }
        elegir(r[0], true);
    }

    document.addEventListener('DOMContentLoaded', () => {
        TF.setCountry(code, { animate: false });
        render();
        $('dForm').addEventListener('submit', buscar);
        $('dGrid').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) elegir(b.dataset.c, true); });
        $('dDetect').addEventListener('click', () => {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone, r = rows.find(x => x[1] === tz);
            if (r) { elegir(r[0], true); toast(`${flagOf(r[0])} ${countryName(r[0])}`); } else toast(t('dia.nodetectado'));
        });
        TF.on('lang', () => render());
        TF.on('moneda', () => render(false));
        setInterval(() => render(false), 60000);
    });
})();
