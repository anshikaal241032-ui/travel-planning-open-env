"""
TravelAgentEnv — FastAPI server implementing the OpenEnv HTTP interface.

Endpoints:
  POST /reset        → resets the environment, returns initial observation
  POST /step         → executes one action, returns obs/reward/done/info
  GET  /state        → returns current environment state
  GET  /tasks        → lists available tasks
  POST /grade        → grades a completed episode
  GET  /health       → health check
"""

from __future__ import annotations

import os
import uvicorn

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Any, Optional

from travel_env import TravelAgentEnv, TravelAction, TravelObservation, TASKS  # ← CORRECT

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="TravelAgentEnv",
    description=(
        "Real-world AI travel agent environment implementing the OpenEnv spec. "
        "Plan trips, search flights, book hotels, add activities — all within budget."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
_frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.isdir(_frontend_dir):
    app.mount("/ui", StaticFiles(directory=_frontend_dir, html=True), name="static")

@app.get("/")
def serve_frontend():
    index = os.path.join(_frontend_dir, "index.html")
    if os.path.exists(index):
        from fastapi.responses import FileResponse
        return FileResponse(index)
    return {"message": "TravelAgentEnv API — see /docs"}

# Global environment instance (stateful per-session; single-user for HF Space)
_env: Optional[TravelAgentEnv] = None


def get_env() -> TravelAgentEnv:
    global _env
    if _env is None:
        _env = TravelAgentEnv("budget_flight_search")
    return _env


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class ResetRequest(BaseModel):
    task_id: str = Field(
        default="budget_flight_search",
        description="Task to initialise. One of: budget_flight_search | multi_preference_tokyo | complex_london_vip",
    )


class StepRequest(BaseModel):
    action_type: str = Field(
        ...,
        description=(
            "One of: search_flights | book_hotel | add_activity | "
            "set_budget | respond_to_user | finalize_itinerary"
        ),
    )
    flight_id: Optional[str] = None
    hotel_id: Optional[str] = None
    activity_id: Optional[str] = None
    amount: Optional[float] = None
    message: Optional[str] = None
    summary: Optional[str] = None


class GradeRequest(BaseModel):
    task_id: str
    final_state: dict[str, Any]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": "TravelAgentEnv", "version": "0.1.0"}


@app.get("/tasks")
def list_tasks() -> dict[str, Any]:
    return {
        "tasks": [
            {
                "id": tid,
                "difficulty": {"budget_flight_search": "easy", "multi_preference_tokyo": "medium", "complex_london_vip": "hard"}[tid],
                "goal": t["goal"],
                "budget": t["budget"],
                "passengers": t["passengers"],
                "duration_days": t["duration_days"],
                "origin": t["origin"],
                "destination": t["destination"],
            }
            for tid, t in TASKS.items()
        ]
    }


@app.post("/reset")
def reset(request: ResetRequest = None) -> dict[str, Any]:
    global _env
    task_id = "budget_flight_search"
    if request and request.task_id:
        task_id = request.task_id
    if task_id not in TASKS:
        raise HTTPException(status_code=400, detail=f"Unknown task_id '{task_id}'")
    _env = TravelAgentEnv(task_id)
    obs = _env.reset()
    return {"observation": obs, "task_id": task_id}


@app.post("/step")
def step(request: StepRequest) -> dict[str, Any]:
    env = get_env()
    action = request.model_dump(exclude_none=True)
    result = env.step(action)
    return result


@app.get("/state")
def state() -> dict[str, Any]:
    return get_env().state()


@app.post("/grade")
def grade(request: GradeRequest) -> dict[str, Any]:
    score = grade_episode(request.task_id, request.final_state)
    return {"task_id": request.task_id, "score": score}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run("server.app:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
