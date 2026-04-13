let map; // Variable global para ver y trabajar con el mapa
window.currentActiveView = 'Inicio';

/**********************************************************************************************************************************************************/
// DEFINIR LA SECCION DE INCIO COMO LA INICIAL
window.onload = function() {
    const btnInicio = document.getElementById("default-view");
    if (btnInicio) {
        changeView('Inicio', btnInicio);
    }
};

/**********************************************************************************************************************************************************/
// FUNCION PARA OBTENER Y ESTABLECER EL COLOR DEL FONDO 
function getGridColor() {
    const isLight = document.body.classList.contains('light-mode');
    return isLight ? '#d1d1d1' : '#31333F';
}

/**********************************************************************************************************************************************************/
// FUNCION PARA OBTENER EL COLOR DEL TEXTO
function getChartFontColor() {
    return getComputedStyle(document.body).getPropertyValue('--texto').trim() || '#ffffff';
}

/**********************************************************************************************************************************************************/
// FUNCION PARA CAMBIAR EL TEMA DEL DASHBOARD
function setTheme(theme) {
    const body = document.body;
    const lightBtn = document.getElementById('theme-light');
    const darkBtn = document.getElementById('theme-dark');
    const logoImg = document.querySelector('.logo-top-nav');

    // Aplicar cambios de clase y UI
    if (theme === 'light') {
        body.classList.add('light-mode');
        if (lightBtn) lightBtn.classList.add('active');
        if (darkBtn) darkBtn.classList.remove('active');
        if (logoImg) logoImg.src = "../static/images/LoginTitle.png";
    } else {
        body.classList.remove('light-mode');
        if (darkBtn) darkBtn.classList.add('active');
        if (lightBtn) lightBtn.classList.remove('active');
        if (logoImg) logoImg.src = "../static/images/LoginTitle_white.png";
    }

    // ACTUALIZAR GRÁFICAS DE PLOTLY
    const charts = document.querySelectorAll('.js-plotly-plot');
    
    if (charts.length > 0) {
        const nuevoColor = getChartFontColor();
        const nuevaGrid = getGridColor();

        const update = {
            'font.color': nuevoColor,
            'xaxis.tickfont.color': nuevoColor,
            'yaxis.tickfont.color': nuevoColor,
            'yaxis.gridcolor': nuevaGrid,
            'xaxis.title.font.color': nuevoColor,
            'yaxis.title.font.color': nuevoColor
        };

        charts.forEach(chart => {
            Plotly.relayout(chart, update);
        });
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

    // Manejo de cambio de fechas
    const inputsFecha = ['fecha-inicio-totales', 'fecha-final-totales', 'fecha-inicio-unidades', 'fecha-final-unidades', 'fecha-inicio-ruta', 'fecha-final-ruta'];
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
    const hoy = new Date();
    const fechaFinalStr = hoy.toISOString().split('T')[0]; 

    const haceSeisDias = new Date();
    haceSeisDias.setDate(hoy.getDate() - 6);
    const fechaInicioStr = haceSeisDias.toISOString().split('T')[0];

    const camposFecha = [
        { id: 'fecha-inicio-totales', valor: fechaInicioStr },
        { id: 'fecha-final-totales',  valor: fechaFinalStr },
        { id: 'fecha-inicio-unidades', valor: fechaInicioStr },
        { id: 'fecha-final-unidades',  valor: fechaFinalStr },
        { id: 'fecha-inicio-ruta',     valor: fechaFinalStr }, 
        { id: 'fecha-final-ruta',      valor: fechaFinalStr }
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

    const trace = {
        x: data.labels,
        y: data.values,
        text: hoverMessages,
        hoverinfo: 'text',          
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: config.color || '#ff0055', width: 2.5, shape: 'linear' },
        marker: { color: config.color || '#ff0055', size: 9 },
        name: config.label || 'Datos'
    };

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        autosize: true,
        font: { color: getChartFontColor(), family: "'Orbitron', sans-serif" },
        margin: { t: 30, r: 20, b: 60, l: 60 },
        showlegend: false, 

        hoverlabel: { 
            bgcolor: '#ff0055',
            font: { color: '#ffffff', family: "'Orbitron', sans-serif", size: 14 },
            bordercolor: config.color || '#ff0055'
        },

        xaxis: { 
            title: { text: config.xTitle || 'X', font: { size: 14 } },
            showgrid: false,
            zeroline: false,
            tickfont: { size: 11 }
        },
        yaxis: { 
            title: { text: config.yTitle || 'Y', font: { size: 14 }, standoff: 20},
            showgrid: true,
            gridcolor: getGridColor(),
            zeroline: true,
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