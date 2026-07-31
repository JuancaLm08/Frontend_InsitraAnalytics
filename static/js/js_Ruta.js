let puntosRutaGlobal = []; // Almacen para Turf.js
let heatLayer = null;      // Se mantiene por compatibilidad: apunta a la capa visible
let drawnItems = null;

// Capas de calor separadas y estado del selector
let heatLayers = { ascensos: null, descensos: null };
let capaActivaRuta = 'ascensos';
let datosCargadosRuta = false;

// Estado de la zona dibujada (para saber qué métrica mostrar)
let hayZonaDibujadaRuta = false;
let totalesZonaRuta = { ascensos: 0, descensos: 0 };

// ESCALA ÚNICA para ambas capas: mismo gradiente y mismo máximo de normalización
const GRADIENTE_CALOR = {
    0.35: '#0000ff', 0.40: '#0033ff', 0.45: '#008cff', 0.50: '#00d9ff',
    0.55: '#00ff95', 0.60: '#1eff00', 0.65: '#9dff00', 0.70: '#fbff00',
    0.75: '#ffe60083', 0.80: '#ffa60083', 0.85: '#ff590088',
    0.90: '#ff22005e', 0.95: '#ff000065'
};

const CONFIG_CAPAS = {
    ascensos:  { campo: 'on',  metricaId: 'valor-pasajeros', valorId: 'map-pasajeros-val' },
    descensos: { campo: 'off', metricaId: 'valor-descensos', valorId: 'map-descensos-val' }
};

// Decimales para agrupar puntos coincidentes (~1 m a 5 decimales)
const PRECISION_AGRUPACION = 5;

// Variables que se ocultan segun el contenido
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
        minZoom: 5, maxZoom: 18,
        zoomDelta: 0.3, zoomSnap: 0.3 // Zoom más suave                       
    }).setView([19.4326, -99.1332], 11);

    // 1. Definir la capa Normal (OpenStreetMap)
    const mapaNormal = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });

    // 2. Definir la capa Satelital (Esri World Imagery)
    const satelitalBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // 3. Definir una capa transparente de solo texto/calles (CartoDB)
    const etiquetasCalles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    });

    // 4. AGRUPAR ambas para crear la vista "Satelital Híbrida"
    const mapaSatelitalHibrido = L.layerGroup([satelitalBase, etiquetasCalles]);

    // 5. Añadir la capa normal por defecto al mapa para que cargue inicialmente
    mapaNormal.addTo(map);

    // 6. Crear el control de capas y agregarlo al mapa
    const capasBase = {
        "🗺️ Normal": mapaNormal,
        "🛰️ Satélital": mapaSatelitalHibrido
    };
    L.control.layers(capasBase).addTo(map);

    // --- BOTÓN DE PANTALLA COMPLETA ---
    // 1. Crear un control personalizado de Leaflet
    L.Control.PantallaCompleta = L.Control.extend({
        options: { position: 'topleft' }, 
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            const button = L.DomUtil.create('a', '', container);
            
            // Le asignamos un ID para poder encontrarlo fácilmente después
            button.id = 'btn-maximizar-mapa'; 
            
            // Estilos del botón iniciales
            button.innerHTML = '⛶'; 
            button.href = '#';
            button.title = 'Maximizar mapa';
            button.style.fontSize = '18px';
            button.style.lineHeight = '30px';
            button.style.textAlign = 'center';
            button.style.textDecoration = 'none';
            button.style.width = '30px';
            button.style.height = '30px';
            button.style.display = 'block';
            button.style.backgroundColor = 'white';
            button.style.color = '#333';
            button.style.fontWeight = 'bold';

            // 2. Lógica SOLO para pedir/quitar pantalla completa
            L.DomEvent.on(button, 'click', function(e) {
                L.DomEvent.stopPropagation(e);
                L.DomEvent.preventDefault(e);
                
                const mapContainer = document.getElementById('map-canvas');

                if (!document.fullscreenElement) {
                    // Entrar a pantalla completa
                    if (mapContainer.requestFullscreen) {
                        mapContainer.requestFullscreen();
                    } else if (mapContainer.webkitRequestFullscreen) { 
                        mapContainer.webkitRequestFullscreen();
                    } else if (mapContainer.msRequestFullscreen) { 
                        mapContainer.msRequestFullscreen();
                    }
                } else {
                    // Salir de pantalla completa
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    }
                }
            });

            return container;
        }
    });

    // 3. Añadir el nuevo control al mapa
    map.addControl(new L.Control.PantallaCompleta());

    // 4. ESCUCHAR CUALQUIER CAMBIO DE PANTALLA (Botón o tecla ESC)
    document.addEventListener('fullscreenchange', () => {
        const btnFullScreen = document.getElementById('btn-maximizar-mapa');
        
        if (document.fullscreenElement) {
            // Si la pantalla completa ESTÁ activa
            if (btnFullScreen) {
                btnFullScreen.innerHTML = '✖'; 
                btnFullScreen.title = 'Salir de pantalla completa';
            }
        } else {
            // Si la pantalla completa NO ESTÁ activa (por botón o tecla ESC)
            if (btnFullScreen) {
                btnFullScreen.innerHTML = '⛶';
                btnFullScreen.title = 'Maximizar mapa';
            }
        }

        // Redibujar el mapa
        if (map) {
            setTimeout(() => { map.invalidateSize(); }, 200); 
        }
    });
    // -----------------------------------

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
// LLENAR LAS OPCIONES DE LOS SELECTS DE HORAS Y MINUTOS (formato 24h)
function llenarOpcionesHoraRuta() {
    const selectsHoras = ['hora-inicio-h-ruta', 'hora-final-h-ruta'];
    const selectsMins  = ['hora-inicio-m-ruta', 'hora-final-m-ruta'];

    selectsHoras.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel || sel.options.length > 0) return;
        for (let h = 0; h < 24; h++) {
            const opt = document.createElement('option');
            opt.value = String(h).padStart(2, '0');
            opt.textContent = String(h).padStart(2, '0');
            sel.appendChild(opt);
        }
    });

    selectsMins.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel || sel.options.length > 0) return;
        for (let m = 0; m < 60; m++) {
            const opt = document.createElement('option');
            opt.value = String(m).padStart(2, '0');
            opt.textContent = String(m).padStart(2, '0');
            sel.appendChild(opt);
        }
    });
}

/**********************************************************************************************************************************************************/
// LEER LAS HORAS COMBINADAS COMO STRING "HH:MM"
function getHoraInicioRuta() {
    const h = document.getElementById('hora-inicio-h-ruta').value;
    const m = document.getElementById('hora-inicio-m-ruta').value;
    return `${h}:${m}`;
}

function getHoraFinalRuta() {
    const h = document.getElementById('hora-final-h-ruta').value;
    const m = document.getElementById('hora-final-m-ruta').value;
    return `${h}:${m}`;
}

/**********************************************************************************************************************************************************/
// ACTUALIZAR EL DASHBOARD EN CASO DE QUE CAMBIEN LAS FECHAS DE CONSULTA
document.addEventListener('DOMContentLoaded', () => {

    llenarOpcionesHoraRuta();

    // Botón "Consultar": único punto que dispara la petición a la API
    const btnConsultar = document.getElementById('btn-consultar-ruta');
    if (btnConsultar) {
        btnConsultar.addEventListener('click', () => {
            const groupId = document.getElementById('select-corredor').value;
            if (!groupId) return;
            actualizarDashboardRuta(groupId, true);
        });
    }

    // Selector de capa: solo alterna capas ya cargadas, NO vuelve a consultar
    const capaSwitch = document.getElementById('capa-switch-ruta');
    if (capaSwitch) {
        capaSwitch.addEventListener('click', (e) => {
            const btn = e.target.closest('.capa-option');
            if (!btn) return;
            mostrarCapaRuta(btn.dataset.capa);
        });
    }

    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (drawnItems) drawnItems.clearLayers();

            hayZonaDibujadaRuta = false;
            totalesZonaRuta = { ascensos: 0, descensos: 0 };
            actualizarMetricasRuta();

            btnLimpiar.style.display = 'none';
            tablaRuta.style.display = 'none';
            setMensajeRuta(datosCargadosRuta ? 'dibujar' : 'consultar');
        });
    }

    // Resetear horas: ya NO consulta, solo marca los filtros como pendientes
    const btnResetHoras = document.getElementById('btn-reset-horas-ruta');
    if (btnResetHoras) {
        btnResetHoras.addEventListener('click', () => {
            document.getElementById('hora-inicio-h-ruta').value = '00';
            document.getElementById('hora-inicio-m-ruta').value = '00';
            document.getElementById('hora-final-h-ruta').value  = '23';
            document.getElementById('hora-final-m-ruta').value  = '59';
            marcarFiltrosPendientes(true);
        });
    }

    // Cambios en fecha/horas: solo marcan pendiente, no disparan la consulta
    const inputsRuta = [
        document.getElementById('fecha-ruta'),
        document.getElementById('hora-inicio-h-ruta'),
        document.getElementById('hora-inicio-m-ruta'),
        document.getElementById('hora-final-h-ruta'),
        document.getElementById('hora-final-m-ruta')
    ];
    inputsRuta.forEach(input => {
        if (!input) return;
        input.addEventListener('change', () => marcarFiltrosPendientes(true));
    });

    setMensajeRuta('consultar');
    mostrarCapaRuta('ascensos');
});


/**********************************************************************************************************************************************************/
// VALIDAR LA FECHA Y EL RANGO DE HORAS DE LA SECCION RUTA
function validarFechaYHorasRuta(fecha, horaInicio, horaFinal) {
    const dateHoy = new Date();
    dateHoy.setHours(0, 0, 0, 0);

    if (!fecha || !horaInicio || !horaFinal) {
        return { valido: false };
    }

    const dateFecha = new Date(fecha + "T00:00:00");

    if (dateFecha > dateHoy) {
        return { valido: false, msj: "La fecha no puede ser después de hoy." };
    }

    // Comparamos las horas como strings "HH:MM" (lexicográficamente equivalentes a numéricamente)
    if (horaInicio >= horaFinal) {
        return { valido: false, msj: "La hora de inicio debe ser menor que la hora final." };
    }

    return { valido: true, msj: "OK" };
}

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
                timestamp: p.timestamp,
                unidad: p.sitename || p.terid || "N/A",
                puerta: p.puerta_texto || (p.door === 'door_1' ? 'Delantera' : 'Trasera'),
                on: Math.round(p.on),
                off: Math.round(p.off),
                lat: parseFloat(p.lat).toFixed(6),
                lon: parseFloat(p.lon).toFixed(6)
            });
        }
    });

    // Se guardan ambos totales, pero solo se pinta el de la capa activa
    totalesZonaRuta = { ascensos: tOn, descensos: tOff };
    hayZonaDibujadaRuta = true;
    actualizarMetricasRuta();

    btnLimpiar.style.display = 'block';
    messageBlue.style.display = 'none';
    tablaRuta.style.display = 'block';

    renderizarTablaMaster({headers: ["Fecha y Hora", "Terid unidad", "Puerta", "Ascensos", "Descensos", "Latitud", "Longitud"], rows: puntosFiltrados}, 'tabla-ruta');
}
/**********************************************************************************************************************************************************/
// CONSTRUCCION Y CONTROL DE LAS CAPAS DE CALOR
function construirHeatmapDesdeDetalles(puntos, campo) {
    const acumulado = new Map();

    puntos.forEach(p => {
        const valor = Number(p[campo]) || 0;
        if (valor <= 0) return;

        const lat = parseFloat(p.lat);
        const lon = parseFloat(p.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;

        const clave = `${lat.toFixed(PRECISION_AGRUPACION)}|${lon.toFixed(PRECISION_AGRUPACION)}`;
        const acc = acumulado.get(clave);
        if (acc) acc[2] += valor;
        else acumulado.set(clave, [lat, lon, valor]);
    });

    return Array.from(acumulado.values());
}

function crearCapaCalor(datos, maximo) {
    return L.heatLayer(datos, {
        radius: 23,
        blur: 25,
        minOpacity: 0.50,
        maxZoom: 13,
        max: maximo,
        gradient: GRADIENTE_CALOR
    });
}

function quitarCapasCalor() {
    Object.keys(heatLayers).forEach(k => {
        if (heatLayers[k] && map && map.hasLayer(heatLayers[k])) map.removeLayer(heatLayers[k]);
        heatLayers[k] = null;
    });
    heatLayer = null;
}

async function reconstruirCapasRuta() {
    if (!map) return;
    quitarCapasCalor();

    const datos = {};
    let maximoGlobal = 1;

    // Primero se calculan ambas capas para obtener un único máximo compartido
    Object.keys(CONFIG_CAPAS).forEach(k => {
        datos[k] = construirHeatmapDesdeDetalles(puntosRutaGlobal, CONFIG_CAPAS[k].campo);
        datos[k].forEach(p => { if (p[2] > maximoGlobal) maximoGlobal = p[2]; });
    });

    await siguienteFrame();

    Object.keys(CONFIG_CAPAS).forEach(k => {
        heatLayers[k] = crearCapaCalor(datos[k], maximoGlobal);
    });

    await siguienteFrame();

    mostrarCapaRuta(capaActivaRuta);
}

function actualizarMetricasRuta() {
    Object.keys(CONFIG_CAPAS).forEach(k => {
        const cont = document.getElementById(CONFIG_CAPAS[k].metricaId);
        const val  = document.getElementById(CONFIG_CAPAS[k].valorId);
        const visible = hayZonaDibujadaRuta && k === capaActivaRuta;

        if (val) val.innerText = (totalesZonaRuta[k] || 0).toLocaleString();
        if (cont) cont.style.display = visible ? 'block' : 'none';
    });
}

function mostrarCapaRuta(capa) {
    if (!CONFIG_CAPAS[capa]) return;
    capaActivaRuta = capa;

    // Estado visual del selector
    document.querySelectorAll('#capa-switch-ruta .capa-option').forEach(btn => {
        const activo = btn.dataset.capa === capa;
        btn.classList.toggle('active', activo);
        btn.setAttribute('aria-selected', activo ? 'true' : 'false');
    });

    // Solo se muestra la métrica de la capa activa
    actualizarMetricasRuta();

    if (!map) return;

    // Solo una capa de calor visible a la vez
    Object.keys(heatLayers).forEach(k => {
        const layer = heatLayers[k];
        if (!layer) return;
        if (k === capa) { if (!map.hasLayer(layer)) layer.addTo(map); }
        else if (map.hasLayer(layer)) map.removeLayer(layer);
    });

    heatLayer = heatLayers[capa] || null;
}

/**********************************************************************************************************************************************************/
// ESTADO DE LA SECCION (mensajes, loader, filtros pendientes)
function setMensajeRuta(modo) {
    if (!messageBlue) return;
    messageBlue.innerText = (modo === 'consultar')
        ? 'Ajusta los filtros y presiona Consultar para cargar el mapa.'
        : 'Dibuja o termina de cerrar el polígono/rectángulo para ver los totales.';
    messageBlue.style.display = 'block';
}

function marcarFiltrosPendientes(pendiente) {
    const btn = document.getElementById('btn-consultar-ruta');
    if (btn) btn.classList.toggle('pendiente', !!pendiente);
}

function siguienteFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function mostrarLoaderRuta(mostrar) {
    const loader = document.getElementById('loader-ruta');
    if (loader) loader.style.display = mostrar ? 'flex' : 'none';

    // "animations" se inicializa en js_Sidebar.js (una instancia de Lottie por cada
    // .section-loader, indexada por su id). Al ser scripts clasicos en la misma pagina
    // comparten scope global, por lo que la variable es visible aqui.
    if (typeof animations !== 'undefined' && animations['loader-ruta']) {
        if (mostrar) animations['loader-ruta'].play();
        else animations['loader-ruta'].stop();
    }
}

function limpiarResultadosRuta() {
    puntosRutaGlobal = [];
    datosCargadosRuta = false;
    hayZonaDibujadaRuta = false;
    totalesZonaRuta = { ascensos: 0, descensos: 0 };

    if (drawnItems) drawnItems.clearLayers();
    quitarCapasCalor();
    actualizarMetricasRuta();

    if (btnLimpiar) btnLimpiar.style.display = 'none';
    if (tablaRuta) tablaRuta.style.display = 'none';

    setMensajeRuta('consultar');
}
/**********************************************************************************************************************************************************/
// FUNCION PARA MOSTRAR LOS DETALLES EN EL MAPA
async function cargarDatosRuta(groupId) {
    const fecha = document.getElementById('fecha-ruta').value;
    const horaInicio = getHoraInicioRuta();
    const horaFinal = getHoraFinalRuta();

    const response = await fetch(`/api/ruta-data?groupid=${groupId}&fecha=${fecha}&hora_inicio=${horaInicio}&hora_final=${horaFinal}`);
    const res = await response.json();

    if (!res.success) throw new Error(res.error || 'La API devolvió success = false');

    puntosRutaGlobal = Array.isArray(res.detalles) ? res.detalles : [];

    await reconstruirCapasRuta();

    if (puntosRutaGlobal.length > 0 && res.centro) {
        map.setView(res.centro, 12);
    }

    return puntosRutaGlobal.length;
}
/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR EN DASHBOARD EN LA SECCION DE RUTA
// ejecutarConsulta = false -> solo prepara la sección (no consulta la API)
// ejecutarConsulta = true  -> lo dispara el botón "Consultar"
async function actualizarDashboardRuta(groupId, ejecutarConsulta = false) {
    const fecha = document.getElementById('fecha-ruta').value;
    const horaInicio = getHoraInicioRuta();
    const horaFinal = getHoraFinalRuta();
    const section = document.getElementById('section-ruta');
    const banners = section.querySelectorAll('.status-banner');
    const contentRuta = document.getElementById('ruta-content');

    const validacion = validarFechaYHorasRuta(fecha, horaInicio, horaFinal);

    if (!validacion.valido) {
        if (contentRuta) contentRuta.style.display = 'none';
        banners.forEach(b => { b.textContent = validacion.msj; b.style.display = 'block'; });
        return;
    }

    banners.forEach(b => b.style.display = 'none');
    if (contentRuta) contentRuta.style.display = 'block';

    inicializarMapa();
    setTimeout(() => { if (map) map.invalidateSize(); }, 300);

    // Cambio de corredor / carga inicial: se limpia y se espera al botón
    if (!ejecutarConsulta) {
        limpiarResultadosRuta();
        marcarFiltrosPendientes(true);
        return;
    }

    try {
        mostrarLoaderRuta(true);
        limpiarResultadosRuta();

        await siguienteFrame();

        const totalPuntos = await cargarDatosRuta(groupId);
        datosCargadosRuta = true;
        marcarFiltrosPendientes(false);

        if (totalPuntos === 0) {
            banners.forEach(b => { b.textContent = "No hay datos para los filtros seleccionados."; b.style.display = 'block'; });
        } else {
            setMensajeRuta('dibujar');
        }
    } catch (error) {
        console.error("Error cargando la ruta:", error);
        if (contentRuta) contentRuta.style.display = 'none';
        banners.forEach(b => { b.textContent = "No hay datos para los filtros seleccionados."; b.style.display = 'block'; });
    } finally {
        await siguienteFrame();
        mostrarLoaderRuta(false);
    }
}
    
