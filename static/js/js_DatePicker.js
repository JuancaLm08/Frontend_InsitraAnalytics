/* =========================================================================================
   INSITRA ANALYTICS — CALENDARIO PROPIO
   Reemplaza el desplegable nativo del navegador en todos los <input type="date">.

   Decisiones importantes:
   - El input SIGUE siendo type="date". Su .value conserva el formato ISO (YYYY-MM-DD),
     así que validarRangoFechas(), inicializarFechas() y los listeners de 'change'
     existentes no cambian ni una línea.
   - El icono nativo se oculta por CSS y se dibuja uno propio como background-image,
     por eso no hizo falta tocar el HTML de Totales/Unidades/Ruta.
   - No se bloquea el foco: se puede seguir escribiendo la fecha con el teclado.
     Solo se intercepta Alt+Flecha abajo, que es como Chrome abre su calendario.
   ========================================================================================= */

(function () {
    'use strict';

    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                          'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // 1 = la semana empieza en lunes. Cambia a 0 si prefieres domingo.
    const PRIMER_DIA_SEMANA = 1;
    const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

    let panel = null;
    let inputActivo = null;
    let mesVisible = null;      // Date apuntando al día 1 del mes mostrado
    let vistaMeses = false;

    /* ------------------------------- utilidades de fecha ------------------------------- */
    const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    function desdeISO(s) {
        if (!s) return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return isNaN(d) ? null : d;
    }

    const mismoDia = (a, b) => a && b && a.getFullYear() === b.getFullYear() &&
                               a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    function fueraDeRango(fecha, input) {
        const min = desdeISO(input.getAttribute('min'));
        const max = desdeISO(input.getAttribute('max'));
        if (min && fecha < min) return true;
        if (max && fecha > max) return true;
        return false;
    }

    /* ------------------------------- construcción del panel ------------------------------- */
    function crearPanel() {
        panel = document.createElement('div');
        panel.className = 'dp-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Seleccionar fecha');
        panel.innerHTML = `
            <div class="dp-head">
                <button type="button" class="dp-nav" data-dp="prev" aria-label="Anterior">
                    <svg viewBox="0 0 24 24"><polyline points="15 6 9 12 15 18"/></svg>
                </button>
                <button type="button" class="dp-titulo" data-dp="vista"></button>
                <button type="button" class="dp-nav" data-dp="next" aria-label="Siguiente">
                    <svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg>
                </button>
            </div>
            <div class="dp-semana"></div>
            <div class="dp-grid"></div>
            <div class="dp-pie">
                <button type="button" class="dp-accion" data-dp="hoy">Hoy</button>
            </div>`;
        document.body.appendChild(panel);

        // Evita que el mousedown dentro del panel cierre el panel o quite el foco
        panel.addEventListener('mousedown', (e) => e.preventDefault());
        panel.addEventListener('click', alClicEnPanel);
    }

    function alClicEnPanel(e) {
        const btn = e.target.closest('[data-dp]');
        if (!btn) return;
        const accion = btn.dataset.dp;

        if (accion === 'prev' || accion === 'next') {
            const paso = accion === 'prev' ? -1 : 1;
            if (vistaMeses) mesVisible.setFullYear(mesVisible.getFullYear() + paso);
            else mesVisible.setMonth(mesVisible.getMonth() + paso);
            dibujar();
        } else if (accion === 'vista') {
            vistaMeses = !vistaMeses;
            dibujar();
        } else if (accion === 'mes') {
            mesVisible.setMonth(Number(btn.dataset.valor));
            vistaMeses = false;
            dibujar();
        } else if (accion === 'dia') {
            aplicar(desdeISO(btn.dataset.valor));
        } else if (accion === 'hoy') {
            const hoy = new Date();
            if (fueraDeRango(hoy, inputActivo)) {
                mesVisible = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                vistaMeses = false;
                dibujar();
            } else {
                aplicar(hoy);
            }
        }
    }

    /* ------------------------------- pintado ------------------------------- */
    function dibujar() {
        const titulo = panel.querySelector('.dp-titulo');
        const semana = panel.querySelector('.dp-semana');
        const grid = panel.querySelector('.dp-grid');

        if (vistaMeses) {
            titulo.textContent = mesVisible.getFullYear();
            semana.innerHTML = '';
            semana.style.display = 'none';
            grid.className = 'dp-grid dp-grid--meses';
            grid.innerHTML = MESES_CORTOS.map((m, i) =>
                `<button type="button" class="dp-mes${i === mesVisible.getMonth() ? ' es-actual' : ''}" data-dp="mes" data-valor="${i}">${m}</button>`
            ).join('');
            return;
        }

        titulo.textContent = `${MESES[mesVisible.getMonth()]} ${mesVisible.getFullYear()}`;
        semana.style.display = '';
        semana.innerHTML = Array.from({ length: 7 }, (_, i) =>
            `<span>${DIAS[(i + PRIMER_DIA_SEMANA) % 7]}</span>`
        ).join('');

        const anio = mesVisible.getFullYear();
        const mes = mesVisible.getMonth();
        const primero = new Date(anio, mes, 1);
        const desplazamiento = (primero.getDay() - PRIMER_DIA_SEMANA + 7) % 7;
        const inicio = new Date(anio, mes, 1 - desplazamiento);

        const hoy = new Date();
        const elegido = desdeISO(inputActivo.value);

        let html = '';
        for (let i = 0; i < 42; i++) {
            const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
            const otroMes = d.getMonth() !== mes;
            const deshabilitado = fueraDeRango(d, inputActivo);
            const clases = ['dp-dia'];
            if (otroMes) clases.push('es-otro-mes');
            if (mismoDia(d, hoy)) clases.push('es-hoy');
            if (mismoDia(d, elegido)) clases.push('es-elegido');
            html += `<button type="button" class="${clases.join(' ')}" data-dp="dia" data-valor="${aISO(d)}"${deshabilitado ? ' disabled' : ''}>${d.getDate()}</button>`;
        }
        grid.className = 'dp-grid';
        grid.innerHTML = html;
    }

    /* ------------------------------- abrir / cerrar / aplicar ------------------------------- */
    function posicionar() {
        const r = inputActivo.getBoundingClientRect();
        const alto = panel.offsetHeight || 320;
        const ancho = panel.offsetWidth || 268;

        // Debajo del input salvo que no quepa; nunca fuera de la ventana
        let top = r.bottom + window.scrollY + 6;
        if (r.bottom + alto + 12 > window.innerHeight && r.top - alto - 6 > 0) {
            top = r.top + window.scrollY - alto - 6;
        }
        let left = r.left + window.scrollX;
        left = Math.min(left, window.scrollX + window.innerWidth - ancho - 10);
        left = Math.max(left, window.scrollX + 8);

        panel.style.top = `${top}px`;
        panel.style.left = `${left}px`;
    }

    function abrir(input) {
        if (!panel) crearPanel();
        inputActivo = input;
        vistaMeses = false;
        const actual = desdeISO(input.value) || new Date();
        mesVisible = new Date(actual.getFullYear(), actual.getMonth(), 1);

        panel.classList.add('esta-abierto');
        dibujar();
        posicionar();
    }

    function cerrar() {
        if (panel) panel.classList.remove('esta-abierto');
        inputActivo = null;
    }

    function aplicar(fecha) {
        if (!inputActivo || !fecha || fueraDeRango(fecha, inputActivo)) return;
        const input = inputActivo;
        input.value = aISO(fecha);
        // Mismos eventos que dispararía el calendario nativo
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        cerrar();
    }

    /* ------------------------------- enganche a los inputs ------------------------------- */
    function preparar(input) {
        if (input.dataset.dpListo) return;
        input.dataset.dpListo = '1';

        // El panel propio es la única vía de edición. Marcar el input como
        // readOnly evita que Firefox (con -moz-appearance: textfield) permita
        // teclear una fecha en un formato que rompa el contrato ISO, y que
        // abra su propio calendario. .value se sigue fijando desde aplicar(),
        // que dispara los eventos input/change igual que el calendario nativo.
        input.readOnly = true;

        input.addEventListener('click', () => abrir(input));

        // Abrir también con teclado (Enter / flecha abajo) para accesibilidad
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { cerrar(); return; }
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
                e.preventDefault();
                abrir(input);
            }
        });

        input.addEventListener('blur', () => {
            // El panel hace preventDefault en mousedown, así que un clic dentro no llega aquí
            setTimeout(() => { if (inputActivo === input && !panel.contains(document.activeElement)) cerrar(); }, 0);
        });
    }

    function escanear(raiz) {
        (raiz || document).querySelectorAll('input[type="date"]').forEach(preparar);
    }

    document.addEventListener('DOMContentLoaded', () => {
        escanear();
        // Secciones que se llenan por JS después de cargar
        new MutationObserver((muts) => {
            muts.forEach(m => m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                if (n.matches && n.matches('input[type="date"]')) preparar(n);
                else escanear(n);
            }));
        }).observe(document.body, { childList: true, subtree: true });
    });

    document.addEventListener('mousedown', (e) => {
        if (!panel || !panel.classList.contains('esta-abierto')) return;
        if (panel.contains(e.target) || e.target === inputActivo) return;
        cerrar();
    });

    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', cerrar, true);
})();