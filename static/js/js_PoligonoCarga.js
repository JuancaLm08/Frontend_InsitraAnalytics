/**************************************************************************************************/
// ESTADO GLOBAL
/**************************************************************************************************/
let _pc_franjasPorHora = {};
let _pc_rutaActual     = null;
let _pc_maxY = null;
window._pc_maestrasData = null;


/**************************************************************************************************/
// BLOQUEAR FECHAS FUTURAS Y HOY + PRESET EN AYER
/**************************************************************************************************/
function setMaxFechaAyer() {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const yyyy = ayer.getFullYear();
    const mm   = String(ayer.getMonth() + 1).padStart(2, '0');
    const dd   = String(ayer.getDate()).padStart(2, '0');
    const fechaAyer = `${yyyy}-${mm}-${dd}`;

    document.getElementById('fecha-franja').max     = fechaAyer;
    document.getElementById('fecha-estacion').max   = fechaAyer;
    document.getElementById('fecha-franja').value   = fechaAyer;
    document.getElementById('fecha-estacion').value = fechaAyer;
}

/**************************************************************************************************/
// CARGAR RUTAS DEL CORREDOR
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

/**************************************************************************************************/
// LLENAR SELECTORES DE RUTA
/**************************************************************************************************/
function llenarSelectoresRuta(rutas) {
    ['ruta-franja', 'ruta-estacion'].forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = '<option value="">-- Selecciona una ruta --</option>';
        rutas.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = r.nombre;
            select.appendChild(opt);
        });
    });
}

/**************************************************************************************************/
// TABS
/**************************************************************************************************/
function inicializarTabs() {
    document.querySelectorAll('#section-poligono-carga .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#section-poligono-carga .tab-btn')
                    .forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#section-poligono-carga .tab-content')
                    .forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';

            // Al cambiar a Tab 2, sincronizar filtros y renderizar si ya hay datos
            if (btn.dataset.tab === 'estacion-maestra') {
                const fechaFranja = document.getElementById('fecha-franja').value;
                const rutaFranja  = document.getElementById('ruta-franja').value;
                if (fechaFranja) document.getElementById('fecha-estacion').value = fechaFranja;
                if (rutaFranja)  document.getElementById('ruta-estacion').value  = rutaFranja;

                // Si ya tenemos datos en memoria, renderizar directo
                const cache = window._pc_maestrasData;
                if (cache && cache.fecha === fechaFranja && cache.ruta === rutaFranja) {
                    const estaciones = cache.maestras.map(m => ({
                        nombre:        m.estacion_maestra,
                        ocupacion_max: m.ocupacion_max,
                        franja:        m.franja
                    }));
                    renderizarEstacionesMaestras({ estaciones });
                }
            }
        });
    });
}

/**************************************************************************************************/
// SLIDER DE HORAS
/**************************************************************************************************/
function inicializarSlider(hora_inicio, hora_fin) {
    let slider = document.getElementById('slider-hora');
    slider.replaceWith(slider.cloneNode(true));
    slider = document.getElementById('slider-hora');

    const label       = document.getElementById('label-hora-slider');
    const marcaInicio = document.getElementById('slider-marca-inicio');
    const marcaFin    = document.getElementById('slider-marca-fin');

    slider.min   = hora_inicio;
    slider.max   = hora_fin;
    slider.value = hora_inicio;

    marcaInicio.textContent = `${String(hora_inicio).padStart(2,'0')}:00`;
    marcaFin.textContent    = `${String(hora_fin).padStart(2,'0')}:00`;
    label.textContent = `Franja horaria: ${String(hora_inicio).padStart(2,'0')}:00 - ${String(hora_inicio+1).padStart(2,'0')}:00`;

    slider.addEventListener('input', () => {
        _pc_mostrarFranja(parseInt(slider.value));
    });

    document.getElementById('slider-box').style.display = 'block';
}

/**************************************************************************************************/
// CONTROL DEL LOADER (MOSTRAR/OCULTAR + REPRODUCIR/DETENER LA ANIMACION LOTTIE)
/**************************************************************************************************/
function _pc_toggleLoader(mostrar) {
    const loader = document.getElementById('loader-poligono-carga');
    if (loader) loader.style.display = mostrar ? 'flex' : 'none';

    // "animations" se inicializa en js_Sidebar.js (una instancia de Lottie por cada
    // .section-loader, indexada por su id). Como ambos scripts son scripts clasicos
    // cargados en la misma pagina, comparten el mismo scope global, por lo que la
    // variable es visible aqui sin necesidad de exponerla en "window".
    if (typeof animations !== 'undefined' && animations['loader-poligono-carga']) {
        if (mostrar) animations['loader-poligono-carga'].play();
        else animations['loader-poligono-carga'].stop();
    }
}

/**************************************************************************************************/
// TAB 1 — CONSULTAR POLÍGONO POR FRANJA HORARIA
/**************************************************************************************************/
async function consultarFranja(groupId) {
    const fecha = document.getElementById('fecha-franja').value;
    const ruta  = document.getElementById('ruta-franja').value;
    if (!fecha || !ruta) {
        alert('Selecciona una fecha y una ruta para continuar.');
        return;
    }

    const banner = document.getElementById('no-data-banner-poligono-carga');
    if (banner) banner.style.display = 'none';
    _pc_toggleLoader(true);

    try {
        const url = `/api/poligono-carga-data?groupid=${groupId}` +
                    `&inicio=${fecha} 00:00:00` +
                    `&final=${fecha} 23:59:59` +
                    `&ruta=${encodeURIComponent(ruta)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        const ocultar = () => {
            document.getElementById('slider-box').style.display       = 'none';
            document.getElementById('chart-franja-box').style.display = 'none';
        };

        if (!data || !data.success) {
            if (banner) { banner.textContent = (data && data.error) || 'Error al consultar.'; banner.style.display = 'block'; }
            ocultar();
            return;
        }

        const franjas = data.franjas || [];
        if (franjas.length === 0) {
            if (banner) { banner.textContent = 'No hay datos para los filtros seleccionados.'; banner.style.display = 'block'; }
            ocultar();
            return;
        }

        // Tab 1 — franjas horarias
        _pc_franjasPorHora = {};
        franjas.forEach(f => { _pc_franjasPorHora[f.franja] = f.estaciones; });
        _pc_rutaActual = ruta;

        // Calcular máximo global del día
        let maxGlobal = 0;
        franjas.forEach(f => {
            f.estaciones.forEach(e => {
                maxGlobal = Math.max(maxGlobal, e.ocupacion || 0, e.ascensos || 0, e.descensos || 0);
            });
        });
        _pc_maxY = Math.ceil(maxGlobal * 1.1);

        // Tab 2 — guardar maestras y series en memoria
        window._pc_maestrasData = {
            groupId,
            fecha,
            ruta,
            series:   data.series_por_estacion || {},
            maestras: data.maestras || []
        };

        const rango = data.rango || { hora_inicio: 6, hora_fin: 22 };
        _pc_graficaInicializada = false;
        inicializarSlider(rango.hora_inicio, rango.hora_fin);

        const primeraHora = parseInt(franjas[0].franja.slice(0, 2), 10);
        document.getElementById('slider-hora').value = primeraHora;
        _pc_mostrarFranja(primeraHora);

    } catch (e) {
        console.error('Error consultando polígono de carga:', e);
        if (banner) { banner.textContent = 'Error de red al consultar.'; banner.style.display = 'block'; }
    } finally {
        _pc_toggleLoader(false);
    }
}
let _pc_graficaInicializada = false;

function _pc_mostrarFranja(h) {
    const franja     = `${String(h).padStart(2, '0')}:00-${String(h + 1).padStart(2, '0')}:00`;
    const label      = document.getElementById('label-hora-slider');
    if (label) label.textContent = `Franja horaria: ${String(h).padStart(2,'0')}:00 - ${String(h+1).padStart(2,'0')}:00`;
    const estaciones = _pc_franjasPorHora[franja] || [];
    const payload     = { ruta: _pc_rutaActual, franja, estaciones };

    // Si la gráfica ya fue dibujada antes (primer Plotly.newPlot ya ejecutado),
    // usamos una transición animada al cambiar de franja (mucho más agradable al
    // arrastrar el slider). Si es el primer dibujo, renderizarPoligonoCarga() se
    // encarga del Plotly.newPlot inicial.
    if (_pc_graficaInicializada) {
        _pc_animarCambioFranja(payload);
    } else {
        renderizarPoligonoCarga(payload);
    }
}

/**************************************************************************************************/
// TRANSICIÓN ANIMADA ENTRE FRANJAS (al mover el slider de horas, con la gráfica ya dibujada)
/**************************************************************************************************/
function _pc_animarCambioFranja(data) {
    const nombres   = data.estaciones.map(e => e.nombre);
    const ascensos  = data.estaciones.map(e => e.ascensos);
    const descensos = data.estaciones.map(e => e.descensos);
    const ocupacion = data.estaciones.map(e => e.ocupacion);
    const unidades  = data.estaciones.map(e => e.unidades || 0);

    const maestraDeEstaFranja = window._pc_maestrasData?.maestras?.find(
        m => m.franja === data.franja
    )?.estacion_maestra || null;

    const coloresAscensos  = nombres.map(n => n === maestraDeEstaFranja ? '#F4C542' : '#651c44');
    const coloresDescensos = nombres.map(n => n === maestraDeEstaFranja ? '#F4A522' : '#3a5d79');

    // customdata se recalcula en cada franja para que el hover ("Unidades: ...") no
    // se quede con datos de la franja anterior tras la animación.
    const customdata = nombres.map((n, i) => ({
        unidades: unidades[i],
        maestra: n === maestraDeEstaFranja
    }));

    Plotly.animate('chart-poligono-franja', {
        data: [
            { x: nombres, y: ascensos,  marker: { color: coloresAscensos,  opacity: 0.85 }, customdata },
            { x: nombres, y: descensos, marker: { color: coloresDescensos, opacity: 0.85 }, customdata },
            {
                x: nombres, y: ocupacion,
                marker: {
                    size:   nombres.map(n => n === maestraDeEstaFranja ? 10 : 5),
                    color:  nombres.map(n => n === maestraDeEstaFranja ? '#F4C542' : '#950c4b'),
                    symbol: nombres.map(n => n === maestraDeEstaFranja ? 'star' : 'circle')
                },
                customdata
            }
        ],
        layout: {
            'xaxis.ticktext': nombres,
            'xaxis.tickvals': nombres,
        }
    }, {
        transition: { duration: 300, easing: 'cubic-in-out' },
        frame:      { duration: 300 }
    });

    document.getElementById('titulo-grafica-franja').textContent =
        `${data.ruta} | ${data.franja}`;

    const datosExpander = data.estaciones.map(e => ({
        Franja:    data.franja,
        Estación:  e.nombre,
        Maestra:   e.nombre === maestraDeEstaFranja ? 'Sí' : 'No',
        Ascensos:  e.ascensos,
        Descensos: e.descensos,
        Ocupación: e.ocupacion
    }));
    crearExpander('chart-poligono-franja', datosExpander, `poligono_carga_${data.franja}`);
}


/**************************************************************************************************/
// GRAFICA: POLÍGONO DE CARGA POR FRANJA
/**************************************************************************************************/
function renderizarPoligonoCarga(data) {
    const nombres   = data.estaciones.map(e => e.nombre);
    const ascensos  = data.estaciones.map(e => e.ascensos);
    const descensos = data.estaciones.map(e => e.descensos);
    const ocupacion = data.estaciones.map(e => e.ocupacion);
    const unidades  = data.estaciones.map(e => e.unidades || 0);

    // Identificar estación maestra de esta franja
    const maestraDeEstaFranja = window._pc_maestrasData?.maestras?.find(
        m => m.franja === data.franja
    )?.estacion_maestra || null;

    // Color especial para la estación maestra
    const coloresAscensos  = nombres.map(n => n === maestraDeEstaFranja ? '#F4C542' : '#651c44');
    const coloresDescensos = nombres.map(n => n === maestraDeEstaFranja ? '#F4A522' : '#3a5d79');

    const trazas = [
        {
            name: 'Ascensos',
            x: nombres, y: ascensos,
            type: 'bar',
            marker: { color: coloresAscensos, opacity: 0.85 },
            customdata: nombres.map((n, i) => ({
                unidades: unidades[i],
                maestra: n === maestraDeEstaFranja
            })),
            hovertemplate:
                '<b>%{x}</b><br>' +
                'Ascensos: %{y}<br>' +
                'Unidades: %{customdata.unidades}' +
                '%{customdata.maestra ? "<br>⭐ Estación maestra" : ""}' +
                '<extra></extra>'
        },
        {
            name: 'Descensos',
            x: nombres, y: descensos,
            type: 'bar',
            marker: { color: coloresDescensos, opacity: 0.85 },
            customdata: nombres.map((n, i) => ({
                unidades: unidades[i],
                maestra: n === maestraDeEstaFranja
            })),
            hovertemplate:
                '<b>%{x}</b><br>' +
                'Descensos: %{y}<br>' +
                'Unidades: %{customdata.unidades}' +
                '%{customdata.maestra ? "<br>⭐ Estación maestra" : ""}' +
                '<extra></extra>'
        },
        {
            name: 'Ocupación',
            x: nombres, y: ocupacion,
            type: 'scatter', mode: 'lines+markers',
            line:   { color: '#950c4b', width: 2.5, shape: 'spline' },
            marker: { 
                size:  nombres.map(n => n === maestraDeEstaFranja ? 10 : 5),
                color: nombres.map(n => n === maestraDeEstaFranja ? '#F4C542' : '#950c4b'),
                symbol: nombres.map(n => n === maestraDeEstaFranja ? 'star' : 'circle')
            },
            customdata: nombres.map((n, i) => ({
                unidades: unidades[i],
                maestra: n === maestraDeEstaFranja
            })),
            hovertemplate:
                '<b>%{x}</b><br>' +
                'Ocupación: %{y}<br>' +
                'Unidades: %{customdata.unidades}' +
                '%{customdata.maestra ? "<br>⭐ Estación maestra" : ""}' +
                '<extra></extra>'
        }
    ];

    // Calcular rango del eje Y basado en la franja actual
    const maxOcupacion = Math.max(...ocupacion, 0);
    const maxFlujo     = Math.max(...ascensos, ...descensos, 0);
    const maxY         = Math.ceil(Math.max(maxOcupacion, maxFlujo) * 1.1);

    const layout = {
        barmode: 'group',
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor:  'rgba(0,0,0,0)',
        font:   { color: getChartFontColor() },
        xaxis:  { tickangle: -90, tickfont: { size: 10 } },
        yaxis:  { title: 'Pasajeros / Ocupación', range: [0, _pc_maxY] },
        legend: { orientation: 'h', y: 1.12, x: 0, xanchor: 'left' },
        margin: { t: 40, b: 120 }
    };

    document.getElementById('titulo-grafica-franja').textContent =
        `${data.ruta} | ${data.franja}`;
    document.getElementById('chart-franja-box').style.display = 'block';
    if (_pc_graficaInicializada) {
    Plotly.react('chart-poligono-franja', trazas, layout, { responsive: true });
        } else {
    Plotly.newPlot('chart-poligono-franja', trazas, layout, { responsive: true });
    _pc_graficaInicializada = true;
        }

    const datosExpander = data.estaciones.map(e => ({
        Franja:    data.franja,
        Estación:  e.nombre,
        Maestra:   e.nombre === maestraDeEstaFranja ? 'Sí' : 'No',
        Ascensos:  e.ascensos,
        Descensos: e.descensos,
        Ocupación: e.ocupacion
    }));
    crearExpander('chart-poligono-franja', datosExpander, `poligono_carga_${data.franja}`);
}

/**************************************************************************************************/
// TAB 2 — CONSULTAR ESTACIONES MAESTRAS
/**************************************************************************************************/
async function consultarEstacionesMaestras(groupId, fecha, ruta) {
    const banner = document.getElementById('no-data-banner-poligono-carga');
    if (banner) banner.style.display = 'none';

    // Si ya tenemos datos para la misma fecha y ruta, no llamamos al backend
    const cache = window._pc_maestrasData;
    if (cache && cache.fecha === fecha && cache.ruta === ruta) {
        const estaciones = cache.maestras.map(m => ({
            nombre:        m.estacion_maestra,
            ocupacion_max: m.ocupacion_max,
            franja:        m.franja
        }));
        renderizarEstacionesMaestras({ estaciones });
        return;
    }

    // Si no, hacemos la llamada al backend
    _pc_toggleLoader(true);

    try {
        const url = `/api/poligono-carga-data?groupid=${groupId}` +
                    `&inicio=${fecha} 00:00:00` +
                    `&final=${fecha} 23:59:59` +
                    `&ruta=${encodeURIComponent(ruta)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (!data || !data.success) {
            if (banner) { banner.textContent = (data && data.error) || 'Error al consultar.'; banner.style.display = 'block'; }
            return;
        }

        window._pc_maestrasData = {
            groupId,
            fecha,
            ruta,
            series:   data.series_por_estacion || {},
            maestras: data.maestras || []
        };

        const estaciones = data.maestras.map(m => ({
            nombre:        m.estacion_maestra,
            ocupacion_max: m.ocupacion_max,
            franja:        m.franja
        }));

        renderizarEstacionesMaestras({ estaciones });

    } catch (e) {
        console.error('Error consultando estaciones maestras:', e);
        if (banner) { banner.textContent = 'Error de red al consultar.'; banner.style.display = 'block'; }
    } finally {
        _pc_toggleLoader(false);
    }
}
/**************************************************************************************************/
// LISTA: ESTACIONES MAESTRAS
/**************************************************************************************************/
function renderizarEstacionesMaestras(data) {
    const grid = document.getElementById('grid-estaciones-maestras');
    grid.innerHTML = '';

    // Agrupar por nombre de estación
    const agrupado = {};
    data.estaciones.forEach(e => {
        if (!agrupado[e.nombre]) {
            agrupado[e.nombre] = {
                nombre:        e.nombre,
                ocupacion_max: e.ocupacion_max,
                hora_max:      e.franja || '99:00',
                franjas:       []
            };
        }
        if (e.franja) agrupado[e.nombre].franjas.push(e.franja);
        if (e.ocupacion_max > agrupado[e.nombre].ocupacion_max) {
            agrupado[e.nombre].ocupacion_max = e.ocupacion_max;
            agrupado[e.nombre].hora_max = e.franja;
        }
    });

    // Ordenar cronológicamente por la franja de mayor ocupación
    const estaciones = Object.values(agrupado).sort((a, b) => {
        const horaA = parseInt(a.hora_max.slice(0, 2), 10);
        const horaB = parseInt(b.hora_max.slice(0, 2), 10);
        return horaA - horaB;
    });

    estaciones.forEach(e => {
        const franjasTexto = e.franjas.join(', ');
        const card = document.createElement('div');
        card.className = 'estacion-card';
        card.innerHTML = `
            <span class="estacion-card-hora">${e.hora_max}</span>
            <span class="estacion-card-nombre">${e.nombre}</span>
            <span class="estacion-card-ocupacion">${franjasTexto}</span>
            <span class="estacion-card-badge">${Math.round(e.ocupacion_max)} 👤</span>
        `;
        card.addEventListener('click', async () => {
            document.querySelectorAll('.estacion-card')
                    .forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            await consultarDetalleEstacion(e.nombre);
        });
        grid.appendChild(card);
    });

    document.getElementById('estacion-maestra-layout').style.display = 'block';
    document.getElementById('detalle-placeholder').style.display     = 'flex';
    document.getElementById('titulo-detalle-estacion').style.display = 'none';
    document.getElementById('chart-detalle-estacion').style.display  = 'none';
}

/**************************************************************************************************/
// TAB 2 — CONSULTAR DETALLE DE ESTACIÓN
/**************************************************************************************************/
async function consultarDetalleEstacion(nombreEstacion) {
    const { series } = window._pc_maestrasData;

    const serie = series[nombreEstacion];
    if (!serie || serie.length === 0) {
        console.error('Sin datos para estación:', nombreEstacion);
        return;
    }

    renderizarDetalleEstacion(nombreEstacion, { serie });
}

/**************************************************************************************************/
// GRAFICA: DETALLE DE ESTACIÓN MAESTRA
/**************************************************************************************************/
function renderizarDetalleEstacion(nombreEstacion, data) {
    const horas     = data.serie.map(s => s.hora);
    const ocupacion = data.serie.map(s => s.ocupacion);
    const ascensos  = data.serie.map(s => s.ascensos  || 0);
    const descensos = data.serie.map(s => s.descensos || 0);

    const trazas = [
        {
            name: 'Ascensos',
            x: horas, y: ascensos,
            type: 'bar',
            marker: { color: '#950c4b', opacity: 0.85 }
        },
        {
            name: 'Descensos',
            x: horas, y: descensos,
            type: 'bar',
            marker: { color: '#3a5d79', opacity: 0.85 }
        },
        {
            name: 'Ocupación',
            x: horas, y: ocupacion,
            type: 'scatter', mode: 'lines+markers',
            line:      { color: '#019cdc', width: 2.5, shape:'spline' },
            marker:    { size: 6, color: '#019cdc' },
            fill:      'tozeroy',
            fillcolor: 'rgba(173,216,230,0.10)'
        }
    ];

    const layout = {
        barmode: 'group',
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor:  'rgba(0,0,0,0)',
        font:   { color: getChartFontColor() },
        xaxis:  { title: 'Hora del día', tickfont: { size: 11 } },
        yaxis:  { title: 'Pasajeros / Ocupación' },
        legend: { orientation: 'h', y: -0.3 },
        margin: { t: 20, b: 80 }
    };

    document.getElementById('detalle-placeholder').style.display     = 'none';
    document.getElementById('titulo-detalle-estacion').style.display = 'block';
    document.getElementById('titulo-detalle-estacion').textContent   =
        `${nombreEstacion} — ocupación a lo largo del día`;
    document.getElementById('chart-detalle-estacion').style.display  = 'block';

    Plotly.newPlot('chart-detalle-estacion', trazas, layout, { responsive: true });

    const datosExpander = data.serie.map(s => ({
        Estación:  nombreEstacion,
        Hora:      s.hora,
        Ascensos:  s.ascensos  || 0,
        Descensos: s.descensos || 0,
        Ocupación: s.ocupacion
    }));
    crearExpander('chart-detalle-estacion', datosExpander, `detalle_${nombreEstacion}`);
}

/**************************************************************************************************/
// EXPANDER DE DESCARGA CSV
/**************************************************************************************************/
function crearExpander(containerId, datos, nombreArchivo) {
    const expanderId = `expander-${containerId}`;

    const previo = document.getElementById(expanderId);
    if (previo) previo.remove();

    const expander = document.createElement('details');
    expander.id = expanderId;
    expander.className = 'data-expander';
    expander.innerHTML = `
        <summary>Ver datos de la gráfica</summary>
        <button class="btn-download" onclick="exportarCSV('${expanderId}-tabla', '${nombreArchivo}')">
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

    const thead = expander.querySelector('thead');
    const tbody = expander.querySelector('tbody');

    const headers = Object.keys(datos[0]);
    thead.innerHTML = `<tr><th>#</th>${headers.map(k => `<th>${k}</th>`).join('')}</tr>`;
    tbody.innerHTML = datos.map((fila, i) => `
        <tr>
            <td>${i + 1}</td>
            ${Object.values(fila).map(v => `<td>${v}</td>`).join('')}
        </tr>
    `).join('');

    const chart = document.getElementById(containerId);
    chart.parentElement.appendChild(expander);
}

function exportarCSV(tablaId, nombreArchivo) {
    const tabla = document.getElementById(tablaId);
    if (!tabla) return;
    let csv = [];
    tabla.querySelectorAll('tr').forEach(row => {
        const cols = row.querySelectorAll('td, th');
        csv.push(Array.from(cols).map(c => `"${c.innerText.replace(/"/g, '""')}"`).join(','));
    });
    const blob = new Blob(["\uFEFF" + csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nombreArchivo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

/**************************************************************************************************/
// INICIALIZAR
/**************************************************************************************************/
async function actualizarDashboardPoligonoCarga(groupId) {
    setMaxFechaAyer();
    inicializarTabs();

    if (!groupId) return;

    await cargarRutasPoligono(groupId);

    const btnFranja   = document.getElementById('btn-consultar-franja');
    const btnEstacion = document.getElementById('btn-consultar-estacion');

    if (btnFranja) {
        btnFranja.replaceWith(btnFranja.cloneNode(true));
        document.getElementById('btn-consultar-franja')
                .addEventListener('click', () => consultarFranja(groupId));
    }

    if (btnEstacion) {
        btnEstacion.replaceWith(btnEstacion.cloneNode(true));
        document.getElementById('btn-consultar-estacion').addEventListener('click', () => {
            const fecha = document.getElementById('fecha-estacion').value;
            const ruta  = document.getElementById('ruta-estacion').value;
            if (!fecha || !ruta) {
                alert('Selecciona una fecha y una ruta para continuar.');
                return;
            }
            consultarEstacionesMaestras(groupId, fecha, ruta);
        });
    }
}

// NOTA: La inicializacion de esta seccion (fechas, tabs, rutas y listeners de los
// botones "Consultar") ya NO se dispara aqui en DOMContentLoaded, porque en ese
// momento el select de corredor todavia no tiene un groupId seleccionado.
// En su lugar, "actualizarDashboardPoligonoCarga(groupId)" se llama desde
// cargarCorredores() en js_Sidebar.js, tanto al cargar la pagina como cada vez
// que el usuario cambia de corredor, para que siempre reciba un groupId valido.