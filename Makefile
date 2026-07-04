# Maths Board - common commands.
#
# Frontend tasks run through npm; the full stack runs through Docker Compose.
# `make` or `make help` lists everything below.
#
# Portability note: on Windows `make` runs recipes through cmd.exe, on
# macOS/Linux through /bin/sh, and the two disagree on how `echo` handles
# quotes and blank lines. So the help text below is wrapped in $(Q) (a quote
# on sh, nothing on cmd) and blank lines / the clean command are selected per
# OS here. Every other recipe is a plain external command that runs the same
# on both.
ifeq ($(OS),Windows_NT)
  Q :=
  BLANK := cmd /c echo.
  CLEAN := cmd /c "if exist dist rd /s /q dist"
else
  Q := "
  BLANK := echo ""
  CLEAN := rm -rf dist
endif

# Local end-to-end stack = base compose file + the local overlay (MinIO for S3,
# dev credentials baked in). Kept in one place so every target agrees.
COMPOSE_LOCAL := docker compose -f docker-compose.yml -f docker-compose.local.yml

.DEFAULT_GOAL := help
.PHONY: help install dev typecheck build preview \
        up up-d down reset logs \
        test test-watch e2e-install e2e \
        deploy deploy-down deploy-logs \
        clean

help:
	@echo $(Q)Maths Board - make targets:$(Q)
	@$(BLANK)
	@echo $(Q)  Frontend (npm)$(Q)
	@echo $(Q)    install       Install npm dependencies$(Q)
	@echo $(Q)    dev           Start the Vite dev server$(Q)
	@echo $(Q)    typecheck     Run tsc -b (no emit)$(Q)
	@echo $(Q)    build         Typecheck + production build$(Q)
	@echo $(Q)    preview       Serve the built app$(Q)
	@$(BLANK)
	@echo $(Q)  Local full stack (Docker: web + api + Y-Sweet + MinIO)$(Q)
	@echo $(Q)    up            Build and run the stack in the foreground (http://localhost:8080)$(Q)
	@echo $(Q)    up-d          Same, detached$(Q)
	@echo $(Q)    down          Stop the stack$(Q)
	@echo $(Q)    reset         Stop the stack and wipe its volumes (MinIO data)$(Q)
	@echo $(Q)    logs          Follow the stack logs$(Q)
	@$(BLANK)
	@echo $(Q)  Tests$(Q)
	@echo $(Q)    test          Run the unit test suite (Vitest, headless - no Docker)$(Q)
	@echo $(Q)    test-watch    Run the unit tests in watch mode$(Q)
	@echo $(Q)    e2e-install   Install the Chromium browser (run once)$(Q)
	@echo $(Q)    e2e           Run the Playwright suite (boots the stack if needed)$(Q)
	@$(BLANK)
	@echo $(Q)  Production deploy (Docker, needs .env)$(Q)
	@echo $(Q)    deploy        Pull the published images and run the production stack detached$(Q)
	@echo $(Q)    deploy-down   Stop the production stack$(Q)
	@echo $(Q)    deploy-logs   Follow the production stack logs$(Q)
	@$(BLANK)
	@echo $(Q)  Housekeeping$(Q)
	@echo $(Q)    clean         Remove the build output (dist/)$(Q)

# ---- Frontend (npm) ---------------------------------------------------------

install:
	npm install

dev:
	npm run dev

typecheck:
	npm run typecheck

build:
	npm run build

preview:
	npm run preview

# ---- Local full stack (Docker) ----------------------------------------------

up:
	$(COMPOSE_LOCAL) up --build

up-d:
	$(COMPOSE_LOCAL) up --build -d

down:
	$(COMPOSE_LOCAL) down

reset:
	$(COMPOSE_LOCAL) down -v

logs:
	$(COMPOSE_LOCAL) logs -f

# ---- Tests -------------------------------------------------------------------

test:
	npm test

test-watch:
	npm run test:watch

e2e-install:
	npx playwright install chromium

e2e:
	npm run test:e2e

# ---- Production deploy (Docker, needs .env) ---------------------------------

deploy:
	docker compose pull
	docker compose up -d

deploy-down:
	docker compose down

deploy-logs:
	docker compose logs -f

# ---- Housekeeping -----------------------------------------------------------

clean:
	$(CLEAN)
