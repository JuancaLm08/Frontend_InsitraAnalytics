/* ==========================================================================
   INSITRA ANALYTICS — BUSCADOR EN LOS MULTISELECT
   Añade un campo de búsqueda dentro de cada .options-list para filtrar
   unidades escribiendo, en vez de recorrer la lista con el ratón.

   Es aditivo: NO toca js_Unidades.js ni js_Horaria.js. Se engancha con un
   MutationObserver, así que también funciona cuando la lista se repuebla al
   cambiar de corredor, y cubre igual el selector de Unidades y el de Horaria.

   Teclado:
     - Al abrir la lista el foco entra solo en el buscador.
     - ↑ / ↓  mueven el resaltado.
     - Enter   selecciona o quita la unidad resaltada (sin cerrar la lista).
     - Esc     limpia el filtro; si ya está vacío, cierra la lista.
   ========================================================================== */
(function () {
    'use strict';

    const ICONO_LUPA =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/>' +
        '<line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';

    const normalizar = s => (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');   // ignora acentos

    /* ------------------------------------------------------------------ */
    function montar(lista) {
        if (lista.querySelector(':scope > .ms-buscador')) return;

        const caja = document.createElement('div');
        caja.className = 'ms-buscador';
        caja.innerHTML = ICONO_LUPA +
            '<input type="text" placeholder="Buscar unidad…" autocomplete="off" spellcheck="false">' +
            '<span class="ms-buscador-contador"></span>';

        // Se inserta arriba del todo, sin borrar las opciones ya renderizadas
        lista.insertBefore(caja, lista.firstChild);

        const input = caja.querySelector('input');
        const contador = caja.querySelector('.ms-buscador-contador');

        // Que el clic en el buscador no llegue a los handlers que cierran la lista
        caja.addEventListener('click', e => e.stopPropagation());
        caja.addEventListener('mousedown', e => e.stopPropagation());

        function opciones() {
            return Array.from(lista.querySelectorAll(':scope > .option'));
        }

        function visibles() {
            return opciones().filter(o => o.style.display !== 'none');
        }

        function filtrar() {
            const q = normalizar(input.value.trim());
            const todas = opciones();
            let n = 0;

            todas.forEach(o => {
                const coincide = !q || normalizar(o.textContent).includes(q);
                o.style.display = coincide ? '' : 'none';
                o.classList.remove('ms-resaltado');
                if (coincide) n++;
            });

            contador.textContent = q ? `${n}/${todas.length}` : '';

            let vacio = lista.querySelector(':scope > .ms-sin-resultados');
            if (n === 0 && todas.length) {
                if (!vacio) {
                    vacio = document.createElement('div');
                    vacio.className = 'ms-sin-resultados';
                    vacio.textContent = 'Ninguna unidad coincide';
                    lista.appendChild(vacio);
                }
            } else if (vacio) {
                vacio.remove();
            }

            const primera = visibles()[0];
            if (primera) primera.classList.add('ms-resaltado');
        }

        function mover(paso) {
            const vis = visibles();
            if (!vis.length) return;
            const actual = vis.findIndex(o => o.classList.contains('ms-resaltado'));
            const siguiente = Math.max(0, Math.min(vis.length - 1, (actual < 0 ? 0 : actual + paso)));
            vis.forEach(o => o.classList.remove('ms-resaltado'));
            vis[siguiente].classList.add('ms-resaltado');
            vis[siguiente].scrollIntoView({ block: 'nearest' });
        }

        input.addEventListener('input', filtrar);

        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); mover(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                const marcada = lista.querySelector(':scope > .option.ms-resaltado');
                // Se reutiliza el onclick original de la opción: la lógica de
                // selección sigue viviendo en js_Unidades.js / js_Horaria.js
                if (marcada) marcada.click();
            } else if (e.key === 'Escape') {
                if (input.value) {
                    e.stopPropagation();
                    input.value = '';
                    filtrar();
                } // si ya está vacío, dejamos que el Esc siga su camino
            }
        });

        lista._msFiltrar = filtrar;
        lista._msInput = input;
        filtrar();
    }

    /* --------- foco automático cuando la lista se hace visible --------- */
    function vigilarApertura(lista) {
        if (lista.dataset.msVigilada === '1') return;
        lista.dataset.msVigilada = '1';

        new MutationObserver(() => {
            const abierta = lista.style.display === 'block';
            if (abierta && lista._msInput) {
                // pequeño retraso: el clic que abre la lista aún está en curso
                setTimeout(() => lista._msInput.focus({ preventScroll: true }), 10);
            } else if (!abierta && lista._msInput && lista._msInput.value) {
                lista._msInput.value = '';
                if (lista._msFiltrar) lista._msFiltrar();
            }
        }).observe(lista, { attributes: true, attributeFilter: ['style'] });
    }

    /* --------- re-montar cuando la lista se repuebla --------- */
    function vigilarContenido(lista) {
        if (lista.dataset.msContenido === '1') return;
        lista.dataset.msContenido = '1';

        const obs = new MutationObserver(() => {
            // cargarListaBuses() hace innerHTML = '' y vuelve a llenar: hay que
            // reinyectar el buscador. El guard de montar() evita el bucle.
            if (!lista.querySelector(':scope > .ms-buscador') && lista.querySelector(':scope > .option')) {
                obs.disconnect();
                montar(lista);
                obs.observe(lista, { childList: true });
            }
        });
        obs.observe(lista, { childList: true });
    }

    function escanear() {
        document.querySelectorAll('.options-list').forEach(lista => {
            vigilarContenido(lista);
            vigilarApertura(lista);
            if (lista.querySelector(':scope > .option')) montar(lista);
        });
    }

    document.addEventListener('DOMContentLoaded', escanear);
    window.InsitraMultiselect = { escanear };
})();