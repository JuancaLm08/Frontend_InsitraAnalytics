import jwt
import datetime

token1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoxMSwibm9tYnJlIjoiU2VyZ2lvIERlbCBBbmdlbCIsImVtYWlsIjoic2RlbGFuZ2VsQGluc2l0cmEuY29tLm14IiwiaWRFbXByZXNhIjoxLCJub21icmVFbXByZXNhIjoiSU5TSVRSQSIsImlhdCI6MTc3NjEyMzUwOCwiZXhwIjoxNzc2MTM0MzA4fQ.ooRssCMdPeZ5KEoiVnJ3PAVYCwL7s_wK_QkXKRlVHhM"
token2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoxMSwibm9tYnJlIjoiU2VyZ2lvIERlbCBBbmdlbCIsImVtYWlsIjoic2RlbGFuZ2VsQGluc2l0cmEuY29tLm14IiwiaWRFbXByZXNhIjoxLCJub21icmVFbXByZXNhIjoiSU5TSVRSQSIsImlhdCI6MTc3Njg4NTk3NSwiZXhwIjoxNzc2ODk2Nzc1fQ.VkU7H-k7UAI615TtL3ftctcSv7zlAr55xUVugRcp50A"
token3 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoxOSwibm9tYnJlIjoiVXN1YXJpbyBDT1BFU0EiLCJlbWFpbCI6ImNvcGVzYUBpbnNpdHJhLmNvbS5teCIsImlkRW1wcmVzYSI6NSwibm9tYnJlRW1wcmVzYSI6IkNPUEVTQSIsImlhdCI6MTc3Njg5NzAyOCwiZXhwIjoxNzc2OTA3ODI4fQ.5ztyFmsaKNmnN878FdbRDgFm6Axs2GA9A5nA_P5Ruf0"
token4 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoyMiwibm9tYnJlIjoiVXN1YXJpbyBTSVRSQVEiLCJlbWFpbCI6InNpdHJhcUBpbnNpdHJhLmNvbS5teCIsImlkRW1wcmVzYSI6Nywibm9tYnJlRW1wcmVzYSI6IlNJVFJBUSIsImlhdCI6MTc3Njg5ODA4OSwiZXhwIjoxNzc2OTA4ODg5fQ.xXruVr6iXDcvRotLKX-9KJZo9lIUuqW_Ju899_-yd0o"
token5 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoyNCwibm9tYnJlIjoiVXN1YXJpbyBaT1hPIiwiZW1haWwiOiJ6b3hvQGluc2l0cmEuY29tLm14IiwiaWRFbXByZXNhIjo5LCJub21icmVFbXByZXNhIjoiWk9YTyIsImlhdCI6MTc3Njg5ODExMSwiZXhwIjoxNzc2OTA4OTExfQ.F5Gb8VVPXQ9n1dUprxw_G4HnMv75FVD2JxauzxjxAzM"
token6 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoxOCwibm9tYnJlIjoiVXN1YXJpbyBDT0RJVkVSU0EiLCJlbWFpbCI6ImNvZGl2ZXJzYUBpbnNpdHJhLmNvbS5teCIsImlkRW1wcmVzYSI6NCwibm9tYnJlRW1wcmVzYSI6IkNPRElWRVJTQSIsImlhdCI6MTc3Njg5ODEzNiwiZXhwIjoxNzc2OTA4OTM2fQ.4FW2cvPP9rrnD8jU5R6KmRHyZZFz5LuKpqofjlM_TG0"



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

usuario = parse_jwt(token1)
#print(usuario)

usuario_validado = token_verify(token1)
print(usuario_validado)