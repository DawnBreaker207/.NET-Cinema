.PHONY: help run build test migrate migrate-up migrate-add docker-up docker-down clean format lint swag

help: ## Liet ke cac lenh co san
	@echo "Lenh co san trong DotNet-Cinema:"
	@echo "  make run          - Chay backend .NET tai port 5000"
	@echo "  make build        - Build solution Cinema.sln"
	@echo "  make format       - Format code C# theo chuan .editorconfig"
	@echo "  make lint         - Kiem tra code style (verify no changes)"
	@echo "  make swag         - Xuat file docs/swagger.json tu backend"
	@echo "  make migrate-add  - Tao migration moi (dung: make migrate-add name=TenMigration)"
	@echo "  make migrate-up   - Apply migrations vao Database"
	@echo "  make docker-up    - Khoi dong toan bo he thong qua Docker Compose"
	@echo "  make docker-down  - Dung he thong Docker"
	@echo "  make clean        - Don dep bin/ obj/ va temp"

run: ## Chay backend .NET
	dotnet run --project backend --urls http://localhost:5000

build: ## Build solution
	dotnet build Cinema.sln

format: ## Format code C#
	dotnet format Cinema.sln

lint: ## Kiem tra code style
	dotnet format Cinema.sln --verify-no-changes

swag: ## Xuat docs/swagger.json
	python scripts/export_swagger.py

migrate-add: ## Tao migration: make migrate-add name=MyMigration
	dotnet ef migrations add $(name) --project backend --startup-project backend

migrate-up: ## Apply migrations vao DB
	dotnet ef database update --project backend --startup-project backend

docker-up: ## Chay full-stack Docker
	docker compose up -d --build

docker-down: ## Dung Docker
	docker compose down

clean: ## Xoa bin, obj
	dotnet clean Cinema.sln
