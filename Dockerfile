# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV BACKEND_PORT=3001
EXPOSE 8080

# Run backend on 3001 and frontend preview on $PORT
CMD ["sh", "-c", "node backend/server.js & npm run preview -- --host 0.0.0.0 --port $PORT"]
