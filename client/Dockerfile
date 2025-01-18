FROM node:18-alpine as build

WORKDIR /app

# Copy the entire client directory structure while preserving paths
COPY client/ ./

# Install dependencies
RUN npm install

# Build for production - will output to /app/dist
RUN npm run build

# Use the Python backend image as the final stage
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install them
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy the backend application
COPY . .

# Create the static/dist directory
RUN mkdir -p /app/app/static/dist

# Copy the built frontend files to the correct location
COPY --from=build /app/dist/* /app/app/static/dist/

CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:8000"]