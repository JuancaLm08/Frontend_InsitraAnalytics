let puntosRutaGlobal = []; // Almacen para Turf.js
let heatLayer = null;
let drawnItems = null;

// Variables que se ocultans segun el contenido
const btnLimpiar = document.getElementById('btn-limpiar');
const messageBlue = document.getElementById('info-message-blue');
const tablaRuta = document.getElementById('data-expander-ruta');
const valorPasajeros = document.getElementById('valor-pasajeros');
const valorDescensos = document.getElementById('valor-descensos');

/**********************************************************************************************************************************************************/
// FUNCION PARA INICIALIZAR EL MAPA ACOTADO
function inicializarMapa() {
    if (map) {
        setTimeout(() => { map.invalidateSize(); }, 200);
        return;
    }

    const esquinasLimites = L.latLngBounds(
        L.latLng(14.02, -118.65), // Esquina inferior izquierda
        L.latLng(32.94, -85.95)   // Esquina superior derecha
    );

    map = L.map('map-canvas', {
        maxBounds: esquinasLimites, // Restringe el de movimiento en el mapa
        maxBoundsViscosity: 1.0,         
        minZoom: 5, maxZoom: 18                      
    }).setView([19.4326, -99.1332], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    inicializarHerramientasLDraw();

    const mapDiv = document.getElementById('map-canvas');
    const resizeObserver = new ResizeObserver(() => {
        if (map) {
            map.invalidateSize();
        }
    });
    resizeObserver.observe(mapDiv);

    map.on('drag', function() {
        map.panInsideBounds(esquinasLimites, { animate: false });
    });
}

/**********************************************************************************************************************************************************/
// FUNCION PARA CARGAR LAS HERRAMIENTAS PARA EL MAPA
function inicializarHerramientasLDraw() {
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        draw: { polyline: false, circle: false, marker: false, circlemarker: false },
        edit: { featureGroup: drawnItems, edit: false, remove: false }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, function (e) {
        drawnItems.clearLayers(); 
        const layer = e.layer;
        drawnItems.addLayer(layer);
        
        filtrarPuntosConTurf(layer.toGeoJSON());
    });
}

/**********************************************************************************************************************************************************/
// ACTUALIZAR EL DASHBOARD EN CASO DE QUE CAMBIEN LAS FECHAS DE CONSULTA
document.addEventListener('DOMContentLoaded', () => {
        
    if (btnLimpiar){
        btnLimpiar.addEventListener('click', () => {

            if (drawnItems) {
                drawnItems.clearLayers();
            }

            document.getElementById('map-pasajeros-val').innerText = "0";
            document.getElementById('map-descensos-val').innerText = "0";

            // Volver al estado inicial de la sección
            btnLimpiar.style.display = 'none';
            valorPasajeros.style.display = 'none';
            valorDescensos.style.display = 'none';
            tablaRuta.style.display = 'none';
            messageBlue.style.display = 'block';            
        });
    }

    // Escuchar cambios en las fechas
    const fechaInicio = document.getElementById('fecha-inicio-ruta');
    const fechaFinal = document.getElementById('fecha-final-ruta');
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
// FUNCION PARA MOSTRAR DATOS SEGUN AREA SELECCIONADA
function filtrarPuntosConTurf(zonaGeoJSON) {
    let tOn = 0, tOff = 0;
    let puntosFiltrados = [];
    const poly = zonaGeoJSON.features ? zonaGeoJSON.features[0] : zonaGeoJSON;

    puntosRutaGlobal.forEach(p => {
        // Turf usa [longitud, latitud]
        const pt = turf.point([p.lon, p.lat]);
        if (turf.booleanPointInPolygon(pt, poly)) {
            tOn += p.on;
            tOff += p.off;

            puntosFiltrados.push({
                unidad: p.sitename || p.terid || "N/A",
                puerta: p.puerta_texto || (p.door === 'door_1' ? 'Delantera' : 'Trasera'),
                on: Math.round(p.on),
                off: Math.round(p.off),
                lat: parseFloat(p.lat).toFixed(6),
                lon: parseFloat(p.lon).toFixed(6)
            });
        }
    });

    document.getElementById('map-pasajeros-val').innerText = tOn.toLocaleString();
    document.getElementById('map-descensos-val').innerText = tOff.toLocaleString();

    // Mostrar los elementos ocultos
    btnLimpiar.style.display = 'block';
    messageBlue.style.display = 'none';
    tablaRuta.style.display = 'block';
    valorPasajeros.style.display = 'block';
    valorDescensos.style.display = 'block';
    
    renderizarTablaMaster({headers: ["Terid unidad", "Puerta", "Ascensos", "Descensos", "Latitud", "Longitud"], rows: puntosFiltrados}, 'tabla-ruta'); 
}

/**********************************************************************************************************************************************************/
// FUNCION PARA MOSTRAR LOS DETALLES EN EL MAPA
async function cargarDatosRuta(groupId) { 
    const inicio = document.getElementById('fecha-inicio-ruta').value;
    const final = document.getElementById('fecha-final-ruta').value;

    const response = await fetch(`/api/ruta-data?groupid=${groupId}&inicio=${inicio}&final=${final}`);
    const res = await response.json();

    if (res.success) {
        puntosRutaGlobal = res.detalles;

        if (heatLayer) map.removeLayer(heatLayer);

        const intensidades = res.heatmap.map(p => p[2]);
        const maxPasajeros = Math.max(...intensidades, 1);

        // Crear la capa de calor
        heatLayer = L.heatLayer(res.heatmap, {
            radius: 23,         
            blur: 15, 
            minOpacity: 0.40,          
            maxZoom: 13,
            max: maxPasajeros * 0.85, 
           gradient: {
                0.35: '#0000ff',
                0.40: '#0033ff',
                0.45: '#008cff', 
                0.50: '#00d9ff',
                0.55: '#00ff95', 
                0.60: '#1eff00',
                0.65: '#9dff00',
                0.70: '#fbff00', 
                0.75: '#ffe600', 
                0.80: '#ffa600',
                0.85: '#ff5900', 
                0.90: '#ff2200',
                0.95: '#ff0000'  
            }
        }).addTo(map);

        if (res.heatmap.length > 0) {
            map.setView(res.centro, 12);
        }
        
        document.getElementById('map-pasajeros-val').innerText = "0";
        document.getElementById('map-descensos-val').innerText = "0";
    }
}

/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR EN DASHBOARD EN LA SECCION DE RUTA
async function actualizarDashboardRuta(groupId) {
    const inicio = document.getElementById('fecha-inicio-ruta').value;
    const final = document.getElementById('fecha-final-ruta').value;
    const section = document.getElementById('section-ruta');
    const banners = section.querySelectorAll('.status-banner');
    const contentRuta = document.getElementById('ruta-content');
    
    // Realizar la validación de las fechas ingresadas
    const validacion = validarRangoFechas(inicio, final);

    if (!validacion.valido) {
        if (contentRuta) contentRuta.style.display = 'none';
        
        banners.forEach(b => { b.textContent = validacion.msj; b.style.display = 'block'; });
        return;
    }

    try {
        banners.forEach(b => b.style.display = 'none');
        
        if (contentRuta) contentRuta.style.display = 'block';

        inicializarMapa();    
        
        setTimeout(() => {
            if(map) map.invalidateSize();
        }, 300);

        await cargarDatosRuta(groupId);
           
    } catch (error) {
        console.error("Error cargando la ruta:", error);
        if (contentRuta) contentRuta.style.display = 'none';
        banners.forEach(b => { b.textContent = "No hay datos para los filtros seleccionados."; b.style.display = 'block'; });
    }
}
    
