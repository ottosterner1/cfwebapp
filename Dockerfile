FROM python:3.11-slim

# Install system dependencies required for building Python packages
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Upgrade pip
RUN pip install --upgrade pip

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

EXPOSE 8000

# Command to run Flask
CMD ["flask", "run", "--host=0.0.0.0"]