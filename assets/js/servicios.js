/* ==========================================================
   TramitaFácil RD — página de Servicios
   El catálogo en sí vive en catalogo.js (lo comparte con la ficha de cada trámite).
   Direcciones: servicios?cat=<área>&pais=<mio|todos>&q=<texto>
   ========================================================== */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { $, t, waLink, saludo } = TF;

    document.addEventListener('DOMContentLoaded', () => {
        TF.catalogo({ url: true });                 // aquí sí se guardan los filtros en la dirección
        const wa = () => { $('catWa').href = waLink(saludo(t('wa.asesoria'))); };
        wa();
        TF.on('lang', wa);
    });
})();
