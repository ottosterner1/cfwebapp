FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend application
COPY . .

# Build for production
RUN npm run build

# Use the Python backend image as the final stage
FROM python:3.11-slim

# Copy only the built files to the correct location
COPY --from=build /app/dist /app/static/dist

CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:8000"]