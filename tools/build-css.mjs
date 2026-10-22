// tools/build-css.mjs — Compila Tailwind v4 sin depender del CDN.
// Uso:  node tools/build-css.mjs
// Requiere el paquete `tailwindcss` (npm i -D tailwindcss@4). Si tienes el CLI oficial,
// también sirve: npx @tailwindcss/cli -i assets/css/tailwind.src.css -o assets/css/tailwind.css --minify
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const twPath = process.env.TAILWIND_PATH || dirname(require.resolve('tailwindcss/package.json'));
const { compile } = await import(join(twPath, 'dist', 'lib.mjs'));

const src = readFileSync(join(root, 'assets/css/tailwind.src.css'), 'utf8')
    .replace(/@source[^;]*;/g, '');

// Candidatos: todas las "palabras" con forma de clase en el HTML y el JS
const files = ['index.html', 'servicio.html', 'instituciones.html', 'diaspora.html', 'assets/js/core.js', 'assets/js/script.js', 'assets/js/servicio.js', 'assets/js/instituciones.js', 'assets/js/diaspora.js'].map(f => readFileSync(join(root, f), 'utf8'));
const candidates = new Set();
for (const text of files) for (const m of text.matchAll(/[A-Za-z0-9_\-:\/\.\[\]%#!@]+/g)) candidates.add(m[0]);

const compiler = await compile(src, {
    base: root,
    loadStylesheet: async (id, base) => {
        const file = id === 'tailwindcss' ? join(twPath, 'index.css') : resolve(base, id);
        return { path: file, base: dirname(file), content: readFileSync(file, 'utf8') };
    }
});
const css = compiler.build([...candidates]);
writeFileSync(join(root, 'assets/css/tailwind.css'), `/* Generado por tools/build-css.mjs — no editar a mano */\n${css}`);
console.log(`✓ assets/css/tailwind.css (${(css.length / 1024).toFixed(1)} KB)`);
