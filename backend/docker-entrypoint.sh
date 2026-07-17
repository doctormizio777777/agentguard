#!/bin/sh
set -eu

seed_state="$(python -c 'from app.database import get_connection, initialize_database; connection = get_connection(); initialize_database(connection); print(connection.execute("SELECT COUNT(*) FROM ledger_entries").fetchone()[0])')"
if [ "$seed_state" = "0" ]; then
  python -m app.demo_seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
