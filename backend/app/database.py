from pathlib import Path
import sqlite3


DATABASE_PATH = Path(__file__).resolve().parents[1] / "agent_payment_guardrail.db"


def get_connection() -> sqlite3.Connection:
    """Open the scaffold database, creating the empty SQLite file if needed."""
    return sqlite3.connect(DATABASE_PATH)

