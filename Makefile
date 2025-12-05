.PHONY: help install build test test-watch lint lint-fix format typecheck clean docker-build docker-run docker-up docker-down docker-logs docker-stop prisma-generate migrate

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

clean: ## Clean build artifacts
	rm -rf dist
	rm -rf generated/prisma

install: ## Install dependencies
	pnpm install

prisma-generate: ## Generate Prisma client
	pnpm prisma:generate

test: ## Run tests
	pnpm test

test-watch: ## Run tests in watch mode
	pnpm test:watch

lint: ## Run linter
	pnpm lint

lint-fix: ## Fix linting issues
	pnpm lint:fix

build: ## Build the project
	pnpm build

format: ## Format code
	pnpm format

typecheck: ## Type check the project
	pnpm typecheck

migrate: ## Run database migrations
	pnpm migrate

docker-build: ## Build Docker image
	docker build -t stellar-lab-api:latest .

docker-run: ## Run Docker container (requires .env file and creds.json) - uses docker-compose
	docker-compose up

docker-up: ## Start services with docker-compose
	docker-compose up -d

docker-down: ## Stop services with docker-compose
	docker-compose down

docker-logs: ## View docker-compose logs
	docker-compose logs -f

docker-stop: ## Stop docker-compose services
	docker-compose stop

docker-build-up: docker-build docker-up ## Build and start with docker-compose
