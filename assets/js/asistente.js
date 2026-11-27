/* Asistente virtual de trámites para páginas internas (misma lógica que el del inicio, sin la calculadora). */
(function () {
    'use strict';
    function iniciar() {
        const TFx = window.TF; if (!TFx || !document.getElementById('quizCats')) return;
        const { D, SERV, PAISES, state, esc, t, tc, money, servUrl, $ } = TFx;
        let clave = null;
        const dots = n => document.querySelectorAll('.quiz-dot').forEach(d => d.classList.toggle('is-on', +d.dataset.dot <= n));
        const ver = (id, on) => $(id).classList.toggle('hidden', !on);
        function categorias() {
            $('quizCats').innerHTML = Object.keys(D.categorias).map(k => { const c = tc('categorias', k);
                return `<button type="button" class="quiz-card group" data-qcat="${k}"><i class="fa-solid ${D.categorias[k].icono} text-domBlue text-2xl mb-2 group-hover:scale-110 transition-transform"></i>
                <div class="font-bold text-slate-800 text-sm">${esc(c.label)}</div><div class="text-xs text-slate-500 mt-1">${esc(c.resumen)}</div></button>`; }).join('');
        }
        function servicios(cat) {
            const keys = Object.keys(SERV).filter(k => SERV[k].category === cat)
                .sort((a, b) => SERV[b].paises.includes(state.pais) - SERV[a].paises.includes(state.pais));
            $('quizOptionsContainer').innerHTML = keys.map(k => `<button type="button" class="quiz-card text-xs font-bold text-slate-800" data-qserv="${k}">${esc(tc('servicios', k).title)}
                ${SERV[k].paises.includes(state.pais) ? `<span class="block mt-1 text-[10px] font-semibold text-emerald-700">${PAISES[state.pais].bandera} ${esc(t('quiz.recomendado'))}</span>` : ''}</button>`).join('');
            ver('quizStep1', false); ver('quizStep3', false); ver('quizStep2', true); dots(2);
        }
        function resultado(k) {
            clave = k;
            const s = SERV[k], tr = tc('servicios', k);
            $('quizResultBox').innerHTML = `
                <span class="text-[10px] font-bold uppercase text-domBlue bg-sky-100 px-2 py-0.5 rounded">${esc(t('quiz.encontrada'))}</span>
                <h4 class="font-extrabold text-slate-900 text-base mt-2">${esc(tr.title)}</h4>
                <p class="text-xs text-slate-600 mt-1">${esc(tr.desc)}</p>
                <p class="text-xs text-slate-500 mt-2">${esc(t('serv.ideal'))}: ${s.paises.map(p => `${PAISES[p].bandera} ${esc(tc('paises', p).corto)}`).join(' · ')}</p>
                ${s.inst.length ? `<p class="text-xs text-slate-500 mt-1">${esc(t('serv.ante'))}: ${s.inst.map(i => `<a class="font-bold text-domBlue hover:underline" href="/instituciones#${i}">${esc(D.instituciones[i].sigla)}</a>`).join(', ')}</p>` : ''}
                <div class="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">${esc(t('quiz.base'))} ${money(TFx.precio(s).final)}</div>`;
            $('quizPageBtn').href = servUrl(k);
            $('quizCalcBtn').href = servUrl(k);
            const n = D.config.whatsapp;
            if (n) $('quizWaBtn').href = 'https://wa.me/' + n + '?text=' + encodeURIComponent('Hola, quiero que me tramiten: ' + tr.title);
            ver('quizStep2', false); ver('quizStep3', true); dots(3);
        }
        function reiniciar() { ver('quizStep2', false); ver('quizStep3', false); ver('quizStep1', true); dots(1); }
        categorias();
        $('quizCats').addEventListener('click', e => { const b = e.target.closest('[data-qcat]'); if (b) servicios(b.dataset.qcat); });
        $('quizOptionsContainer').addEventListener('click', e => { const b = e.target.closest('[data-qserv]'); if (b) resultado(b.dataset.qserv); });
        $('quizBack').addEventListener('click', reiniciar);
        $('quizReset').addEventListener('click', reiniciar);
        ['tf:lang', 'tf:pais', 'tf:moneda'].forEach(ev => document.addEventListener(ev, () => {
            categorias(); TFx.applyI18n($('asistente'));
            if (clave && !$('quizStep3').classList.contains('hidden')) resultado(clave);
        }));
        TFx.applyI18n($('asistente'));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
