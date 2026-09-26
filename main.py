"""

* En este script se realiza la conexion de los calculos realizados en utilidades.py y el backend.
* Se definen los endpoints unicos de cada seccion, especificando lo que se va a mostrar en cada
  seccion y su contenido (DataFrames) que se obtiene desde utilides.py.
* El endpoint principal de cada seccion "get_(sección)_data" regresa un jsonify el cual esta
  organizado segun el tipo de dato que reciben como parametro las funciones de JavaScript para
  renderizar las graficas, tablas y demas datos, pero en si cada uno de los jsonify necesita del
  DataFrame que sera mostrado en el Dashboard.
* IMPORTANTE: En ese archivo NO SE REALIZA NINGUN PROCESAMIENTO DE DATOS, solo se establecen los
  endpoints para hacer la conexion.

"""
    
# Importar las librerias
import os
import locale
import requests
import pandas as pd
import json, time
import utilidades as util
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from auth_insitra import verificar_token, TokenInvalido
from permisos import secciones_permitidas

#############################################################################################################################################################
# CONFIGURACIONES
app = Flask(__name__)
load_dotenv('.env')
API = os.getenv('CEIBA_BASE_URL')
BCK = os.getenv('BCK')
app.secret_key = os.environ["FLASK_SECRET_KEY"]
URL_EMPRESAS = os.getenv('URL_EMPRESAS')
URL_LOGIN = os.environ["URL_LOGIN"]
URL_LOGIN_MATRIZ = os.environ["URL_LOGIN_MATRIZ"]
ID_EMPRESA_ADMIN = 1
RUTAS_SIN_GRUPO = {'/api/grupos'}
RUTAS_PUBLICAS = {'index', 'login', 'access', 'logout', 'static'}
_mapa_cache = {"data": None, "expira": 0}
MAPA_TTL = 300

def bck(metodo, path, **kwargs):
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {session.get('jwt', '')}"
    return requests.request(metodo, f"{BCK}{path}", headers=headers, **kwargs)

def cargar_mapa():
    ahora = time.time()
    if _mapa_cache["data"] is not None and _mapa_cache["expira"] > ahora:
        return _mapa_cache["data"]
    try:
        r = bck("get", "/mapa-corredores", timeout=5)
        mapa = {item["idEmpresa"]: item["group_id"] for item in r.json()}
        _mapa_cache["data"] = mapa
        _mapa_cache["expira"] = ahora + MAPA_TTL
        return mapa
    except Exception:
        if _mapa_cache["data"] is not None:
            return _mapa_cache["data"]   # si el back falla, usa el último bueno
        raise


def iniciar_sesion_con_token(token):
    """Única puerta de sesión, sin importar cómo se autenticó el usuario."""
    identidad = verificar_token(token)          # valida contra /auth + lee claims
    session['user_name']  = identidad['nombre']
    session['email']      = identidad['email']
    session['user_id']    = identidad['user_id']
    session['user_key']   = identidad['user_id']
    session['id_empresa'] = identidad['id_empresa']
    session['roles']      = identidad.get('rol', [])
    session['jwt']        = token               # debe ir antes de registrar_sesion()
    session['login_id']   = registrar_sesion()  # candado
    return identidad

EMAILS_ACCESO_ESPECIAL = {
    'cmunguia@ci-sa.com.mx': {11, 10, 12, 7, 49},  
}

def grupos_permitidos():
    mapa = cargar_mapa()
    id_empresa = session.get('id_empresa')
    email = session.get("email")

    if email in EMAILS_ACCESO_ESPECIAL:
        return EMAILS_ACCESO_ESPECIAL[email]

    if id_empresa == ID_EMPRESA_ADMIN:
        return set(mapa.values())
    
    
    propio = mapa.get(id_empresa)
    return {propio} if propio is not None else set()

def _grupos_en_peticion():
    # Saca todos los group_id que vienen en la petición (query o body JSON).a
    crudos = []
    arg = request.args.get('groupid')
    if arg:
        crudos += [x.strip() for x in arg.split(',') if x.strip()]  # admite "11,12"
    body = request.get_json(silent=True)
    if body and body.get('groupid') is not None:
        crudos.append(str(body.get('groupid')))
    ids = []
    for x in crudos:
        try:
            ids.append(int(x))
        except (TypeError, ValueError):
            pass
    return ids

def salir_a_matriz():
    """Página -> redirect. Llamada /api (XHR) -> 401 con la URL para que el JS navegue."""
    if request.path.startswith('/api/'):
        return jsonify({"redirect": URL_LOGIN_MATRIZ}), 401
    return redirect(URL_LOGIN_MATRIZ)

@app.before_request
def candado_sesion():
    if request.endpoint in RUTAS_PUBLICAS:
        return
    if 'user_id' not in session:
        return salir_a_matriz()
    if sesion_vigente() != session.get('login_id'):
        session.clear()
        return salir_a_matriz()


@app.before_request
def guard_grupo():
    if not request.path.startswith('/api/'):
        return
    if request.path in RUTAS_SIN_GRUPO:
        return
    if 'user_key' not in session:
        return salir_a_matriz()

    permitidos = grupos_permitidos()
    for gid in _grupos_en_peticion():
        if gid not in permitidos:
            return salir_a_matriz()

def registrar_sesion():
    r = bck("post", "/sesion/registrar", timeout=5)
    return r.json().get("login_id")

def sesion_vigente():
    try:
        r = bck("get", "/sesion/vigente", timeout=5)
    except Exception:
        return session.get('login_id')   # back inaccesible: no expulses por un parpadeo
    if r.status_code == 200:
        return r.json().get("login_id")
    if r.status_code == 401:
        return None                        # token inválido/expirado: expulsa
    return session.get('login_id')         # otros errores: no expulses

def cerrar_sesion():
    try:
        bck("delete", "/sesion", timeout=5)
    except Exception:
        pass

# Obtener el nombre del día actual
try:
    locale.setlocale(locale.LC_TIME, 'es_ES.UTF-8')
except:
    try:
        locale.setlocale(locale.LC_TIME, 'es_ES')
    except:
        locale.setlocale(locale.LC_TIME, '') 
#############################################################################################################################################################
# INICIAR SESION
@app.route('/')
def index():
    return render_template('IniciarSesion.html') # Definir IniciarSesion.html como la vista inicial

@app.route('/login', methods=['POST'])
def login():
    datos = request.json
    email = datos.get('email') or datos.get('usuario')   # tu form manda 'usuario'
    password = datos.get('password')

    # 1) credenciales -> token, contra la matriz
    try:
        r = requests.post(URL_LOGIN, json={"email": email, "password": password}, timeout=10)
    except requests.RequestException:
        return jsonify({"success": False, "message": "No se pudo contactar al servicio de autenticación."})

    if r.status_code != 200:
        return jsonify({"success": False, "message": "Correo o contraseña incorrectos."})

    token = r.json().get("token")
    if not token:
        return jsonify({"success": False, "message": "Respuesta inválida del servicio."})

    # 2) misma puerta de sesión que /access (usa SOLO el token)
    try:
        iniciar_sesion_con_token(token)
    except TokenInvalido:
        return jsonify({"success": False, "message": "No se pudo validar la sesión."})

    return jsonify({"success": True, "redirect": url_for('dashboard')})
##############################################################################################################################################################
# ENDPOINT  PARA VERIFICAR EL TOKEN JWT DEL USUARIO Y DAR ACCESO A LA SECCION DE DASHBOARD
@app.route('/access')
def access():
    token = request.args.get('token')
    try:
        iniciar_sesion_con_token(token)
    except TokenInvalido:
        return salir_a_matriz()
    return redirect(url_for('dashboard'))


############################################################################################################################################################
# ENDPONT PRINCIPAL DEL DASHBOARD, SE ENCARGA DE CARGAR EL DASHBOARD Y LOS PERMISOS DEL USUARIO
@app.route('/Dashboard')
def dashboard():
    if 'user_key' not in session:
        return redirect(url_for('index'))
    usuario = session.get('user_name')
    roles_usuario = session.get('roles', [])
    try:
        permisos = secciones_permitidas(session.get('jwt'), roles_usuario)
    except Exception:
        permisos = []   # si el catálogo falla, sin secciones
    return render_template('Dashboard.html', nombre_usuario=usuario, permisos=permisos)


#############################################################################################################################################################
# CERRAR SESION
@app.route('/logout')
def logout():
    if 'jwt' in session:
        cerrar_sesion()
    session.clear()
    return redirect(URL_LOGIN_MATRIZ)

#############################################################################################################################################################
# OBTENER NOMBRES DE LOS CORREDORES PARA EL <SELECT> DEL SIDEBAR
@app.route('/api/grupos')
def obtener_grupos():
    if 'user_key' not in session:
        return jsonify({"error": "No autenticado"}), 401

    headers = {"Authorization": f"Bearer {session.get('jwt', '')}"}
    try:
        r = requests.get(URL_EMPRESAS, headers=headers, timeout=10)
        empresas = r.json()

        if not isinstance(empresas, list):
            return jsonify({"error": "Respuesta inesperada de empresas", "detalle": empresas}), 502

        permitidos = grupos_permitidos()
        mapa = cargar_mapa()

        out = []
        for e in empresas:
            group_id = mapa.get(e["idEmpresa"])
            if group_id is not None and group_id in permitidos:
                out.append({"id": group_id, "nombre": e["nombre"]})
        return jsonify(out)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

""" ##################################################################################################################################################### """
""" ################################################################# SECCION DE INICIO ################################################################# """
# ENDPOINT'S DE LAS GRAFICAS Y TABLAS DE LA SECCION DE INICIO
@app.route('/api/inicio-data')
def get_inicio_data():
    if 'user_key' not in session:
        return jsonify({"error": "No autenticado"}), 401

    group_id = request.args.get('groupid')

    if not group_id:
        return jsonify({ "success": False, "error": "Falta parámetro: groupid"}), 400

    try:
        ruta_back = f"{BCK}/api/inicio-data"
        #response = requests.get(ruta_back, params={"groupid": group_id})
        response = bck("get", "/api/inicio-data", params={"groupid": group_id})
        #print(f"\n\nDATOS OBTENIDOS PARA INICIO\n{response.json()}")
        #print(f"\n\nDATOS OBTENIDOS PARA INICIO\n{ruta_back}")
        return jsonify(response.json()), response.status_code

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

""" ##################################################################################################################################################### """
""" ################################################################# SECCION DE TOTALES ################################################################ """
# ENDPOINT'S DE LAS GRAFICAS Y TABLAS DE LA SECCION DE TOTALES
@app.route('/api/totales-data')
def get_totales_data():
    if 'user_key' not in session:
        return jsonify({"error": "No autenticado"}), 401

    group_id = request.args.get('groupid')
    inicio_totales = request.args.get('inicio')
    final_totales = request.args.get('final')

    if not group_id or not inicio_totales or not final_totales:
        return jsonify({"success": False, "error": "Faltan parámetros: groupid, inicio, final"})

    try:
        #response = requests.get(f"{BCK}/api/totales-data", params={"groupid": group_id, "inicio": f"{inicio_totales} 00:00:00", "final": f"{final_totales} 23:59:59"})
        response = bck("get", "/api/totales-data", params={"groupid": group_id, "inicio": f"{inicio_totales} 00:00:00", "final": f"{final_totales} 23:59:59"})
        #print(f"\n\nDATOS OBTENIDOS PARA TOTALES\n{response.json()}")
        return jsonify(response.json())

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


""" ##################################################################################################################################################### """
""" ################################################################ SECCION DE UNIDADES ################################################################ """
# ENDPOINT PARA LLENAR EL MULTISELECT SEGUN EL GRUPO SELECCIONADO
@app.route('/api/unidades-lista')
def get_unidades_lista():
    if 'user_key' not in session:
        return jsonify({"error": "No autenticado"}), 401
    
    group_id = request.args.get('groupid')

    if not group_id:
        return jsonify([])

    try:
        #response = requests.get(f"{BCK}/api/unidades-lista", params={"groupid": group_id})
        response = bck("get", "/api/unidades-lista", params={"groupid": group_id})
        return jsonify(response.json())

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ENDPOINT'S DE LAS GRAFICAS Y TABLAS DE LA SECCION DE UNIDADES
@app.route('/api/unidades-data')
def get_unidades_data():
    if 'user_key' not in session:
        return jsonify({"error": "No autenticado"}), 401

    group_id = request.args.get('groupid').split(',')
    raw_terids = request.args.get('terids', '')
    inicio = request.args.get('inicio')
    final = request.args.get('final')

    if not group_id or not inicio or not final:
        return jsonify({"success": False, "error": "Faltan parámetros: groupid, inicio, final"}), 400

    try:
        #response = requests.get(f"{BCK}/api/unidades-data", params={"groupid": group_id, "terids": raw_terids, "inicio": f"{inicio} 00:00:00", "final": f"{final} 23:59:59"})
        response = bck("get", "/api/unidades-data", params={"groupid": group_id, "terids": raw_terids, "inicio": f"{inicio} 00:00:00", "final": f"{final} 23:59:59"})
        #print(f"\n\nDATOS OBTENIDOS PARA UNIDADES\n{response.json()}")
        return jsonify(response.json()), response.status_code

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

""" ##################################################################################################################################################### """
""" ################################################################## SECCION DE RUTA ################################################################## """
# ENDPOINT'S DEL MAPA Y TABLA DE LA SECCION DE RUTA
@app.route('/api/ruta-data')
def get_ruta_data():
    if 'user_key' not in session:
        return jsonify({"error": "No autenticado"}), 401

    group_id = request.args.get('groupid')
    fecha = request.args.get('fecha')
    hora_inicio = request.args.get('hora_inicio')  # formato HH:MM
    hora_final = request.args.get('hora_final')    # formato HH:MM

    if not group_id or not fecha or not hora_inicio or not hora_final:
        return jsonify({"success": False, "error": "Faltan parámetros: groupid, fecha, hora_inicio, hora_final"}), 400

    try:
        inicio = f"{fecha} {hora_inicio}:00"
        final  = f"{fecha} {hora_final}:59"
        #response = requests.get(f"{BCK}/api/ruta-data", params={"groupid": group_id, "inicio": inicio, "final": final})
        response = bck("get", "/api/ruta-data", params={"groupid": group_id, "inicio": inicio, "final": final})
        return jsonify(response.json()), response.status_code

    except Exception as e:
        import traceback
        print(f"\n[RUTA] ERROR en /api/ruta-data:\n{traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500

#############################################################################################################################################################
""" ##################################################################################################################################################### """
""" ################################################################ SECCION DE HORARIA ################################################################## """
# ENDPOINT PROXY DE LA SECCION DE HORARIA
@app.route('/api/horaria-data', methods=['POST'])
def post_horaria_data():

    body = request.get_json(silent=True)
    if not body:
        return jsonify({"success": False, "error": "El body debe ser JSON."}), 400

    try:
        # ── 1. Traducir campos raíz ──────────────────────────────────────────
        group_id = body.get('groupid')
        unidades = body.get('terids', [])

        # dias[].fecha → dias[].dia  (los demás campos coinciden)
        dias = [
            {
                "dia":         d.get('fecha'),
                "hora_inicio": d.get('hora_inicio'),
                "hora_fin":    d.get('hora_fin'),
            }
            for d in body.get('dias', [])
        ]

        # ── 2. Traducir tarifas ──────────────────────────────────────────────
        tf_front = body.get('tarifas', {})
        tarifas  = { "normal": tf_front.get('normal') }

        # Nocturna: valor→precio  |  desde/hasta→hora_inicio/hora_fin
        noc = tf_front.get('nocturna')
        if noc:
            tarifas['nocturna'] = {
                "precio":      noc.get('valor'),
                "hora_inicio": noc.get('desde'),
                "hora_fin":    noc.get('hasta'),
            }

        # Especial: valor→precio  |  geojson FeatureCollection → poligonos [[lat,lng],...]
        esp = tf_front.get('especial')
        if esp:
            poligonos = []
            fc = esp.get('geojson', {})
            for feature in fc.get('features', []):
                coords = feature.get('geometry', {}).get('coordinates', [[]])[0]
                # GeoJSON usa [lng, lat]; el backend espera [lat, lng]
                poligonos.append([[lat, lng] for lng, lat in coords])

            tarifas['especial'] = {
                "precio":    esp.get('valor'),
                "poligonos": poligonos,
            }

        # ── 3. Payload final para el backend ─────────────────────────────────
        payload_bck = {
            "group_id": group_id,"unidades": unidades, "dias": dias, "tarifas": tarifas,
            }

        #response = requests.post(f"{BCK}/api/horarios-data",json=payload_bck,timeout=60)
        response = bck("post", "/api/horarios-data", json=payload_bck, timeout=60)
        return jsonify(response.json()), response.status_code

    except Exception as e:
        import traceback
        print(f"\n[HORARIA] ERROR en /api/horaria-data:\n{traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/zonas-tarifarias', methods=['GET'])
def get_zonas():
    group_id = request.args.get('groupid')
    #r = requests.get(f"{BCK}/api/zonas-tarifarias", params={"group_id": group_id}, timeout=10)
    r = bck("get", "/api/zonas-tarifarias", params={"group_id": group_id}, timeout=10)
    return jsonify(r.json()), r.status_code

@app.route('/api/zonas-tarifarias', methods=['POST'])
def post_zona():
    body = request.get_json(silent=True)
    payload = {
        "group_id": body.get('groupid'),
        "nombre":   body.get('nombre'),
        "geojson":  body.get('geojson'),   # pasa tal cual
    }
    #r = requests.post(f"{BCK}/api/zonas-tarifarias", json=payload, timeout=10)
    r = bck("post", "/api/zonas-tarifarias", json=payload, timeout=10)
    return jsonify(r.json()), r.status_code

@app.route('/api/zonas-tarifarias/<int:zona_id>', methods=['PUT'])
def put_zona(zona_id):
    body = request.get_json(silent=True)
    payload = {
        "group_id": body.get('groupid'),
        "nombre":  body.get('nombre'),
        "geojson": body.get('geojson'),
    }
    #r = requests.put(f"{BCK}/api/zonas-tarifarias/{zona_id}", json=payload, timeout=10)
    r = bck("put", f"/api/zonas-tarifarias/{zona_id}", json=payload, timeout=10)
    return jsonify(r.json()), r.status_code

@app.route('/api/zonas-tarifarias/<int:zona_id>', methods=['DELETE'])
def delete_zona(zona_id):
    group_id = request.args.get('groupid')
    #r = requests.delete(f"{BCK}/api/zonas-tarifarias/{zona_id}", params={"group_id": group_id}, timeout=10)
    r = bck("delete", f"/api/zonas-tarifarias/{zona_id}", params={"group_id": group_id}, timeout=10)
    return jsonify(r.json()), r.status_code

""" ############################################################ SECCION DE POLIGONO DE CARGA ########################################################## """
 
# Catálogo de rutas para el <select> (se llama al iniciar la sección)
@app.route('/api/poligono-carga/rutas')
def get_poligono_carga_rutas():
 
    group_id = request.args.get('groupid')
 
    if not group_id:
        return jsonify({"success": False, "error": "Falta parámetro: groupid"}), 400
 
    try:
        #response = requests.get(f"{BCK}/api/poligono-carga/rutas", params={"groupid": group_id})
        response = bck("get", "/api/poligono-carga/rutas", params={"groupid": group_id})
        return jsonify(response.json()), response.status_code
 
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
 
 
@app.route('/api/poligono-carga-data')
def get_poligono_carga_data():

    group_id = request.args.get('groupid')
    inicio   = request.args.get('inicio')    # ← cambiar fecha por inicio
    final    = request.args.get('final')     # ← agregar final
    ruta     = request.args.get('ruta')

    if not group_id or not inicio or not final or not ruta:
        return jsonify({"success": False, "error": "Faltan parámetros: groupid, inicio, final, ruta"}), 400

    try:
        #response = requests.get(f"{BCK}/api/poligono-carga-data", params={"groupid": group_id, "inicio": inicio, "final": final, "ruta": ruta},)
        response = bck("get", "/api/poligono-carga-data", params={"groupid": group_id, "inicio": inicio, "final": final, "ruta": ruta})
        return jsonify(response.json()), response.status_code

    except Exception as e:
        import traceback
        print(f"\n[POLIGONO_CARGA] ERROR:\n{traceback.format_exc()}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)