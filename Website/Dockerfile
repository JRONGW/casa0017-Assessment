# Use a stable LTS Node
FROM node:20-bookworm

# Create app dir and set working directory to your Website folder
WORKDIR /app

# Install system sqlite (handy for CLI/debug; not strictly required)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Copy only package manifests first (better layer caching)
COPY package*.json ./

# Install deps (no dev deps in production image)
RUN npm ci --omit=dev

# Now copy the rest of the Website/ code
COPY . .

# Env: tell the app the port Fly will map
ENV NODE_ENV=production
ENV PORT=3000

# Fly’s TCP health checks hit this port
EXPOSE 3000

# Start the server
CMD ["node", "server/routes/app.js"]
