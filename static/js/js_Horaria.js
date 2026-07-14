/*
 * js_Horaria.js — Sección Horaria
 *
 * Flujo:
 *  1. Selector de unidades (toma el corredor del sidebar, igual que Unidades)
 *  2. Calendario multidía — máx 10 días no continuos
 *  3. Selectores hora inicio / hora fin por cada día (24 h, igual que Ruta)
 *  4. Botón "Generar reporte"
 */

/* ======================================================
   ESTADO
   ====================================================== */
let horaria_unidadesSeleccionadas = [];   // array de terids
let horaria_diasSeleccionados     = [];   // array "YYYY-MM-DD" ordenados ASC
let horaria_calYear  = null;
let horaria_calMonth = null;
let horaria_zonaMap  = null;              // instancia Leaflet del mapa de zona especial
let horaria_zonasItems = null;            // FeatureGroup con los polígonos dibujados

const HORARIA_MAX_DIAS = 10;

/* ======================================================
   INIT
   ====================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const hoy = new Date();
    horaria_calYear  = hoy.getFullYear();
    horaria_calMonth = hoy.getMonth();

    _horaria_initBusSelect();
    _horaria_initCalendar();
    _horaria_initTarifas();
    _horaria_initGenerarBtn();
});

/* ======================================================
   1. SELECTOR DE UNIDADES
      Fuente de datos: /api/buses?groupid=<corredor del sidebar>
      Se llama desde js_Sidebar cuando cambia el corredor.
   ====================================================== */
function _horaria_initBusSelect() {
    const trigger = document.getElementById('horaria-bus-select');
    const list    = document.getElementById('horaria-bus-list');
    if (!trigger || !list) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        list.style.display = list.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !list.contains(e.target))
            list.style.display = 'none';
    });
}

async function cargarListaBusesHoraria(groupId) {
    const list        = document.getElementById('horaria-bus-list');
    const placeholder = document.getElementById('horaria-bus-placeholder');
    if (!list || !placeholder) return;

    list.innerHTML = '';
    horaria_unidadesSeleccionadas = [];
    placeholder.innerHTML = '';
    placeholder.innerText = 'Selecciona una o varias unidades';
    _horaria_checkGenerarBtn();

    try {
        const res  = await fetch(`/api/unidades-lista?groupid=${groupId}`);
        const data = await res.json();
        if (!data || data.error) return;

        const unidades = Array.isArray(data) ? data : (data.unidades || []);

        unidades.forEach(u => {
            const terid = u.terid ?? u.id ?? u;
            const label = u.placa  ?? u.nombre ?? terid;

            const opt = document.createElement('div');
            opt.className     = 'option';
            opt.textContent   = label;
            opt.dataset.terid = terid;

            opt.addEventListener('click', () => _horaria_toggleBus(opt, terid, label));
            list.appendChild(opt);
        });

    } catch (err) {
        console.error('[Horaria] Error al cargar unidades:', err);
    }
}

function _horaria_toggleBus(optEl, terid, label) {
    const idx = horaria_unidadesSeleccionadas.indexOf(terid);
    if (idx === -1) {
        horaria_unidadesSeleccionadas.push(terid);
        optEl.classList.add('active');
    } else {
        horaria_unidadesSeleccionadas.splice(idx, 1);
        optEl.classList.remove('active');
    }
    _horaria_renderBusTags();
    _horaria_checkGenerarBtn();
}

function _horaria_renderBusTags() {
    const placeholder = document.getElementById('horaria-bus-placeholder');
    placeholder.innerHTML = '';

    if (horaria_unidadesSeleccionadas.length === 0) {
        placeholder.innerText = 'Selecciona una o varias unidades';
        return;
    }

    const allOpts = document.querySelectorAll('#horaria-bus-list .option');

    horaria_unidadesSeleccionadas.forEach(terid => {
        const opt   = Array.from(allOpts).find(o => o.dataset.terid === terid);
        const label = opt ? opt.textContent : terid;

        const tag = document.createElement('div');
        tag.className = 'bus-tag';
        tag.innerHTML = `<span>${label}</span><span class="remove-tag" data-terid="${terid}">×</span>`;
        tag.querySelector('.remove-tag').addEventListener('click', (e) => {
            e.stopPropagation();
            const optEl = Array.from(allOpts).find(o => o.dataset.terid === terid);
            if (optEl) _horaria_toggleBus(optEl, terid, label);
        });
        placeholder.appendChild(tag);
    });
}

/* ======================================================
   2. CALENDARIO MULTIDÍA
   ====================================================== */
function _horaria_initCalendar() {
    document.getElementById('horaria-prev-month').addEventListener('click', () => {
        horaria_calMonth--;
        if (horaria_calMonth < 0) { horaria_calMonth = 11; horaria_calYear--; }
        _horaria_renderCalendar();
    });
    document.getElementById('horaria-next-month').addEventListener('click', () => {
        horaria_calMonth++;
        if (horaria_calMonth > 11) { horaria_calMonth = 0; horaria_calYear++; }
        _horaria_renderCalendar();
    });
    _horaria_renderCalendar();
}

function _horaria_renderCalendar() {
    const title = document.getElementById('horaria-cal-title');
    const grid  = document.getElementById('horaria-cal-days');
    const hoy   = new Date();
    hoy.setHours(0, 0, 0, 0);

    const mes = new Date(horaria_calYear, horaria_calMonth, 1);
    title.textContent = mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

    const diasEnMes = new Date(horaria_calYear, horaria_calMonth + 1, 0).getDate();
    let primerDia   = mes.getDay();
    primerDia = (primerDia === 0) ? 6 : primerDia - 1;

    grid.innerHTML = '';
    grid.classList.toggle('limit-reached', horaria_diasSeleccionados.length >= HORARIA_MAX_DIAS);

    for (let i = 0; i < primerDia; i++) {
        const empty = document.createElement('div');
        empty.className = 'horaria-cal-day empty';
        grid.appendChild(empty);
    }

    for (let d = 1; d <= diasEnMes; d++) {
        const fecha    = new Date(horaria_calYear, horaria_calMonth, d);
        const fechaStr = _horaria_dateToStr(fecha);
        const esFuturo = fecha > hoy;
        const esHoy    = fecha.getTime() === hoy.getTime();
        const selec    = horaria_diasSeleccionados.includes(fechaStr);

        const cell = document.createElement('div');
        cell.className = 'horaria-cal-day';
        cell.textContent = d;
        if (esHoy)    cell.classList.add('today');
        if (selec)    cell.classList.add('selected');
        if (esFuturo) cell.classList.add('disabled');
        if (!esFuturo) cell.addEventListener('click', () => _horaria_toggleDay(fechaStr));

        grid.appendChild(cell);
    }

    document.getElementById('horaria-day-counter').textContent =
        `(${horaria_diasSeleccionados.length} / ${HORARIA_MAX_DIAS})`;
}

function _horaria_toggleDay(fechaStr) {
    const idx = horaria_diasSeleccionados.indexOf(fechaStr);
    if (idx === -1) {
        if (horaria_diasSeleccionados.length >= HORARIA_MAX_DIAS) return;
        horaria_diasSeleccionados.push(fechaStr);
        horaria_diasSeleccionados.sort();
    } else {
        horaria_diasSeleccionados.splice(idx, 1);
        _horaria_removeDayHours(fechaStr);
    }
    _horaria_renderCalendar();
    _horaria_renderDayTags();
    _horaria_syncHoursBlock();
    _horaria_checkGenerarBtn();
}

/* Tags */
function _horaria_renderDayTags() {
    const container = document.getElementById('horaria-selected-days');
    const msg       = document.getElementById('horaria-no-days-msg');
    container.innerHTML = '';

    if (horaria_diasSeleccionados.length === 0) {
        container.appendChild(msg);
        return;
    }

    horaria_diasSeleccionados.forEach(fechaStr => {
        const tag = document.createElement('div');
        tag.className = 'horaria-day-tag';
        tag.innerHTML = `<span>${fechaStr}</span><span class="remove-tag" data-fecha="${fechaStr}">×</span>`;
        tag.querySelector('.remove-tag').addEventListener('click', () => _horaria_toggleDay(fechaStr));
        container.appendChild(tag);
    });
}

/* ======================================================
   3. SELECTORES DE HORA POR DÍA
   ====================================================== */
function _horaria_syncHoursBlock() {
    const block     = document.getElementById('horaria-hours-block');
    const container = document.getElementById('horaria-hours-container');

    if (horaria_diasSeleccionados.length === 0) {
        block.style.display = 'none';
        return;
    }
    block.style.display = 'flex';

    horaria_diasSeleccionados.forEach(fechaStr => {
        if (!document.getElementById(`horaria-hours-row-${fechaStr}`))
            container.appendChild(_horaria_buildHoursRow(fechaStr));
    });

    // Reordenar ASC
    horaria_diasSeleccionados.forEach(fechaStr => {
        const row = document.getElementById(`horaria-hours-row-${fechaStr}`);
        if (row) container.appendChild(row);
    });
}

function _horaria_buildHoursRow(fechaStr) {
    const row = document.createElement('div');
    row.className = 'horaria-day-hours-row';
    row.id = `horaria-hours-row-${fechaStr}`;

    const label = document.createElement('span');
    label.className   = 'horaria-day-hours-label';
    label.textContent = fechaStr;
    row.appendChild(label);

    const selWrapper = document.createElement('div');
    selWrapper.className = 'horaria-hours-selects';

    selWrapper.appendChild(
        _horaria_buildTimeGroup('Hora inicio',
            `horaria-ini-h-${fechaStr}`, 0, 23, '00',
            `horaria-ini-m-${fechaStr}`, 0, 59, '00')
    );
    selWrapper.appendChild(
        _horaria_buildTimeGroup('Hora fin',
            `horaria-fin-h-${fechaStr}`, 0, 23, '23',
            `horaria-fin-m-${fechaStr}`, 0, 59, '59')
    );

    row.appendChild(selWrapper);
    return row;
}

/* Construye  label + [<selectHH> : <selectMM>] */
function _horaria_buildTimeGroup(labelText, hId, hMin, hMax, hDef, mId, mMin, mMax, mDef) {
    const group = document.createElement('div');
    group.className = 'horaria-time-group';

    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    group.appendChild(lbl);

    const tsGroup = document.createElement('div');
    tsGroup.className = 'time-select-group';

    tsGroup.appendChild(_horaria_makeSelect(hId, hMin, hMax, hDef));
    const sep = document.createElement('span');
    sep.className   = 'time-separator';
    sep.textContent = ':';
    tsGroup.appendChild(sep);
    tsGroup.appendChild(_horaria_makeSelect(mId, mMin, mMax, mDef));

    group.appendChild(tsGroup);
    return group;
}

/* Crea y llena un <select> como elemento (sin getElementsById) */
function _horaria_makeSelect(id, min, max, defaultVal) {
    const sel = document.createElement('select');
    sel.id = id;
    for (let i = min; i <= max; i++) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = String(i).padStart(2, '0');
        sel.appendChild(opt);
    }
    sel.value = defaultVal;
    return sel;
}

function _horaria_removeDayHours(fechaStr) {
    const row = document.getElementById(`horaria-hours-row-${fechaStr}`);
    if (row) row.remove();
}

function _horaria_getHorasDia(fechaStr) {
    const v = id => document.getElementById(id)?.value ?? '00';
    return {
        hora_inicio: `${v(`horaria-ini-h-${fechaStr}`)}:${v(`horaria-ini-m-${fechaStr}`)}`,
        hora_fin:    `${v(`horaria-fin-h-${fechaStr}`)}:${v(`horaria-fin-m-${fechaStr}`)}`
    };
}

/* ======================================================
   4. TARIFAS
   ====================================================== */
function _horaria_initTarifas() {
    // Toggle nocturna
    const toggleNoc = document.getElementById('horaria-toggle-nocturna');
    if (toggleNoc) {
        toggleNoc.addEventListener('change', () => {
            const detail = document.getElementById('horaria-nocturna-detail');
            detail.style.display = toggleNoc.checked ? 'flex' : 'none';
            if (toggleNoc.checked) _horaria_fillNocturnaSelects();
            _horaria_checkGenerarBtn();
        });
    }

    // Toggle especial
    const toggleEsp = document.getElementById('horaria-toggle-especial');
    if (toggleEsp) {
        toggleEsp.addEventListener('change', () => {
            const detail = document.getElementById('horaria-especial-detail');
            detail.style.display = toggleEsp.checked ? 'flex' : 'none';
            if (toggleEsp.checked) _horaria_initZonaMap();
            _horaria_checkGenerarBtn();
        });
    }

    // Botón limpiar zonas
    const btnLimpiar = document.getElementById('btn-horaria-limpiar-zonas');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
            if (horaria_zonasItems) {
                horaria_zonasItems.clearLayers();
                _horaria_updateZonaCounter();
                document.getElementById('btn-horaria-guardar-zona').disabled = true;
            }
        });
    }

    // Botón guardar zona / guardar edición (comportamiento depende del modo)
    const btnGuardar = document.getElementById('btn-horaria-guardar-zona');
    if (btnGuardar) {
        btnGuardar.dataset.mode = 'save';
        btnGuardar.addEventListener('click', () => {
            if (btnGuardar.dataset.mode === 'edit') {
                _horaria_guardarEdicion();
            } else {
                _horaria_guardarZonaActual();
            }
        });
    }

    // Validación en tiempo real de tarifa normal
    const inputNormal = document.getElementById('horaria-tarifa-normal');
    if (inputNormal) {
        inputNormal.addEventListener('input', () => _horaria_checkGenerarBtn());
    }
}

function _horaria_fillNocturnaSelects() {
    const ids = [
        { id: 'horaria-noc-ini-h', min: 0, max: 23, def: '23' },
        { id: 'horaria-noc-ini-m', min: 0, max: 59, def: '00' },
        { id: 'horaria-noc-fin-h', min: 0, max: 23, def: '06' },
        { id: 'horaria-noc-fin-m', min: 0, max: 59, def: '00' },
    ];
    ids.forEach(({ id, min, max, def }) => {
        const sel = document.getElementById(id);
        if (!sel || sel.options.length > 0) return; // ya llenado
        for (let i = min; i <= max; i++) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = String(i).padStart(2, '0');
            sel.appendChild(opt);
        }
        sel.value = def;
    });
}

/* ---- Mapa de zona especial ---- */
function _horaria_initZonaMap() {
    setTimeout(() => {
        if (horaria_zonaMap) {
            horaria_zonaMap.invalidateSize();
            return;
        }

        const bounds = L.latLngBounds(
            L.latLng(14.02, -118.65),
            L.latLng(32.94, -85.95)
        );

        horaria_zonaMap = L.map('horaria-zona-map-canvas', {
            maxBounds: bounds,
            maxBoundsViscosity: 1.0,
            minZoom: 5, maxZoom: 18
        }).setView([19.4326, -99.1332], 11);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(horaria_zonaMap);

        const satelital = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: '&copy; Esri' }
        );
        L.control.layers({
            '🗺️ Normal':    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }),
            '🛰️ Satelital': satelital
        }).addTo(horaria_zonaMap);

        horaria_zonasItems = new L.FeatureGroup();
        horaria_zonaMap.addLayer(horaria_zonasItems);

        const drawControl = new L.Control.Draw({
            draw: {
                polyline: false, circle: false, marker: false, circlemarker: false,
                polygon:   { shapeOptions: { color: '#751643', fillOpacity: 0.2 } },
                rectangle: { shapeOptions: { color: '#751643', fillOpacity: 0.2 } }
            },
            edit: { featureGroup: horaria_zonasItems, edit: true, remove: true }
        });
        horaria_zonaMap.addControl(drawControl);

        horaria_zonaMap.on(L.Draw.Event.CREATED, (e) => {
            horaria_zonasItems.addLayer(e.layer);
            _horaria_updateZonaCounter();
            const btnGuardar = document.getElementById('btn-horaria-guardar-zona');
            if (btnGuardar) btnGuardar.disabled = false;
        });

        horaria_zonaMap.on(L.Draw.Event.DELETED, () => {
            _horaria_updateZonaCounter();
            const btnGuardar = document.getElementById('btn-horaria-guardar-zona');
            if (btnGuardar) btnGuardar.disabled = horaria_zonasItems.getLayers().length === 0;
        });

        const canvas = document.getElementById('horaria-zona-map-canvas');
        if (canvas) {
            new ResizeObserver(() => horaria_zonaMap && horaria_zonaMap.invalidateSize()).observe(canvas);
        }

        horaria_zonaMap.on('drag', () => horaria_zonaMap.panInsideBounds(bounds, { animate: false }));

        // Cargar zonas guardadas en el servidor
        _horaria_cargarZonasServidor();

    }, 150);
}

function _horaria_updateZonaCounter() {
    const counter = document.getElementById('horaria-zona-counter');
    if (!counter || !horaria_zonasItems) return;
    const n = horaria_zonasItems.getLayers().length;
    counter.textContent = `${n} zona(s) dibujada(s)`;
}

/* ---- Estado del panel de zonas ---- */
let horaria_poligonosGuardados    = [];        // [{ id, zona_id?, nombre, geojson, capas, esServidor }]
let horaria_seleccionadas         = new Set(); // ids locales de zonas visibles en el mapa
let horaria_menuAbiertoId         = null;
let horaria_menuListenerRegistrado = false;    // el listener de cerrar-menú se registra UNA sola vez
let horaria_zonaEnEdicion         = null;      // { localId } zona cuyos puntos se están editando

/* ──────────────────────────────────────────────────────────
   API — GET: cargar zonas guardadas en el servidor
   ────────────────────────────────────────────────────────── */
async function _horaria_cargarZonasServidor() {
    const groupId = document.getElementById('select-corredor')?.value;
    if (!groupId) return;

    _horaria_setPanelLoading(true);
    try {
        const res  = await fetch(`/api/zonas-tarifarias?groupid=${groupId}`);
        const data = await res.json();
        const zonas = Array.isArray(data) ? data : (data.zonas ?? []);

        // Limpiar las que venían del servidor (no las locales no guardadas)
        horaria_poligonosGuardados = horaria_poligonosGuardados.filter(p => !p.esServidor);
        horaria_seleccionadas.clear();

        zonas.forEach(z => {
            // z = { zona_id, nombre, geojson: FeatureCollection }
            const id = Symbol('zona-' + z.zona_id); // id local único
            horaria_poligonosGuardados.unshift({
                id,
                zona_id:    z.zona_id,
                nombre:     z.nombre,
                geojson:    z.geojson,
                capas:      [],          // se pintan al hacer click
                esServidor: true
            });
        });

        _horaria_renderPanelPoligonos();
    } catch (err) {
        console.error('[Horaria] Error al cargar zonas:', err);
    } finally {
        _horaria_setPanelLoading(false);
    }
}

/* ──────────────────────────────────────────────────────────
   API — POST: guardar zona dibujada en el canvas
   ────────────────────────────────────────────────────────── */
async function _horaria_guardarZonaActual() {
    if (!horaria_zonasItems || horaria_zonasItems.getLayers().length === 0) return;

    // Pedir nombre inmediatamente antes de guardar
    const nombre = prompt('Nombre para esta zona:', `Zona ${horaria_poligonosGuardados.length + 1}`);
    if (!nombre || !nombre.trim()) return; // usuario canceló

    // Construir FeatureCollection con name en properties
    const features = [];
    horaria_zonasItems.eachLayer(layer => {
        const f = layer.toGeoJSON();
        f.properties      = f.properties || {};
        f.properties.name = nombre.trim();
        features.push(f);
    });
    const geojson = { type: 'FeatureCollection', features };

    const groupId = document.getElementById('select-corredor')?.value;

    _horaria_setPanelLoading(true);
    try {
        const res  = await fetch('/api/zonas-tarifarias', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupid: groupId, nombre: nombre.trim(), geojson })
        });
        const data = await res.json();

        const capas = [];
        horaria_zonasItems.eachLayer(l => capas.push(l));

        const id = Symbol('z');
        horaria_poligonosGuardados.push({
            id,
            zona_id:    data.zona_id ?? null,
            nombre:     nombre.trim(),
            geojson,
            capas,
            esServidor: true
        });

        _horaria_renderPanelPoligonos();

        horaria_zonasItems.clearLayers();
        _horaria_updateZonaCounter();
        document.getElementById('btn-horaria-guardar-zona').disabled = true;

    } catch (err) {
        console.error('[Horaria] Error al guardar zona:', err);
    } finally {
        _horaria_setPanelLoading(false);
    }
}

/* ──────────────────────────────────────────────────────────
   API — PUT: renombrar zona (y opcionalmente redibujar)
   ────────────────────────────────────────────────────────── */
async function _horaria_renombrarPoligono(localId) {
    const poly = horaria_poligonosGuardados.find(p => p.id === localId);
    if (!poly) return;

    const nuevoNombre = prompt('Nuevo nombre para la zona:', poly.nombre);
    if (!nuevoNombre || !nuevoNombre.trim()) return;

    poly.nombre = nuevoNombre.trim();
    poly.geojson.features.forEach(f => {
        f.properties        = f.properties || {};
        f.properties.name   = poly.nombre;
    });

    // Si tiene zona_id, actualizar en el servidor
    if (poly.zona_id) {
        try {
            await fetch(`/api/zonas-tarifarias/${poly.zona_id}`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: poly.nombre, geojson: poly.geojson })
            });
        } catch (err) {
            console.error('[Horaria] Error al renombrar zona:', err);
        }
    }

    _horaria_renderPanelPoligonos();
}

/* ──────────────────────────────────────────────────────────
   Edición de puntos de una zona guardada
   ────────────────────────────────────────────────────────── */
function _horaria_iniciarEdicionPuntos(localId) {
    const poly = horaria_poligonosGuardados.find(p => p.id === localId);
    if (!poly || !horaria_zonaMap) return;

    // Si había otra en edición, cancelarla limpiando el canvas primero
    if (horaria_zonaEnEdicion !== null) {
        horaria_zonasItems.clearLayers();
    }

    // Quitar la zona del mapa si estaba visible (la vamos a poner en el canvas)
    if (horaria_seleccionadas.has(localId)) {
        poly.capas.forEach(l => { if (horaria_zonaMap.hasLayer(l)) horaria_zonaMap.removeLayer(l); });
        poly.capas = [];
        horaria_seleccionadas.delete(localId);
    }

    // Cargar los polígonos de esta zona al canvas editable
    L.geoJSON(poly.geojson, {
        style: { color: '#751643', fillOpacity: 0.2 }
    }).eachLayer(l => horaria_zonasItems.addLayer(l));

    horaria_zonaEnEdicion = localId;

    // Cambiar el botón "Guardar zona" al modo edición
    const btn = document.getElementById('btn-horaria-guardar-zona');
    if (btn) {
        btn.textContent  = '💾 Guardar cambios';
        btn.disabled     = false;
        btn.dataset.mode = 'edit';
    }

    _horaria_updateZonaCounter();
    _horaria_renderPanelPoligonos();

    // Hacer zoom a la zona
    try {
        horaria_zonaMap.fitBounds(L.geoJSON(poly.geojson).getBounds(), { padding: [30, 30] });
    } catch (_) {}
}

async function _horaria_guardarEdicion() {
    const localId = horaria_zonaEnEdicion;
    const poly    = horaria_poligonosGuardados.find(p => p.id === localId);
    if (!poly || !horaria_zonasItems) return;

    // Construir nuevo GeoJSON desde el canvas actual
    const features = [];
    horaria_zonasItems.eachLayer(layer => {
        const f = layer.toGeoJSON();
        f.properties      = f.properties || {};
        f.properties.name = poly.nombre;
        features.push(f);
    });
    const nuevoGeojson = { type: 'FeatureCollection', features };

    const groupId = document.getElementById('select-corredor')?.value;

    _horaria_setPanelLoading(true);
    try {
        if (poly.zona_id) {
            await fetch(`/api/zonas-tarifarias/${poly.zona_id}`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupid: groupId, nombre: poly.nombre, geojson: nuevoGeojson })
            });
        }

        // Actualizar estado local
        poly.geojson = nuevoGeojson;
        poly.capas   = [];

    } catch (err) {
        console.error('[Horaria] Error al guardar edición de zona:', err);
    } finally {
        _horaria_setPanelLoading(false);
    }

    // Limpiar canvas y resetear modo
    horaria_zonaEnEdicion = null;
    horaria_zonasItems.clearLayers();
    _horaria_updateZonaCounter();

    // Restaurar botón original
    const btn = document.getElementById('btn-horaria-guardar-zona');
    if (btn) {
        btn.innerHTML    = '<span>💾</span> Guardar zona actual';
        btn.disabled     = true;
        btn.dataset.mode = 'save';
    }

    _horaria_renderPanelPoligonos();
}

/* ──────────────────────────────────────────────────────────
   API — DELETE: eliminar zona
   ────────────────────────────────────────────────────────── */
async function _horaria_eliminarPoligono(localId) {
    const idx  = horaria_poligonosGuardados.findIndex(p => p.id === localId);
    if (idx === -1) return;
    const poly = horaria_poligonosGuardados[idx];

    // Quitar capas del mapa
    poly.capas.forEach(l => {
        if (horaria_zonaMap?.hasLayer(l)) horaria_zonaMap.removeLayer(l);
    });
    if (horaria_seleccionadas.has(localId)) {
        horaria_seleccionadas.delete(localId);
    }
    horaria_poligonosGuardados.splice(idx, 1);
    _horaria_renderPanelPoligonos();

    // Si tiene zona_id, borrar en el servidor
    if (poly.zona_id) {
        const groupId = document.getElementById('select-corredor')?.value;
        try {
            await fetch(`/api/zonas-tarifarias/${poly.zona_id}?groupid=${groupId}`, {
                method: 'DELETE'
            });
        } catch (err) {
            console.error('[Horaria] Error al eliminar zona:', err);
        }
    }
}

/* ──────────────────────────────────────────────────────────
   RENDER del panel
   ────────────────────────────────────────────────────────── */
function _horaria_renderPanelPoligonos() {
    const body = document.getElementById('horaria-poligonos-guardados');
    if (!body) return;
    horaria_menuAbiertoId = null;
    body.innerHTML = '';

    // Registrar el listener de cierre UNA sola vez (no en cada render)
    if (!horaria_menuListenerRegistrado) {
        document.addEventListener('click', _horaria_cerrarMenus);
        horaria_menuListenerRegistrado = true;
    }

    if (horaria_poligonosGuardados.length === 0) {
        body.innerHTML = '<p class="horaria-zona-panel-empty">Aún no hay zonas guardadas.</p>';
        return;
    }

    horaria_poligonosGuardados.forEach((poly, idx) => {
        // Usar índice numérico como ID de menú → sin Symbols, sin paréntesis
        const menuId = `hmenu-${idx}`;
        const totalPts = poly.geojson.features.reduce(
            (acc, f) => acc + (f.geometry?.coordinates?.[0]?.length ?? 0), 0
        );
        const activo = horaria_seleccionadas.has(poly.id);

        const enEdicion = horaria_zonaEnEdicion === poly.id;

        const item = document.createElement('div');
        item.className = 'horaria-zona-item' + (activo ? ' activo' : '') + (enEdicion ? ' en-edicion' : '');

        const badge = enEdicion
            ? '<span class="horaria-zona-badge editando" title="Editando puntos">✏️</span>'
            : poly.esServidor
                ? '<span class="horaria-zona-badge servidor" title="Guardada en servidor">☁️</span>'
                : '<span class="horaria-zona-badge local" title="Local (sin guardar)">💾</span>';

        item.innerHTML = `
            <span class="horaria-zona-item-name" title="${poly.nombre}">📍 ${poly.nombre}</span>
            ${badge}
            <span class="horaria-zona-item-verts">${totalPts} pts</span>
            <div class="horaria-zona-item-menu-wrap">
                <span class="horaria-zona-item-opts" title="Opciones">⋮</span>
                <div class="horaria-zona-item-dropdown" id="${menuId}" style="display:none;">
                    <div class="horaria-zona-menu-opt" data-action="rename">✏️ Renombrar</div>
                    <div class="horaria-zona-menu-opt" data-action="edit">🖊️ Editar puntos</div>
                    <div class="horaria-zona-menu-opt danger" data-action="delete">🗑️ Eliminar</div>
                </div>
            </div>
        `;

        // Toggle visibilidad en mapa (multiselect)
        item.addEventListener('click', (e) => {
            if (e.target.closest('.horaria-zona-item-menu-wrap')) return;
            _horaria_togglePoligonoEnMapa(poly.id);
        });

        // Abrir/cerrar menú ⋮ — stopPropagation evita que el documento lo cierre de inmediato
        item.querySelector('.horaria-zona-item-opts').addEventListener('click', (e) => {
            e.stopPropagation();
            _horaria_toggleMenu(menuId);
        });

        // Acciones del menú
        item.querySelectorAll('.horaria-zona-menu-opt').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                horaria_menuAbiertoId = null;
                document.getElementById(menuId)?.style && (document.getElementById(menuId).style.display = 'none');
                if (opt.dataset.action === 'rename') _horaria_renombrarPoligono(poly.id);
                if (opt.dataset.action === 'edit')   _horaria_iniciarEdicionPuntos(poly.id);
                if (opt.dataset.action === 'delete') _horaria_eliminarPoligono(poly.id);
            });
        });

        body.appendChild(item);
    });
}

/* ──────────────────────────────────────────────────────────
   Helpers del menú
   ────────────────────────────────────────────────────────── */
function _horaria_toggleMenu(menuId) {
    if (horaria_menuAbiertoId && horaria_menuAbiertoId !== menuId) {
        const prev = document.getElementById(horaria_menuAbiertoId);
        if (prev) prev.style.display = 'none';
    }
    const menu  = document.getElementById(menuId);
    if (!menu) return;
    const abierto = menu.style.display === 'block';
    menu.style.display    = abierto ? 'none' : 'block';
    horaria_menuAbiertoId = abierto ? null : menuId;
}

function _horaria_cerrarMenus() {
    if (horaria_menuAbiertoId) {
        const menu = document.getElementById(horaria_menuAbiertoId);
        if (menu) menu.style.display = 'none';
        horaria_menuAbiertoId = null;
    }
}

/* ──────────────────────────────────────────────────────────
   Toggle visible en el mapa (multiselect)
   ────────────────────────────────────────────────────────── */
function _horaria_togglePoligonoEnMapa(localId) {
    const poly = horaria_poligonosGuardados.find(p => p.id === localId);
    if (!poly || !horaria_zonaMap) return;

    if (horaria_seleccionadas.has(localId)) {
        // Deseleccionar: quitar del mapa
        poly.capas.forEach(l => { if (horaria_zonaMap.hasLayer(l)) horaria_zonaMap.removeLayer(l); });
        poly.capas = [];
        horaria_seleccionadas.delete(localId);
    } else {
        // Seleccionar: pintar desde el geojson
        const nuevasCapas = [];
        L.geoJSON(poly.geojson, {
            style: { color: '#751643', fillOpacity: 0.2 }
        }).eachLayer(l => {
            horaria_zonaMap.addLayer(l);
            nuevasCapas.push(l);
        });
        poly.capas = nuevasCapas;
        horaria_seleccionadas.add(localId);

        // Centrar en esta zona
        try {
            horaria_zonaMap.fitBounds(L.geoJSON(poly.geojson).getBounds(), { padding: [20, 20] });
        } catch (_) {}
    }

    _horaria_renderPanelPoligonos();
}

/* ──────────────────────────────────────────────────────────
   Loading state del panel
   ────────────────────────────────────────────────────────── */
function _horaria_setPanelLoading(loading) {
    const body = document.getElementById('horaria-poligonos-guardados');
    if (!body) return;
    if (loading) {
        body.innerHTML = '<p class="horaria-zona-panel-empty">Cargando zonas...</p>';
    }
}
/* ---- Leer tarifas para el payload ---- */
function _horaria_getTarifas() {
    const tarifas = {
        normal: parseFloat(document.getElementById('horaria-tarifa-normal')?.value) || 0
    };

    const tocNoc = document.getElementById('horaria-toggle-nocturna');
    if (tocNoc?.checked) {
        const v = id => document.getElementById(id)?.value ?? '00';
        tarifas.nocturna = {
            valor:  parseFloat(document.getElementById('horaria-tarifa-nocturna')?.value) || 0,
            desde:  `${v('horaria-noc-ini-h')}:${v('horaria-noc-ini-m')}`,
            hasta:  `${v('horaria-noc-fin-h')}:${v('horaria-noc-fin-m')}`
        };
    }

    const tocEsp = document.getElementById('horaria-toggle-especial');
    if (tocEsp?.checked) {
        const precio = parseFloat(document.getElementById('horaria-tarifa-especial')?.value) || 0;
        const allFeatures = [];

        // Incluir todas las zonas activas (visibles en el mapa)
        if (horaria_seleccionadas.size > 0) {
            horaria_poligonosGuardados
                .filter(p => horaria_seleccionadas.has(p.id))
                .forEach(poly => {
                    poly.geojson.features.forEach(f => {
                        const feature = JSON.parse(JSON.stringify(f));
                        feature.properties      = feature.properties || {};
                        feature.properties.name = poly.nombre;
                        allFeatures.push(feature);
                    });
                });
        }

        // Polígonos del canvas sin guardar (siempre se incluyen)
        if (horaria_zonasItems) {
            horaria_zonasItems.eachLayer(layer => {
                const f = layer.toGeoJSON();
                f.properties      = f.properties || {};
                f.properties.name = 'Sin nombre';
                allFeatures.push(f);
            });
        }

        tarifas.especial = {
            valor:  precio,
            geojson: {
                type:     'FeatureCollection',
                features: allFeatures
            }
        };
    }

    return tarifas;
}

/* ======================================================
   5. BOTÓN GENERAR
   ====================================================== */
function _horaria_initGenerarBtn() {
    const btn = document.getElementById('btn-generar-horaria');
    if (btn) btn.addEventListener('click', _horaria_generarReporte);
}

function _horaria_checkGenerarBtn() {
    const btn = document.getElementById('btn-generar-horaria');
    if (!btn) return;
    const tarifaOk = parseFloat(document.getElementById('horaria-tarifa-normal')?.value) > 0;
    btn.disabled = !(horaria_unidadesSeleccionadas.length > 0 && horaria_diasSeleccionados.length > 0 && tarifaOk);
}

async function _horaria_generarReporte() {
    const errorBanner  = document.getElementById('error-banner-horaria');
    const noDataBanner = document.getElementById('no-data-banner-horaria');
    errorBanner.style.display  = 'none';
    noDataBanner.style.display = 'none';

    for (const fechaStr of horaria_diasSeleccionados) {
        const { hora_inicio, hora_fin } = _horaria_getHorasDia(fechaStr);
        if (hora_inicio >= hora_fin) {
            errorBanner.textContent = `Rango inválido para ${fechaStr}: hora inicio debe ser menor que hora fin.`;
            errorBanner.style.display = 'block';
            return;
        }
    }

    // Validar tarifa normal obligatoria
    const tarifaNormal = parseFloat(document.getElementById('horaria-tarifa-normal')?.value);
    if (!tarifaNormal || tarifaNormal <= 0) {
        errorBanner.textContent = 'La tarifa normal es obligatoria y debe ser mayor a 0.';
        errorBanner.style.display = 'block';
        return;
    }

    // Validar que si tarifa especial está activa haya al menos una zona seleccionada
    const tocEsp = document.getElementById('horaria-toggle-especial');
    if (tocEsp?.checked) {
        const tieneZonaActiva  = horaria_seleccionadas.size > 0;
        const tieneCanvasZonas = horaria_zonasItems && horaria_zonasItems.getLayers().length > 0;
        if (!tieneZonaActiva && !tieneCanvasZonas) {
            errorBanner.textContent = 'Tarifa especial activa: selecciona o dibuja al menos una zona en el mapa.';
            errorBanner.style.display = 'block';
            return;
        }
    }

    const groupId = document.getElementById('select-corredor')?.value;
    const payload = {
        groupid: groupId,
        terids:  horaria_unidadesSeleccionadas,
        dias: horaria_diasSeleccionados.map(fechaStr => {
            const { hora_inicio, hora_fin } = _horaria_getHorasDia(fechaStr);
            return { fecha: fechaStr, hora_inicio, hora_fin };
        }),
        tarifas: _horaria_getTarifas()
    };

    const loader  = document.getElementById('loader-horaria');
    const content = document.getElementById('horaria-content');
    if (loader) {
        loader.style.display = 'flex';
        if (typeof animations !== 'undefined' && animations['loader-horaria']) {
            animations['loader-horaria'].play();
        }
    }
    // Limpiar resultados anteriores
    content.style.display = 'none';
    ['horaria-summary-cards', 'horaria-tarifa-breakdown'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
    const tbody = document.querySelector('#tabla-horaria tbody');
    if (tbody) tbody.innerHTML = '';

    try {
        const res  = await fetch('/api/horaria-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!data.success) {
            noDataBanner.style.display = 'block';
        } else if (!data.tabla || data.tabla.rows.length === 0) {
            noDataBanner.style.display = 'block';
        } else {
            _horaria_renderResultados(data);
            content.style.display = 'block';
        }
    } catch (err) {
        console.error('[Horaria] Error al generar reporte:', err);
        errorBanner.textContent = 'Error de conexión al generar el reporte.';
        errorBanner.style.display = 'block';
    } finally {
        if (loader) {
            loader.style.display = 'none';
            if (typeof animations !== 'undefined' && animations['loader-horaria']) {
                animations['loader-horaria'].stop();
            }
        }
    }
}

/* ======================================================
   5. RENDER RESULTADOS
   ====================================================== */
function _horaria_renderResultados(data) {

    /* ---------- Tarjetas de totales ---------- */
    const cardsEl = document.getElementById('horaria-summary-cards');
    if (cardsEl) {
        const tot = data.totales ?? {};
        const fmt = n => Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtInt = n => Number(n ?? 0).toLocaleString('es-MX');

        cardsEl.innerHTML = `
            <div class="horaria-summary-card">
                <span class="horaria-card-label">Total ascensos</span>
                <span class="horaria-card-value">${fmtInt(tot.ascensos)}</span>
                <span class="horaria-card-sub">pasajeros</span>
            </div>
            <div class="horaria-summary-card">
                <span class="horaria-card-label">Recaudo total</span>
                <span class="horaria-card-value">$${fmt(tot.recaudo)}</span>
                <span class="horaria-card-sub">MXN</span>
            </div>
        `;
    }

    /* ---------- Desglose por tarifa ---------- */
    const breakEl = document.getElementById('horaria-tarifa-breakdown');
    if (breakEl) {
        const pt = data.por_tarifa ?? {};
        const fmt = n => Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtInt = n => Number(n ?? 0).toLocaleString('es-MX');

        const tarifas = [
            { key: 'normal',   label: '🌞 Normal',   cls: 'tarifa-normal'   },
            { key: 'nocturna', label: '🌙 Nocturna',  cls: 'tarifa-nocturna' },
            { key: 'especial', label: '📍 Especial',  cls: 'tarifa-especial' },
        ];

        breakEl.innerHTML = tarifas
            .filter(t => pt[t.key])   // solo mostrar las activas (con datos)
            .map(t => {
                const d = pt[t.key];
                return `
                    <div class="horaria-breakdown-item ${t.cls}">
                        <span class="horaria-breakdown-title">${t.label}</span>
                        <span class="horaria-breakdown-asc">${fmtInt(d.ascensos)} asc.</span>
                        <span class="horaria-breakdown-rec">$${fmt(d.recaudo)} MXN</span>
                    </div>
                `;
            }).join('');
    }

    /* ---------- Tabla detalle ---------- */
    if (data.tabla) {
        renderizarTablaMaster(data.tabla, 'tabla-horaria');
    }
}

/* ======================================================
   UTIL
   ====================================================== */
function _horaria_dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}