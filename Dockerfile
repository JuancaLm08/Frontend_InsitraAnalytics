# Usa una imagen oficial y ligera de Python
FROM python:3.10-slim

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia primero el archivo de requerimientos para optimizar la caché de Docker
COPY requirements.txt .

# Instala las dependencias
RUN pip install --no-cache-dir -r requirements.txt

# Copia el resto de los archivos del proyecto (incluyendo estáticos, templates, etc.)
COPY . .

# Expone el puerto 5000 para que coincida con Flask
EXPOSE 5000

# Comando para levantar el servidor
CMD ["python", "main.py"]