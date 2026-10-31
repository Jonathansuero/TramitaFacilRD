/* ==========================================================
   TramitaFácil RD — achica las fotos antes de subirlas.
   Una foto de celular pesa 3-8 MB; así viaja en ~300 KB: sube rápido con datos
   móviles, no choca con el límite del servidor y ocupa menos en el VPS.
   Los PDF y las fotos pequeñas se dejan tal cual.
   ========================================================== */
(function () {
    'use strict';
    const MAX_LADO = 1800;          // suficiente para leer un comprobante o un acta
    const CALIDAD = 0.82;
    const DEJAR_IGUAL = 400 * 1024; // por debajo de esto no vale la pena tocarla

    async function achicar(archivo) {
        if (!archivo || !/^image\/(jpeg|png|webp)$/i.test(archivo.type || '') || archivo.size <= DEJAR_IGUAL) return archivo;
        try {
            const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
            const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
            const lienzo = document.createElement('canvas');
            lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
            lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
            const ctx = lienzo.getContext('2d');
            ctx.fillStyle = '#fff';                       // los PNG con fondo transparente quedan en blanco, no en negro
            ctx.fillRect(0, 0, lienzo.width, lienzo.height);
            ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
            if (bitmap.close) bitmap.close();
            const blob = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', CALIDAD));
            if (!blob || blob.size >= archivo.size) return archivo;   // si no mejora, se queda el original
            const nombre = String(archivo.name || 'foto').replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
            return new File([blob], nombre, { type: 'image/jpeg', lastModified: Date.now() });
        } catch (e) {
            return archivo;   // si el navegador no puede, se sube tal cual
        }
    }

    /** Mensaje claro cuando el servidor no responde con JSON (nginx, cortes de red…). */
    function errorSubida(status, datos) {
        if (datos && datos.error) return datos.error;
        if (status === 413) return 'El archivo pesa demasiado para el servidor. Intenta con una foto más liviana o un PDF más pequeño.';
        if (status === 404) return 'El servidor todavía no tiene esta función. Actualízalo con: tramita actualizar';
        if (status === 401 || status === 403) return 'No tienes permiso para subir este archivo.';
        if (status === 502 || status === 503 || status === 504) return 'El servidor no respondió. Intenta de nuevo en un momento.';
        if (!status) return 'No hay conexión. Revisa tu internet e intenta de nuevo.';
        return `No se pudo subir el archivo (error ${status}). Intenta de nuevo.`;
    }

    window.TF_IMAGEN = { achicar, errorSubida };
})();
