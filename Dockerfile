# syntax=docker/dockerfile:1

# ── API production image ──────────────────────────────────────────
FROM node:22-alpine AS api-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
# prisma (migrate deploy + generate) production container'da gerekir
RUN npm ci -w apps/api

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=api-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate
EXPOSE 4000
CMD ["sh", "-c", "mkdir -p prisma/data && npx prisma migrate deploy && node src/index.js"]

# ── Web production image ──────────────────────────────────────────
FROM node:22-alpine AS web-build
WORKDIR /app
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web
COPY apps/web ./apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
