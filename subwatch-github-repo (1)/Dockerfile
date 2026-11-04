# ---- build stage: compile the API and bundle the SPA -------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
RUN npm ci --no-audit --no-fund && npm --prefix client ci --no-audit --no-fund

COPY tsconfig.json tsconfig.server.json ./
COPY server ./server
COPY client ./client
COPY db ./db
RUN npm run build:server && npm --prefix client run build

# ---- runtime stage: production dependencies only ----------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/db ./db

# SQLite needs a writable directory; run as the unprivileged node user.
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# JWT_SECRET must be supplied at run time (the process refuses to start without it).
CMD ["node", "dist-server/index.js"]
