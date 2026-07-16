.PHONY: help up down build rebuild logs logs-server logs-client logs-db logs-redis \
        connect-server connect-client connect-db connect-redis \
        migrate migrate-create migrate-reset migrate-status prisma-generate prisma-studio \
        clean shell-server shell-client install build-shared test test-server test-shared \
        test-watch lint

# Default target
help:
	@echo "Blurtz Development Commands"
	@echo ""
	@echo "Docker Compose:"
	@echo "  make up              - Start all services"
	@echo "  make down            - Stop all services"
	@echo "  make build           - Build all services"
	@echo "  make rebuild         - Rebuild and restart all services"
	@echo "  make clean           - Stop services and remove volumes"
	@echo ""
	@echo "Logs:"
	@echo "  make logs            - Tail logs from all services"
	@echo "  make logs-server     - Tail server logs"
	@echo "  make logs-client     - Tail client logs"
	@echo "  make logs-db         - Tail database logs"
	@echo "  make logs-redis      - Tail redis logs"
	@echo ""
	@echo "Connect to Services:"
	@echo "  make connect-server  - Shell into server container"
	@echo "  make connect-client  - Shell into client container"
	@echo "  make connect-db      - Connect to PostgreSQL database"
	@echo "  make connect-redis   - Connect to Redis CLI"
	@echo "  make shell-server    - Alias for connect-server"
	@echo "  make shell-client    - Alias for connect-client"
	@echo ""
	@echo "Database Migrations:"
	@echo "  make migrate              - Run pending migrations"
	@echo "  make migrate-create NAME=x - Create new migration with name"
	@echo "  make migrate-reset        - Reset database (WARNING: destroys data)"
	@echo "  make migrate-status       - Show migration status"
	@echo "  make prisma-generate      - Regenerate Prisma client"
	@echo "  make prisma-studio        - Open Prisma Studio"
	@echo ""
	@echo "Workspace:"
	@echo "  make install         - Install every workspace from the root lockfile"
	@echo "  make build-shared    - Build @blurtz/shared (client + server import its dist/)"
	@echo "  make test            - Run all three suites (shared, server, client)"
	@echo "  make test-shared     - Run the rules engine suite only"
	@echo "  make test-server     - Run the server suite only"
	@echo "  make lint            - Lint every workspace"

# =============================================================================
# Docker Compose Commands
# =============================================================================

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

rebuild:
	docker compose down
	docker compose build --no-cache
	docker compose up -d

clean:
	docker compose down -v

# =============================================================================
# Logs
# =============================================================================

logs:
	docker compose logs -f

logs-server:
	docker compose logs -f server

logs-client:
	docker compose logs -f client

logs-db:
	docker compose logs -f db

logs-redis:
	docker compose logs -f redis

# =============================================================================
# Connect to Services
# =============================================================================

connect-server:
	docker compose exec server sh

connect-client:
	docker compose exec client sh

connect-db:
	docker compose exec db psql -U blurtz -d blurtz

connect-redis:
	docker compose exec redis redis-cli

# Aliases
shell-server: connect-server
shell-client: connect-client

# =============================================================================
# Database Migrations (run inside server container)
# =============================================================================
#
# `-w /app/server` on every one of these: the container's WORKDIR is the
# workspace root now, and prisma.config.ts - which is where DATABASE_URL and
# the schema path come from - lives in the server package, not at the root.

migrate:
	docker compose exec -w /app/server server npx prisma migrate deploy

migrate-create:
ifndef NAME
	$(error NAME is required. Usage: make migrate-create NAME=migration_name)
endif
	docker compose exec -w /app/server server npx prisma migrate dev --name $(NAME)

migrate-reset:
	@echo "WARNING: This will destroy all data in the database!"
	@read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
	docker compose exec -w /app/server server npx prisma migrate reset --force

migrate-status:
	docker compose exec -w /app/server server npx prisma migrate status

prisma-generate:
	docker compose exec -w /app/server server npx prisma generate

prisma-studio:
	cd server && npx prisma studio

# =============================================================================
# Development Helpers
# =============================================================================

# Install dependencies for every workspace (shared, client, server) from the
# single root lockfile. There is one install now, not two.
install:
	npm install

# Build the shared package. Both the client and the server import it as
# @blurtz/shared and resolve to its dist/, so it has to exist before either
# will type-check or run.
build-shared:
	npm run build:shared

# Run tests. `npm test` builds shared first (root pretest) and then runs all
# three suites: shared (the rules engine), server, client.
test:
	npm test

test-server:
	npm run build:shared
	cd server && npm test

test-shared:
	cd shared && npm test

test-watch:
	cd server && npm run test:watch

# Lint every workspace that has a lint script
lint:
	npm run lint
