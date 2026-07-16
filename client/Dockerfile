FROM node:22-alpine

# The repo root, not client/ - this is an npm workspace and the install, the
# lockfile and the hoisted node_modules all live at the root.
WORKDIR /app

# Manifests first, so a source-only change does not re-run the install. All
# three workspace manifests are needed: `npm ci` resolves the root lockfile
# against every workspace the root package.json globs, and errors if one is
# missing.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

# Build shared BEFORE the client: the client imports `@blurtz/shared` by name,
# which resolves through node_modules/@blurtz/shared -> ../shared and lands on
# `dist/`. Vite is pointed at the built package, not at shared/src.
COPY shared ./shared
RUN npm run build:shared

COPY client ./client

EXPOSE 3000

# Rebuild shared from the mounted ./shared/src before starting Vite.
CMD npm run build:shared && npm run dev --workspace client
