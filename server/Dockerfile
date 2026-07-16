FROM node:22-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# The repo root, not server/ - this is an npm workspace and the install, the
# lockfile and the hoisted node_modules all live at the root.
WORKDIR /app

# Manifests first, so a source-only change does not re-run the install.
# All three workspace manifests are needed: `npm ci` resolves the root
# lockfile against every workspace the root package.json globs, and errors if
# one is missing.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

# Build shared BEFORE the server: the server imports `@blurtz/shared` by name,
# which resolves through node_modules/@blurtz/shared -> ../shared and lands on
# `dist/`. `nest build` will not compile sources outside server/src, so if
# dist/ is missing the server has nothing to import.
COPY shared ./shared
RUN npm run build:shared

COPY server ./server

# Generate the Prisma client. This MUST come after the last `npm ci`: the
# generator has no `output` in schema.prisma, so it emits into
# node_modules/@prisma/client (hoisted to /app/node_modules here), and any
# later install wipes it.
WORKDIR /app/server
RUN npx prisma generate
WORKDIR /app

EXPOSE 3001

# Rebuild shared from the mounted ./shared/src, regenerate the Prisma client in
# case the mounted schema changed, then start the dev server.
CMD npm run build:shared && cd server && npx prisma generate && npm run start:dev
