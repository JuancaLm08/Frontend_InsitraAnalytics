"""

Archivo: utilidades.py
Descripción: Este archivo contiene funciones de utilidad para la aplicación, como la validación de usuarios

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
