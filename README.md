---
title: Travel Agent Env
emoji: ✈️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# ✈️ TravelAgentEnv
...rest of your README...


# ✈️ TravelAgentEnv

> A real-world OpenEnv environment for training and evaluating AI travel planning agents.

[![OpenEnv](https://img.shields.io/badge/OpenEnv-compatible-blue)](https://github.com/openenv)
[![HuggingFace Space](https://img.shields.io/badge/🤗-HF%20Space-yellow)](https://huggingface.co/spaces)

---

## Environment Description

**TravelAgentEnv** simulates a real-world AI travel agent that must plan complete trips for users. The agent interacts with a simulated travel booking system — searching flights, selecting hotels, adding activities, communicating with users, and finalizing itineraries — all while respecting budget constraints and user preferences.

This environment is ideal for training and evaluating agents on:
- Multi-step sequential decision making
- Budget optimization under constraints
- Preference satisfaction with partial information
- Natural language user communication

---

## 🎯 Tasks

| Task | Difficulty | Route | Budget | Passengers |
|------|-----------|-------|--------|-----------|
| `budget_flight_search` | Easy | Mumbai → Paris | $2,000 | 1 |
| `multi_preference_tokyo` | Medium | Delhi → Tokyo | $3,500 | 4 |
| `complex_london_vip` | Hard | Bangalore → London | $3,000 | 1 |

### Task 1: `budget_flight_search` (Easy)
Solo traveler, 7 days, $2,000. Find cheapest flight, book 3★–4★ hotel, add 2+ activities, finalize.

### Task 2: `multi_preference_tokyo` (Medium)
Family of 4, 5 days, $3,500. Direct flight if available, breakfast hotel, 3+ activities (1 entertainment), communicate requirements.

### Task 3: `complex_london_vip` (Hard)
VIP corporate, 3 days, $3,000. **Only 5★+spa** hotels, non-stop preferred, 3+ mixed activities, day-by-day schedule.

---

## 🔧 Action Space

| Action | Required Parameters |
|--------|-------------------|
| `search_flights` | `flight_id` (optional — omit to just browse) |
| `book_hotel` | `hotel_id` |
| `add_activity` | `activity_id` |
| `set_budget` | `amount` |
| `respond_to_user` | `message` |
| `finalize_itinerary` | `summary` |

---

## 👁️ Observation Space

Each step returns a `TravelObservation` with:

```json
{
  "task_id": "budget_flight_search",
  "step": 3,
  "goal": "Plan a 7-day solo trip...",
  "budget_total": 2000.0,
  "budget_remaining": 1270.0,
  "origin": "Mumbai",
  "destination": "Paris",
  "duration_days": 7,
  "passengers": 1,
  "requirements": {"min_hotel_stars": 3, "breakfast_required": false, ...},
  "available_flights": [...],
  "available_hotels": [...],
  "available_activities": [...],
  "selected_flight": {"id": "F002", "price": 580, ...},
  "selected_hotel": null,
  "selected_activities": [],
  "messages_sent": [],
  "itinerary_finalized": false,
  "last_action_result": "Flight F002 selected. Cost: $580. Remaining: $1420"
}
```

---

## 🏆 Reward Function

Rewards are **dense** — given at each step for partial progress.

| Signal | Reward |
|--------|--------|
| Flight searched | +0.05 |
| Flight selected | +0.10 |
| Direct flight (when preferred) | +0.05 |
| Hotel booked | +0.10 |
| Star requirement met | +0.05 |
| Breakfast included (when required) | +0.05 |
| Spa included (when required) | +0.05 |
| Activity added | +0.08 each |
| Required category covered | +0.03 |
| User message sent | +0.05 |
| Final episode score | up to +0.50 |
| Over budget (>5%) | penalty |

---

## 📊 Baseline Scores

| Task | Difficulty | Score |
|------|-----------|-------|
| `budget_flight_search` | Easy | ~0.72 |
| `multi_preference_tokyo` | Medium | ~0.64 |
| `complex_london_vip` | Hard | ~0.51 |

---

## 🚀 Setup & Usage

### Prerequisites

```bash
pip install openenv-core fastapi uvicorn pydantic openai requests
```

### Run locally

```bash
# Start the server
python -m uvicorn server.app:app --host 0.0.0.0 --port 7860

# In another terminal — run baseline
export HF_TOKEN="your-token"
export MODEL_NAME="meta-llama/Llama-3.3-70B-Instruct"
export API_BASE_URL="https://router.huggingface.co/v1"
python inference.py
```

### Docker

```bash
docker build -t travel-agent-env .
docker run -p 7860:7860 \
  -e HF_TOKEN=$HF_TOKEN \
  -e MODEL_NAME=$MODEL_NAME \
  travel-agent-env
```

### API Endpoints

```bash
# Health check
curl http://localhost:7860/health

# List tasks
curl http://localhost:7860/tasks

# Reset environment
curl -X POST http://localhost:7860/reset \
  -H "Content-Type: application/json" \
  -d '{"task_id": "budget_flight_search"}'

# Take a step
curl -X POST http://localhost:7860/step \
  -H "Content-Type: application/json" \
  -d '{"action_type": "search_flights", "flight_id": "F001"}'

# Get current state
curl http://localhost:7860/state

# Grade a completed episode
curl -X POST http://localhost:7860/grade \
  -H "Content-Type: application/json" \
  -d '{"task_id": "budget_flight_search", "final_state": {...}}'
```

### Validate submission

```bash
openenv validate
```

---

## 📁 Project Structure

```
travel-agent-env/
├── openenv.yaml          # OpenEnv metadata & task definitions
├── pyproject.toml        # Python package config with entry points
├── Dockerfile            # Container definition
├── inference.py          # Baseline inference script (required)
├── README.md
└── server/
    ├── __init__.py
    ├── app.py            # FastAPI server (OpenEnv HTTP interface)
    └── travel_env.py     # Core environment logic + graders
```
