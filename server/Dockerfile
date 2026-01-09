FROM node:22-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

COPY server/package*.json ./
RUN npm install

COPY server ./

# Generate Prisma client (will be regenerated on startup if schema changed via volume mount)
RUN npx prisma generate

EXPOSE 3001

# Regenerate Prisma client on startup (in case schema changed via volume) then start dev server
CMD npx prisma generate && npm run start:dev
