# ── Stage 1: Build ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install

# Accept build-time env vars for Vite (injected at cloud build time)
ARG VITE_MAPS_API_KEY
ARG VITE_BACKEND_URL
ENV VITE_MAPS_API_KEY=$VITE_MAPS_API_KEY
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

COPY . .
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────
FROM nginx:1.25-alpine AS runner

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Cloud Run uses port 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
