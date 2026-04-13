/**********************************************************************************************************************************************************/
// FUNCION PARA DEFINIR EL TIPO DE FLECHA EN LAS METRICAS DE INICIO
const updateDeltaBadge = (id, valor, clase) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    const arrow = clase === 'up' ? '↑' : (clase === 'down' ? '↓' : '');    
    el.innerHTML = `<span>${arrow}</span> ${valor}`;
    
    el.className = `delta ${clase}`;
};

/**********************************************************************************************************************************************************/
// FUNCION PARA MOSTRAR LOS INDICADORES DEL DIA
function renderizarMetricas(data) {
    if (data.error) return;

    const labelDia = document.getElementById('label-comparativa-dia');
    if (labelDia) labelDia.innerText = `Pasajeros desde el último ${data.nombre_dia}`;

    document.getElementById('metric-pasajeros-dia').innerText = data.p_dia_pct;
    updateDeltaBadge('delta-pasajeros-dia', data.p_dia_delta, data.p_dia_clase);
    document.getElementById('metric-pasajeros-hora').innerText = data.p_hora_pct;
    updateDeltaBadge('delta-pasajeros-hora', data.p_hora_delta, data.p_hora_clase);
    document.getElementById('metric-total-pasajeros').innerText = data.total_dia;
    document.getElementById('metric-ultima-hora-total').innerText = data.ultima_hora_total;
    document.getElementById('metric-prediccion-pasajeros').innerText = data.prediccion_pasajeros;
}

/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR EN DASHBOARD EN LA OPCION DE INICIO 
async function actualizarDashboardInicio(groupId) {
    const content = document.getElementById('inicio-content');
    const noDataBanner = document.getElementById('no-data-banner-inicio');
    
    try {
        const response = await fetch(`/api/inicio-data?groupid=${groupId}`);
        const data = await response.json();

        if (!data.success) {
            if (noDataBanner) noDataBanner.style.display = 'block';
            if (content) content.style.display = 'none';
            return;
        }

        if (noDataBanner) noDataBanner.style.display = 'none';
        if (content) content.style.display = 'block';

        renderizarMetricas(data.metricas);

        try {
            const csvRes = await fetch('/static/data/DescripcionModelos.csv');
            const csvText = await csvRes.text();
            
            const filas = csvText.split('\n');
            const dataModelo = filas.find(f => f.startsWith(`${groupId},`) || f.startsWith(`${groupId}\t`));

            if (dataModelo) {
                const columnas = dataModelo.split(/[\t,]| {2,}/); 
                const precision = columnas[1]?.trim();
                const variacion = columnas[2]?.trim();

                const helpIcon = document.querySelector('#metric-prediccion-pasajeros').parentElement.querySelector('.help-icon');
                if (helpIcon) {
                    helpIcon.setAttribute('data-help', `Este indicador muestra una predicción de la cantidad de pasajeros estimados al final del día de hoy.\n` +
                                                       `Precisión: ${precision}%\n` +
                                                       `Variación: ±${variacion} pax.`
                    );
                }
            }
        } catch (csvErr) {
            console.warn("Error:", csvErr);
        }

        renderizarGraficaMaster(data.pasajeros.grafica, 'chart-pasajeros-hora');
        renderizarTablaMaster(data.pasajeros.tabla, 'tabla-pasajeros-hora');

        renderizarGraficaMaster(data.kilometros.grafica, 'chart-kilometros-hora');
        renderizarTablaMaster(data.kilometros.tabla, 'tabla-kilometros-hora');

        renderizarGraficaMaster(data.IPK.grafica, 'chart-IPK');
        renderizarTablaMaster(data.IPK.tabla, 'tabla-IPK');

    } catch (error) {
        console.error("Error:", error);
        if (noDataBanner) noDataBanner.style.display = 'block';
        if (content) content.style.display = 'none';
    } finally {
        if (content) content.classList.remove('loading-blur');
        
        // Ajuste de tamaño para Plotly
        setTimeout(() => {
            ['chart-pasajeros-hora', 'chart-kilometros-hora', 'chart-IPK'].forEach(id => {
                const div = document.getElementById(id);
                if (div && typeof Plotly !== 'undefined') Plotly.Plots.resize(div);
            });
        }, 150);
    }
}

