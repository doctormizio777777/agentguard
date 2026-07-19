from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_render_blueprint_defines_backend_docker_service_and_demo_environment() -> None:
    blueprint = (ROOT / "render.yaml").read_text(encoding="utf-8")

    for expected in (
        "type: web",
        "runtime: docker",
        "plan: free",
        "rootDir: backend",
        "dockerfilePath: ./Dockerfile",
        "dockerContext: .",
        "healthCheckPath: /health",
        "key: ALLOWED_ORIGINS",
        "key: DEMO_MODE",
        'value: "true"',
        "key: DEMO_RESET_KEY",
        "sync: false",
        "key: AUTO_RESEED_MINUTES",
        'value: "60"',
        "key: OPENAI_BASE_URL",
        "key: INTENT_MODEL",
        "value: openai/gpt-5.6-sol",
    ):
        assert expected in blueprint

    assert "plan: starter" not in blueprint
    assert "dockerfilePath: ./backend/Dockerfile" not in blueprint


def test_keepalive_workflow_uses_repository_url_and_strict_health_check() -> None:
    workflow = (ROOT / ".github" / "workflows" / "keepalive.yml").read_text(encoding="utf-8")

    for expected in (
        'cron: "*/10 * * * *"',
        "workflow_dispatch:",
        "vars.RENDER_URL",
        "--max-time 30",
        '"%{http_code}"',
        '"${RENDER_URL%/}/health"',
        'if [[ "$http_code" != "200" ]]',
        "exit 1",
    ):
        assert expected in workflow

    assert "onrender.com" not in workflow


def test_backend_image_builds_from_backend_directory_without_parent_files() -> None:
    dockerfile = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
    entrypoint = (ROOT / "backend" / "docker-entrypoint.sh").read_text(encoding="utf-8")
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "COPY requirements.txt" in dockerfile
    assert "COPY app" in dockerfile
    assert "COPY backend" not in dockerfile
    assert "COPY scripts" not in dockerfile
    assert "python -m app.demo_seed" in entrypoint
    assert "seed_dashboard.py" not in entrypoint
    assert "context: ./backend" in compose


def test_deploy_guide_covers_required_order_settings_and_verification() -> None:
    deploy = (ROOT / "docs" / "DEPLOY.md").read_text(encoding="utf-8")

    for expected in (
        "## 1. Deploy the backend on Render",
        "Root Directory",
        "`backend`",
        "`./Dockerfile`",
        "`dockerContext: .`",
        "`ALLOWED_ORIGINS`",
        "`DEMO_MODE`",
        "`DEMO_RESET_KEY`",
        "`AUTO_RESEED_MINUTES`",
        "## 2. Deploy the frontend on Vercel",
        "`frontend`",
        "`NEXT_PUBLIC_API_URL`",
        "## 3. Close CORS after Vercel assigns the URL",
        "/dashboard/summary",
        '"blocked_count": 1',
        '"agents_online": 3',
        '"valid": true',
        "POST /demo/reset",
        "free tier sleeps after 15 minutes",
        "Settings > Secrets and variables > Actions > Variables",
        "`RENDER_URL`",
        "workflow_dispatch",
    ):
        assert expected in deploy


def test_readme_lists_live_landing_before_console_and_local_option() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    landing = readme.index("**Landing:** https://agentguard-dusky.vercel.app")
    console = readme.index(
        "**Guided attack demo:** https://agentguard-dusky.vercel.app/console?demo=1"
    )
    local = readme.index("**Local run:** `docker compose up --build`")
    assert landing < console < local


def test_backend_example_lists_public_demo_settings_without_a_real_secret() -> None:
    example = (ROOT / "backend" / ".env.example").read_text(encoding="utf-8")

    assert "INTENT_MODEL=openai/gpt-5.6-sol" in example
    assert "ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001" in example
    assert "DEMO_MODE=false" in example
    assert "DEMO_RESET_KEY=replace-with-a-long-random-value" in example
    assert "AUTO_RESEED_MINUTES=" in example
