/* ==========================================================================================
   INSITRA ANALYTICS — SECCIÓN VIAJES

   Consume dos endpoints del back (rama del polígono de carga v3), vía los proxies de main.py:
     GET /api/viajes-data     -> kpis, otros, opciones {rutas, unidades}, matriz, por_ruta, periodo
     GET /api/viajes-detalle  -> viajes: [un renglón por tramo], total, truncado, periodo

   Decisiones:
   - La consulta es de UN día (como en el diseño). El back acepta rango, así que pasar a
     rango solo sería agregar una segunda fecha y mandar inicio != final.
   - La fecha máxima es AYER: el job corre de madrugada sobre ayer/antier, hoy nunca tiene datos.
   - Las opciones de Ruta y Unidad salen de la propia respuesta (opciones.*). El back las
     calcula ANTES de aplicar los filtros, así que filtrar por una unidad no vacía el selector.
   - El detalle es pesado y casi nadie lo abre: se pide solo al desplegar "Ver detalle".
   - Una consulta nueva cancela a la anterior (AbortController) y además se descarta
     cualquier respuesta cuyo token ya no sea el vigente: así una respuesta lenta del
     corredor anterior no pisa la del corredor actual.
   - No hay gráficas Plotly: todo es HTML + tokens CSS, así que el cambio de tema no
     necesita repintar nada.
   ========================================================================================== */

const _vj = {
    groupId: null,          // corredor de la última consulta
    params: null,           // filtros de la última consulta exitosa (los usa el detalle)
    token: 0,               // token monotónico del resumen
    ctrl: null,             // AbortController del resumen
    detToken: 0,
    detCtrl: null,
    detalle: null,          // respuesta de /api/viajes-detalle para params actuales
    detalleVigente: false,  // false = hay que volver a pedirlo al abrir
    matriz: null,           // matriz de la última respuesta (para reordenar sin pedir)
    orden: { col: 'unidad', dir: 1 },
    listo: false            // listeners enganchados
};

/**************************************************************************************************/
// UTILIDADES
/**************************************************************************************************/
function _vj_esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

const _vj_num = (n, dec = 0) => (n === null || n === undefined || Number.isNaN(Number(n)))
    ? '--'
    : Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function _vj_isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _vj_fechaLarga(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

// Escala de color fija del diseño: 1–3, 4–6, 7–9, 10–12, 13+
function _vj_claseHeat(n) {
    if (!n || n <= 0) return '';
    if (n <= 3)  return 'vj-h1';
    if (n <= 6)  return 'vj-h2';
    if (n <= 9)  return 'vj-h3';
    if (n <= 12) return 'vj-h4';
    return 'vj-h5';
}

function _vj_toggleLoader(mostrar) {
    const loader = document.getElementById('loader-viajes');
    if (loader) loader.style.display = mostrar ? 'flex' : 'none';
    // "animations" vive en js_Sidebar.js (mismo scope global de scripts clásicos)
    if (typeof animations !== 'undefined' && animations['loader-viajes']) {
        if (mostrar) animations['loader-viajes'].play();
        else animations['loader-viajes'].stop();
    }
}

function _vj_mostrarBanner(msj) {
    const banner  = document.getElementById('no-data-banner-viajes');
    const content = document.getElementById('viajes-content');
    if (banner)  { banner.textContent = msj; banner.style.display = 'block'; }
    if (content) content.style.display = 'none';
}

function _vj_mostrarContenido() {
    const banner  = document.getElementById('no-data-banner-viajes');
    const content = document.getElementById('viajes-content');
    if (banner)  banner.style.display = 'none';
    if (content) content.style.display = 'block';
}

/**************************************************************************************************/
// FECHA: MÁXIMO Y PRESET EN AYER
/**************************************************************************************************/
function _vj_inicializarFecha() {
    const input = document.getElementById('fecha-viajes');
    if (!input) return;
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const iso = _vj_isoLocal(ayer);
    input.max = iso;
    if (!input.value || input.value > iso) input.value = iso;
}

/**************************************************************************************************/
// SELECTORES DE RUTA Y UNIDAD (se llenan con opciones.* de la respuesta)
/**************************************************************************************************/
function _vj_llenarSelect(id, opciones) {
    const select = document.getElementById(id);
    if (!select) return;
    const previo = select.value;
    select.innerHTML = '<option value="">Todas</option>' +
        opciones.map(o => `<option value="${_vj_esc(o.value)}">${_vj_esc(o.label)}</option>`).join('');
    // Conserva la selección si sigue existiendo en el corredor/día
    select.value = opciones.some(o => String(o.value) === previo) ? previo : '';
    syncSelect(id);
}

function _vj_resetFiltros() {
    ['ruta-viajes', 'unidad-viajes'].forEach(id => {
        const s = document.getElementById(id);
        if (s) s.innerHTML = '<option value="">Todas</option>';
        syncSelect(id);
    });
}

/**************************************************************************************************/
// CONSULTA PRINCIPAL
/**************************************************************************************************/
async function _vj_consultar(groupId, { conLoader = true } = {}) {
    if (!groupId) return;

    const fecha  = document.getElementById('fecha-viajes').value;
    const ruta   = document.getElementById('ruta-viajes').value;
    const unidad = document.getElementById('unidad-viajes').value;

    if (!fecha) {
        _vj_mostrarBanner('Selecciona una fecha para continuar.');
        return;
    }

    // Cancela la consulta anterior y toma un token nuevo
    if (_vj.ctrl) _vj.ctrl.abort();
    const ctrl = new AbortController();
    _vj.ctrl = ctrl;
    const token = ++_vj.token;

    const params = { groupid: groupId, inicio: fecha, final: fecha, ruta, unidad };
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null));

    const btn = document.getElementById('btn-consultar-viajes');
    if (btn) btn.disabled = true;
    if (conLoader) _vj_toggleLoader(true);
    const content = document.getElementById('viajes-content');
    if (content) content.classList.add('loading-blur');

    try {
        const resp = await fetch(`/api/viajes-data?${qs}`, { signal: ctrl.signal });
        const data = await resp.json();
        if (token !== _vj.token) return;           // llegó tarde: ya hay otra consulta

        _vj.groupId = groupId;

        if (!data || !data.success) {
            _vj_mostrarBanner((data && data.error) || 'Error al consultar los viajes.');
            return;
        }

        // Opciones primero: aunque el día no tenga viajes, los selectores quedan útiles
        const op = data.opciones || {};
        _vj_llenarSelect('ruta-viajes', (op.rutas || []).map(r => ({ value: r.id, label: r.nombre })));
        _vj_llenarSelect('unidad-viajes', (op.unidades || []).map(u => ({ value: u, label: u })));

        // ¿El job procesó ese día?
        const msjPeriodo = _vj_mensajePeriodo(data.periodo, fecha);
        if (msjPeriodo) { _vj_mostrarBanner(msjPeriodo); return; }

        const kpis = data.kpis || {};
        if (!kpis.viajes_totales) {
            const hayFiltro = ruta || unidad;
            _vj_mostrarBanner(hayFiltro
                ? 'No hay viajes para los filtros seleccionados.'
                : `No se identificaron viajes con ruta el ${_vj_fechaLarga(fecha)}.`);
            return;
        }

        _vj.params = params;
        _vj_mostrarContenido();
        _vj_renderKpis(kpis, data.otros || {});
        _vj.matriz = data.matriz;
        _vj_renderMatriz();
        _vj_renderPorRuta(data.por_ruta || [], data.ruta_top);
        _vj_invalidarDetalle();

    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Error en Viajes:', e);
        if (token === _vj.token) _vj_mostrarBanner('Error al consultar los viajes.');
    } finally {
        if (token === _vj.token) {
            if (btn) btn.disabled = false;
            if (conLoader) _vj_toggleLoader(false);
            if (content) content.classList.remove('loading-blur');
        }
    }
}

// periodo = {con_datos:[], omitidos:[], con_error:[], sin_procesar:[]} (fechas ISO)
function _vj_mensajePeriodo(periodo, fecha) {
    if (!periodo) return null;
    const f = _vj_fechaLarga(fecha);
    if ((periodo.con_datos || []).includes(fecha)) return null;
    if ((periodo.omitidos || []).includes(fecha))
        return `El ${f} no hay GPS del corredor; el día no se procesó.`;
    if ((periodo.con_error || []).includes(fecha))
        return `El procesamiento del ${f} terminó con error. Revisa la ejecución del job.`;
    return `El ${f} aún no ha sido procesado.`;
}

/**************************************************************************************************/
// INDICADORES
/**************************************************************************************************/
function _vj_renderKpis(kpis, otros) {
    document.getElementById('metric-viajes-totales').textContent  = _vj_num(kpis.viajes_totales);
    document.getElementById('metric-viajes-unidades').textContent = _vj_num(kpis.unidades_activas);
    document.getElementById('metric-viajes-promedio').textContent = _vj_num(kpis.promedio_por_unidad, 1);

    const top = kpis.unidad_top;
    document.getElementById('metric-viajes-top').textContent     = top ? top.unidad : '--';
    document.getElementById('metric-viajes-top-sub').textContent = top ? `${_vj_num(top.viajes)} viajes` : '';

    // Lo que NO entra al total, para que el número no engañe
    const partes = [];
    if (otros.viajes_sin_ruta) partes.push(`${_vj_num(otros.viajes_sin_ruta)} sin ruta`);
    if (otros.maniobras)       partes.push(`${_vj_num(otros.maniobras)} maniobras`);
    document.getElementById('metric-viajes-otros').textContent = partes.length ? `+ ${partes.join(' · ')}` : '';
}

/**************************************************************************************************/
// MATRIZ UNIDAD x RUTA
/**************************************************************************************************/
function _vj_renderMatriz() {
    const m = _vj.matriz;
    const tabla = document.getElementById('tabla-viajes-matriz');
    if (!m || !tabla) return;

    const columnas = m.columnas || [];
    const { col, dir } = _vj.orden;

    // El orden por defecto (unidad A→Z) no lleva flecha, como en el diseño
    const porDefecto = col === 'unidad' && dir > 0;
    const flecha = (k) => (k === col && !porDefecto) ? `<span class="vj-orden">${dir > 0 ? '▲' : '▼'}</span>` : '';
    const thSort = (k, texto, clase = '', title = '') =>
        `<th class="${clase}" data-sort="${_vj_esc(k)}" title="${_vj_esc(title || texto)}" ` +
        `aria-sort="${k === col ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${_vj_esc(texto)}${flecha(k)}</th>`;

    tabla.querySelector('thead').innerHTML = '<tr>' +
        thSort('unidad', 'Unidad', 'vj-col-unidad') +
        columnas.map(c => thSort(String(c.ruta_id), c.nombre, 'vj-col-ruta', c.nombre)).join('') +
        thSort('total', 'Total', 'vj-col-total') +
        '</tr>';

    // Orden: por unidad (alfanumérico natural) o por cualquier columna numérica
    const filas = [...(m.filas || [])];
    const valor = (f) => col === 'unidad' ? f.unidad : col === 'total' ? f.total : (f.por_ruta[col] || 0);
    filas.sort((a, b) => {
        const va = valor(a), vb = valor(b);
        let r = (typeof va === 'number')
            ? va - vb
            : String(va).localeCompare(String(vb), 'es', { numeric: true });
        // Empates: siempre por unidad A→Z, sin importar la dirección
        if (r === 0) return String(a.unidad).localeCompare(String(b.unidad), 'es', { numeric: true });
        return r * dir;
    });

    tabla.querySelector('tbody').innerHTML = filas.map(f => '<tr>' +
        `<td class="vj-col-unidad">${_vj_esc(f.unidad)}</td>` +
        columnas.map(c => {
            const n = f.por_ruta[String(c.ruta_id)] || 0;
            return n > 0
                ? `<td class="vj-col-ruta"><span class="vj-heat ${_vj_claseHeat(n)}">${_vj_num(n)}</span></td>`
                : '<td class="vj-col-ruta"><span class="vj-vacio">–</span></td>';
        }).join('') +
        `<td class="vj-col-total">${_vj_num(f.total)}</td>` +
        '</tr>').join('');

    const tot = m.totales || {};
    tabla.querySelector('tfoot').innerHTML = '<tr>' +
        '<td class="vj-col-unidad">Total</td>' +
        columnas.map(c => `<td class="vj-col-ruta">${_vj_num(tot[String(c.ruta_id)] || 0)}</td>`).join('') +
        `<td class="vj-col-total vj-gran-total">${_vj_num(tot.total)}</td>` +
        '</tr>';
}

function _vj_alOrdenar(e) {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    if (_vj.orden.col === k) {
        _vj.orden.dir *= -1;
    } else {
        // La unidad arranca A→Z; los conteos arrancan de mayor a menor
        _vj.orden = { col: k, dir: k === 'unidad' ? 1 : -1 };
    }
    _vj_renderMatriz();
}

/**************************************************************************************************/
// VIAJES POR RUTA (barras relativas a la ruta con más viajes)
/**************************************************************************************************/
function _vj_renderPorRuta(porRuta, rutaTop) {
    const cont = document.getElementById('vj-rutas-barras');
    if (!cont) return;
    const max = Math.max(1, ...porRuta.map(r => r.viajes));

    cont.innerHTML = porRuta.map(r => `
        <div class="vj-ruta" title="${_vj_esc(r.nombre)}: ${_vj_num(r.viajes)} viajes (${_vj_num(r.pct, 1)}% del total)">
            <div class="vj-ruta-fila">
                <span class="vj-ruta-nombre">${_vj_esc(r.nombre)}</span>
                <span class="vj-ruta-valor">${_vj_num(r.viajes)}</span>
            </div>
            <div class="vj-ruta-pista"><div class="vj-ruta-barra" style="width:${(r.viajes / max * 100).toFixed(1)}%"></div></div>
        </div>`).join('');

    const pie = document.getElementById('vj-ruta-top');
    if (pie) {
        pie.innerHTML = rutaTop
            ? `Ruta con más viajes: <b>${_vj_esc(rutaTop.nombre)}</b>`
            : '';
        pie.style.display = (rutaTop && porRuta.length > 1) ? 'block' : 'none';
    }
}

/**************************************************************************************************/
// DETALLE DE VIAJES (perezoso: se pide al abrir el desplegable)
/**************************************************************************************************/
function _vj_invalidarDetalle() {
    _vj.detalle = null;
    _vj.detalleVigente = false;
    if (_vj.detCtrl) _vj.detCtrl.abort();
    const det = document.getElementById('vj-detalle');
    if (det && det.open) _vj_cargarDetalle();      // si ya estaba abierto, se refresca
    else {
        const tb = document.querySelector('#tabla-viajes-detalle tbody');
        if (tb) tb.innerHTML = '';
        _vj_estadoDetalle('');
        const c = document.getElementById('vj-detalle-conteo');
        if (c) c.textContent = '';
    }
}

function _vj_estadoDetalle(msj) {
    const el = document.getElementById('vj-detalle-estado');
    if (!el) return;
    el.textContent = msj;
    el.style.display = msj ? 'block' : 'none';
}

async function _vj_cargarDetalle() {
    if (!_vj.params) return;
    if (_vj.detCtrl) _vj.detCtrl.abort();
    const ctrl = new AbortController();
    _vj.detCtrl = ctrl;
    const token = ++_vj.detToken;

    const qs = new URLSearchParams(Object.entries(_vj.params).filter(([, v]) => v !== '' && v != null));
    _vj_estadoDetalle('Cargando detalle…');
    document.querySelector('#tabla-viajes-detalle tbody').innerHTML = '';

    try {
        const resp = await fetch(`/api/viajes-detalle?${qs}`, { signal: ctrl.signal });
        const data = await resp.json();
        if (token !== _vj.detToken) return;

        if (!data || !data.success) {
            _vj_estadoDetalle((data && data.error) || 'Error al cargar el detalle.');
            return;
        }
        _vj.detalle = data;
        _vj.detalleVigente = true;
        _vj_renderDetalle();
    } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Error en detalle de viajes:', e);
        if (token === _vj.detToken) _vj_estadoDetalle('Error al cargar el detalle.');
    }
}

const _vj_hora = (ts) => ts ? String(ts).slice(11, 16) : '--';

function _vj_chipTipo(v) {
    if (v.tipo === 'maniobra') return '<span class="vj-chip vj-chip-maniobra">Maniobra</span>';
    if (v.clasificacion === 'identificada') return '<span class="vj-chip vj-chip-viaje">Viaje</span>';
    return `<span class="vj-chip vj-chip-sinruta" title="${_vj_esc(v.clasificacion || '')}">Sin ruta</span>`;
}

function _vj_pasajeros(n, estado) {
    // null = el conteo de la unidad no se aceptó ese día: "no se sabe", no "cero"
    if (n === null || n === undefined)
        return `<span class="vj-vacio" title="Conteo ${_vj_esc(estado || 'no disponible')}">–</span>`;
    return _vj_num(n);
}

function _vj_renderDetalle() {
    const data = _vj.detalle;
    if (!data) return;

    const incluirOtros = document.getElementById('vj-incluir-otros').checked;
    const todos = data.viajes || [];
    const filas = incluirOtros
        ? todos
        : todos.filter(v => v.tipo === 'viaje' && v.clasificacion === 'identificada');

    const tabla = document.getElementById('tabla-viajes-detalle');
    tabla.querySelector('thead').innerHTML = `<tr>
        <th>#</th><th>Unidad</th><th>Tipo</th><th>Ruta</th><th>Origen</th><th>Destino</th>
        <th>Salida</th><th>Llegada</th><th>Duración (min)</th><th>Ascensos</th><th>Descensos</th>
    </tr>`;

    tabla.querySelector('tbody').innerHTML = filas.map((v, i) => `<tr>
        <td class="row-index">${i + 1}</td>
        <td>${_vj_esc(v.unidad)}</td>
        <td>${_vj_chipTipo(v)}</td>
        <td>${v.ruta ? _vj_esc(v.ruta) : '<span class="vj-vacio">–</span>'}</td>
        <td>${_vj_esc(v.origen)}</td>
        <td>${_vj_esc(v.destino)}</td>
        <td title="${_vj_esc(v.salida)}">${_vj_hora(v.salida)}</td>
        <td title="${_vj_esc(v.llegada)}">${_vj_hora(v.llegada)}</td>
        <td>${_vj_num(v.duracion_min, 1)}</td>
        <td>${_vj_pasajeros(v.ascensos, v.estado_conteo)}</td>
        <td>${_vj_pasajeros(v.descensos, v.estado_conteo)}</td>
    </tr>`).join('');

    const conteo = document.getElementById('vj-detalle-conteo');
    if (conteo) {
        conteo.textContent = incluirOtros
            ? `${_vj_num(filas.length)} tramos`
            : `${_vj_num(filas.length)} viajes · ${_vj_num(todos.length - filas.length)} tramos ocultos`;
    }

    _vj_estadoDetalle(data.truncado
        ? `El detalle se recortó a los primeros ${_vj_num(todos.length)} tramos.`
        : (filas.length ? '' : 'No hay tramos para mostrar.'));
}

/**************************************************************************************************/
// LISTENERS (una sola vez)
/**************************************************************************************************/
function _vj_engancharListeners() {
    if (_vj.listo) return;
    _vj.listo = true;

    // Selectores estilizados: componente compartido (js_SelectEstilizado.js)
    mejorarSelect(document.getElementById('ruta-viajes'),   { buscador: 'auto', placeholder: 'Buscar ruta…' });
    mejorarSelect(document.getElementById('unidad-viajes'), { buscador: true,   placeholder: 'Buscar unidad…' });

    document.getElementById('btn-consultar-viajes').addEventListener('click', () => {
        const sel = document.getElementById('select-corredor');
        _vj_consultar(sel ? sel.value : _vj.groupId);
    });

    document.querySelector('#tabla-viajes-matriz thead').addEventListener('click', _vj_alOrdenar);

    const det = document.getElementById('vj-detalle');
    det.addEventListener('toggle', () => {
        if (det.open && !_vj.detalleVigente) _vj_cargarDetalle();
    });

    document.getElementById('vj-incluir-otros').addEventListener('change', _vj_renderDetalle);
}

/**************************************************************************************************/
// PUNTO DE ENTRADA — lo llama dispararActualizacionGlobal() (js_Sidebar.js), que ya pone
// el loader y el desenfoque, por eso aquí va sin loader propio.
/**************************************************************************************************/
async function actualizarDashboardViajes(groupId) {
    _vj_inicializarFecha();
    _vj_engancharListeners();
    if (!groupId) return;

    // Cambio de corredor: la ruta y la unidad elegidas eran del corredor anterior
    if (_vj.groupId !== null && String(_vj.groupId) !== String(groupId)) {
        _vj_resetFiltros();
        _vj.orden = { col: 'unidad', dir: 1 };
    }
    await _vj_consultar(groupId, { conLoader: false });
}

document.addEventListener('DOMContentLoaded', () => {
    _vj_inicializarFecha();
    _vj_engancharListeners();
});
