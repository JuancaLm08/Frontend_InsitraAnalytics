"""
permisos.py — Resuelve qué secciones del Dashboard puede ver el usuario,
usando el catálogo rol->permisos de la matriz (endpoint app-rol-permiso/{idApp}).

Reemplaza la lógica del Permisos_temporal.csv.
"""

import os
import requests

URL_PERMISOS = os.getenv("URL_PERMISOS")      
ID_APP = os.getenv("ID_APP", "3")             

# permisoCodigo (normalizado) -> número de sección del Dashboard.
# AJUSTA estos números para que coincidan con la numeración que usa Dashboard.html.
PERMISO_A_SECCION = {
    "VER_INICIO":   1,
    "VER_TOTALES":  2,
    "VER_UNIDADES": 3,
    "VER_RUTA":     4,
    "VER_HORARIO":  5,
}


def _norm(codigo: str) -> str:
    """Normaliza el código: arregla inconsistencias como 'VER _TOTALES'."""
    return codigo.replace(" ", "").upper()


def _catalogo(token: str, id_app: str) -> dict:
    """
    Devuelve {rolNombre: set(permisoCodigo_normalizado)} para la app.
    El catálogo es igual para todos los usuarios de la app; podrías cachearlo
    más adelante para no pedirlo en cada carga.
    """
    r = requests.get(
        f"{URL_PERMISOS}/{id_app}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    r.raise_for_status()

    catalogo = {}
    for app in r.json():
        for rol in app.get("roles", []):
            catalogo[rol["rolNombre"]] = {
                _norm(p["permisoCodigo"]) for p in rol.get("permisos", [])
            }
    return catalogo


def secciones_permitidas(token: str, roles_usuario: list[str], id_app: str | None = None) -> list[int]:
    """
    Une los permisos de todos los roles que tiene el usuario y los traduce a
    los números de sección del Dashboard.
    """
    catalogo = _catalogo(token, id_app or ID_APP)

    codigos = set()
    for nombre_rol in roles_usuario:
        codigos |= catalogo.get(nombre_rol, set())

    secciones = {PERMISO_A_SECCION[c] for c in codigos if c in PERMISO_A_SECCION}
    return sorted(secciones)