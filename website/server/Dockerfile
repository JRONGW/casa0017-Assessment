FROM node:22-slim

WORKDIR /website

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Expose backend port
EXPOSE 3000

# Start the application
CMD ["node", "server/routes/app.js"]