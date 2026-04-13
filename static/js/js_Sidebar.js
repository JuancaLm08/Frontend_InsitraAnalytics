let debounceTimer; // Variable para el temporizador
let insitraLoader; // Variable para controlar la aparicion de la animacion Lottie
let animations = {}; // Objeto para guardar las instancias de Lottie

window.seccionesCargadas = {'Inicio': false, 'Totales': false, 'Unidades': false, 'Ruta': false };

/**********************************************************************************************************************************************************/
// FUNCION PARA CARGAR LA ANIMACION LOTTIE
document.addEventListener('DOMContentLoaded', () => {
    const containers = document.querySelectorAll('.section-loader .lottie-anim-canvas');    
    containers.forEach((container, index) => {
        const sectionId = container.closest('.section-loader').id;
        animations[sectionId] = lottie.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: true,
            autoplay: false,
            path: '../static/animations/Insitra_loading.json'
        });
    });
});

/**********************************************************************************************************************************************************/
// FUNCION PARA EL CONTROL DEL SIDEBAR
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
    } else {
        sidebar.classList.toggle('collapsed');
    }

    setTimeout(() => {
        const charts = document.querySelectorAll('.js-plotly-plot');
        charts.forEach(chart => {
            Plotly.Plots.resize(chart);
        });
    }, 400); 
}

/**********************************************************************************************************************************************************/
// FUNCION PARA CAMBIAR DE VISTA (SECCION)
async function changeView(view, el) {
    window.currentActiveView = view;
    const iconSpan = el.querySelector('.icon');
    const icon = iconSpan ? iconSpan.innerText : '';
    
    document.getElementById("view-title").innerText = "INSITRA ANALYTICS: " + view + " " + icon;
    document.getElementById("titulo-general").innerText = "INSITRA ANALYTICS: " + view;
    const secciones = {'Inicio': 'section-inicio', 'Totales': 'section-totales', 'Unidades': 'section-unidades', 'Ruta': 'section-ruta'};

    // Ocultar todas las secciones y mostrar la activa
    Object.values(secciones).forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = "none";
    });

    const seccionActivaId = secciones[view];
    const seccionActiva = document.getElementById(seccionActivaId);
    if(seccionActiva) seccionActiva.style.display = "block";

    const selectCorredor = document.getElementById('select-corredor');
    const groupId = selectCorredor ? selectCorredor.value : null;

    if (groupId) {
        // SOLO actualiza automáticamente si la sección NO ha sido cargada antes
        if (!seccionesCargadas[view]) {
            if (view === 'Unidades') {
                if (typeof cargarListaBuses === 'function') await cargarListaBuses(groupId);
            }
            if (view === 'Ruta') inicializarMapa();
            
            dispararActualizacionGlobal(); 
        }
    }

    if(typeof setActiveMenu === "function") setActiveMenu(el);
}

/**********************************************************************************************************************************************************/
// FUNCION PARA ACTUALIZAR LOS DASHBOARD SEGUN CORRESPONDA
function dispararActualizacionGlobal() {
    clearTimeout(debounceTimer);
    
    const elementosBloqueables = [
        document.getElementById('select-corredor'),
        document.getElementById('fecha-inicio-totales'),
        document.getElementById('fecha-final-totales'),
        document.getElementById('select-all-bus'),
        document.querySelector('.custom-select'),
        document.getElementById('fecha-inicio-unidades'),
        document.getElementById('fecha-final-unidades'),
        document.getElementById('fecha-inicio-ruta'),
        document.getElementById('fecha-final-ruta'),

        document.getElementById('no-data-banner-inicio'),
        document.getElementById('no-data-banner-totales1'),
        document.getElementById('no-data-banner-totales2'),
        document.getElementById('no-data-banner-unidades1'),
        document.getElementById('no-data-banner-unidades2'),
        document.getElementById('no-data-banner-ruta'),

        document.getElementById('btn-refresh'),
    ];

    debounceTimer = setTimeout(async () => {
        const view = window.currentActiveView;
        const selectCorredor = document.getElementById('select-corredor');
        const groupId = selectCorredor ? selectCorredor.value : null;

        if (!groupId) return;

        let contenedoresActivos = [];
        let activeLoaderId = '';

        if (view === 'Inicio') {
            contenedoresActivos = [document.getElementById('inicio-content')];
            activeLoaderId = 'loader-inicio';
        } else if (view === 'Totales') {
            contenedoresActivos = [document.getElementById('totales-pasajeros-content'), document.getElementById('totales-kilometraje-content')];
            activeLoaderId = 'loader-totales';
        } else if (view === 'Unidades') {
            contenedoresActivos = [document.getElementById('unidades-pasajeros-content'), document.getElementById('unidades-kilometraje-content')];
            activeLoaderId = 'loader-unidades';
        } else if (view === 'Ruta') {
            contenedoresActivos = [document.getElementById('ruta-content')];
            activeLoaderId = 'loader-ruta';
        }

        const currentLoader = document.getElementById(activeLoaderId);

        if (currentLoader) {
            currentLoader.style.display = 'flex';
            if(animations[activeLoaderId]) animations[activeLoaderId].play();
        }

        contenedoresActivos.forEach(c => { if(c) c.classList.add('loading-blur'); });
        
        elementosBloqueables.forEach(el => {
            if (!el) return;
            el.style.opacity = '0.72';
            if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'BUTTON') el.disabled = true;
            else el.style.pointerEvents = 'none';
        });

        try {
            switch (view) {
                case 'Inicio': if (typeof actualizarDashboardInicio === 'function') await actualizarDashboardInicio(groupId); break;
                case 'Totales': if (typeof actualizarDashboardTotales === 'function') await actualizarDashboardTotales(groupId); break;
                case 'Unidades': if (typeof actualizarDashboardUnidades === 'function') await actualizarDashboardUnidades(); break;
                case 'Ruta': if (typeof actualizarDashboardRuta === 'function') await actualizarDashboardRuta(groupId); break;
            }
            window.seccionesCargadas[view] = true;
        } catch (error) {
            console.error("Error en la actualización:", error);
        } finally {
            if (currentLoader) {
                currentLoader.style.display = 'none';
                if(animations[activeLoaderId]) animations[activeLoaderId].stop();
            }

            elementosBloqueables.forEach(el => {
                if (!el) return;
                el.style.opacity = '1';
                if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'BUTTON') el.disabled = false;
                else el.style.pointerEvents = 'auto';
            });

            contenedoresActivos.forEach(c => { if(c) c.classList.remove('loading-blur'); });
        }
    }, 1000);
}

/**********************************************************************************************************************************************************/
// FUNCION PARA CARGAR LOS CORREDORES CON LA API
async function cargarCorredores() {
    const select = document.getElementById('select-corredor');
    
    try {
        const response = await fetch('/api/grupos');
        const grupos = await response.json();
        
        if (grupos.error) return;

        grupos.forEach(grupo => {
            const option = document.createElement('option');
            option.value = grupo.id; 
            option.textContent = grupo.nombre;
            select.appendChild(option);
        });

        select.value = grupos[0].id;
        dispararActualizacionGlobal();

        // Evento al cambiar de corredor
        select.addEventListener('change', async (e) => {
            const groupId = e.target.value;
            if (!groupId) return;
            if (window.currentActiveView === 'Unidades') {
                if (typeof cargarListaBuses === 'function') await cargarListaBuses(groupId);
            }
            dispararActualizacionGlobal();
        });

    } catch (error) {
        console.error("Error al cargar corredores:", error);
    }
}

/**********************************************************************************************************************************************************/
// Ejecutar cuando cargue el documento
document.addEventListener('DOMContentLoaded', () => {
    cargarCorredores();
});

/**********************************************************************************************************************************************************/
// FUNCION PARA CERRAR SESION
document.addEventListener('DOMContentLoaded', () => {
    const btnLogout = document.querySelector('.logout');
    
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("¿Estás seguro de que deseas cerrar sesión?")) { // Para evitar cierres accidentales
                window.location.href = '/logout';
            }
        });
    }
});

/**********************************************************************************************************************************************************/
// MANEJO DE SELECCIÓN ACTIVA
function setActiveMenu(el) {
    document.querySelectorAll(".menu a").forEach(a => a.classList.remove("active"));
    el.classList.add("active");
}

/**********************************************************************************************************************************************************/
// PARA HACER RESPONSIVE LA SIDEBAR
window.addEventListener('resize', function() {
    const sidebar = document.querySelector('.sidebar');
    const charts = document.querySelectorAll('.js-plotly-plot');

    if (window.innerWidth > 768) {
        sidebar.classList.remove('mobile-open');
    }

    charts.forEach(chart => {
        Plotly.Plots.resize(chart);
    });
});