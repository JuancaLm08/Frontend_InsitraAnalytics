let map; // Variable global para ver y trabajar con el mapa
window.currentActiveView = 'Inicio';

/* =========================================================================================
   CONFIGURACION VISUAL DE LAS GRAFICAS
   MINIMAL_AXES = true  -> como el diseño nuevo: sin títulos de eje y sin números en el eje Y
   MINIMAL_AXES = false -> recupera los números del eje Y y los títulos de ambos ejes
   ========================================================================================= */
const MINIMAL_AXES = false;


window.onload = function() {
    const btnInicio = document.getElementById("default-view");
    if (btnInicio) {
        changeView('Inicio', btnInicio);
    }
};
/**********************************************************************************************************************************************************/
// LECTURA DE TOKENS DE COLOR DEFINIDOS EN estilo_Dashboard.css
function cssVar(nombre, fallback) {
    const v = getComputedStyle(document.body).getPropertyValue(nombre).trim();
    return v || fallback;
}

// Convierte "#E8175D" (o rgb()) a rgba con la opacidad indicada
function conAlpha(color, alpha) {
    const hex = color.replace('#', '');
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
}

function temaGrafica() {
    return {
        accent:     cssVar('--accent', '#E8175D'),
        grid:       cssVar('--borde-principal', '#21262C'),
        texto:      cssVar('--texto', '#ECEFF1'),
        suave:      cssVar('--texto-suave', '#8C959F'),
        superficie: cssVar('--superficie-2', '#171B20')
    };
}

/**********************************************************************************************************************************************************/
// FUNCION PARA OBTENER Y ESTABLECER EL COLOR DE LA CUADRICULA (se conserva por compatibilidad)
function getGridColor() {
    return cssVar('--borde-principal', '#21262C');
}

/**********************************************************************************************************************************************************/
// FUNCION PARA OBTENER EL COLOR DEL TEXTO (se conserva por compatibilidad)
function getChartFontColor() {
    return cssVar('--texto-suave', '#8C959F');
}

/**********************************************************************************************************************************************************/
// FUNCION PARA CAMBIAR EL TEMA DEL DASHBOARD
function setTheme(theme) {
    const body = document.body;
    const toggleInput = document.getElementById('theme-toggle-input');
    const logoImg = document.querySelector('.logo-top-nav');

    // Aplicar cambios de clase y UI
    if (theme === 'light') {
        body.classList.add('light-mode');
        if (toggleInput) toggleInput.checked = false;
        if (logoImg) logoImg.src = "../static/images/LoginTitle.png";
    } else {
        body.classList.remove('light-mode');
        if (toggleInput) toggleInput.checked = true;
        if (logoImg) logoImg.src = "../static/images/LoginTitle_white.png";
    }

    // ACTUALIZAR GRÁFICAS DE PLOTLY
    // El restyle global pinta line/marker/fill con el acento único: sirve para
    // gráficas de UNA serie, pero aplastaría a las multiserie (Unidades, Polígono
    // de Carga), dejándolas todas del mismo color. Por eso separamos:
    //  - relayout (rejilla, tipografía, hover) sí aplica a TODAS las gráficas.
    //  - restyle de color solo a las que NO son multiserie.
    // Las de Polígono de Carga además se repintan con su propia paleta desde
    // js_PoligonoCarga.js; las de Unidades usan PALETA_COLORES fija, así que con
    // excluirlas del restyle basta para que conserven sus colores.
    const todasLasGraficas = document.querySelectorAll('.js-plotly-plot');
    const graficasUnaSerie = document.querySelectorAll(
        '.js-plotly-plot:not(.pc-chart):not(.grafica-multiserie)'
    );

    if (todasLasGraficas.length > 0) {
        const t = temaGrafica();

        const relayout = {
            'font.color': t.suave,
            'xaxis.tickfont.color': t.suave,
            'yaxis.tickfont.color': t.suave,
            'yaxis.gridcolor': t.grid,
            'hoverlabel.bgcolor': t.superficie,
            'hoverlabel.bordercolor': conAlpha(t.accent, 0.5),
            'hoverlabel.font.color': t.texto
        };

        const restyle = {
            'line.color': t.accent,
            'marker.color': t.accent,
            'fillcolor': conAlpha(t.accent, 0.10),
            'fillgradient.colorscale': [[
                [0, conAlpha(t.accent, 0.00)],
                [1, conAlpha(t.accent, 0.10)]
            ]]
        };

        // Rejilla/tipografía/hover a todas (incluidas las multiserie)
        todasLasGraficas.forEach(chart => Plotly.relayout(chart, relayout));

        // Color de línea/marcador/relleno solo a las de una serie
        graficasUnaSerie.forEach(chart => Plotly.restyle(chart, restyle));
    }
}

/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR LA SECCION ACTUAL POR MEDIO DE BOTON
document.addEventListener('DOMContentLoaded', () => {
    const btnRefresh = document.getElementById('btn-refresh');

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            dispararActualizacionGlobal();
        });
    }

    // Manejo del cambio de corredor
    const selectCorredor = document.getElementById('select-corredor');
    if (selectCorredor) {
        selectCorredor.addEventListener('change', () => {
            if (typeof seccionesCargadas !== 'undefined') {
                Object.keys(seccionesCargadas).forEach(k => seccionesCargadas[k] = false);
            }
            dispararActualizacionGlobal();
        });
    }

    // Manejo de cambio de fechas y horas
    const inputsFecha = ['fecha-inicio-totales', 'fecha-final-totales', 'fecha-inicio-unidades', 'fecha-final-unidades', 'fecha-ruta', 'hora-inicio-h-ruta', 'hora-inicio-m-ruta', 'hora-final-h-ruta', 'hora-final-m-ruta'];
    inputsFecha.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                if (typeof seccionesCargadas !== 'undefined') {
                    seccionesCargadas[window.currentActiveView] = false;
                }
            });
        }
    });
});

/**********************************************************************************************************************************************************/
// FUNCION PARA ESTABLECER LAS FECHAS DE INICIO Y FIN EN TOTALES, UNIDADES Y RUTA
function inicializarFechas() {
    // Asegurar que los selects de hora de Ruta tengan sus opciones antes de asignar valores
    if (typeof llenarOpcionesHoraRuta === 'function') {
        llenarOpcionesHoraRuta();
    }

    // Usar hora LOCAL del cliente (no UTC) para evitar que después de las 18:00 CST
    // toISOString() devuelva el día siguiente al estar ya en UTC+siguiente_día
    const _localDateStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const hoy = new Date();
    const fechaFinalStr = _localDateStr(hoy);

    const haceSeisDias = new Date();
    haceSeisDias.setDate(hoy.getDate() - 6);
    const fechaInicioStr = _localDateStr(haceSeisDias);

    const camposFecha = [
        { id: 'fecha-inicio-totales', valor: fechaInicioStr },
        { id: 'fecha-final-totales',  valor: fechaFinalStr },
        { id: 'fecha-inicio-unidades', valor: fechaInicioStr },
        { id: 'fecha-final-unidades',  valor: fechaFinalStr },
        { id: 'fecha-ruta',            valor: fechaFinalStr },
        { id: 'hora-inicio-h-ruta',    valor: '00' },
        { id: 'hora-inicio-m-ruta',    valor: '00' },
        { id: 'hora-final-h-ruta',     valor: '23' },
        { id: 'hora-final-m-ruta',     valor: '59' }
    ];

    // Recorremos el arreglo y solo asignamos si el elemento existe
    camposFecha.forEach(campo => {
        const elemento = document.getElementById(campo.id);
        if (elemento) {
            elemento.value = campo.valor;
        }
    });
}
document.addEventListener('DOMContentLoaded', inicializarFechas);

/**********************************************************************************************************************************************************/
// FUNCION PARA VALIDAR QUE LAS FECHAS INGRESADAS EN TOTALES, UNIDADES Y RUTA SEAN CORRECTAS
function validarRangoFechas(inicio, final) {
    const maxDias = 31;
    const dateHoy = new Date();
    dateHoy.setHours(0, 0, 0, 0);

    if (!inicio || !final) {
        return { valido: false };
    }

    const dateInicio = new Date(inicio + "T00:00:00");
    const dateFinal = new Date(final + "T00:00:00");

    if (dateFinal > dateHoy) {
        return { valido: false, msj: "La fecha final no puede ser después de hoy." };
    }

    if (dateInicio > dateFinal) {
        return { valido: false, msj: "La fecha de inicio no puede ser mayor a la fecha final." };
    }

    const diffTime = Math.abs(dateFinal - dateInicio);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > maxDias) {
        return { valido: false, msj: "El rango de fechas no puede ser mayor a 31 días." };
    }

    return { valido: true, msj: "OK" };
}

/**********************************************************************************************************************************************************/
// FUNCION PARA DESCARGAR EN UN CSV EL CONTENIDO DE LAS TABLAS
function exportTableToCSV(tableID) {
    const table = document.getElementById(tableID);
    let csv = [];
    const rows = table.querySelectorAll("tr");

    for (const row of rows) {
        const cols = row.querySelectorAll("td, th");
        const rowData = Array.from(cols).map(col => `"${col.innerText.replace(/"/g, '""')}"`);
        csv.push(rowData.join(","));
    }

    const csvContent = "\uFEFF" + csv.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.setAttribute("href", url);
    link.setAttribute("download", `${tableID}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**********************************************************************************************************************************************************/
// FUNCION MODULARIZADA PARA MOSTRAR UNA TABLA SEGUN LOS DATOS RECIBIDOS
function renderizarTablaMaster(data, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    // 1. Renderizar Cabeceras
    const thead = table.querySelector('thead');
    if (thead && data.headers) {
        thead.innerHTML = `<tr><th style="width: 30px;">#</th>${data.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    }

    // 2. Renderizar Filas (N columnas)
    const tbody = table.querySelector('tbody');
    if (tbody && data.rows && data.rows.length > 0) {
        tbody.innerHTML = data.rows.map((row, i) => {
            const celdasDinamicas = Object.values(row).map(val => `<td>${val}</td>`).join('');

            return `
                <tr>
                    <td class="row-index">${i + 1}</td>
                    ${celdasDinamicas}
                </tr>`;
        }).join('');
    }
}

/**********************************************************************************************************************************************************/
// FUNCION MODULARIZADA PARA MOSTRAR UNA GRAFICA SEGUN LOS DATOS RECIBIDOS
function renderizarGraficaMaster(data, containerId) {
    const chartDiv = document.getElementById(containerId);
    if (!chartDiv || !data.values || data.values.length === 0) return;

    const config = data.config || {};
    const t = temaGrafica();
    const color = t.accent;

    let hoverMessages = data.hovertext || [];
    if (hoverMessages.length === 0) {
        const nombreEjeX = config.xTitle || 'X';
        const nombreEjeY = config.label || 'Valor';

        hoverMessages = data.labels.map((label, index) => {
            const valor = data.values[index];
            const valorFormateado = typeof valor === 'number' ? valor.toLocaleString() : valor;

            return `<b>${nombreEjeX}:</b> ${label}<br><b>${nombreEjeY}:</b> ${valorFormateado}`;
        });
    }

    // Rango vertical del relleno, para anclar el degradado
    const numeros = data.values.map(Number).filter(Number.isFinite);
    const yMax = numeros.length ? Math.max(...numeros) : 1;
    const yMin = Math.min(0, ...(numeros.length ? numeros : [0]));

    const trace = {
        x: data.labels,
        y: data.values,
        text: hoverMessages,
        hoverinfo: 'text',
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: color, width: 2, shape: 'spline', smoothing: 0.5 },
        marker: { color: color, size: 5, line: { width: 0 } },
        fill: 'tozeroy',
        // fillcolor queda como respaldo si Plotly < 2.27 (ignora fillgradient)
        fillcolor: conAlpha(color, 0.10),
        fillgradient: {
            type: 'vertical',
            start: yMin,                 // abajo: transparente
            stop: yMax,                  // arriba: color
            colorscale: [
                [0, conAlpha(color, 0.00)],
                [1, conAlpha(color, 0.10)]
            ]
        },
        name: config.label || 'Datos'
    };

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        autosize: true,
        font: { color: t.suave, family: "'Orbitron', sans-serif", size: 11 },
        margin: { t: 10, r: 14, b: 34, l: MINIMAL_AXES ? 14 : 52 },
        showlegend: false,

        hovermode: 'closest',
        hoverlabel: {
            bgcolor: t.superficie,
            bordercolor: conAlpha(color, 0.5),
            font: { color: t.texto, family: "'Orbitron', sans-serif", size: 11 },
            align: 'left'
        },

        xaxis: {
            title: MINIMAL_AXES ? null : { text: config.xTitle || 'X', font: { size: 12 } },
            type: 'category',
            showgrid: false,
            zeroline: false,
            showline: false,
            ticks: '',
            tickfont: { size: 10, color: t.suave },
            automargin: true,
            range: (data.labels && data.labels.length) ? [-0.5, data.labels.length - 0.5] : undefined
        },
        yaxis: {
            title: MINIMAL_AXES ? null : { text: config.yTitle || 'Y', font: { size: 12 }, standoff: 18 },
            showgrid: true,
            gridcolor: t.grid,
            gridwidth: 1,
            zeroline: false,
            showline: false,
            ticks: '',
            showticklabels: !MINIMAL_AXES,
            tickfont: { size: 10, color: t.suave },
            range: [ -(yMax > 0 ? yMax : 1) * 0.06, (yMax > 0 ? yMax : 1) * 1.08 ],
            nticks: 4,
            automargin: true
        }
    };

    Plotly.newPlot(chartDiv, [trace], layout, {
        responsive: true,
        displaylogo: false,
        displayModeBar: false
    }).then(() => {
        Plotly.Plots.resize(chartDiv);
        const resizeObserver = new ResizeObserver(() => {
            if (chartDiv.clientWidth > 0) Plotly.Plots.resize(chartDiv);
        });
        resizeObserver.observe(chartDiv);
    });
}