"""
auth_insitra.py — Validación del token contra el endpoint /auth de la matriz.

Primer nivel de integración: la matriz decide si el token es válido (endpoint
/auth). Localmente ya NO verificamos la firma, así que este módulo no necesita
el JWT_SECRET. Solo leemos los claims DESPUÉS de que /auth dijo "válido".

Dependencia: PyJWT (solo para decodificar y leer claims).

.env necesario:
    URL_AUTH=https://api-auth.insitra.com.mx/api-auth/auth
"""

import os
import time

import requests
import jwt  # PyJWT: aquí solo LEE los claims, ya no verifica firma

URL_AUTH = os.environ["URL_AUTH"]

# Cache de validez: tras un "válido" de /auth, damos el token por bueno durante
# CACHE_SEG segundos sin volver a preguntar. Evita golpear /auth varias veces
# por una sola acción del usuario. Es por-worker (cada proceso tiene el suyo).
# Trade-off: si la matriz revoca un token, tardamos hasta CACHE_SEG en notarlo.
CACHE_SEG = 60
_cache: dict[str, float] = {}


class TokenInvalido(Exception):
    """Token ausente, o rechazado por la matriz."""


def _validar_remoto(token: str) -> bool:
    ahora = time.time()

    # ¿Sigue vigente la "pulsera" de este token?
    if _cache.get(token, 0) > ahora:
        return True

    try:
        r = requests.get(
            URL_AUTH,
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
    except requests.RequestException:
        # /auth no responde -> fail-closed (no dejamos pasar).
        raise TokenInvalido("No se pudo validar el token (auth no disponible).")

    if r.status_code == 200:
        _cache[token] = ahora + CACHE_SEG   # ponemos la pulsera
        return True
    return False


def verificar_token(token: str) -> dict:
    """Valida el token contra /auth y devuelve los claims si es válido."""
    if not token:
        raise TokenInvalido("No se recibió token.")

    if not _validar_remoto(token):
        raise TokenInvalido("Token rechazado.")

    # Ya validado: decodificamos solo para leer los claims (sin verificar firma).
    claims = jwt.decode(token, options={"verify_signature": False})
    return {
        "user_id": claims["user"],
        "nombre": claims.get("nombre"),
        "email": claims.get("email"),
        "id_empresa": claims.get("idEmpresa"),
        "nombre_empresa": claims.get("nombreEmpresa"),
        "rol": claims.get("rol", []),
        "iat": claims.get("iat"),
        "exp": claims.get("exp"),
    }