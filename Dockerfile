# ---------- Etapa 1: compilar TypeScript ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package.json ./
RUN npm install --no-audit --no-fund
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---------- Etapa 2: imagen de producción ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY frontend ./public
EXPOSE 3000 3443
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "dist/index.js"]
