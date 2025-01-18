# Frontend Dockerfile (./client/Dockerfile)
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY client/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend application
COPY client/ .

# Start dev server
CMD ["npm", "run", "dev", "--", "--host"]

EXPOSE 5173