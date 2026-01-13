# Check if we need to prepend docker commands with sudo
SUDO := $(shell docker version >/dev/null 2>&1 || echo "sudo")

# If LABEL is not provided set default value
LABEL ?= $(shell git rev-parse --short HEAD)$(and $(shell git status -s),-dirty-$(shell id -u -n))
# If TAG is not provided set default value
TAG ?= stellar/laboratory-backend:$(LABEL)
# https://github.com/opencontainers/image-spec/blob/master/annotations.md
BUILD_DATE := $(shell date -u +%FT%TZ)

.PHONY: help docker-build docker-push clean install audit prisma-generate test lint format format-check typecheck check build

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

docker-build: ## Build Docker image
	$(SUDO) docker build --pull --label org.opencontainers.image.created="$(BUILD_DATE)" -t $(TAG) --build-arg GIT_COMMIT=$(LABEL) .

docker-push:
	$(SUDO) docker push $(TAG)

clean: ## Clean build artifacts
	rm -rf dist
	rm -rf generated/prisma

install: ## Install dependencies
	pnpm install

audit: ## Check for security vulnerabilities in dependencies
	pnpm audit

prisma-generate: ## Generate Prisma client
	pnpm prisma db pull
	pnpm prisma:generate

test: ## Run tests
	pnpm test

lint: ## Run linter
	pnpm lint

format: ## Format code
	pnpm format

typecheck: ## Type check the project
	pnpm typecheck

check: format lint typecheck test audit ## Run all checks (format, lint, typecheck, audit, test)

build: ## Build the project
	pnpm build
