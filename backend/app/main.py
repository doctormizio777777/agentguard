from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.cors import CORSMiddleware

from .database import get_connection


app = FastAPI(title="Agent Payment Guardrail")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
def initialize_database() -> None:
    with get_connection():
        pass


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
