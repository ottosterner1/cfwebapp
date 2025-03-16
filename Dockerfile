# Build frontend with memory optimizations
FROM node:18-alpine as frontend-build

WORKDIR /frontend

COPY client/package*.json ./
# Install dependencies first (separate step for better caching)
RUN npm ci --only=production
# Copy remaining files and build
COPY client/ .
RUN NODE_OPTIONS="--max-old-space-size=512" npm run build
RUN echo "Frontend build contents:" && ls -la dist/

# Build backend and combine with memory optimizations 
FROM python:3.11-slim

# Install system dependencies with memory optimization flags
RUN apt-get update -y --no-install-recommends && \
    apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    python3-dev \
    libpq-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first
COPY requirements.txt .
# Install Python dependencies with memory optimizations
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

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