/* TramitaFácil RD — asistente de chat guiado (Tramy).
   Funciona con el catálogo real de la página (trámites, precios, requisitos, preguntas frecuentes) y con el mismo
   servicio de solicitudes y de seguimiento. No inventa respuestas: todo sale de los datos del sitio. */
(function () {
    'use strict';
    const TF = window.TF;
    if (!TF || document.getElementById('tfChat')) return;
    const { D, C, SERV, PAISES, state, esc, tc, money } = TF;
    const NOMBRE = 'Tramy';

    // ---------------- textos (es · en · fr)
    const L = {
        es: {
            sub: 'Asistente virtual · en línea', abrir: '¿Dudas? Pregúntale a Tramy', cerrar: 'Cerrar chat', reiniciar: 'Empezar de nuevo', info: 'Información',
            infoTxt: 'Soy un asistente automático de TramitaFácil RD, no una persona. Respondo con la información de esta página. No somos una oficina del gobierno: somos un servicio privado que hace tus trámites por ti.',
            escribe: 'Escribe tu mensaje…', enviar: 'Enviar',
            hola: `¡Hola! Soy ${NOMBRE}, el asistente virtual de TramitaFácil RD.`,
            digital: 'Hacemos tus trámites en República Dominicana de forma **100 % digital**: tú nos envías tus documentos y nosotros hacemos el resto, estés donde estés.',
            ayuda: '¿En qué te puedo ayudar hoy?',
            m_cotizar: 'Cotizar un trámite', m_rastrear: 'Rastrear mi trámite', m_faq: 'Preguntas frecuentes', m_persona: 'Hablar con una persona', m_menu: 'Volver al menú',
            donde: '¿Desde dónde nos escribes? Así te muestro los precios en tu moneda.',
            cat: '¿Qué tipo de trámite necesitas?', serv: 'Estos son los trámites de **{cat}**. Elige uno:', otra: '← Otra categoría',
            total: 'Precio total', totalNota: 'incluye la tasa del Estado, nuestros honorarios e ITBIS', hoy: 'Para empezar', hoyNota: 'el resto lo pagas cuando te entregamos', tiempo: 'Tiempo', ante: 'Ante', incluye: 'Qué incluye', docs: 'Documentos que te pediremos',
            solicitar: 'Solicitar este trámite', otro: 'Ver otro trámite', detalle: 'Ver detalle completo', calc: 'Abrir la calculadora',
            elegido: 'Perfecto. Para registrar tu solicitud necesito unos datos. ¿Cuál es tu **nombre completo**?',
            wa: 'Gracias, {n}. ¿Cuál es tu número de **WhatsApp**? Si no vives en RD, incluye el código de tu país (por ejemplo +1 o +34).',
            email: '¿Y tu **correo electrónico**?',
            repaso: 'Revisa tus datos:', r_serv: 'Trámite', r_nom: 'Nombre', r_wa: 'WhatsApp', r_mail: 'Correo',
            acepta: 'Al enviar, aceptas que usemos tus datos solo para gestionar tu trámite ([política de privacidad](/privacidad)). Esto no es un pago: te cotizamos y coordinamos todo por WhatsApp.',
            c_enviar: 'Sí, enviar solicitud', c_corregir: 'Corregir mis datos', c_wa: 'Mejor hablar por WhatsApp',
            enviando: 'Enviando tu solicitud…',
            listo: '¡Listo, {n}! Recibimos tu solicitud. Tu código de seguimiento es **{c}**. Guárdalo: con él ves cómo va tu trámite.',
            listo2: 'Un gestor te escribirá por WhatsApp en horario de atención para confirmar los detalles y coordinar el pago inicial.',
            listoSin: 'No pude enviarla desde aquí, pero puedes mandarla por WhatsApp con tus datos ya escritos:',
            c_abrirwa: 'Abrir WhatsApp con mi resumen', c_seguir: 'Seguir mi trámite',
            e_nombre: 'Escribe tu nombre y apellido, por favor.', e_wa: 'Ese número no parece válido. Escríbelo con el código de país, por ejemplo +1 305 555 1234.', e_mail: 'Ese correo no parece válido. Revísalo e inténtalo otra vez.',
            codigoPide: 'Escribe tu **código de seguimiento** (se ve así: RD-1234).',
            noCodigo: 'No encontré ese código. Revisa que esté bien escrito (por ejemplo RD-1234) o escríbenos por WhatsApp.',
            estado: 'Estado', verTodo: 'Ver el detalle completo', otroCodigo: 'Probar otro código',
            faqQ: 'Estas son las preguntas más comunes. Toca una:', masFaq: 'Ver más preguntas', todasFaq: 'Ver todas en Preguntas',
            persona: 'Con gusto te atiende una persona.', abierto: 'Ahora estamos **en horario de atención** (lun–vie 8:00–18:00, sáb 9:00–13:00, hora de RD).', cerrado: 'Ahora estamos **fuera de horario** (lun–vie 8:00–18:00, sáb 9:00–13:00, hora de RD). Déjanos tu mensaje y te respondemos al abrir.',
            c_wagen: 'Escribir por WhatsApp', c_correo: 'Enviar un correo',
            hallado: 'Esto es lo que encontré para ti:', hallaFaq: 'Esto puede ayudarte:', nada: 'No estoy seguro de haberte entendido. Puedes elegir una opción, buscar por el nombre del trámite (por ejemplo «pasaporte» o «acta») o hablar con una persona.',
            gracias: '¡Con gusto! Si necesitas algo más, aquí estoy.', saludoR: '¡Hola! ¿Qué trámite necesitas hoy?',
            reinicio: 'Empecemos de nuevo.', wahola: 'Hola, quiero que me tramiten: {t}'
        },
        en: {
            sub: 'Virtual assistant · online', abrir: 'Questions? Ask Tramy', cerrar: 'Close chat', reiniciar: 'Start over', info: 'Information',
            infoTxt: 'I am an automated assistant of TramitaFácil RD, not a person. I answer with the information on this site. We are not a government office: we are a private service that handles your paperwork for you.',
            escribe: 'Type your message…', enviar: 'Send',
            hola: `Hi! I'm ${NOMBRE}, the virtual assistant of TramitaFácil RD.`,
            digital: 'We handle your paperwork in the Dominican Republic **100% digitally**: you send us your documents and we do the rest, wherever you are.',
            ayuda: 'How can I help you today?',
            m_cotizar: 'Get a quote', m_rastrear: 'Track my request', m_faq: 'Frequently asked questions', m_persona: 'Talk to a person', m_menu: 'Back to menu',
            donde: 'Where are you writing from? This way I show prices in your currency.',
            cat: 'What kind of procedure do you need?', serv: 'These are the **{cat}** procedures. Pick one:', otra: '← Another category',
            total: 'Total price', totalNota: 'includes the government fee, our fees and ITBIS (tax)', hoy: 'To start', hoyNota: 'you pay the rest when we deliver', tiempo: 'Time', ante: 'Before', incluye: 'What is included', docs: 'Documents we will ask for',
            solicitar: 'Request this procedure', otro: 'See another procedure', detalle: 'See full details', calc: 'Open the calculator',
            elegido: 'Great. To register your request I need a few details. What is your **full name**?',
            wa: 'Thanks, {n}. What is your **WhatsApp** number? If you do not live in the DR, include your country code (for example +1 or +34).',
            email: 'And your **email**?',
            repaso: 'Please check your details:', r_serv: 'Procedure', r_nom: 'Name', r_wa: 'WhatsApp', r_mail: 'Email',
            acepta: 'By sending, you agree that we use your data only to handle your procedure ([privacy policy](/privacidad)). This is not a payment: we quote and coordinate everything by WhatsApp.',
            c_enviar: 'Yes, send request', c_corregir: 'Fix my details', c_wa: 'I prefer WhatsApp',
            enviando: 'Sending your request…',
            listo: 'Done, {n}! We received your request. Your tracking code is **{c}**. Keep it: it lets you follow your procedure.',
            listo2: 'A specialist will message you on WhatsApp during business hours to confirm details and arrange the first payment.',
            listoSin: 'I could not send it from here, but you can send it by WhatsApp with your details already written:',
            c_abrirwa: 'Open WhatsApp with my summary', c_seguir: 'Track my procedure',
            e_nombre: 'Please type your first and last name.', e_wa: 'That number does not look valid. Type it with the country code, for example +1 305 555 1234.', e_mail: 'That email does not look valid. Please check it and try again.',
            codigoPide: 'Type your **tracking code** (it looks like RD-1234).',
            noCodigo: 'I could not find that code. Check that it is correct (for example RD-1234) or write to us on WhatsApp.',
            estado: 'Status', verTodo: 'See full details', otroCodigo: 'Try another code',
            faqQ: 'These are the most common questions. Tap one:', masFaq: 'More questions', todasFaq: 'See all in FAQ',
            persona: 'Happy to connect you with a person.', abierto: 'We are **open now** (Mon–Fri 8:00–18:00, Sat 9:00–13:00, Dominican time).', cerrado: 'We are **closed now** (Mon–Fri 8:00–18:00, Sat 9:00–13:00, Dominican time). Leave your message and we will reply when we open.',
            c_wagen: 'Write on WhatsApp', c_correo: 'Send an email',
            hallado: 'This is what I found for you:', hallaFaq: 'This may help:', nada: 'I am not sure I understood. You can pick an option, search by the name of the procedure (for example “passport” or “birth certificate”) or talk to a person.',
            gracias: 'My pleasure! If you need anything else, I am here.', saludoR: 'Hi! Which procedure do you need today?',
            reinicio: 'Let us start over.', wahola: 'Hello, I would like you to handle: {t}'
        },
        fr: {
            sub: 'Assistant virtuel · en ligne', abrir: 'Une question ? Demandez à Tramy', cerrar: 'Fermer le chat', reiniciar: 'Recommencer', info: 'Information',
            infoTxt: 'Je suis un assistant automatique de TramitaFácil RD, pas une personne. Je réponds avec les informations de ce site. Nous ne sommes pas un bureau du gouvernement : nous sommes un service privé qui fait vos démarches pour vous.',
            escribe: 'Écrivez votre message…', enviar: 'Envoyer',
            hola: `Bonjour ! Je suis ${NOMBRE}, l'assistant virtuel de TramitaFácil RD.`,
            digital: 'Nous faisons vos démarches en République dominicaine **100 % en ligne** : vous nous envoyez vos documents et nous faisons le reste, où que vous soyez.',
            ayuda: 'Comment puis-je vous aider aujourd’hui ?',
            m_cotizar: 'Demander un devis', m_rastrear: 'Suivre ma demande', m_faq: 'Questions fréquentes', m_persona: 'Parler à une personne', m_menu: 'Retour au menu',
            donde: 'D’où nous écrivez-vous ? Je vous montre les prix dans votre devise.',
            cat: 'Quel type de démarche vous faut-il ?', serv: 'Voici les démarches de **{cat}**. Choisissez-en une :', otra: '← Autre catégorie',
            total: 'Prix total', totalNota: 'comprend la taxe de l’État, nos honoraires et l’ITBIS', hoy: 'Pour commencer', hoyNota: 'le reste se paie à la livraison', tiempo: 'Délai', ante: 'Auprès de', incluye: 'Ce qui est inclus', docs: 'Documents que nous demanderons',
            solicitar: 'Demander cette démarche', otro: 'Voir une autre démarche', detalle: 'Voir le détail complet', calc: 'Ouvrir le calculateur',
            elegido: 'Parfait. Pour enregistrer votre demande, il me faut quelques informations. Quel est votre **nom complet** ?',
            wa: 'Merci, {n}. Quel est votre numéro **WhatsApp** ? Si vous ne vivez pas en RD, ajoutez l’indicatif de votre pays (par exemple +1 ou +33).',
            email: 'Et votre **e-mail** ?',
            repaso: 'Vérifiez vos informations :', r_serv: 'Démarche', r_nom: 'Nom', r_wa: 'WhatsApp', r_mail: 'E-mail',
            acepta: 'En envoyant, vous acceptez que nous utilisions vos données uniquement pour votre démarche ([politique de confidentialité](/privacidad)). Ce n’est pas un paiement : nous vous faisons un devis et tout se coordonne par WhatsApp.',
            c_enviar: 'Oui, envoyer la demande', c_corregir: 'Corriger mes informations', c_wa: 'Plutôt WhatsApp',
            enviando: 'Envoi de votre demande…',
            listo: 'C’est fait, {n} ! Nous avons reçu votre demande. Votre code de suivi est **{c}**. Gardez-le : il permet de suivre votre démarche.',
            listo2: 'Un gestionnaire vous écrira sur WhatsApp pendant les heures d’ouverture pour confirmer les détails et organiser le premier paiement.',
            listoSin: 'Je n’ai pas pu l’envoyer d’ici, mais vous pouvez l’envoyer par WhatsApp avec vos informations déjà écrites :',
            c_abrirwa: 'Ouvrir WhatsApp avec mon résumé', c_seguir: 'Suivre ma démarche',
            e_nombre: 'Écrivez votre prénom et nom, s’il vous plaît.', e_wa: 'Ce numéro ne semble pas valide. Écrivez-le avec l’indicatif du pays, par exemple +33 6 12 34 56 78.', e_mail: 'Cet e-mail ne semble pas valide. Vérifiez-le et réessayez.',
            codigoPide: 'Écrivez votre **code de suivi** (il ressemble à RD-1234).',
            noCodigo: 'Je n’ai pas trouvé ce code. Vérifiez-le (par exemple RD-1234) ou écrivez-nous sur WhatsApp.',
            estado: 'Statut', verTodo: 'Voir le détail complet', otroCodigo: 'Essayer un autre code',
            faqQ: 'Voici les questions les plus courantes. Touchez-en une :', masFaq: 'Plus de questions', todasFaq: 'Tout voir dans la FAQ',
            persona: 'Avec plaisir, une personne va vous répondre.', abierto: 'Nous sommes **ouverts** (lun–ven 8 h–18 h, sam 9 h–13 h, heure dominicaine).', cerrado: 'Nous sommes **fermés** (lun–ven 8 h–18 h, sam 9 h–13 h, heure dominicaine). Laissez votre message, nous répondrons à l’ouverture.',
            c_wagen: 'Écrire sur WhatsApp', c_correo: 'Envoyer un e-mail',
            hallado: 'Voici ce que j’ai trouvé :', hallaFaq: 'Ceci peut vous aider :', nada: 'Je ne suis pas sûr d’avoir compris. Vous pouvez choisir une option, chercher par nom de démarche (par exemple « passeport » ou « acte ») ou parler à une personne.',
            gracias: 'Avec plaisir ! Si vous avez besoin d’autre chose, je suis là.', saludoR: 'Bonjour ! De quelle démarche avez-vous besoin ?',
            reinicio: 'Recommençons.', wahola: 'Bonjour, je voudrais que vous fassiez : {t}'
        }
    };
    const T = (k, v) => { let s = (L[state.lang] || L.es)[k] || L.es[k] || k; if (v) Object.keys(v).forEach(x => { s = s.split('{' + x + '}').join(v[x]); }); return s; };

    // ---------------- texto con **negrita** y [enlaces](/ruta) seguros
    const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');

    // ---------------- estructura
    const raiz = document.createElement('div');
    raiz.id = 'tfChat';
    raiz.innerHTML = `
      <button type="button" id="tfChatBtn" class="tfc-btn" aria-haspopup="dialog" aria-controls="tfChatPanel" aria-expanded="false">
        <span class="tfc-av" aria-hidden="true">TF</span><span class="tfc-btn-txt"></span>
      </button>
      <section id="tfChatPanel" class="tfc-panel" role="dialog" aria-modal="false" aria-label="${NOMBRE}" hidden>
        <header class="tfc-head">
          <span class="tfc-av tfc-av-g" aria-hidden="true">TF</span>
          <div class="tfc-who"><strong>${NOMBRE}</strong><small class="tfc-sub"></small></div>
          <button type="button" class="tfc-ic" id="tfcInfo" aria-label=""><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>
          <button type="button" class="tfc-ic" id="tfcReset" aria-label=""><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
          <button type="button" class="tfc-ic" id="tfcClose" aria-label=""><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </header>
        <div class="tfc-msgs" id="tfcMsgs" role="log" aria-live="polite"></div>
        <form class="tfc-form" id="tfcForm" autocomplete="off">
          <input id="tfcIn" class="tfc-in" type="text" maxlength="200" enterkeyhint="send">
          <button type="submit" class="tfc-send" id="tfcSend"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
        </form>
      </section>`;
    document.body.appendChild(raiz);
    const $ = id => document.getElementById(id);
    const msgs = $('tfcMsgs'), entrada = $('tfcIn'), panel = $('tfChatPanel'), boton = $('tfChatBtn');

    // ---------------- estado de la conversación
    let modo = 'libre';          // libre | nombre | wa | email | codigo
    let cat = null, clave = null, lugarElegido = false;
    const datos = { nombre: '', wa: '', email: '' };
    let hilo = 0;                // sube al reiniciar: corta mensajes pendientes
    let ocupado = false;

    const bajar = () => { msgs.scrollTop = msgs.scrollHeight; };
    const espera = ms => new Promise(r => setTimeout(r, ms));
    function quitarOpciones() { msgs.querySelectorAll('.tfc-chips').forEach(c => c.remove()); }

    function burbuja(html, quien) {
        const d = document.createElement('div');
        d.className = 'tfc-row ' + quien;
        d.innerHTML = quien === 'bot' ? `<span class="tfc-av tfc-av-s" aria-hidden="true">TF</span><div class="tfc-b">${html}</div>` : `<div class="tfc-b">${html}</div>`;
        msgs.appendChild(d); bajar(); return d;
    }
    /** Mensajes del asistente, uno tras otro, con los puntitos de "escribiendo". Cada uno es texto con **negrita** o { html }. */
    async function decir(...lista) {
        const mio = hilo; ocupado = true; entrada.disabled = false;
        for (const m of lista) {
            if (mio !== hilo) return;
            const tipo = document.createElement('div');
            tipo.className = 'tfc-row bot tfc-typing';
            tipo.innerHTML = '<span class="tfc-av tfc-av-s" aria-hidden="true">TF</span><div class="tfc-b"><i></i><i></i><i></i></div>';
            msgs.appendChild(tipo); bajar();
            const html = typeof m === 'string' ? md(m) : m.html;
            await espera(Math.min(900, 350 + (html.length || 0) * 2));
            tipo.remove();
            if (mio !== hilo) return;
            burbuja(html, 'bot');
        }
        ocupado = false;
    }
    function usuario(texto) { burbuja(esc(texto), 'user'); }
    /** Opciones para tocar: [{ t, a (acción), v, href }]. Un enlace se abre en otra pestaña. */
    function opciones(lista) {
        quitarOpciones();
        const w = document.createElement('div');
        w.className = 'tfc-chips';
        w.innerHTML = lista.map(o => o.href
            ? `<a class="tfc-chip ${o.cls || ''}" href="${esc(o.href)}" ${/^https?:/.test(o.href) ? 'target="_blank" rel="noopener"' : ''}>${o.t}</a>`
            : `<button type="button" class="tfc-chip ${o.cls || ''}" data-a="${esc(o.a)}" data-v="${esc(o.v || '')}">${o.t}</button>`).join('');
        msgs.appendChild(w); bajar();
    }
    const T_ = k => esc(T(k));

    // ---------------- pasos
    function menuOpciones() {
        opciones([
            { t: `<i class="fa-solid fa-file-invoice-dollar"></i> ${T_('m_cotizar')}`, a: 'cotizar' },
            { t: `<i class="fa-solid fa-location-crosshairs"></i> ${T_('m_rastrear')}`, a: 'rastrear' },
            { t: `<i class="fa-solid fa-circle-question"></i> ${T_('m_faq')}`, a: 'faq' },
            { t: `<i class="fa-brands fa-whatsapp"></i> ${T_('m_persona')}`, a: 'persona' }
        ]);
    }
    async function bienvenida() {
        modo = 'libre'; cat = null; clave = null;
        await decir(T('hola'), T('digital'), T('ayuda'));
        menuOpciones();
    }
    async function menu(msg) { modo = 'libre'; if (msg) await decir(msg); else await decir(T('ayuda')); menuOpciones(); }

    async function cotizar() {
        modo = 'libre';
        if (lugarElegido) return categorias();
        await decir(T('donde'));
        opciones(Object.keys(PAISES).map(k => ({ t: `${PAISES[k].bandera} ${esc(tc('paises', k).nombre)}`, a: 'pais', v: k })));
    }
    async function categorias() {
        await decir(T('cat'));
        opciones(Object.keys(D.categorias).map(k => ({ t: `<i class="fa-solid ${D.categorias[k].icono}"></i> ${esc(tc('categorias', k).label)}`, a: 'cat', v: k })).concat([{ t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }]));
    }
    async function servicios(k) {
        cat = k;
        const lista = Object.keys(SERV).filter(x => SERV[x].category === k)
            .sort((a, b) => SERV[b].paises.includes(state.pais) - SERV[a].paises.includes(state.pais));
        await decir(T('serv', { cat: tc('categorias', k).label }));
        opciones(lista.map(x => ({ t: esc(tc('servicios', x).title), a: 'serv', v: x })).concat([{ t: T_('otra'), a: 'cotizar2', cls: 'tfc-chip-g' }]));
    }
    function fichaHtml(k) {
        const s = SERV[k], tr = tc('servicios', k), p = TF.precio(s), tm = TF.tiempo(k);
        const docs = D.checklists[k] ? tc('checklists', k) : null;
        const inc = (s.incluye || []).slice(0, 5);
        const ante = (s.inst || []).filter(i => D.instituciones[i]).map(i => D.instituciones[i].sigla).join(', ');
        return `<div class="tfc-card">
            <strong class="tfc-card-t">${esc(tr.title)}</strong>
            <p>${esc(tr.desc)}</p>
            <dl>
              <div><dt>${T_('total')}</dt><dd><b>${esc(money(p.total))}</b><small>${T_('totalNota')}</small></dd></div>
              <div><dt>${T_('hoy')}</dt><dd><b>${esc(money(p.hoy))}</b><small>${T_('hoyNota')}</small></dd></div>
              ${tm ? `<div><dt>${T_('tiempo')}</dt><dd>${esc(tm.txt)}</dd></div>` : ''}
              ${ante ? `<div><dt>${T_('ante')}</dt><dd>${esc(ante)}</dd></div>` : ''}
            </dl>
            ${inc.length ? `<h5>${T_('incluye')}</h5><ul>${inc.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            ${docs && docs.items.length ? `<h5>${T_('docs')}</h5><ul>${docs.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </div>`;
    }
    async function ficha(k) {
        clave = k; modo = 'libre';
        burbuja(fichaHtml(k), 'bot').classList.add('tfc-ancha');
        await espera(250);
        opciones([
            { t: `<i class="fa-solid fa-paper-plane"></i> ${T_('solicitar')}`, a: 'solicitar', cls: 'tfc-chip-p' },
            { t: T_('otro'), a: 'cotizar2' },
            { t: T_('detalle'), href: TF.servUrl(k) },
            { t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }
        ]);
    }
    async function pedirNombre() { modo = 'nombre'; await decir(T('elegido')); entrada.focus(); }

    const waOk = w => { const n = w.replace(/\D/g, '').length; return n >= 8 && n <= 15; };
    const mailOk = e => TF.contacto.correoValido(e);
    function resumenTexto(codigo) {
        const t = tc('servicios', clave).title;
        return [T('wahola', { t: '*' + t + '*' }), '', codigo ? `${codigo}` : null, `${T('r_nom')}: ${datos.nombre}`, `${T('r_wa')}: ${datos.wa}`, `${T('r_mail')}: ${datos.email}`, `${TF.lugar()}`].filter(x => x !== null).join('\n');
    }
    async function repaso() {
        modo = 'libre';
        await decir(T('repaso'));
        burbuja(`<ul class="tfc-res"><li><b>${T_('r_serv')}:</b> ${esc(tc('servicios', clave).title)}</li><li><b>${T_('r_nom')}:</b> ${esc(datos.nombre)}</li><li><b>${T_('r_wa')}:</b> ${esc(datos.wa)}</li><li><b>${T_('r_mail')}:</b> ${esc(datos.email)}</li></ul>`, 'bot');
        await decir(T('acepta'));
        opciones([
            { t: `<i class="fa-solid fa-check"></i> ${T_('c_enviar')}`, a: 'enviar', cls: 'tfc-chip-p' },
            { t: T_('c_corregir'), a: 'solicitar' },
            { t: `<i class="fa-brands fa-whatsapp"></i> ${T_('c_wa')}`, href: TF.waLink(resumenTexto()) }
        ]);
    }
    async function enviar() {
        quitarOpciones(); ocupado = true;
        const trabajo = document.createElement('div'); trabajo.className = 'tfc-row bot tfc-typing';
        trabajo.innerHTML = `<span class="tfc-av tfc-av-s" aria-hidden="true">TF</span><div class="tfc-b">${T_('enviando')}</div>`; msgs.appendChild(trabajo); bajar();
        const d = { nombre: datos.nombre, whatsapp: datos.wa, email: datos.email, contacto: [datos.wa, datos.email].join(' · '), pais: state.pais, servicio: clave,
            mensaje: 'Solicitud enviada desde el chat con ' + NOMBRE, acepta: true, web: '', moneda: state.moneda, idioma: state.lang, pais_detalle: state.detalle || '', express: false, envio: false };
        let codigo = null, fallo = false;
        try {
            if (!state.api) throw new Error('offline');
            const r = await TF.api('/solicitud', { method: 'POST', body: JSON.stringify(d) });
            codigo = r.codigo;
        } catch (e) { fallo = true; }
        trabajo.remove(); ocupado = false;
        if (fallo) {
            await decir(T('listoSin'));
            opciones([{ t: `<i class="fa-brands fa-whatsapp"></i> ${T_('c_abrirwa')}`, href: TF.waLink(resumenTexto()), cls: 'tfc-chip-p' }, { t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }]);
            return;
        }
        await decir(T('listo', { n: datos.nombre.split(' ')[0], c: codigo }), T('listo2'));
        opciones([
            { t: `<i class="fa-brands fa-whatsapp"></i> ${T_('c_abrirwa')}`, href: TF.waLink(resumenTexto(codigo)), cls: 'tfc-chip-p' },
            { t: `<i class="fa-solid fa-location-crosshairs"></i> ${T_('c_seguir')}`, href: '/rastreo?c=' + encodeURIComponent(codigo) },
            { t: T_('otro'), a: 'cotizar2' },
            { t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }
        ]);
    }

    async function pedirCodigo() { modo = 'codigo'; await decir(T('codigoPide')); entrada.focus(); }
    async function buscarCodigo(txt) {
        const code = txt.trim().toUpperCase().replace(/\s+/g, '');
        modo = 'libre'; let r = null;
        try {
            if (state.api) r = await TF.api('/rastreo/' + encodeURIComponent(code));
            else r = D.rastreo_demo[code] || null;
        } catch (e) { r = null; }
        if (!r) { await decir(T('noCodigo')); opciones([{ t: T_('otroCodigo'), a: 'rastrear' }, { t: `<i class="fa-brands fa-whatsapp"></i> ${T_('c_wagen')}`, href: TF.waLink(TF.saludo()) }, { t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }]); return; }
        burbuja(`<div class="tfc-card"><strong class="tfc-card-t">${esc(r.service)}</strong><dl><div><dt>${T_('estado')}</dt><dd><b>${esc(r.statusText)}</b></dd></div></dl><p>${esc(r.detail || '')}</p></div>`, 'bot').classList.add('tfc-ancha');
        await espera(200);
        opciones([{ t: T_('verTodo'), href: '/rastreo?c=' + encodeURIComponent(code), cls: 'tfc-chip-p' }, { t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }]);
    }

    let faqDesde = 0;
    async function faq(desde) {
        modo = 'libre'; faqDesde = desde || 0;
        const idx = D.faq.map((f, i) => i).slice(faqDesde, faqDesde + 5);
        if (!faqDesde) await decir(T('faqQ'));
        opciones(idx.map(i => ({ t: esc(tc('faq', i).q), a: 'faqr', v: String(i), cls: 'tfc-chip-l' }))
            .concat(faqDesde + 5 < D.faq.length ? [{ t: T_('masFaq'), a: 'faqmas' }] : [{ t: T_('todasFaq'), href: '/preguntas' }])
            .concat([{ t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }]));
    }
    async function faqRespuesta(i) {
        const f = tc('faq', i);
        await decir({ html: `<b>${esc(f.q)}</b><br>${esc(f.a)}` });
        opciones([{ t: T_('m_faq'), a: 'faq' }, { t: T_('m_cotizar'), a: 'cotizar' }, { t: `<i class="fa-brands fa-whatsapp"></i> ${T_('m_persona')}`, a: 'persona' }]);
    }
    async function persona() {
        modo = 'libre';
        await decir(T('persona'), T(TF.abierto() ? 'abierto' : 'cerrado'));
        opciones([
            { t: `<i class="fa-brands fa-whatsapp"></i> ${T_('c_wagen')}`, href: TF.waLink(TF.saludo()), cls: 'tfc-chip-p' },
            { t: `<i class="fa-solid fa-envelope"></i> ${T_('c_correo')}`, href: 'mailto:' + C.email },
            { t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }
        ]);
    }

    // ---------------- búsqueda por texto libre (solo con los datos del sitio)
    const limpia = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ');
    const PARO = new Set('de la el los las un una unos unas y o a en por para con del al que es mi me quiero necesito como cuanto cuesta tramite tramites hacer sacar pedir tengo busco quisiera puedo se lo'.split(' '));
    const SINON = { carro: 'vehicul', auto: 'vehicul', coche: 'vehicul', vehiculo: 'vehicul', casa: 'inmueble', apartamento: 'inmueble', terreno: 'inmueble', propiedad: 'inmueble', matrimonio: 'union', casarme: 'union', novia: 'solteria', soltero: 'solteria', soltera: 'solteria', papeles: 'acta', nacimiento: 'acta', licencia: 'licencia', conducir: 'licencia', pasaporte: 'pasaporte', visa: 'visa', schengen: 'visa', residencia: 'residencia', empresa: 'empresa', negocio: 'empresa', sociedad: 'srl', marca: 'onapi', nombre: 'nombre', titulo: 'titulo', universidad: 'titulo', tesis: 'turnitin', plagio: 'turnitin', web: 'web', pagina: 'web', multa: 'multa', impuesto: 'impuesto', hipoteca: 'hipoteca', traduccion: 'traduccion', traducir: 'traduccion', apostillar: 'apostilla', legalizar: 'legalizacion', poder: 'poder', divorcio: 'divorcio', cedula: 'cedula', menores: 'menores', hijo: 'menores', hija: 'menores' };
    function buscar(txt) {
        const q = limpia(txt).split(/\s+/).filter(w => w.length > 2 && !PARO.has(w));
        if (!q.length) return [];
        const claves = [...new Set(q.map(w => SINON[w] || w))];
        return Object.keys(SERV).map(k => {
            const tr = tc('servicios', k), tit = limpia(tr.title), des = limpia(tr.desc + ' ' + (SERV[k].incluye || []).join(' '));
            let n = 0; claves.forEach(w => { if (tit.includes(w)) n += 3; else if (des.includes(w)) n += 1; });
            return [k, n];
        }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    }
    function buscarFaq(txt) {
        const q = limpia(txt).split(/\s+/).filter(w => w.length > 3 && !PARO.has(w));
        if (!q.length) return -1;
        let mejor = -1, max = 1;
        D.faq.forEach((f, i) => { const t = tc('faq', i), h = limpia(t.q + ' ' + t.a); const n = q.filter(w => h.includes(w)).length; if (n > max) { max = n; mejor = i; } });
        return mejor;
    }
    async function libre(txt) {
        const l = limpia(txt).trim();
        if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hi|hello|hey|bonjour|salut)\b/.test(l) && l.split(' ').length <= 3) { await decir(T('saludoR')); menuOpciones(); return; }
        if (/\b(gracias|thanks|thank you|merci)\b/.test(l)) { await decir(T('gracias')); menuOpciones(); return; }
        if (/\b(rastre|seguimiento|codigo|track|suivi)/.test(l)) return pedirCodigo();
        if (/\b(humano|persona|asesor|agente|whatsapp|hablar|llamar|human|agent|person)\b/.test(l)) return persona();
        if (/\b(pregunta|preguntas|faq|dudas|question|questions)\b/.test(l)) return faq(0);
        const hall = buscar(txt);
        if (hall.length) {
            await decir(T('hallado'));
            opciones(hall.map(k => ({ t: esc(tc('servicios', k).title), a: 'serv', v: k })).concat([{ t: T_('m_menu'), a: 'menu', cls: 'tfc-chip-g' }]));
            return;
        }
        const f = buscarFaq(txt);
        if (f >= 0) { await decir(T('hallaFaq')); await faqRespuesta(f); return; }
        await decir(T('nada')); menuOpciones();
    }

    // ---------------- entrada de texto
    async function recibir(txt) {
        txt = txt.trim(); if (!txt) return;
        quitarOpciones(); usuario(txt);
        if (modo === 'nombre') {
            if (txt.replace(/[^\p{L}]/gu, '').length < 3) { await decir(T('e_nombre')); return; }
            datos.nombre = txt.slice(0, 80); modo = 'wa';
            await decir(T('wa', { n: datos.nombre.split(' ')[0] })); entrada.focus(); return;
        }
        if (modo === 'wa') {
            const w = TF.contacto.whatsapp(TF.contacto.prefijoInicial(), txt);
            if (!waOk(w)) { await decir(T('e_wa')); return; }
            datos.wa = w; modo = 'email'; await decir(T('email')); entrada.focus(); return;
        }
        if (modo === 'email') {
            if (!mailOk(txt)) { await decir(T('e_mail')); return; }
            datos.email = txt.slice(0, 120); return repaso();
        }
        if (modo === 'codigo') return buscarCodigo(txt);
        return libre(txt);
    }
    $('tfcForm').addEventListener('submit', e => { e.preventDefault(); if (ocupado && modo === 'libre') return; const v = entrada.value; entrada.value = ''; recibir(v); });

    // ---------------- toques en las opciones
    msgs.addEventListener('click', async e => {
        const b = e.target.closest('.tfc-chip[data-a]'); if (!b || ocupado) return;
        const a = b.dataset.a, v = b.dataset.v, texto = b.textContent.trim();
        usuario(texto); quitarOpciones();
        if (a === 'menu') return menu();
        if (a === 'cotizar') return cotizar();
        if (a === 'cotizar2') return categorias();
        if (a === 'pais') { lugarElegido = true; TF.setPais(v, { animate: false }); return categorias(); }
        if (a === 'cat') return servicios(v);
        if (a === 'serv') return ficha(v);
        if (a === 'solicitar') return pedirNombre();
        if (a === 'enviar') return enviar();
        if (a === 'rastrear') return pedirCodigo();
        if (a === 'faq') return faq(0);
        if (a === 'faqmas') return faq(faqDesde + 5);
        if (a === 'faqr') return faqRespuesta(+v);
        if (a === 'persona') return persona();
    });

    // ---------------- historial: la conversación sigue al cambiar de página (se guarda en esta pestaña y se borra al cerrarla)
    const GUARDA = 'tf_chat_v1';
    function guardar() {
        try {
            const c = msgs.cloneNode(true); c.querySelectorAll('.tfc-typing').forEach(x => x.remove());
            sessionStorage.setItem(GUARDA, JSON.stringify({ h: c.innerHTML, modo, cat, clave, lugar: lugarElegido, faqDesde, datos, abierto: !panel.hidden }));
        } catch (e) { /* sin almacenamiento: el chat funciona igual, sin memoria */ }
    }
    let pendiente = 0;
    new MutationObserver(() => { clearTimeout(pendiente); pendiente = setTimeout(guardar, 150); }).observe(msgs, { childList: true });
    window.addEventListener('pagehide', guardar);

    // ---------------- abrir, cerrar, reiniciar
    let iniciado = false;
    function abrir() {
        panel.hidden = false; raiz.classList.add('is-open'); boton.setAttribute('aria-expanded', 'true'); setTimeout(guardar, 0);
        TF.evento && TF.evento('chat_abierto', {});
        if (!iniciado) { iniciado = true; bienvenida(); }
        setTimeout(() => entrada.focus({ preventScroll: true }), 50);
    }
    function cerrar() { panel.hidden = true; raiz.classList.remove('is-open'); boton.setAttribute('aria-expanded', 'false'); boton.focus({ preventScroll: true }); guardar(); }
    function reiniciar() { hilo++; ocupado = false; msgs.innerHTML = ''; Object.assign(datos, { nombre: '', wa: '', email: '' }); lugarElegido = false; bienvenida(); }
    boton.addEventListener('click', () => (panel.hidden ? abrir() : cerrar()));
    $('tfcClose').addEventListener('click', cerrar);
    $('tfcReset').addEventListener('click', reiniciar);
    $('tfcInfo').addEventListener('click', () => { quitarOpciones(); decir(T('infoTxt')).then(menuOpciones); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) cerrar(); });
    // Enlaces del chat a otra parte de la misma página: se cierra el chat
    msgs.addEventListener('click', e => { const a = e.target.closest('a[href^="/"]'); if (a) cerrar(); });

    function textos() {
        boton.querySelector('.tfc-btn-txt').textContent = T('abrir');
        boton.setAttribute('aria-label', T('abrir'));
        raiz.querySelector('.tfc-sub').textContent = T('sub');
        $('tfcInfo').setAttribute('aria-label', T('info')); $('tfcInfo').title = T('info');
        $('tfcReset').setAttribute('aria-label', T('reiniciar')); $('tfcReset').title = T('reiniciar');
        $('tfcClose').setAttribute('aria-label', T('cerrar')); $('tfcClose').title = T('cerrar');
        entrada.placeholder = T('escribe'); entrada.setAttribute('aria-label', T('escribe'));
        $('tfcSend').setAttribute('aria-label', T('enviar'));
    }
    textos();
    TF.on('lang', textos);
    // Si había una conversación en esta pestaña, se retoma donde quedó
    try {
        const g = JSON.parse(sessionStorage.getItem(GUARDA) || 'null');
        if (g && g.h) {
            msgs.innerHTML = g.h; modo = g.modo || 'libre'; cat = g.cat || null; clave = g.clave || null; lugarElegido = !!g.lugar; faqDesde = g.faqDesde || 0;
            Object.assign(datos, g.datos || {}); iniciado = true;
            if (modo === 'libre' && !msgs.querySelector('.tfc-chips:last-child')) menuOpciones();
            if (g.abierto) { panel.hidden = false; raiz.classList.add('is-open'); boton.setAttribute('aria-expanded', 'true'); requestAnimationFrame(bajar); }
        }
    } catch (e) { /* conversación guardada dañada: se empieza de cero */ }
    window.TF_CHAT = { abrir, cerrar };
    if (location.hash === '#chat') abrir();
})();
