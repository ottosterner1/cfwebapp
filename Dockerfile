# Build frontend
FROM node:18-alpine as frontend-build

WORKDIR /frontend
COPY client/package*.json ./
RUN npm ci --only=production
COPY client/ .
RUN npm run build

# Use a pre-built Python image with PostgreSQL support
FROM nikolaik/python-nodejs:python3.11-nodejs18-slim

WORKDIR /app

# Copy the backend application
COPY . .

# Copy requirements first and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create static directory and copy frontend
RUN mkdir -p /app/app/static/dist
COPY --from=frontend-build /frontend/dist /app/app/static/dist/

# Add this line to ensure wsgi.py is in the Python path
ENV PYTHONPATH=/app

# Use Railway's dynamic PORT
EXPOSE ${PORT:-8000}

# Modified CMD to use the PORT environment variable
CMD gunicorn --chdir /app wsgi:app --bind 0.0.0.0:${PORT:-8000}