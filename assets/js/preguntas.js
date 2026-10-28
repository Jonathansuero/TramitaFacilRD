/* TramitaFácil RD — preguntas frecuentes (preguntas). Las del país del visitante van primero. */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { D, PAISES, state, $, esc, t, tc, waLink, saludo, normal } = TF;
    let query = '';

    function render() {
        const q = normal(query.trim());
        const list = D.faq.map((f, i) => ({ ...tc('faq', i), tags: f.tags, i }))
            .filter(f => !q || normal(f.q + ' ' + f.a).includes(q))
            .sort((a, b) => (b.tags.includes(state.pais) - a.tags.includes(state.pais)) || a.i - b.i);
        const hl = s => { const tx = esc(s); if (!q) return tx; const idx = normal(tx).indexOf(q); return idx < 0 ? tx : tx.slice(0, idx) + '<mark>' + tx.slice(idx, idx + q.length) + '</mark>' + tx.slice(idx + q.length); };
        $('faqContainer').innerHTML = list.length ? list.map(f => `
            <div class="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <button id="faqBtn-${f.i}" aria-expanded="${q ? 'true' : 'false'}" aria-controls="faqAns-${f.i}" data-faq="${f.i}" class="w-full p-4 sm:p-5 text-left font-bold text-slate-800 flex justify-between items-center gap-3 hover:bg-slate-50 text-sm">
                    <span>${f.tags.includes(state.pais) ? `<span class="mr-1">${PAISES[state.pais].bandera}</span>` : ''}${hl(f.q)}</span>
                    <i id="faqIcon-${f.i}" class="fa-solid fa-chevron-down text-slate-400 transition-transform duration-200 ${q ? 'rotate-180' : ''}"></i></button>
                <div id="faqAns-${f.i}" class="${q ? '' : 'hidden'} p-4 sm:p-5 pt-0 text-slate-600 text-xs sm:text-sm border-t border-slate-100">${hl(f.a)}</div>
            </div>`).join('')
            : `<p class="text-center text-sm text-slate-500 py-6">${esc(t('faq.vacio'))} <a class="text-emerald-700 font-bold underline" target="_blank" rel="noopener" href="${waLink(saludo(t('wa.pregunta', { q: query })))}">${esc(t('cat.preguntar'))}</a></p>`;
        $('faqWa').href = waLink(saludo(query.trim() ? t('wa.pregunta', { q: query.trim() }) : t('wa.info')));
    }

    function toggle(i) {
        const ans = $(`faqAns-${i}`), open = ans.classList.toggle('hidden') === false;
        ans.classList.toggle('faq-open', open);
        $(`faqIcon-${i}`).classList.toggle('rotate-180', open);
        $(`faqBtn-${i}`).setAttribute('aria-expanded', open);
    }

    /** Datos estructurados para que Google muestre las preguntas en los resultados. */
    function schema() {
        const add = obj => { const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(obj); document.head.appendChild(s); };
        add({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: D.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
    }

    document.addEventListener('DOMContentLoaded', () => {
        render();
        schema();
        $('faqSearch').addEventListener('input', e => { query = e.target.value; render(); });
        $('faqContainer').addEventListener('click', e => { const b = e.target.closest('[data-faq]'); if (b) toggle(b.dataset.faq); });
        TF.on('lang', render);
        TF.on('pais', render);
    });
})();
