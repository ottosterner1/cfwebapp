# Build frontend
FROM node:18-alpine as frontend-build
WORKDIR /frontend
COPY client/ .
RUN npm ci --only=production
RUN npm run build

# Use minimal Python image
FROM python:3.11-slim

WORKDIR /app

# Do NOT install system packages - work around them
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_BINARY=psycopg2

# Copy requirements and install with workarounds
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt || pip install --no-cache-dir -r requirements.txt --no-binary :all:

# Copy application and frontend build
COPY . .
RUN mkdir -p /app/app/static/dist
COPY --from=frontend-build /frontend/dist /app/app/static/dist/

ENV PYTHONPATH=/app
EXPOSE ${PORT:-8000}
CMD gunicorn --chdir /app wsgi:app --bind 0.0.0.0:${PORT:-8000}