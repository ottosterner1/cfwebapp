# Build stage
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

# Copy the build files to the Flask static directory
FROM scratch as static
COPY --from=build /app/dist /static/dist