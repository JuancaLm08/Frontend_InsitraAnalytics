// Variable global para guardar terids seleccionados
let grupoSeleccionado = null;
let unidadesSeleccionadas = [];

// Colores para los valores de los autobuses
const PALETA_COLORES = [
    "#ff0055", "#217dbe", "#2fac2f",
    "#ffcb20", "#9467bd",
]

/**********************************************************************************************************************************************************/
// INICIALIZACIÓN Y EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    const customSelect = document.querySelector('.custom-select');
    const busList = document.getElementById('bus-list');
    const selectAllCheckbox = document.getElementById('select-all-bus');
    
    // Escuchar cambios en las fechas
    const fechaInicio = document.getElementById('fecha-inicio-unidades');
    const fechaFinal = document.getElementById('fecha-final-unidades');
    [fechaInicio, fechaFinal].forEach(input => {
        input.addEventListener('change', () => {
            if (unidadesSeleccionadas.length > 0) {
                dispararActualizacionGlobal();
            }
        });
    });

    // ABRIR / CERRAR EL SELECT 
    customSelect.addEventListener('click', (e) => {
        e.stopPropagation(); // Evita que el clic cierre el menú inmediatamente
        const isVisible = busList.style.display === 'block';
        busList.style.display = isVisible ? 'none' : 'block';
    });

    // CERRAR AL HACER CLIC FUERA
    document.addEventListener('click', (e) => {
        if (!customSelect.contains(e.target) && !busList.contains(e.target)) {
            busList.style.display = 'none';
        }
    });

    // LÓGICA DE "SELECCIONAR TODOS"
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const options = busList.querySelectorAll('.option');
            const isChecked = e.target.checked;
            
            unidadesSeleccionadas = []; 
            options.forEach(opt => {
                if (isChecked) {
                    opt.classList.add('active');
                    unidadesSeleccionadas.push(opt.dataset.terid);
                } else {
                    opt.classList.remove('active');
                }
            });
            
            actualizarPlaceholder();
            dispararActualizacionGlobal();
        });
    }
});

/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR EL PLACEHOLDER CON LOS AUTOBUSES SELECCIONADOS
function actualizarPlaceholder() {
    const container = document.getElementById('select-placeholder');
    container.innerHTML = ''; // Limpiamos

    if (unidadesSeleccionadas.length === 0) {
        container.innerText = 'Selecciona el / los autobús(es)';
        return;
    }

    // Buscamos todas las opciones disponibles para obtener el texto (Placa)
    const options = document.querySelectorAll('#bus-list .option');
    
    unidadesSeleccionadas.forEach(terid => {
        // Encontrar la placa correspondiente al terid
        const opt = Array.from(options).find(o => o.dataset.terid === terid);
        const textoPlaca = opt ? opt.innerText : terid;

        // Crear la etiqueta (Tag)
        const tag = document.createElement('div');
        tag.className = 'bus-tag';
        tag.innerHTML = `
            <span>${textoPlaca}</span>
            <span class="remove-tag" data-terid="${terid}">×</span>
        `;

        // Evento para quitar la etiqueta al hacer clic en la X
        tag.querySelector('.remove-tag').addEventListener('click', (e) => {
            e.stopPropagation(); // Evita abrir el menú al borrar
            const idParaQuitar = e.target.dataset.terid;
            
            // Reutilizamos tu lógica de toggle: buscamos el div original en la lista y le damos click
            const opcionOriginal = Array.from(options).find(o => o.dataset.terid === idParaQuitar);
            if (opcionOriginal) {
                toggleSeleccionIndividual(opcionOriginal, idParaQuitar);
            }
        });

        container.appendChild(tag);
    });
}

/**********************************************************************************************************************************************************/
// FUNCION PARA CARGA DE LA LISTA DE AUTOBUSES
async function cargarListaBuses(groupId) {
    grupoSeleccionado = groupId;
    const busListContainer = document.getElementById('bus-list');
    const selectAllCheckbox = document.getElementById('select-all-bus');
    
    try {
        const response = await fetch(`/api/unidades-lista?groupid=${groupId}`);
        const buses = await response.json();
        
        busListContainer.innerHTML = '';
        unidadesSeleccionadas = [];
        
        if (buses.length === 0) return;

        const indiceAzar = Math.floor(Math.random() * buses.length);

        buses.forEach((bus, index) => {
            const div = document.createElement('div');
            div.className = 'option';
            div.dataset.terid = bus.terid;
            div.innerText = bus.placa;
            
            if (index === indiceAzar) {
                div.classList.add('active');
                unidadesSeleccionadas.push(bus.terid);
            }

            div.onclick = (e) => {
                e.stopPropagation();
                toggleSeleccionIndividual(div, bus.terid);
            };
            busListContainer.appendChild(div);
        });

        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        
        actualizarPlaceholder();
        if(unidadesSeleccionadas.length > 0) dispararActualizacionGlobal();

    } catch (e) {
        console.error("Error:", e);
    }
}

function toggleSeleccionIndividual(elemento, terid) {
    elemento.classList.toggle('active');
    const index = unidadesSeleccionadas.indexOf(terid);
    
    if (index > -1) {
        unidadesSeleccionadas.splice(index, 1);
    } else {
        unidadesSeleccionadas.push(terid);
    }
    
    // Desmarcar "Seleccionar todos" si se quita uno manualmente
    const selectAllCheckbox = document.getElementById('select-all-bus');
    const allOptions = document.querySelectorAll('#bus-list .option').length;
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = (unidadesSeleccionadas.length === allOptions);
    }

    actualizarPlaceholder();
    dispararActualizacionGlobal();
}

/**********************************************************************************************************************************************************/
// FUNCION PARA MOSTRAR LAS GRAFICAS DE LA SECCION UNIDADES
function renderizarGraficaUnidades(data, containerId) {
    const chartDiv = document.getElementById(containerId);
    const colorTexto = getChartFontColor();
    
    if (!chartDiv || !data.tabla || !data.tabla.rows) return;

    const config = data.grafica.config || {};
    const rows = data.tabla.rows;

    // Agrupar por Placa
    const grupos = {};
    rows.forEach(row => {
        const placa = row.col2;
        if (!grupos[placa]) {
            grupos[placa] = { x: [], y: [] };
        }
        grupos[placa].x.push(row.col1);
        grupos[placa].y.push(row.col3);
    });

    // Crear las series con colores automáticos
    const traces = Object.keys(grupos).map((placa, index) => {
        const color = PALETA_COLORES[index % PALETA_COLORES.length];
        return {
            x: grupos[placa].x,
            y: grupos[placa].y,
            name: placa,
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: color, width: 2.5, shape: 'linear' },
            marker: { color: color, size: 8 },
            connectgaps: true
        };
    });

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        autosize: true,

        hoverlabel: {
            bgcolor: '#ffffff',
            bordercolor: '#ffffff',
            font: { color: '#000000', family: "'Orbitron', sans-serif", size: 12 }
        },

        font: { color: colorTexto, family: "'Orbitron', sans-serif" },
        margin: { t: 40, r: 30, b: 60, l: 80 },
        showlegend: true, 
        legend: {
            font: {size: 12, color: "#00000", family: "'Orbitron', sans-serif" },
            orientation: 'v',
            x: 1.02,
            y: 1
        },

        xaxis: { 
            title: { text: config.xTitle || 'Día', font: { size: 14 } },
            showgrid: false,
            gridcolor: 'rgba(128,128,128,0.1)',
            tickangle: -30,
            tickfont: { color: getChartFontColor() }
        },
        yaxis: { 
            title: { text: config.yTitle || 'Valor', font: { size: 14 }, standoff: 15},
            gridcolor: getGridColor(),
            tickfont: { color: getChartFontColor() }
        },
        hovermode: 'x unified'
    };

    Plotly.newPlot(chartDiv, traces, layout, { 
        responsive: true, 
        displaylogo: false,
        displayModeBar: false
    }).then(() => {
        Plotly.Plots.resize(chartDiv);

        const resizeObserver = new ResizeObserver(() => {
            Plotly.Plots.resize(chartDiv);
        });
        resizeObserver.observe(chartDiv);
    });
}

/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR EN DASHBOARD EN LA SECCION DE UNIDADES
async function actualizarDashboardUnidades() {
    const inicio = document.getElementById('fecha-inicio-unidades').value;
    const final = document.getElementById('fecha-final-unidades').value;
    const section = document.getElementById('section-unidades');
    
    const banners = section.querySelectorAll('.status-banner');
    const contentPasajeros = document.getElementById('unidades-pasajeros-content');
    const contentKilometraje = document.getElementById('unidades-kilometraje-content');

    // Realizar la validación de las fechas ingresadas
    const validacion = validarRangoFechas(inicio, final);

    if (!validacion.valido) {
        if (contentPasajeros) contentPasajeros.style.display = 'none';
        if (contentKilometraje) contentKilometraje.style.display = 'none';
        
        banners.forEach(b => { b.textContent = validacion.msj; b.style.display = 'block'; });
        return; 
    }

    try {
        const teridsStr = unidadesSeleccionadas.join(',');
        if (!teridsStr) {
            banners.forEach(b => {
                b.textContent = "Por favor, selecciona al menos un autobús."; b.style.display = 'block';
                contentPasajeros.style.display = 'none';
                contentKilometraje.style.display = 'none';  
            });
            return;
        }

        const response = await fetch(`/api/unidades-data?groupid=${grupoSeleccionado}&inicio=${inicio}&final=${final}&terids=${teridsStr}`);
        const data = await response.json();

        if (data.success) {
            banners.forEach(b => b.style.display = 'none');
            
            if(contentPasajeros) contentPasajeros.style.display = 'block';
            if(contentKilometraje) contentKilometraje.style.display = 'block';

            if (data.pasajeros && data.pasajeros.tabla.rows.length > 0) {
                renderizarGraficaUnidades(data.pasajeros, 'chart-ascensos-unidad-dia');
                renderizarTablaMaster(data.pasajeros.tabla, 'tabla-ascensos-unidad-dia');
                const totalAsc = data.pasajeros.total_pasajeros;
                document.getElementById('total-ascensos-unidades').innerText = totalAsc.toLocaleString() + " pasajeros";
            }

            if (data.kilometraje && data.kilometraje.tabla.rows.length > 0) {
                renderizarGraficaUnidades(data.kilometraje, 'chart-kilometraje-unidad-dia');
                renderizarTablaMaster(data.kilometraje.tabla, 'tabla-kilometraje-unidad-dia');
                const totalKm = data.kilometraje.total_kilometraje;
                document.getElementById('total-kilometraje-unidades').innerText = totalKm.toLocaleString() + " km";
            }
            
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);

        } else {
            if(contentPasajeros) contentPasajeros.style.display = 'none';
            if(contentKilometraje) contentKilometraje.style.display = 'none';
            
            banners.forEach(b => { b.textContent = "No hay datos para los filtros seleccionados."; b.style.display = 'block'; });
        }
    } catch (error) {
        console.error("Error:", error);
        banners.forEach(b => { b.textContent = "Error al conectar con el servidor."; b.style.display = 'block'; });
        contentPasajeros.style.display = 'none';
        contentKilometraje.style.display = 'none';
    }
}

