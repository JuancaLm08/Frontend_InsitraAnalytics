/**************************************************************************************************/
// DATOS SIMULADOS (MOCK)
/**************************************************************************************************/
const MOCK_RANGO = { hora_inicio: 6, hora_fin: 22 };

const MOCK_RUTAS = [
    { id: "XOCHIMILCO_TULYEHUALCO",  nombre: "Xochimilco → Tulyehualco" },
    { id: "TULYEHUALCO_XOCHIMILCO",  nombre: "Tulyehualco → Xochimilco" },
    { id: "EMBARCADERO_TULYEHUALCO", nombre: "Embarcadero → Tulyehualco" },
    { id: "TULYEHUALCO_EMBARCADERO", nombre: "Tulyehualco → Embarcadero" },
];

const MOCK_FRANJA = {
    ruta: "XOCHIMILCO_TULYEHUALCO",
    franja: "07:00-08:00",
    estaciones: [
        { nombre: "CETRAM",         ascensos: 45, descensos: 0,  ocupacion: 45 },
        { nombre: "AV_CUAUHTEMOC",  ascensos: 23, descensos: 8,  ocupacion: 60 },
        { nombre: "CAPULINES",      ascensos: 10, descensos: 5,  ocupacion: 65 },
        { nombre: "PIEDRA_LISA",    ascensos: 0,  descensos: 0,  ocupacion: 65 },
        { nombre: "OJO_DE_AGUA",    ascensos: 15, descensos: 20, ocupacion: 60 },
        { nombre: "MINAS",          ascensos: 0,  descensos: 12, ocupacion: 48 },
        { nombre: "SAN_GREGORIO",   ascensos: 8,  descensos: 5,  ocupacion: 51 },
        { nombre: "TLAXIALTEMALCO", ascensos: 3,  descensos: 10, ocupacion: 44 },
        { nombre: "TULYEHUALCO",    ascensos: 0,  descensos: 44, ocupacion: 0  },
    ]
};

const MOCK_MAESTRAS = {
    estaciones: [
        { nombre: "OJO_DE_AGUA",    ocupacion_max: 65 },
        { nombre: "CAPULINES",      ocupacion_max: 60 },
        { nombre: "SAN_GREGORIO",   ocupacion_max: 51 },
        { nombre: "AV_CUAUHTEMOC",  ocupacion_max: 48 },
        { nombre: "TLAXIALTEMALCO", ocupacion_max: 44 },
        { nombre: "MINAS",          ocupacion_max: 38 },
        { nombre: "CETRAM",         ocupacion_max: 30 },
        { nombre: "TULYEHUALCO",    ocupacion_max: 10 },
    ]
};

const MOCK_DETALLE = {
    estacion: "OJO_DE_AGUA",
    serie: [
        { hora: "06:00", ascensos: 15, descensos: 3,  ocupacion: 12 },
        { hora: "07:00", ascensos: 25, descensos: 8,  ocupacion: 34 },
        { hora: "08:00", ascensos: 40, descensos: 10, ocupacion: 65 },
        { hora: "09:00", ascensos: 12, descensos: 22, ocupacion: 55 },
        { hora: "10:00", ascensos: 8,  descensos: 23, ocupacion: 40 },
        { hora: "11:00", ascensos: 10, descensos: 12, ocupacion: 38 },
        { hora: "12:00", ascensos: 20, descensos: 8,  ocupacion: 50 },
        { hora: "13:00", ascensos: 15, descensos: 17, ocupacion: 48 },
        { hora: "14:00", ascensos: 30, descensos: 18, ocupacion: 60 },
        { hora: "15:00", ascensos: 10, descensos: 25, ocupacion: 45 },
        { hora: "16:00", ascensos: 5,  descensos: 20, ocupacion: 30 },
        { hora: "17:00", ascensos: 3,  descensos: 13, ocupacion: 20 },
        { hora: "18:00", ascensos: 2,  descensos: 12, ocupacion: 10 },
    ]
};

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
    const slider      = document.getElementById('slider-hora');
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
        const h = parseInt(slider.value);
        label.textContent = `Franja horaria: ${String(h).padStart(2,'0')}:00 - ${String(h+1).padStart(2,'0')}:00`;
        renderizarPoligonoCarga(MOCK_FRANJA);
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
    llenarSelectoresRuta(MOCK_RUTAS);

    // ── Event listeners de botones ────────────────────────────
    const btnFranja   = document.getElementById('btn-consultar-franja');
    const btnEstacion = document.getElementById('btn-consultar-estacion');

    if (btnFranja) {
        btnFranja.replaceWith(btnFranja.cloneNode(true));
        document.getElementById('btn-consultar-franja').addEventListener('click', () => {
            const fecha = document.getElementById('fecha-franja').value;
            const ruta  = document.getElementById('ruta-franja').value;
            if (!fecha || !ruta) {
                alert('Selecciona una fecha y una ruta para continuar.');
                return;
            }
            inicializarSlider(MOCK_RANGO.hora_inicio, MOCK_RANGO.hora_fin);
            renderizarPoligonoCarga(MOCK_FRANJA);
        });
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