/* ==========================================================================================
   INSITRA ANALYTICS — SECCIÓN POLÍGONO DE CARGA

   UNA consulta (/api/poligono-carga-data) alimenta las dos pestañas:
     - Por franja horaria:   franjas[] → slider + gráfica por estación; variaciones[] → anotaciones
     - Por estación maestra: estaciones_maestras[] → tarjetas + comportamiento de la estación en el día

   Decisiones:
   - Filtros arriba de las pestañas y compartidos: los datos de ambas salen de la misma respuesta,
     así que no tiene sentido tener dos juegos de filtros que se puedan desincronizar.
   - Las gráficas se dibujan solo cuando su pestaña está visible. Plotly mide el contenedor al
     dibujar: en una pestaña oculta (display:none) mide 0 px y la gráfica sale aplastada.
     Si la pestaña está oculta se marca "pendiente" y se dibuja al abrirla.
   - Una consulta nueva cancela a la anterior (AbortController + token), como en Viajes.
   ========================================================================================== */

/**************************************************************************************************/
// ESTADO
/**************************************************************************************************/
const _pc = {
    token: 0,
    ctrl: null,
    ruta: null,              // id de la ruta consultada
    rutaNombre: null,        // "Mercados → Santiago"
    franjasPorHora: {},      // "06:00-07:00" -> estaciones[]
    franjaInfo: {},          // "06:00-07:00" -> {n_viajes, variacion_id, descripcion?}
    variaciones: {},         // variacion_id -> {descripcion, es_principal, n_viajes, n_poligonos}
    maestras: [],            // estaciones_maestras[]
    maestraSel: -1,          // índice de la tarjeta elegida
    graficaFranjaLista: false,
    pendiente: { franja: false, maestra: false },
    listo: false
};

/**************************************************************************************************/
// PALETA Y LAYOUT
/**************************************************************************************************/
function _pc_paleta() {
    const css = getComputedStyle(document.body);
    const v = (n, f) => css.getPropertyValue(n).trim() || f;
    return {
        ascensos:     v('--accent-solido', '#C1226B'),
        descensos:    v('--serie-descensos', '#5B8FD6'),
        ocupacion:    v('--serie-ocupacion', '#3A9A5B'),
        maestra:      v('--maestra', '#F4C542'),
        maestraBanda: v('--maestra-banda', 'rgba(244, 197, 66, 0.18)')
    };
}

/* Layout compartido por las dos gráficas de la sección */
function _pc_layout({ rangoY = null, tickangle = -45, marginB = 110 } = {}) {
    const t = temaGrafica();
    const p = _pc_paleta();

    return {
        barmode: 'group',
        bargap: 0.35,
        bargroupgap: 0.15,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: t.suave, family: "'Orbitron', sans-serif", size: 11 },
        xaxis: {
            tickangle: tickangle,
            tickfont: { size: 9, color: t.suave },
            showgrid: false,
            zeroline: false,
            showline: false,
            ticks: '',
            automargin: true
        },
        yaxis: {
            title: null,
            range: rangoY,
            showgrid: true,
            gridcolor: t.grid,
            gridwidth: 1,
            zeroline: false,
            showline: false,
            ticks: '',
            tickfont: { size: 10, color: t.suave },
            nticks: 5,
            automargin: true
        },
        legend: {
            orientation: 'h',
            y: 1.12, x: 0.5, xanchor: 'center',
            font: { size: 10, color: t.suave }
        },
        margin: { t: 34, r: 14, b: marginB, l: 44 },
        hoverlabel: {
            bgcolor: t.superficie,
            bordercolor: conAlpha(p.ascensos, 0.5),
            font: { color: t.texto, family: "'Orbitron', sans-serif", size: 11 },
            align: 'left'
        }
    };
}

const _PC_PLOTLY_CONFIG = {
    responsive: true,
    displaylogo: false,
    displayModeBar: 'hover',
    modeBarButtonsToRemove: ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'autoScale2d']
};

/**************************************************************************************************/
// TOPE DEL EJE Y: redondeado a un número "bonito" (1, 2, 2.5, 5 × 10^k) para que las marcas
// del eje queden limpias (0, 10, 20, 30, 40) en vez de 0, 7.3, 14.6…
/**************************************************************************************************/
function _pc_topeEje(maximo) {
    const m = Math.max(Number(maximo) || 0, 0) * 1.08;   // 8 % de aire arriba
    if (m <= 5) return { tope: 5, paso: 1 };               // casi vacío: escala mínima legible
    const pasoCrudo = m / 4;                               // ~4 divisiones
    const mag = Math.pow(10, Math.floor(Math.log10(pasoCrudo)));
    const paso = [1, 2, 2.5, 5, 10].map(f => f * mag).find(p => p >= pasoCrudo);
    return { tope: Math.ceil(m / paso) * paso, paso };
}

/**************************************************************************************************/
// UTILIDADES
/**************************************************************************************************/
function _pc_escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const _pc_hh = (h) => String(h).padStart(2, '0');
const _pc_fmt = (n, dec = 2) => (n === null || n === undefined) ? '–'
    : Number(n).toLocaleString('es-MX', { maximumFractionDigits: dec });

function _pc_tabActiva() {
    const b = document.querySelector('#section-poligono-carga .tab-btn.active');
    return b ? b.dataset.tab : 'franja-horaria';
}

function _pc_toggleLoader(mostrar) {
    const loader = document.getElementById('loader-poligono-carga');
    if (loader) loader.style.display = mostrar ? 'flex' : 'none';
    // "animations" vive en js_Sidebar.js (mismo scope global de scripts clásicos)
    if (typeof animations !== 'undefined' && animations['loader-poligono-carga']) {
        if (mostrar) animations['loader-poligono-carga'].play();
        else animations['loader-poligono-carga'].stop();
    }
}

function _pc_banner(msj) {
    const banner = document.getElementById('no-data-banner-poligono-carga');
    if (!banner) return;
    banner.textContent = msj || '';
    banner.style.display = msj ? 'block' : 'none';
}

/**************************************************************************************************/
// FECHA: MÁXIMO Y PRESET EN AYER (el job procesa ayer/antier; hoy nunca tiene datos)
/**************************************************************************************************/
function setMaxFechaAyer() {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const fechaAyer = `${ayer.getFullYear()}-${_pc_hh(ayer.getMonth() + 1)}-${_pc_hh(ayer.getDate())}`;
    const input = document.getElementById('fecha-franja');
    input.max = fechaAyer;
    if (!input.value || input.value > fechaAyer) input.value = fechaAyer;
}

/**************************************************************************************************/
// RUTAS DEL CORREDOR
/**************************************************************************************************/
async function cargarRutasPoligono(groupId) {
    try {
        const resp = await fetch(`/api/poligono-carga/rutas?groupid=${groupId}`);
        const data = await resp.json();
        llenarSelectoresRuta((data && data.success && Array.isArray(data.rutas)) ? data.rutas : []);
    } catch (e) {
        console.error('Error cargando rutas de polígono:', e);
        llenarSelectoresRuta([]);
    }
}

function llenarSelectoresRuta(rutas) {
    const select = document.getElementById('ruta-franja');
    const previo = select.value;
    select.innerHTML = '<option value="">Selecciona una ruta</option>';
    rutas.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.nombre;
        select.appendChild(opt);
    });
    select.value = rutas.some(r => String(r.id) === previo) ? previo : '';
    if (typeof syncSelect === 'function') syncSelect(select);
}

/**************************************************************************************************/
// PESTAÑAS
/**************************************************************************************************/
function inicializarTabs() {
    document.querySelectorAll('#section-poligono-carga .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#section-poligono-carga .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#section-poligono-carga .tab-content').forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
            _pc_dibujarPendientes();
        });
    });
}

// Dibuja (o redimensiona) la gráfica de la pestaña que se acaba de mostrar
function _pc_dibujarPendientes() {
    const tab = _pc_tabActiva();
    if (tab === 'franja-horaria' && _pc.pendiente.franja) {
        const slider = document.getElementById('slider-hora');
        _pc_mostrarFranja(parseInt(slider.value, 10));
    } else if (tab === 'estacion-maestra' && _pc.pendiente.maestra && _pc.maestraSel >= 0) {
        renderizarDetalleEstacion(_pc.maestras[_pc.maestraSel]);
    }
    const id = tab === 'franja-horaria' ? 'chart-poligono-franja' : 'chart-detalle-estacion';
    const g = document.getElementById(id);
    if (g && g.data) Plotly.Plots.resize(g);
}

/**************************************************************************************************/
// SLIDER DE HORAS
/**************************************************************************************************/
function inicializarSlider(hora_inicio, hora_fin) {
    let slider = document.getElementById('slider-hora');
    slider.replaceWith(slider.cloneNode(true));          // quita listeners de consultas previas
    slider = document.getElementById('slider-hora');

    slider.min   = hora_inicio;
    slider.max   = hora_fin;
    slider.value = hora_inicio;
    document.getElementById('slider-marca-inicio').textContent = `${_pc_hh(hora_inicio)}:00`;
    document.getElementById('slider-marca-fin').textContent    = `${_pc_hh(hora_fin)}:00`;

    slider.addEventListener('input', () => _pc_mostrarFranja(parseInt(slider.value, 10)));
    document.getElementById('slider-box').style.display = 'block';
}

/**************************************************************************************************/
// CONSULTA (alimenta ambas pestañas)
/**************************************************************************************************/
function _pc_limpiarResultados() {
    document.getElementById('slider-box').style.display       = 'none';
    document.getElementById('chart-franja-box').style.display = 'none';
    document.getElementById('estacion-maestra-layout').style.display = 'none';
    const vacio = document.getElementById('pc-maestras-vacio');
    vacio.textContent = 'Consulta una fecha y una ruta para ver sus estaciones maestras.';
    vacio.style.display = 'block';
    // Los expanders viven fuera de las tarjetas: no se ocultan con ellas
    ['expander-chart-poligono-franja', 'expander-chart-detalle-estacion'].forEach(id => {
        const e = document.getElementById(id);
        if (e) e.remove();
    });
    _pc.maestras = [];
    _pc.maestraSel = -1;
    _pc.pendiente = { franja: false, maestra: false };
}

async function consultarPoligono(groupId) {
    const fecha = document.getElementById('fecha-franja').value;
    const ruta  = document.getElementById('ruta-franja').value;
    if (!groupId) return;
    if (!fecha || !ruta) {
        _pc_banner('Selecciona una fecha y una ruta para continuar.');
        return;
    }

    if (_pc.ctrl) _pc.ctrl.abort();
    const ctrl = new AbortController();
    _pc.ctrl = ctrl;
    const token = ++_pc.token;

    _pc_banner('');
    _pc_toggleLoader(true);
    const btn = document.getElementById('btn-consultar-franja');
    if (btn) btn.disabled = true;

    try {
        const qs = new URLSearchParams({ groupid: groupId, inicio: `${fecha} 00:00:00`, final: `${fecha} 23:59:59`, ruta });
        const resp = await fetch(`/api/poligono-carga-data?${qs}`, { signal: ctrl.signal });
        const data = await resp.json();
        if (token !== _pc.token) return;            // llegó tarde: ya hay otra consulta

        _pc_limpiarResultados();

        if (!data || !data.success) {
            _pc_banner((data && data.error) || 'Error al consultar.');
            return;
        }
        const franjas = data.franjas || [];
        if (franjas.length === 0) {
            _pc_banner('No hay datos para los filtros seleccionados.');
            document.getElementById('pc-maestras-vacio').style.display = 'none';
            return;
        }

        // ── Pestaña 1: franjas ──
        _pc.franjasPorHora = {};
        _pc.franjaInfo = {};
        franjas.forEach(f => {
            _pc.franjasPorHora[f.franja] = f.estaciones;
            _pc.franjaInfo[f.franja] = { n_viajes: f.n_viajes, variacion_id: f.variacion_id, descripcion: f.descripcion };
        });
        _pc.variaciones = {};
        (data.variaciones || []).forEach(v => { _pc.variaciones[v.variacion_id] = v; });
        _pc.ruta = ruta;
        // Nombre legible para títulos: el del back o, si no viene, el de la opción elegida
        const opt = document.querySelector(`#ruta-franja option[value="${CSS.escape(ruta)}"]`);
        _pc.rutaNombre = data.ruta_nombre || (opt && opt.textContent) || ruta;

        const rango = data.rango || { hora_inicio: 6, hora_fin: 22 };
        _pc.graficaFranjaLista = false;
        inicializarSlider(rango.hora_inicio, rango.hora_fin);
        const primeraHora = parseInt(franjas[0].franja.slice(0, 2), 10);
        document.getElementById('slider-hora').value = primeraHora;
        _pc_mostrarFranja(primeraHora);

        // ── Pestaña 2: estaciones maestras ──
        _pc.maestras = data.estaciones_maestras || [];
        renderizarEstacionesMaestras();

    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Error consultando polígono de carga:', e);
        if (token === _pc.token) _pc_banner('Error de red al consultar.');
    } finally {
        if (token === _pc.token) {
            _pc_toggleLoader(false);
            if (btn) btn.disabled = false;
        }
    }
}

/**************************************************************************************************/
// PESTAÑA 1 — FRANJA HORARIA
/**************************************************************************************************/
// Porcentaje recorrido del slider → variable CSS --pct (relleno del riel en Chrome/Edge)
function _pc_pintarSlider() {
    const s = document.getElementById('slider-hora');
    if (!s) return;
    const min = Number(s.min), max = Number(s.max), v = Number(s.value);
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    s.style.setProperty('--pct', `${pct}%`);
}

function _pc_mostrarFranja(h) {
    _pc_pintarSlider();   // aquí pasan todos los cambios: arrastre, consulta nueva y cambio de pestaña
    const franja = `${_pc_hh(h)}:00-${_pc_hh(h + 1)}:00`;
    const label = document.getElementById('label-hora-slider');
    if (label) label.innerHTML = `Franja horaria: <b class="pc-franja-hora">${_pc_hh(h)}:00 - ${_pc_hh(h + 1)}:00</b>`;
    _pc_renderAnotaciones(franja);

    // La gráfica solo se dibuja con la pestaña visible (ver cabecera del archivo)
    if (_pc_tabActiva() !== 'franja-horaria') { _pc.pendiente.franja = true; return; }
    _pc.pendiente.franja = false;
    renderizarPoligonoCarga({ franja, estaciones: _pc.franjasPorHora[franja] || [] });
}

/* Anotaciones: descripción de la variación de ruta usada en la franja.
   Si algún día la franja trae su propia `descripcion`, gana esa. */
function _pc_renderAnotaciones(franja) {
    const titulo = document.getElementById('pc-anot-titulo');
    const texto  = document.getElementById('pc-anot-texto');
    const meta   = document.getElementById('pc-anot-meta');
    if (!titulo || !texto || !meta) return;

    const info = _pc.franjaInfo[franja];
    if (!info) {
        titulo.textContent = 'Sin viajes en esta franja';
        texto.textContent  = 'No hubo viajes identificados de esta ruta en este horario.';
        meta.textContent   = '';
        return;
    }

    const v = _pc.variaciones[info.variacion_id];
    // El título ya dice si es principal o alterna: se quita ese prefijo del texto
    const descripcion = (info.descripcion || (v && v.descripcion) || '')
        .replace(/^\s*(alterna|principal)\s*:\s*/i, '')
        .replace(/^./, c => c.toUpperCase());

    titulo.textContent = v ? (v.es_principal ? 'Recorrido principal' : 'Variación alterna') : 'Recorrido';
    // Los nombres de estación (MAYÚSCULAS_CON_GUIONES) se resaltan para leerlos rápido
    texto.innerHTML = descripcion
        ? _pc_escHtml(descripcion).replace(/[A-Z0-9][A-Z0-9_\/.]*_[A-Z0-9_\/.]+|[A-Z]{4,}/g, m => `<span class="pc-anot-est">${m}</span>`)
        : 'Sin descripción para esta variación.';

    const n = info.n_viajes || 0;
    const partes = [`${n} ${n === 1 ? 'viaje' : 'viajes'} en esta franja`];
    if (v && v.n_poligonos) partes.push(`${v.n_poligonos} paradas`);
    meta.textContent = partes.join(' · ');
}

function renderizarPoligonoCarga(data) {
    const est       = data.estaciones;
    const nombres   = est.map(e => e.nombre);
    const ascensos  = est.map(e => e.ascensos);
    const descensos = est.map(e => e.descensos);
    const ocupacion = est.map(e => e.ocupacion);
    const maestra   = est.map(e => !!e.es_maestra);   // el back marca la(s) estación(es) de máxima carga
    const p = _pc_paleta();

    const custom = est.map(e => ({ unidades: e.unidades || 0, nota: e.es_maestra ? '<br>⭐ Estación maestra' : '' }));
    const hover = (campo) => `<b>%{x}</b><br>${campo}: %{y}<br>Unidades: %{customdata.unidades}%{customdata.nota}<extra></extra>`;

    const trazas = [
        {
            name: 'Ascensos', x: nombres, y: ascensos, type: 'bar',
            marker: { color: maestra.map(m => m ? p.maestra : p.ascensos), opacity: 0.85 },
            customdata: custom, hovertemplate: hover('Ascensos')
        },
        {
            name: 'Descensos', x: nombres, y: descensos, type: 'bar',
            marker: { color: p.descensos, opacity: 0.85 },
            customdata: custom, hovertemplate: hover('Descensos')
        },
        {
            name: 'Ocupación', x: nombres, y: ocupacion,
            type: 'scatter', mode: 'lines+markers',
            line: { color: p.ocupacion, width: 2.5, shape: 'spline', smoothing: 0.5 },   // mismo suavizado que las demás gráficas
            // Sin marcadores, salvo una estrella en las estaciones maestras
            marker: { size: maestra.map(m => m ? 11 : 0), color: p.maestra, symbol: 'star', line: { width: 0 } },
            customdata: custom, hovertemplate: hover('Ocupación')
        }
    ];

    // Escala por franja: el eje se ajusta a la franja visible y se anima al mover el slider
    const { tope, paso } = _pc_topeEje(Math.max(0, ...ocupacion, ...ascensos, ...descensos));
    const layout = _pc_layout({ rangoY: [0, tope], marginB: 120 });
    layout.yaxis.dtick = paso;
    // Solo se anima al moverse DENTRO de una consulta; ni la primera gráfica ni el repintado por
    // tema (setTheme() hace un relayout sobre la misma gráfica y una transición en curso choca).
    if (_pc.graficaFranjaLista && !data.sinTransicion) {
        layout.transition = { duration: 350, easing: 'cubic-in-out' };
    }

    document.getElementById('titulo-grafica-franja').textContent = `${_pc.rutaNombre || _pc.ruta} | ${data.franja}`;
    document.getElementById('chart-franja-box').style.display = 'block';

    // Siempre react (no newPlot): newPlot destruye el DOM y una transición a medio camino truena
    Plotly.react('chart-poligono-franja', trazas, layout, _PC_PLOTLY_CONFIG);
    _pc.graficaFranjaLista = true;
    document.getElementById('chart-poligono-franja').classList.add('pc-chart');

    crearExpander('chart-poligono-franja', est.map(e => ({
        Franja:    data.franja,
        Estación:  e.nombre,
        Maestra:   e.es_maestra ? 'Sí' : 'No',
        Ascensos:  e.ascensos,
        Descensos: e.descensos,
        Ocupación: e.ocupacion,
        Unidades:  e.unidades || 0
    })), `poligono_carga_${data.franja}`);
}

/**************************************************************************************************/
// PESTAÑA 2 — ESTACIONES MAESTRAS
/**************************************************************************************************/
const _PC_ICONO_BANDERA = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="22" x2="5" y2="3"/><path d="M5 4h12l-2.5 4L17 12H5z"/></svg>';

function renderizarEstacionesMaestras() {
    const lista  = _pc.maestras;
    const grid   = document.getElementById('grid-estaciones-maestras');
    const layout = document.getElementById('estacion-maestra-layout');
    const vacio  = document.getElementById('pc-maestras-vacio');

    if (!lista.length) {
        layout.style.display = 'none';
        vacio.textContent = 'No se identificaron estaciones maestras para esta ruta en el día.';
        vacio.style.display = 'block';
        return;
    }
    vacio.style.display = 'none';
    layout.style.display = 'block';

    // Orden del back (de la que fue maestra más horas a la que menos)
    grid.innerHTML = lista.map((m, i) => {
        const horas = m.n_franjas === 1 ? '1 hora' : `${m.n_franjas} horas`;
        const pocos = (m.horas_pocos_viajes || []).length
            ? `<span class="pc-maestra-aviso" title="Franjas con pocos viajes: el promedio es menos confiable">Pocos viajes en ${m.horas_pocos_viajes.map(h => `${_pc_hh(h)}:00`).join(', ')}</span>`
            : '';
        return `
            <button type="button" class="pc-maestra-card" role="option" aria-selected="false" data-i="${i}"
                    title="Pico de ${_pc_fmt(m.ocupacion_pico)} a bordo en ${_pc_escHtml(m.franja_pico)}">
                <span class="pc-maestra-cabeza">
                    <span class="pc-maestra-id">
                        <span class="pc-maestra-icono">${_PC_ICONO_BANDERA}</span>
                        <span class="pc-maestra-nombre">${_pc_escHtml(m.nombre).replace(/([_\/])/g, '$1<wbr>')}</span>
                    </span>
                    <span class="pc-maestra-chip">${horas}</span>
                </span>
                <span class="pc-maestra-rangos">${_pc_escHtml(m.etiqueta)}</span>
                ${pocos}
            </button>`;
    }).join('');

    _pc_seleccionarMaestra(0);
}

function _pc_seleccionarMaestra(i) {
    _pc.maestraSel = i;
    document.querySelectorAll('#grid-estaciones-maestras .pc-maestra-card').forEach(c => {
        const sel = Number(c.dataset.i) === i;
        c.classList.toggle('es-activa', sel);
        c.setAttribute('aria-selected', String(sel));
    });

    const m = _pc.maestras[i];
    document.getElementById('titulo-detalle-estacion').textContent = m.nombre;
    document.getElementById('subtitulo-detalle-estacion').textContent =
        `Comportamiento durante el día · Estación maestra en ${m.etiqueta}`;

    if (_pc_tabActiva() !== 'estacion-maestra') { _pc.pendiente.maestra = true; return; }
    renderizarDetalleEstacion(m);
}

function renderizarDetalleEstacion(m, { sinTransicion = false } = {}) {
    if (!m) return;
    _pc.pendiente.maestra = false;
    const p = _pc_paleta();
    const serie = m.serie || [];

    const horas     = serie.map(s => s.hora);
    // Eje X categórico con la franja completa ("08:00-09:00"): así la etiqueta del hover dice la
    // franja; las marcas del eje muestran solo la hora ("08"), como el diseño.
    const franjas   = serie.map(s => s.franja);
    const ascensos  = serie.map(s => s.ascensos);
    const descensos = serie.map(s => s.descensos);
    const ocupacion = serie.map(s => s.ocupacion);
    // Franjas con pocos viajes: barras más tenues (el promedio sale de muy pocos recorridos)
    const opac = serie.map(s => s.pocos_viajes ? 0.4 : 0.9);
    const custom = serie.map(s => ({
        viajes: s.n_viajes,
        nota: (s.es_maestra ? '<br>⭐ Franja maestra' : '') + (s.pocos_viajes ? '<br>⚠ Pocos viajes' : '')
    }));

    const trazas = [
        {
            name: 'Ascensos', x: franjas, y: ascensos, type: 'bar',
            marker: { color: p.ascensos, opacity: opac }, customdata: custom,
            hovertemplate: 'Ascensos: %{y}<extra></extra>'
        },
        {
            name: 'Descensos', x: franjas, y: descensos, type: 'bar',
            marker: { color: p.descensos, opacity: opac }, customdata: custom,
            hovertemplate: 'Descensos: %{y}<extra></extra>'
        },
        {
            name: 'Ocupación', x: franjas, y: ocupacion, type: 'scatter', mode: 'lines',
            line: { color: p.ocupacion, width: 2.5, shape: 'spline', smoothing: 0.5 }, customdata: custom,
            hovertemplate: 'Ocupación: %{y}<br>Viajes: %{customdata.viajes}%{customdata.nota}<extra></extra>'
        }
    ];

    // Bandas amarillas = rangos en los que esta estación fue la maestra. En un eje categórico la
    // categoría i ocupa [i - 0.5, i + 0.5], así la banda cubre las barras completas de cada hora.
    const shapes = (m.rangos || []).map(r => {
        const i0 = horas.indexOf(r.hora_inicio), i1 = horas.indexOf(r.hora_fin);
        if (i0 < 0 || i1 < 0) return null;
        return {
            type: 'rect', layer: 'below', xref: 'x', yref: 'paper',
            x0: i0 - 0.5, x1: i1 + 0.5, y0: 0, y1: 1,
            fillcolor: p.maestraBanda, line: { width: 0 }
        };
    }).filter(Boolean);

    const { tope, paso } = _pc_topeEje(Math.max(0, ...ocupacion, ...ascensos, ...descensos));
    const layout = _pc_layout({ rangoY: [0, tope], tickangle: 0, marginB: 30 });
    layout.yaxis.dtick = paso;
    layout.xaxis.type = 'category';
    layout.xaxis.tickmode = 'array';
    layout.xaxis.tickvals = franjas;
    layout.xaxis.ticktext = horas.map(_pc_hh);
    layout.xaxis.tickfont.size = 10;
    layout.xaxis.range = [-0.6, franjas.length - 0.4];
    layout.showlegend = false;                // la leyenda va en HTML, junto al título (como el diseño)
    layout.margin.t = 8;
    layout.shapes = shapes;
    layout.hovermode = 'x unified';           // una sola etiqueta por hora con las tres series
    layout.hoverlabel.namelength = 0;
    if (!sinTransicion) layout.transition = { duration: 300, easing: 'cubic-in-out' };

    Plotly.react('chart-detalle-estacion', trazas, layout, _PC_PLOTLY_CONFIG);
    document.getElementById('chart-detalle-estacion').classList.add('pc-chart');

    crearExpander('chart-detalle-estacion', serie.map(s => ({
        Franja:           s.franja,
        'Franja maestra': s.es_maestra ? 'Sí' : 'No',
        Ascensos:         s.ascensos,
        Descensos:        s.descensos,
        Ocupación:        s.ocupacion,
        Viajes:           s.n_viajes,
        'Pocos viajes':   s.pocos_viajes ? 'Sí' : 'No'
    })), `estacion_maestra_${m.nombre.replace(/[^\w]+/g, '_')}`);
}

/**************************************************************************************************/
// REPINTAR AL CAMBIAR DE TEMA
// setTheme() (js_Dashboard.js) hace un Plotly.restyle GLOBAL con el acento único, que aplastaría
// los colores de estas gráficas multiserie; por eso se excluyen con la clase .pc-chart y aquí se
// vuelven a dibujar con _pc_paleta(), que ya lee los colores del tema recién aplicado.
/**************************************************************************************************/
function _pc_repintarTema() {
    if (_pc.graficaFranjaLista && _pc_tabActiva() === 'franja-horaria') {
        const slider = document.getElementById('slider-hora');
        const h = slider ? parseInt(slider.value, 10) : NaN;
        if (!Number.isNaN(h)) {
            const franja = `${_pc_hh(h)}:00-${_pc_hh(h + 1)}:00`;
            renderizarPoligonoCarga({ franja, estaciones: _pc.franjasPorHora[franja] || [], sinTransicion: true });
        }
    } else if (_pc.graficaFranjaLista) {
        _pc.pendiente.franja = true;          // se repinta al volver a su pestaña
    }

    if (_pc.maestraSel >= 0) {
        if (_pc_tabActiva() === 'estacion-maestra') {
            renderizarDetalleEstacion(_pc.maestras[_pc.maestraSel], { sinTransicion: true });
        } else {
            _pc.pendiente.maestra = true;
        }
    }
}

// Enganche con setTheme SIN editar js_Dashboard.js. Esta sección se incluye dentro del <body>,
// así que corre ANTES que js_Dashboard.js: se espera a DOMContentLoaded, cuando setTheme existe.
function _pc_engancharTema() {
    if (window._pc_temaEnganchado) return;
    if (typeof window.setTheme !== 'function') return;
    const _setThemeAnterior = window.setTheme;
    window.setTheme = function (tema) {
        _setThemeAnterior(tema);
        setTimeout(_pc_repintarTema, 0);
    };
    window._pc_temaEnganchado = true;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _pc_engancharTema);
} else {
    _pc_engancharTema();
}

/**************************************************************************************************/
// EXPANDER DE DATOS + DESCARGA CSV (va debajo de la tarjeta de la gráfica, a todo lo ancho)
/**************************************************************************************************/
function crearExpander(containerId, datos, nombreArchivo) {
    const expanderId = `expander-${containerId}`;
    const previo = document.getElementById(expanderId);
    const estabaAbierto = !!(previo && previo.open);   // al mover el slider no se cierra solo
    if (previo) previo.remove();
    if (!datos || !datos.length) return;

    const expander = document.createElement('details');
    expander.id = expanderId;
    expander.className = 'data-expander';
    expander.open = estabaAbierto;
    expander.innerHTML = `
        <summary>Ver datos de la gráfica</summary>
        <button class="btn-download" onclick="exportarCSV('${expanderId}-tabla', '${_pc_escHtml(nombreArchivo)}')" aria-label="Descargar datos en CSV">
            <svg class="download-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
        </button>
        <div class="table-container">
            <table id="${expanderId}-tabla">
                <thead></thead>
                <tbody></tbody>
            </table>
        </div>
    `;

    const headers = Object.keys(datos[0]);
    expander.querySelector('thead').innerHTML =
        `<tr><th>#</th>${headers.map(k => `<th>${_pc_escHtml(k)}</th>`).join('')}</tr>`;
    expander.querySelector('tbody').innerHTML = datos.map((fila, i) => `
        <tr>
            <td class="row-index">${i + 1}</td>
            ${Object.values(fila).map(v => `<td>${_pc_escHtml(v)}</td>`).join('')}
        </tr>`).join('');

    const chart = document.getElementById(containerId);
    const caja  = chart.closest('.chart-box');
    if (caja) caja.after(expander);
    else chart.parentElement.appendChild(expander);
}

function exportarCSV(tablaId, nombreArchivo) {
    const tabla = document.getElementById(tablaId);
    if (!tabla) return;
    const csv = [];
    tabla.querySelectorAll('tr').forEach(row => {
        const cols = row.querySelectorAll('td, th');
        csv.push(Array.from(cols).map(c => `"${c.innerText.replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob(["﻿" + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nombreArchivo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

/**************************************************************************************************/
// LISTENERS (una sola vez)
/**************************************************************************************************/
function _pc_engancharListeners() {
    if (_pc.listo) return;
    _pc.listo = true;

    inicializarTabs();

    // Selector estilizado compartido (js_SelectEstilizado.js)
    if (typeof mejorarSelect === 'function') {
        mejorarSelect(document.getElementById('ruta-franja'),
            { buscador: 'auto', placeholder: 'Buscar ruta…', ocultarVacio: true });
    }

    // El corredor se lee al hacer clic (antes se "congelaba" el de la primera carga en un closure)
    document.getElementById('btn-consultar-franja').addEventListener('click', () => {
        const sel = document.getElementById('select-corredor');
        consultarPoligono(sel ? sel.value : null);
    });

    document.getElementById('grid-estaciones-maestras').addEventListener('click', (e) => {
        const card = e.target.closest('.pc-maestra-card');
        if (card) _pc_seleccionarMaestra(Number(card.dataset.i));
    });
}

/**************************************************************************************************/
// PUNTO DE ENTRADA — js_Dashboard.js lo llama al cargar y en cada cambio de corredor
/**************************************************************************************************/
async function actualizarDashboardPoligonoCarga(groupId) {
    setMaxFechaAyer();
    _pc_engancharListeners();
    if (!groupId) return;

    // Cambio de corredor: los resultados en pantalla eran del corredor anterior
    if (_pc.ctrl) _pc.ctrl.abort();
    _pc.token++;
    _pc_toggleLoader(false);
    _pc_banner('');
    _pc_limpiarResultados();

    await cargarRutasPoligono(groupId);
}
