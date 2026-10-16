# ---------- deps stage ----------
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# node_modules must live in the image (test runs at runtime).
RUN npm ci

# ---------- test stage (CI) ----------
FROM deps AS test

COPY . .

CMD ["sh", "-c", "npx tsc --noEmit -p tsconfig.app.json && npm run lint && npm test"]

# ---------- build stage ----------
FROM deps AS builder

COPY . .

# Bake API base tai build time (compose truyen /api/v1 de di same-origin qua nginx).
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# TMDB read-only token (FE goi thang TMDB). Rong = an vung TMDB, khong vo form.
ARG VITE_TMDB_READ_TOKEN
ENV VITE_TMDB_READ_TOKEN=$VITE_TMDB_READ_TOKEN

RUN npm run build

# ---------- runtime stage ----------
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
