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
import utilidades as util
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, session, redirect, url_for

#############################################################################################################################################################
# CONFIGURACIONES
app = Flask(__name__)
load_dotenv('.env')
API = os.getenv('CEIBA_BASE_URL')
BCK = os.getenv('BCK')
app.secret_key = 'tu_llave_secreta_aqui' # !!! ESTA SE DEBE DE CAMBIAR POSTERIORMENTE Y AGREGAR AL secrets.env ¡¡¡

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
    usuario = datos.get('usuario')
    password = datos.get('password')
    
    exito, key, mensaje = util.validarUsuario(usuario, password)
    
    if exito:
        session['user_key'] = key
        session['user_name'] = usuario
        return jsonify({"success": True, "redirect": url_for('dashboard')})
    else:
        return jsonify({"success": False, "message": mensaje})

@app.route('/Dashboard')
def dashboard():
    if 'user_key' not in session:
        return redirect(url_for('index'))
    
    usuario = session.get('user_name')
    permisos = [1] # Inicio (1) siempre permitido por defecto
    
    ruta_csv = os.path.join(app.root_path, 'static', 'data', 'Permisos_temporal.csv')
    df_permisos = pd.read_csv(ruta_csv)
        
    row = df_permisos[df_permisos['user_name'] == usuario]
        
    if not row.empty:
        adicionales_str = str(row['secciones_adicionales'].values[0])
        adicionales = [int(x.strip()) for x in adicionales_str.replace('"', '').split(',') if x.strip().isdigit()]
        permisos.extend(adicionales)
            
    permisos = sorted(list(set(permisos)))

    return render_template('Dashboard.html', nombre_usuario=usuario, permisos=permisos)

#############################################################################################################################################################
# CERRAR SESION
@app.route('/logout')
def logout():
    session.clear() # Elimina todos los datos al cerrar la sesión 
    return redirect(url_for('index'))

#############################################################################################################################################################
# OBTENER NOMBRES DE LOS CORREDORES PARA EL <SELECT> DEL SIDEBAR
@app.route('/api/grupos')
def obtener_grupos():
    if 'user_key' not in session:
        return jsonify({"error": "No autenticado"}), 401
    
    # Usamos la key guardada en la sesión
    params = {'key': session['user_key']}
    
    try:
        # Replicamos la llamada api_get original
        r = requests.get(f"{API}/basic/groups", params=params, timeout=10)
        data = r.json()
        
        if data.get("errorcode") == 200:
            # Normalizamos la salida para que el JS la lea fácil
            grupos = data.get("data", [])
            out = [{"id": g.get("groupid"), "nombre": g.get("groupname")} for g in grupos]
            return jsonify(out)
        else:
            return jsonify({"error": "Error de la API externa"}), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

""" ##################################################################################################################################################### """
""" ################################################################# SECCION DE INICIO ################################################################# """
# ENDPOINT'S DE LAS GRAFICAS Y TABLAS DE LA SECCION DE INICIO
@app.route('/api/inicio-data')
def get_inicio_data():
    import requests

    group_id = request.args.get('groupid')

    if not group_id:
        return jsonify({ "success": False, "error": "Falta parámetro: groupid"}), 400

    try:
        ruta_back = f"{BCK}/api/inicio-data"
        response = requests.get(ruta_back, params={"groupid": group_id})
        #print(f"\n\nDATOS OBTENIDOS PARA INICIO\n{response.json()}")
        print(f"\n\nDATOS OBTENIDOS PARA INICIO\n{ruta_back}")
        return jsonify(response.json()), response.status_code

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

""" ##################################################################################################################################################### """
""" ################################################################# SECCION DE TOTALES ################################################################ """
# ENDPOINT'S DE LAS GRAFICAS Y TABLAS DE LA SECCION DE TOTALES
@app.route('/api/totales-data')
def get_totales_data():

    group_id = request.args.get('groupid')
    inicio_totales = request.args.get('inicio')
    final_totales = request.args.get('final')

    if not group_id or not inicio_totales or not final_totales:
        return jsonify({"success": False, "error": "Faltan parámetros: groupid, inicio, final"})

    try:
        response = requests.get(f"{BCK}/api/totales-data", params={"groupid": group_id, "inicio": f"{inicio_totales} 00:00:00", "final": f"{final_totales} 23:59:59"})
        #print(f"\n\nDATOS OBTENIDOS PARA TOTALES\n{response.json()}")
        return jsonify(response.json())

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


""" ##################################################################################################################################################### """
""" ################################################################ SECCION DE UNIDADES ################################################################ """
# ENDPOINT PARA LLENAR EL MULTISELECT SEGUN EL GRUPO SELECCIONADO
@app.route('/api/unidades-lista')
def get_unidades_lista():

    group_id = request.args.get('groupid')

    if not group_id:
        return jsonify([])

    try:
        response = requests.get(f"{BCK}/api/unidades-lista", params={"groupid": group_id})
        return jsonify(response.json())

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ENDPOINT'S DE LAS GRAFICAS Y TABLAS DE LA SECCION DE UNIDADES
@app.route('/api/unidades-data')
def get_unidades_data():

    group_id = request.args.get('groupid').split(',')
    raw_terids = request.args.get('terids', '')
    inicio = request.args.get('inicio')
    final = request.args.get('final')

    if not group_id or not inicio or not final:
        return jsonify({"success": False, "error": "Faltan parámetros: groupid, inicio, final"}), 400

    try:
        response = requests.get(f"{BCK}/api/unidades-data", params={"groupid": group_id, "terids": raw_terids, "inicio": f"{inicio} 00:00:00", "final": f"{final} 23:59:59"})
        #print(f"\n\nDATOS OBTENIDOS PARA UNIDADES\n{response.json()}")
        return jsonify(response.json()), response.status_code

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

""" ##################################################################################################################################################### """
""" ################################################################## SECCION DE RUTA ################################################################## """
# ENDPOINT'S DEL MAPA Y TABLA DE LA SECCION DE RUTA
@app.route('/api/ruta-data')
def get_ruta_data():

    group_id = request.args.get('groupid')
    inicio = request.args.get('inicio')
    final = request.args.get('final')

    if not group_id or not inicio or not final:
        return jsonify({"success": False, "error": "Faltan parámetros: groupid, inicio, final"}), 400

    try:
        response = requests.get(f"{BCK}/api/ruta-data", params={"groupid": group_id, "inicio": f"{inicio} 00:00:00", "final": f"{final} 23:59:59"})
        #print(f"\n\nDATOS OBTENIDOS PARA RUTA\n{response.json()}")
        return jsonify(response.json()), response.status_code

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

#############################################################################################################################################################
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
