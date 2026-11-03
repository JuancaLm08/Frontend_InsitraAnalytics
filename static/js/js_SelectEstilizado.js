/* ==========================================================================================
   INSITRA ANALYTICS — SELECTOR ESTILIZADO (compartido)

   La lista desplegable de un <select> nativo la dibuja el navegador y no se puede estilizar.
   Este componente pone encima un botón + panel propios, pero deja el <select> en el DOM,
   oculto, como ÚNICA fuente de verdad:
     - El código de cada sección sigue leyendo/escribiendo select.value y select.innerHTML.
     - Al elegir una opción se fija select.value y se dispara 'change', como haría el nativo.
     - Si el código cambia las opciones o el valor por su cuenta, llama a syncSelect(select)
       para repintar el botón (cambiar .value no dispara ningún evento que podamos escuchar).

   Uso:
     mejorarSelect(document.getElementById('mi-select'), {
         buscador:     'auto',      // true = siempre | false = nunca | 'auto' = si hay > minBuscador
         minBuscador:  8,
         placeholder:  'Buscar…',   // placeholder del buscador
         ocultarVacio: false        // true: la opción value="" no se lista (es un "Selecciona…")
     });
     syncSelect('mi-select');       // acepta id o elemento

   Teclado: ↑/↓ mueven, Enter elige, Esc cierra, Inicio/Fin, Tab sale; escribir abre y filtra.
   Primero lo usó Viajes; Polígono de Carga lo reutiliza.
   ========================================================================================== */

(function () {
    'use strict';

    const ICONO_CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
    const ICONO_LUPA    = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';
    const ICONO_CHECK   = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="5 12 10 17 19 7"/></svg>';

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
    const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    let contador = 0;

    function mejorarSelect(select, { buscador = 'auto', placeholder = 'Buscar…', minBuscador = 8, ocultarVacio = false } = {}) {
        if (!select || select._selSync) return;

        if (!select.id) select.id = `sel-est-${++contador}`;
        const idLista = `${select.id}-lista`;

        const raiz = document.createElement('div');
        raiz.className = 'sel-est';
        raiz.innerHTML = `
            <button type="button" class="sel-est-boton" role="combobox" aria-haspopup="listbox"
                    aria-expanded="false" aria-controls="${idLista}" id="${select.id}-boton">
                <span class="sel-est-valor"></span>
                <span class="sel-est-chevron">${ICONO_CHEVRON}</span>
            </button>
            <div class="sel-est-panel" hidden>
                <div class="sel-est-buscador">
                    ${ICONO_LUPA}
                    <input type="text" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"
                           aria-controls="${idLista}">
                </div>
                <ul class="sel-est-lista" id="${idLista}" role="listbox"></ul>
            </div>`;
        select.after(raiz);
        select.classList.add('sel-est-nativo');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');

        const boton = raiz.querySelector('.sel-est-boton');
        const valor = raiz.querySelector('.sel-est-valor');
        const panel = raiz.querySelector('.sel-est-panel');
        const caja  = raiz.querySelector('.sel-est-buscador');
        const input = caja.querySelector('input');
        const lista = raiz.querySelector('.sel-est-lista');

        // El <label for="..."> apuntaba al select oculto: ahora enfoca el botón
        const etiqueta = document.querySelector(`label[for="${select.id}"]`);
        if (etiqueta) etiqueta.htmlFor = boton.id;

        let visibles = [];
        let resaltado = -1;

        const opciones = () => [...select.options]
            .filter(o => !(ocultarVacio && o.value === ''))
            .map(o => ({ value: o.value, label: o.textContent }));
        const usaBuscador = () => buscador === true || (buscador === 'auto' && opciones().length > minBuscador);

        function sync() {
            const sel = select.options[select.selectedIndex];
            valor.textContent = sel ? sel.textContent : '';
            const vacio = !select.value;
            boton.classList.toggle('sel-est-filtrado', !vacio && !ocultarVacio);  // filtro activo (≠ "Todas")
            boton.classList.toggle('sel-est-placeholder', vacio && ocultarVacio); // "Selecciona…" en tenue
            boton.disabled = select.disabled;
            if (!panel.hidden) pintarLista();
        }

        function pintarLista() {
            const q = normalizar(input.value.trim());
            visibles = opciones().filter(o => !q || o.value === '' || normalizar(o.label).includes(q));
            if (resaltado >= visibles.length) resaltado = visibles.length - 1;

            lista.innerHTML = visibles.length
                ? visibles.map((o, i) => {
                    const activo = o.value === select.value;
                    return `<li role="option" id="${idLista}-${i}" data-i="${i}" aria-selected="${activo}"
                                class="sel-est-op${activo ? ' es-activo' : ''}${i === resaltado ? ' es-resaltado' : ''}${o.value === '' ? ' es-todas' : ''}">
                                <span>${esc(o.label)}</span>${activo ? ICONO_CHECK : ''}
                            </li>`;
                }).join('')
                : '<li class="sel-est-vacio">Sin resultados</li>';

            const actual = lista.querySelector('.es-resaltado');
            boton.setAttribute('aria-activedescendant', actual ? actual.id : '');
            if (actual) actual.scrollIntoView({ block: 'nearest' });
        }

        function abrir() {
            if (!panel.hidden || boton.disabled) return;
            document.querySelectorAll('.sel-est.esta-abierto').forEach(r => r._selCerrar && r._selCerrar());
            input.value = '';
            caja.hidden = !usaBuscador();
            resaltado = Math.max(0, opciones().findIndex(o => o.value === select.value));
            panel.hidden = false;
            raiz.classList.add('esta-abierto');
            boton.setAttribute('aria-expanded', 'true');
            pintarLista();
            if (!caja.hidden) input.focus();
        }

        function cerrar(devolverFoco = false) {
            if (panel.hidden) return;
            panel.hidden = true;
            raiz.classList.remove('esta-abierto');
            boton.setAttribute('aria-expanded', 'false');
            boton.removeAttribute('aria-activedescendant');
            if (devolverFoco) boton.focus();
        }
        raiz._selCerrar = cerrar;

        function elegir(i) {
            const o = visibles[i];
            if (!o) return;
            const cambio = select.value !== o.value;
            select.value = o.value;
            sync();
            cerrar(true);
            if (cambio) select.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function teclas(e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (panel.hidden) { abrir(); return; }
                const d = e.key === 'ArrowDown' ? 1 : -1;
                resaltado = Math.min(visibles.length - 1, Math.max(0, resaltado + d));
                pintarLista();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (panel.hidden) abrir(); else elegir(resaltado);
            } else if (e.key === 'Escape') {
                if (!panel.hidden) { e.preventDefault(); e.stopPropagation(); cerrar(true); }
            } else if (e.key === 'Tab') {
                cerrar();
            } else if (e.key === 'Home' || e.key === 'End') {
                if (panel.hidden) return;
                e.preventDefault();
                resaltado = e.key === 'Home' ? 0 : visibles.length - 1;
                pintarLista();
            }
        }

        boton.addEventListener('click', () => (panel.hidden ? abrir() : cerrar()));
        boton.addEventListener('keydown', (e) => {
            if (e.key === ' ' && panel.hidden) { e.preventDefault(); abrir(); return; }
            // Escribir con el botón enfocado abre el buscador con esa letra
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && usaBuscador()) {
                abrir(); input.value = e.key; resaltado = 0; pintarLista(); e.preventDefault(); return;
            }
            teclas(e);
        });
        input.addEventListener('keydown', teclas);
        input.addEventListener('input', () => { resaltado = 0; pintarLista(); });

        // mousedown (no click) para que el input no pierda el foco antes de elegir
        lista.addEventListener('mousedown', (e) => {
            const li = e.target.closest('li[data-i]');
            if (!li) return;
            e.preventDefault();
            elegir(Number(li.dataset.i));
        });
        lista.addEventListener('mousemove', (e) => {
            const li = e.target.closest('li[data-i]');
            if (!li || Number(li.dataset.i) === resaltado) return;
            resaltado = Number(li.dataset.i);
            lista.querySelectorAll('.es-resaltado').forEach(x => x.classList.remove('es-resaltado'));
            li.classList.add('es-resaltado');
        });

        document.addEventListener('mousedown', (e) => { if (!raiz.contains(e.target)) cerrar(); });

        select._selSync = sync;
        sync();
    }

    function syncSelect(ref) {
        const s = typeof ref === 'string' ? document.getElementById(ref) : ref;
        if (s && s._selSync) s._selSync();
    }

    window.mejorarSelect = mejorarSelect;
    window.syncSelect = syncSelect;
})();
