/* TramitaFácil RD — directorio de instituciones (instituciones#<id>) */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, SERV, $, $$, esc, t, tc, money, waLink, saludo, normal } = TF;
    const ids = Object.keys(D.instituciones);
    const ui = { tipo: 'todas', q: '', abierta: null, lastFocus: null };
    const servDe = id => Object.keys(SERV).filter(k => SERV[k].inst.includes(id));

    function render() {
        const n = tipo => ids.filter(i => D.instituciones[i].tipo === tipo).length;
        $('cPub').textContent = n('publica'); $('cPriv').textContent = n('privada'); $('cInt').textContent = n('internacional');
        $('iFiltros').innerHTML = ['todas', 'publica', 'privada', 'internacional'].map(k => `<button class="chip ${ui.tipo === k ? 'is-active' : ''}" data-tipo="${k}">${esc(t('instp.f.' + k))}</button>`).join('');
        const q = normal(ui.q.trim());
        const list = ids.filter(i => { const it = D.instituciones[i], tr = tc('instituciones', i);
            return (ui.tipo === 'todas' || it.tipo === ui.tipo) && (!q || normal(`${it.sigla} ${it.nombre} ${tr.nombre} ${tr.desc}`).includes(q)); });
        $('iGrid').innerHTML = list.length ? list.map((i, n) => { const tr = tc('instituciones', i), cnt = servDe(i).length;
            return `<button class="inst-row" data-inst="${i}" id="card-${i}" style="animation-delay:${n * 25}ms">
                ${TF.instBadge(i)}
                <span class="flex-1 min-w-0 text-left"><span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">${esc(t('instp.f.' + D.instituciones[i].tipo))}</span>
                <strong class="block text-sm text-slate-900">${esc(tr.nombre)}</strong>
                <span class="block text-xs text-slate-500 mt-1">${esc(tr.desc)}</span>
                <span class="inline-block mt-2 text-[11px] font-bold text-domBlue">${esc(t(cnt === 1 ? 'inst.ntramites1' : 'inst.ntramites', { n: cnt }))} →</span></span></button>`; }).join('')
            : `<p class="sm:col-span-2 lg:col-span-3 text-center text-sm text-slate-500 py-10">${esc(t('cat.vacio'))}</p>`;
        if (ui.abierta) abrir(ui.abierta, false);
    }

    function abrir(id, push = true) {
        if (!D.instituciones[id]) return;
        ui.abierta = id;
        const it = D.instituciones[id], tr = tc('instituciones', id), lista = servDe(id);
        $('dBody').innerHTML = `
            <div class="flex items-center gap-4">${TF.instBadge(id, 'lg')}<div><p class="text-[10px] font-bold uppercase tracking-wider text-domRed">${esc(t('instp.f.' + it.tipo))}</p><h2 id="dTitle" class="text-xl font-extrabold text-slate-900">${esc(tr.nombre)}</h2></div></div>
            <p class="text-sm text-slate-600 mt-4">${esc(tr.desc)}</p>
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mt-6 mb-3">${esc(t('instp.tramites'))}</h3>
            <div class="space-y-2">${lista.map(k => `<a href="servicio?id=${k}" class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 hover:border-domBlue hover:bg-sky-50 transition-colors">
                <span class="text-sm font-semibold text-slate-800">${esc(tc('servicios', k).title)}</span><span class="text-xs font-bold text-domBlue whitespace-nowrap">${money(SERV[k].tax + SERV[k].fee)} →</span></a>`).join('')}</div>
            <a href="${waLink(saludo(t('wa.inst', { inst: tr.nombre })))}" target="_blank" rel="noopener" class="mt-6 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 rounded-xl"><i class="fa-brands fa-whatsapp"></i> ${esc(t('instp.consultar'))}</a>
            <p class="text-[11px] text-slate-400 mt-4">${esc(t('inst.aviso'))}</p>`;
        const dr = $('iDrawer');
        if (!dr.classList.contains('open')) ui.lastFocus = document.activeElement;
        dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        dr.querySelector('.drawer-close').focus();
        if (push && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    }
    function cerrar() {
        ui.abierta = null;
        const dr = $('iDrawer'); dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        history.replaceState(null, '', location.pathname + location.search);
        ui.lastFocus?.focus?.();
    }

    document.addEventListener('DOMContentLoaded', () => {
        render();
        $('iSearch').addEventListener('input', e => { ui.q = e.target.value; render(); });
        $('iFiltros').addEventListener('click', e => { const b = e.target.closest('[data-tipo]'); if (b) { ui.tipo = b.dataset.tipo; render(); } });
        $('iGrid').addEventListener('click', e => { const b = e.target.closest('[data-inst]'); if (b) abrir(b.dataset.inst); });
        $('iDrawer').addEventListener('click', e => { if (e.target.closest('[data-close]')) cerrar(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.abierta) cerrar(); });
        const h = location.hash.slice(1); if (D.instituciones[h]) { $('card-' + h)?.scrollIntoView({ block: 'center' }); abrir(h, false); }
        TF.on('lang', render); TF.on('moneda', () => ui.abierta && abrir(ui.abierta, false)); TF.on('pais', () => ui.abierta && abrir(ui.abierta, false));
    });
})();
