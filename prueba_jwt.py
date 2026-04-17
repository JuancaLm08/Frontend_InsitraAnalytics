import jwt
import datetime

token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoxMSwibm9tYnJlIjoiU2VyZ2lvIERlbCBBbmdlbCIsImVtYWlsIjoic2RlbGFuZ2VsQGluc2l0cmEuY29tLm14IiwiaWRFbXByZXNhIjoxLCJub21icmVFbXByZXNhIjoiSU5TSVRSQSIsImlhdCI6MTc3NjEyMzUwOCwiZXhwIjoxNzc2MTM0MzA4fQ.ooRssCMdPeZ5KEoiVnJ3PAVYCwL7s_wK_QkXKRlVHhM"

JWT_SECRET = 'r13d8M*jWUb4'
AUTH_EXPIRES = '3h'

def token_verify(token):
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return data
        
    except jwt.ExpiredSignatureError:
        return {"error": "El token ha expirado"}
    except jwt.InvalidTokenError:
        return {"error": "Token inválido o firma incorrecta"}

def parse_jwt(token):
    try:
        data = jwt.decode(token, options={"verify_signature": False})
        return data
        
    except jwt.DecodeError:
        return {"error": "El token no tiene un formato Base64 válido"}

usuario = parse_jwt(token)
#print(usuario)

usuario_validado = token_verify(token)
print(usuario_validado)