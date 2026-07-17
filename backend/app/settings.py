from __future__ import annotations

import math
import os


DEFAULT_ALLOWED_ORIGINS = ("http://localhost:3000", "http://localhost:3001")
TRUE_VALUES = {"1", "true", "yes", "on"}


def allowed_origins() -> list[str]:
    configured = os.getenv("ALLOWED_ORIGINS")
    values = DEFAULT_ALLOWED_ORIGINS if configured is None else configured.split(",")
    origins: list[str] = []
    for value in values:
        origin = value.strip()
        if origin and origin not in origins:
            origins.append(origin)
    if not origins:
        raise ValueError("ALLOWED_ORIGINS must include at least one origin")
    return origins


def demo_mode_enabled() -> bool:
    return os.getenv("DEMO_MODE", "").strip().lower() in TRUE_VALUES


def demo_reset_key() -> str | None:
    value = os.getenv("DEMO_RESET_KEY")
    return value if value else None


def auto_reseed_seconds() -> float | None:
    value = os.getenv("AUTO_RESEED_MINUTES")
    if value is None or not value.strip():
        return None
    try:
        minutes = float(value)
    except ValueError as error:
        raise ValueError("AUTO_RESEED_MINUTES must be a positive number") from error
    if not math.isfinite(minutes) or minutes <= 0:
        raise ValueError("AUTO_RESEED_MINUTES must be a positive number")
    return minutes * 60
