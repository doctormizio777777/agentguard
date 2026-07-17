from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_compose_defines_backend_and_frontend_ports() -> None:
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert "backend:" in compose
    assert "frontend:" in compose
    assert '"8000:8000"' in compose
    assert '"3000:3000"' in compose


def test_backend_entrypoint_initializes_and_seeds_only_empty_database() -> None:
    entrypoint = (ROOT / "backend" / "docker-entrypoint.sh").read_text(encoding="utf-8")
    assert "initialize_database" in entrypoint
    assert "ledger_entries" in entrypoint
    assert "seed_dashboard.py" in entrypoint
    assert "uvicorn app.main:app" in entrypoint
    seed = (ROOT / "scripts" / "seed_dashboard.py").read_text(encoding="utf-8")
    assert "refusing to reseed" in seed


def test_dockerfiles_are_present() -> None:
    assert (ROOT / "backend" / "Dockerfile").is_file()
    assert (ROOT / "frontend" / "Dockerfile").is_file()
    assert (ROOT / ".dockerignore").is_file()
    assert (ROOT / "backend" / ".dockerignore").is_file()
    assert (ROOT / "frontend" / ".dockerignore").is_file()


def test_frontend_runtime_has_pnpm_available_for_start_command() -> None:
    dockerfile = (ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")
    assert dockerfile.count("RUN corepack enable") == 2


def test_readme_uses_real_phase5_verdict_reasoning() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert (
        '"reasoning": "The proposed 5,000 EUR payment exceeds the 2,000 EUR daily budget and targets '
        'an unknown vendor rather than an approved API-credit vendor."'
    ) in readme
