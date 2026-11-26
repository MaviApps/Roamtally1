FROM node:22-slim

WORKDIR /app

# Install dependencies first for better Docker layer caching
COPY package*.json ./
RUN npm ci

# Copy application source and build production Vite bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.ts"]
