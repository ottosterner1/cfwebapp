# Build frontend
FROM node:18-alpine as frontend-build

WORKDIR /frontend

COPY client/ .
RUN npm install
RUN npm run build
# Add verification step
RUN echo "Frontend build contents:" && ls -la dist/

# Build backend and combine
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy the backend application
COPY . .

# Create static/dist directory
RUN mkdir -p /app/app/static/dist

# Copy the built frontend files
COPY --from=frontend-build /frontend/dist /app/app/static/dist/

# Verify the files were copied correctly
RUN echo "Static dist contents:" && ls -la /app/app/static/dist/

# Add this line to ensure wsgi.py is in the Python path
ENV PYTHONPATH=/app

# Use Railway's dynamic PORT
EXPOSE ${PORT:-8000}

# Modified CMD to use the PORT environment variable
CMD gunicorn --chdir /app wsgi:app --bind 0.0.0.0:${PORT:-8000}