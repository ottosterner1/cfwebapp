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

# Create directory for static files
RUN mkdir -p app/static/dist

# Add this line to ensure wsgi.py is in the Python path
ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["gunicorn", "--chdir", "/app", "wsgi:app", "--bind", "0.0.0.0:8000"]