"""

* En este script se realizan TODOS los calculos individuales para cada una de las secciones de ANALITYCS.
* No existe una conexion con el backend, solo el procesamiento de los datos en bruto obtenidos por medio 
  de la API para regresar un DataFrame a los endpoints de "main.py".
* Los calculos estan divididos segun la seccion del dashboard que se va a mostrar despues de que el 
  usuario haya seleccionado corredor y llenado los datos de fecha (si es el caso).

"""

# Importar las librerias
import os
import requests
from dotenv import load_dotenv

#############################################################################################################################################################
# CONFIGURACIÓN INICIAL
load_dotenv('.env')
API = os.getenv('CEIBA_BASE_URL')

#############################################################################################################################################################
# FUNCIÓN PARA VALIDAR AL USUARIO POR MEDIO DE LA API
def validarUsuario(usuario, clave):
    try:
        resp = requests.get(f"{API}/basic/key", params={"username": usuario, "password": clave}, timeout=10)
        data = resp.json()
        err = data.get("errorcode")
        
        if err == 200:
            key = data.get("data", {}).get("key")
            return True, key, None
        elif err == 206:
            return False, None, "Credenciales incorrectas."
        else:
            return False, None, f"Error: {err}"
    except Exception as e:
        return False, None, "Error de conexión con el servidor."
