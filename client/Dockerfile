FROM node:18-alpine

WORKDIR /app

# Copy the entire client directory
COPY . .

# Install dependencies
RUN npm install

# Build for production
RUN npm run build