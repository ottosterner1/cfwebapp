# Build frontend
FROM node:18-alpine as frontend-build
WORKDIR /frontend
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# Build backend
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create directory structure
RUN mkdir -p /app/app/static

# Copy built frontend files
COPY --from=frontend-build /frontend/dist /app/app/static/dist

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Set environment variables
ENV PYTHONPATH=/app \
    FLASK_ENV=production \
    STATIC_FOLDER=/app/app/static

# Expose port
EXPOSE ${PORT:-8000}

# Start application
CMD gunicorn --chdir /app wsgi:app --bind 0.0.0.0:${PORT:-8000}