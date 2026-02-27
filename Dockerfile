
# Use a lightweight Node.js base image
FROM node:20-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package manifests and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Expose app port
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]
