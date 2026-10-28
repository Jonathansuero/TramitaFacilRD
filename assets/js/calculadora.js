/* TramitaFácil RD — pestaña de calculadoras: calculadora?s=<servicio>
   Calculadora desglosada (módulo compartido cotizador.js) + IPI + traspaso vehicular. */
(function () {
    'use strict';
    const TF = window.TF; if (!TF) return;
    const { C, SERV, state, $, esc, t, money, restart } = TF;

    // ---------------- calculadoras DGII
    const fmtDOP = n => `RD$ ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    function calculateIPI(e) {
        e?.preventDefault();
        const v = parseFloat($('ipiInputValue').value), box = $('ipiResultBox');
        if (!e && box.classList.contains('hidden')) return;
        box.classList.remove('hidden');
        if (!(v > 0)) { box.innerHTML = `<div class="text-red-600 font-semibold">${esc(t('dgii.invalido'))}</div>`; return; }
        const ex = C.ipi_exencion;
        if (v <= ex) box.innerHTML = `<div class="text-emerald-700 font-bold">${esc(t('ipi.exento'))}</div><div class="text-slate-600">${esc(t('ipi.exento.d', { v: fmtDOP(ex) }))}</div>`;
        else {
            const exc = v - ex, ipi = exc * 0.01;
            box.innerHTML = `<div>${esc(t('ipi.excedente'))}: <strong class="text-domBlue">${fmtDOP(exc)}</strong></div>
                <div>${esc(t('ipi.anual'))}: <strong class="text-emerald-700">${fmtDOP(ipi)}</strong></div>
                <div>${esc(t('ipi.cuota'))}: <strong>${fmtDOP(ipi / 2)}</strong>${state.moneda !== 'DOP' ? ` <span class="text-slate-500">(≈ ${money(ipi / 2)})</span>` : ''}</div>
                <div class="text-[10px] text-slate-500 mt-1">${esc(t('ipi.nota'))}</div>
                <a class="text-left text-xs font-bold text-domBlue mt-1" href="servicio?id=ipi_impuesto">${esc(t('ipi.cta'))} →</a>`;
        }
        if (e) restart(box, 'pop');
    }
    function calculateVehicleTransfer(e) {
        e?.preventDefault();
        const v = parseFloat($('vehicleInputValue').value), box = $('vehicleResultBox');
        if (!e && box.classList.contains('hidden')) return;
        box.classList.remove('hidden');
        if (!(v > 0)) { box.innerHTML = `<div class="text-red-600 font-semibold">${esc(t('dgii.invalido'))}</div>`; return; }
        const imp = v * C.traspaso_tasa, tot = imp + C.traspaso_cargos;
        box.innerHTML = `<div>${esc(t('veh.impuesto'))} (${C.traspaso_tasa * 100}%): <strong>${fmtDOP(imp)}</strong></div>
            <div>${esc(t('veh.cargos'))}: <strong>${fmtDOP(C.traspaso_cargos)}</strong></div>
            <div class="text-emerald-700 font-bold border-t border-slate-200 pt-1 mt-1">${esc(t('veh.total'))}: ${fmtDOP(tot)}${state.moneda !== 'DOP' ? ` (≈ ${money(tot)})` : ''}</div>
            <a class="text-left text-xs font-bold text-domBlue mt-1" href="servicio?id=traspaso_vehicular">${esc(t('veh.cta'))} →</a>`;
        if (e) restart(box, 'pop');
    }
    const refrescarDgii = () => { calculateIPI(); calculateVehicleTransfer(); };

    document.addEventListener('DOMContentLoaded', () => {
        TF.cotizador.mount('cotizadorApp');
        const s = new URLSearchParams(location.search).get('s');
        if (SERV[s]) TF.cotizador.seleccionar(s);

        $('ipiForm').addEventListener('submit', calculateIPI);
        $('vehForm').addEventListener('submit', calculateVehicleTransfer);
        TF.on('lang', refrescarDgii);
        TF.on('moneda', refrescarDgii);
        TF.on('pais', refrescarDgii);

        // Enlaces directos: calculadora#herramientas-dgii lleva a IPI y traspaso
        if (location.hash === '#herramientas-dgii') setTimeout(() => TF.goTo('herramientas-dgii'), 300);
    });
})();
