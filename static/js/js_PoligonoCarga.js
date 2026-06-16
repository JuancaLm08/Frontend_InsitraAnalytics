
/**************************************************************************************************/
// ESTADO Y DATOS REALES — PESTAÑA POR FRANJA HORARIA
/**************************************************************************************************/
let _pc_franjasPorHora = {};   // { "06:00-07:00": [estaciones], ... }
let _pc_rutaActual     = null; // id de la ruta consultada

// Catálogo de rutas del corredor -> selectores
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

// Consulta el polígono por franja para (fecha, ruta) y prepara el slider
async function consultarFranja(groupId) {
    const fecha = document.getElementById('fecha-franja').value;
    const ruta  = document.getElementById('ruta-franja').value;
    if (!fecha || !ruta) {
        alert('Selecciona una fecha y una ruta para continuar.');
        return;
    }

    const loader = document.getElementById('loader-poligono-carga');
    const banner = document.getElementById('no-data-banner-poligono-carga');
    if (banner) banner.style.display = 'none';
    if (loader) loader.style.display = 'flex';

    try {
        const url = `/api/poligono-carga-data?groupid=${groupId}` +
                    `&fecha=${fecha}&ruta=${encodeURIComponent(ruta)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        const ocultar = () => {
            document.getElementById('slider-box').style.display      = 'none';
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

        // Indexar franjas por etiqueta para que el slider las seleccione
        _pc_franjasPorHora = {};
        franjas.forEach(f => { _pc_franjasPorHora[f.franja] = f.estaciones; });
        _pc_rutaActual = ruta;

        const rango = data.rango || { hora_inicio: 6, hora_fin: 22 };
        inicializarSlider(rango.hora_inicio, rango.hora_fin);

        // Posicionar el slider en la primera franja con datos y renderizarla
        const primeraHora = parseInt(franjas[0].franja.slice(0, 2), 10);
        document.getElementById('slider-hora').value = primeraHora;
        _pc_mostrarFranja(primeraHora);

    } catch (e) {
        console.error('Error consultando polígono de carga:', e);
        if (banner) { banner.textContent = 'Error de red al consultar.'; banner.style.display = 'block'; }
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

// Renderiza la franja de la hora h del slider desde lo ya consultado
function _pc_mostrarFranja(h) {
    const franja = `${String(h).padStart(2, '0')}:00-${String(h + 1).padStart(2, '0')}:00`;
    const label  = document.getElementById('label-hora-slider');
    if (label) label.textContent = `Franja horaria: ${String(h).padStart(2,'0')}:00 - ${String(h+1).padStart(2,'0')}:00`;
    const estaciones = _pc_franjasPorHora[franja] || [];
    renderizarPoligonoCarga({ ruta: _pc_rutaActual, franja, estaciones });
}

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
        });
    });
}

/**************************************************************************************************/
// SLIDER DE HORAS
/**************************************************************************************************/
function inicializarSlider(hora_inicio, hora_fin) {
    // Clonar el slider para limpiar listeners de consultas previas
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
// GRAFICA: POLÍGONO DE CARGA POR FRANJA
/**************************************************************************************************/
function renderizarPoligonoCarga(data) {
    const nombres   = data.estaciones.map(e => e.nombre);
    const ascensos  = data.estaciones.map(e => e.ascensos);
    const descensos = data.estaciones.map(e => e.descensos);
    const ocupacion = data.estaciones.map(e => e.ocupacion);

    const trazas = [
        {
            name: 'Ascensos',
            x: nombres, y: ascensos,
            type: 'bar',
            marker: { color: '#651c44', opacity: 0.85 }
        },
        {
            name: 'Descensos',
            x: nombres, y: descensos,
            type: 'bar',
            marker: { color: '#3a5d79', opacity: 0.85 }
        },
        {
            name: 'Ocupación',
            x: nombres, y: ocupacion,
            type: 'scatter', mode: 'lines+markers',
            line:   { color: '#950c4b', width: 2.5 },
            marker: { size: 5, color: '#950c4b' }
        }
    ];

    const layout = {
        barmode: 'group',
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor:  'rgba(0,0,0,0)',
        font:   { color: getChartFontColor() },
        xaxis:  { tickangle: -45, tickfont: { size: 10 } },
        yaxis:  { title: 'Pasajeros / Ocupación' },
        legend: { orientation: 'h', y: -0.3 },
        margin: { t: 20, b: 120 }
    };

    document.getElementById('titulo-grafica-franja').textContent =
        `${data.ruta} | ${data.franja}`;
    document.getElementById('chart-franja-box').style.display = 'block';
    Plotly.newPlot('chart-poligono-franja', trazas, layout, { responsive: true });

    const datosExpander = data.estaciones.map(e => ({
        Franja:    data.franja,
        Estación:  e.nombre,
        Ascensos:  e.ascensos,
        Descensos: e.descensos,
        Ocupación: e.ocupacion
    }));
    crearExpander('chart-poligono-franja', datosExpander, `poligono_carga_${data.franja}`);
}

/**************************************************************************************************/
// LISTA: ESTACIONES MAESTRAS
/**************************************************************************************************/
function renderizarEstacionesMaestras(data) {
    const lista = document.getElementById('lista-estaciones-maestras');
    lista.innerHTML = '';

    data.estaciones.forEach(e => {
        const item = document.createElement('div');
        item.className = 'estacion-item';
        item.innerHTML = `
            <span>${e.nombre}</span>
            <span class="ocu-badge">${e.ocupacion_max} 👤</span>
        `;
        item.addEventListener('click', () => {
            document.querySelectorAll('.estacion-item')
                    .forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            renderizarDetalleEstacion(e.nombre, MOCK_DETALLE);
        });
        lista.appendChild(item);
    });

    document.getElementById('estacion-maestra-layout').style.display = 'block';
    document.getElementById('detalle-placeholder').style.display     = 'flex';
    document.getElementById('titulo-detalle-estacion').style.display = 'none';
    document.getElementById('chart-detalle-estacion').style.display  = 'none';
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
            line:      { color: '#019cdc', width: 2.5 },
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

    // Sin corredor seleccionado (p. ej. carga inicial): solo deja la UI lista
    if (!groupId) return;

    // Llenar selectores con el catálogo real de rutas del corredor
    await cargarRutasPoligono(groupId);

    // ── Event listeners de botones ────────────────────────────
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
            renderizarEstacionesMaestras(MOCK_MAESTRAS);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    actualizarDashboardPoligonoCarga();
});