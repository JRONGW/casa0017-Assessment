FROM node:20-bookworm
WORKDIR /app/Website

# install sqlite CLI (optional)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# install deps
COPY Website/package*.json ./
RUN npm ci --omit=dev

# copy source
COPY Website/. .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/routes/app.js"]
