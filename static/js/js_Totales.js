
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
    const banners = document.querySelectorAll('#section-totales .status-banner'); 

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

