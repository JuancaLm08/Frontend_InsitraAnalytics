
/**********************************************************************************************************************************************************/
// ACTUALIZAR EL DASHBOARD EN CASO DE QUE CAMBIEN LAS FECHAS DE CONSULTA
document.addEventListener('DOMContentLoaded', () => {
        
    // Escuchar cambios en las fechas
    const fechaInicio = document.getElementById('fecha-inicio-totales');
    const fechaFinal = document.getElementById('fecha-final-totales');
    [fechaInicio, fechaFinal].forEach(input => {
        input.addEventListener('change', () => {
            const groupId = document.getElementById('select-corredor').value; // Solo disparamos si hay un corredor seleccionado
            if (groupId) {
                dispararActualizacionGlobal();
            }
        });
    });
});

/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR EN DASHBOARD EN LA SECCION DE TOTALES
async function actualizarDashboardTotales(groupId) {
    const inicio = document.getElementById('fecha-inicio-totales').value;
    const final = document.getElementById('fecha-final-totales').value;

    const contentPasajeros = document.getElementById('totales-pasajeros-content');
    const contentKm = document.getElementById('totales-kilometraje-content');
    // Solo los avisos de la pestaña de rango (la de día tiene el suyo)
    const banners = document.querySelectorAll('#tab-totales-rango .status-banner');

    // Realizar la validación de las fechas
    const validacion = validarRangoFechas(inicio, final);
    
    if (!validacion.valido) {
        if (contentPasajeros) contentPasajeros.style.display = 'none';
        if (contentKm) contentKm.style.display = 'none';
        
        banners.forEach(b => { b.textContent = validacion.msj; b.style.display = 'block'; });
        return; 
    }

    try {
        const response = await fetch(`/api/totales-data?groupid=${groupId}&inicio=${inicio}&final=${final}`);
        const data = await response.json();

        if (data.success) {
            banners.forEach(b => b.style.display = 'none');
            if (contentPasajeros) contentPasajeros.style.display = 'block';
            if (contentKm) contentKm.style.display = 'block';

            renderizarGraficaMaster(data.pasajeros.grafica_total, 'chart-total-ascensos-dia');
            renderizarGraficaMaster(data.pasajeros.grafica_promedio, 'chart-promedio-unidad-dia');
            renderizarTablaMaster(data.pasajeros.tabla, 'tabla-promedio-unidad-dia');
            const totalPas = data.pasajeros.total_pasajeros;
            document.getElementById('total-pasajeros-totales').innerText = totalPas.toLocaleString() + " pasajeros";

            renderizarGraficaMaster(data.kilometraje.grafica_total, 'chart-kilometraje-dia');
            renderizarGraficaMaster(data.kilometraje.grafica_promedio, 'chart-promedio-kilometraje-dia');
            renderizarTablaMaster(data.kilometraje.tabla, 'tabla-kilometraje-promedio-unidad-dia');
            const totalKm = data.kilometraje.total_kilometros;
            document.getElementById('total-kilometros-totales').innerText = totalKm.toLocaleString() + " km";

            setTimeout(() => {
                const allCharts = document.querySelectorAll('.js-plotly-plot');
                allCharts.forEach(c => Plotly.Plots.resize(c));
            }, 300);

            // La pestaña de día se consulta solo si está a la vista; si no,
            // queda pendiente para cuando se abra (cada día completo implica
            // procesar el GPS de todo el corredor).
            _td.pendiente = true;
            if (_totalesTabActiva() === 'totales-dia') await actualizarConsultaDia(groupId);

        } else {
            if(contentPasajeros) contentPasajeros.style.display = 'none';
            if(contentKm) contentKm.style.display = 'none';
            
            banners.forEach(b => { b.textContent = "No hay datos para los filtros seleccionados."; b.style.display = 'block'; });
        }
    } catch (error) {
        console.error("Error en Totales:", error);
        banners.forEach(b => { b.textContent = "Error de conexión con el servidor."; b.style.display = 'block'; });
        contentPasajeros.style.display = 'none';
        contentKm.style.display = 'none';
    }
}


/**********************************************************************************************************************************************************/
// PESTAÑA "CONSULTA POR DÍA"
// Las tres gráficas de Inicio (ascensos, km e IPK por hora) para un día ya
// cerrado. El back aplica la misma lógica que Inicio; aquí solo se dibuja.
/**********************************************************************************************************************************************************/
const _td = { pendiente: true };
const GRAFICAS_DIA = ['chart-dia-ascensos', 'chart-dia-km', 'chart-dia-ipk'];

function _totalesTabActiva() {
    const b = document.querySelector('#section-totales .tab-btn.active');
    return b ? b.dataset.tab : 'totales-rango';
}

// Ayer en hora local del cliente (mismo criterio que inicializarFechas)
function _ayerISO() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _redimensionarGraficasDia() {
    GRAFICAS_DIA.forEach(id => {
        const g = document.getElementById(id);
        if (g && g.data && typeof Plotly !== 'undefined') Plotly.Plots.resize(g);
    });
}

function _mostrarDia(content, banner, msj) {
    if (msj) {
        banner.textContent = msj;
        banner.style.display = 'block';
        content.style.display = 'none';
    } else {
        banner.style.display = 'none';
        content.style.display = 'block';
    }
}

const _fmtEntero = v => (v === null || v === undefined) ? '--' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 });

async function actualizarConsultaDia(groupId) {
    const content = document.getElementById('totales-dia-content');
    const banner = document.getElementById('no-data-banner-totales-dia');
    const fecha = document.getElementById('fecha-dia-totales').value;
    if (!content || !banner || !groupId) return;

    _td.pendiente = false;

    if (!fecha) { _mostrarDia(content, banner, 'Selecciona una fecha.'); return; }
    if (fecha > _ayerISO()) { _mostrarDia(content, banner, 'Solo se pueden consultar días anteriores a hoy. El día en curso está en Inicio.'); return; }

    content.classList.add('loading-blur');
    try {
        const response = await fetch(`/api/totales-dia-data?groupid=${groupId}&fecha=${fecha}`);
        const data = await response.json();

        const hayDatos = data.success && [data.pasajeros, data.kilometros, data.IPK].some(
            s => s && s.grafica && Array.isArray(s.grafica.values) && s.grafica.values.length > 0
        );
        if (!hayDatos) {
            _mostrarDia(content, banner, data.success === false && data.error ? data.error : 'No hay datos para el día seleccionado.');
            return;
        }

        _mostrarDia(content, banner, null);

        const k = data.kpis || {};
        document.getElementById('dia-kpi-ascensos').innerText = data.tiene_contadores ? _fmtEntero(k.ascensos) : 'Sin contadores';
        document.getElementById('dia-kpi-km').innerText = `${_fmtEntero(k.kilometros)} km`;
        document.getElementById('dia-kpi-ipk').innerText = (k.ipk === null || k.ipk === undefined) ? '--' : Number(k.ipk).toFixed(2);

        // Explica por qué la gráfica/tabla no suman lo mismo que las tarjetas
        const help = document.getElementById('help-umbrales-dia');
        if (help) {
            const u = data.umbrales || {};
            const partes = [];
            if (data.tiene_contadores && Number(u.pasajeros_hora) > 0) partes.push(`menos de ${Number(u.pasajeros_hora).toLocaleString('es-MX')} ascensos`);
            if (Number(u.km_hora) > 0) partes.push(`menos de ${Number(u.km_hora).toLocaleString('es-MX')} km`);
            help.setAttribute('data-help', partes.length
                ? `Las gráficas y la tabla no muestran las horas con ${partes.join(' o ')} (umbral del corredor). Los indicadores de arriba sí las incluyen.`
                : 'Se muestran todas las horas con actividad.');
        }

        renderizarGraficaMaster(data.pasajeros?.grafica, 'chart-dia-ascensos');
        renderizarGraficaMaster(data.kilometros?.grafica, 'chart-dia-km');
        renderizarGraficaMaster(data.IPK?.grafica, 'chart-dia-ipk');
        renderizarTablaMaster(data.tabla, 'tabla-dia-totales');

    } catch (error) {
        console.error('Error en Totales (consulta por día):', error);
        _mostrarDia(content, banner, 'Error de conexión con el servidor.');
    } finally {
        content.classList.remove('loading-blur');
        setTimeout(_redimensionarGraficasDia, 150);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Fecha: por defecto ayer y como máximo ayer (día vencido)
    const inputDia = document.getElementById('fecha-dia-totales');
    if (inputDia) {
        inputDia.value = _ayerISO();
        inputDia.max = _ayerISO();
        inputDia.addEventListener('change', () => {
            const groupId = document.getElementById('select-corredor')?.value;
            if (groupId) actualizarConsultaDia(groupId);
        });
    }

    // Pestañas
    document.querySelectorAll('#section-totales .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#section-totales .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#section-totales > .tab-content').forEach(t => t.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';

            if (btn.dataset.tab === 'totales-dia') {
                const groupId = document.getElementById('select-corredor')?.value;
                if (_td.pendiente && groupId) actualizarConsultaDia(groupId);
                else _redimensionarGraficasDia();
            } else {
                // Las gráficas del rango se dibujaron con la pestaña oculta o cambió el ancho
                document.querySelectorAll('#tab-totales-rango .js-plotly-plot').forEach(g => Plotly.Plots.resize(g));
            }
        });
    });
});
