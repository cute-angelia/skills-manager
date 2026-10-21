.PHONY: run dev build tauri-build test lint help

# Default target
run:
	npm run tauri:dev

dev:
	npm run dev

build:
	npm run build

tauri-build:
	npm run tauri:build

lint:
	npm run lint

help:
	@echo "Available commands:"
	@echo "  make run         - Run desktop app in development mode (npm run tauri:dev)"
	@echo "  make dev         - Run Vite frontend dev server (npm run dev)"
	@echo "  make build       - Build frontend bundle (npm run build)"
	@echo "  make tauri-build - Build desktop release application (npm run tauri:build)"
	@echo "  make lint        - Run linters and checks (npm run lint)"
