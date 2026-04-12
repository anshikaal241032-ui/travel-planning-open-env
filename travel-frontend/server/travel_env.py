"""
TravelAgentEnv — Core environment logic.

Simulates a real-world AI travel agent that plans complete trips:
searching flights, booking hotels, adding activities, communicating
with users, and finalising itineraries — all within budget constraints.
"""

from __future__ import annotations

import copy
import random
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Pydantic models — Observation / Action / Reward
# ---------------------------------------------------------------------------


class TravelObservation(BaseModel):
    task_id: str
    step: int
    goal: str
    budget_total: float
    budget_remaining: float
    origin: str
    destination: str
    duration_days: int
    passengers: int
    requirements: dict[str, Any]
    available_flights: list[dict[str, Any]]
    available_hotels: list[dict[str, Any]]
    available_activities: list[dict[str, Any]]
    selected_flight: Optional[dict[str, Any]] = None
    selected_hotel: Optional[dict[str, Any]] = None
    selected_activities: list[dict[str, Any]] = Field(default_factory=list)
    messages_sent: list[str] = Field(default_factory=list)
    itinerary_finalized: bool = False
    last_action_result: str = ""
    episode_done: bool = False


class TravelAction(BaseModel):
    action_type: str  # search_flights | book_hotel | add_activity | set_budget | respond_to_user | finalize_itinerary
    flight_id: Optional[str] = None
    hotel_id: Optional[str] = None
    activity_id: Optional[str] = None
    amount: Optional[float] = None
    message: Optional[str] = None
    summary: Optional[str] = None


class TravelReward(BaseModel):
    step_reward: float
    cumulative_reward: float
    breakdown: dict[str, float]


# ---------------------------------------------------------------------------
# Simulated data catalogues
# ---------------------------------------------------------------------------

FLIGHT_CATALOGUE: dict[str, list[dict]] = {
    "MUM_PAR": [
        {"id": "F001", "airline": "Air France", "price": 650, "duration_h": 9.5, "stops": 0, "type": "economy"},
        {"id": "F002", "airline": "Emirates", "price": 580, "duration_h": 14.0, "stops": 1, "type": "economy"},
        {"id": "F003", "airline": "IndiGo", "price": 720, "duration_h": 11.0, "stops": 1, "type": "economy"},
    ],
    "DEL_TYO": [
        {"id": "F004", "airline": "Japan Airlines", "price": 620, "duration_h": 8.5, "stops": 0, "type": "economy"},
        {"id": "F005", "airline": "Air India", "price": 510, "duration_h": 12.0, "stops": 1, "type": "economy"},
        {"id": "F006", "airline": "Singapore Air", "price": 680, "duration_h": 10.0, "stops": 1, "type": "economy"},
    ],
    "BLR_LON": [
        {"id": "F007", "airline": "British Airways", "price": 890, "duration_h": 10.5, "stops": 0, "type": "business"},
        {"id": "F008", "airline": "Virgin Atlantic", "price": 820, "duration_h": 10.5, "stops": 0, "type": "economy"},
        {"id": "F009", "airline": "Qatar Airways", "price": 750, "duration_h": 14.0, "stops": 1, "type": "economy"},
    ],
}

HOTEL_CATALOGUE: dict[str, list[dict]] = {
    "PAR": [
        {"id": "H001", "name": "Hotel Ibis Paris", "stars": 3, "price_per_night": 80, "breakfast": False, "spa": False},
        {"id": "H002", "name": "Novotel Paris Centre", "stars": 4, "price_per_night": 140, "breakfast": True, "spa": False},
        {"id": "H003", "name": "Le Bristol Paris", "stars": 5, "price_per_night": 450, "breakfast": True, "spa": True},
    ],
    "TYO": [
        {"id": "H004", "name": "Tokyo Inn", "stars": 3, "price_per_night": 90, "breakfast": False, "spa": False},
        {"id": "H005", "name": "Shinjuku Granbell", "stars": 4, "price_per_night": 160, "breakfast": True, "spa": False},
        {"id": "H006", "name": "Park Hyatt Tokyo", "stars": 5, "price_per_night": 420, "breakfast": True, "spa": True},
    ],
    "LON": [
        {"id": "H007", "name": "Travelodge London", "stars": 3, "price_per_night": 95, "breakfast": False, "spa": False},
        {"id": "H008", "name": "The Savoy", "stars": 5, "price_per_night": 680, "breakfast": True, "spa": True},
        {"id": "H009", "name": "Claridge's", "stars": 5, "price_per_night": 750, "breakfast": True, "spa": True},
    ],
}

ACTIVITY_CATALOGUE: dict[str, list[dict]] = {
    "PAR": [
        {"id": "A001", "name": "Eiffel Tower Tour", "price": 35, "category": "culture", "duration_h": 3},
        {"id": "A002", "name": "Louvre Museum", "price": 20, "category": "culture", "duration_h": 4},
        {"id": "A003", "name": "Seine River Cruise", "price": 45, "category": "entertainment", "duration_h": 2},
        {"id": "A004", "name": "Versailles Day Trip", "price": 70, "category": "culture", "duration_h": 8},
    ],
    "TYO": [
        {"id": "A005", "name": "TeamLab Planets", "price": 32, "category": "entertainment", "duration_h": 3},
        {"id": "A006", "name": "Senso-ji Temple Visit", "price": 0, "category": "culture", "duration_h": 2},
        {"id": "A007", "name": "Shibuya Crossing + Shopping", "price": 50, "category": "entertainment", "duration_h": 4},
        {"id": "A008", "name": "Mount Fuji Day Trip", "price": 80, "category": "nature", "duration_h": 10},
    ],
    "LON": [
        {"id": "A009", "name": "Tower of London", "price": 35, "category": "culture", "duration_h": 3},
        {"id": "A010", "name": "West End Theatre Show", "price": 90, "category": "entertainment", "duration_h": 3},
        {"id": "A011", "name": "British Museum", "price": 0, "category": "culture", "duration_h": 3},
        {"id": "A012", "name": "Afternoon Tea at Claridge's", "price": 80, "category": "culture", "duration_h": 2},
    ],
}

# ---------------------------------------------------------------------------
# Task definitions
# ---------------------------------------------------------------------------

TASKS: dict[str, dict] = {
    "budget_flight_search": {
        "goal": (
            "Plan a 7-day solo trip from Mumbai to Paris with a $2,000 budget. "
            "Find the cheapest available flight, book a 3★ or 4★ hotel within budget, "
            "add at least 2 activities, and finalize the itinerary."
        ),
        "origin": "Mumbai",
        "destination": "Paris",
        "flight_key": "MUM_PAR",
        "hotel_key": "PAR",
        "activity_key": "PAR",
        "duration_days": 7,
        "passengers": 1,
        "budget": 2000.0,
        "requirements": {
            "min_hotel_stars": 3,
            "max_hotel_stars": 4,
            "breakfast_required": False,
            "spa_required": False,
            "min_activities": 2,
            "required_activity_categories": [],
            "prefer_direct_flight": False,
            "only_5_star": False,
        },
    },
    "multi_preference_tokyo": {
        "goal": (
            "Plan a 5-day family trip (2 adults + 2 kids) from Delhi to Tokyo with a $3,500 budget. "
            "Select a direct flight if available, book a hotel with breakfast, "
            "add at least 3 activities including 1 entertainment activity, "
            "communicate requirements back to the user, and stay within budget for all 4 passengers."
        ),
        "origin": "Delhi",
        "destination": "Tokyo",
        "flight_key": "DEL_TYO",
        "hotel_key": "TYO",
        "activity_key": "TYO",
        "duration_days": 5,
        "passengers": 4,
        "budget": 3500.0,
        "requirements": {
            "min_hotel_stars": 3,
            "max_hotel_stars": 5,
            "breakfast_required": True,
            "spa_required": False,
            "min_activities": 3,
            "required_activity_categories": ["entertainment"],
            "prefer_direct_flight": True,
            "only_5_star": False,
        },
    },
    "complex_london_vip": {
        "goal": (
            "Plan a 3-day VIP corporate trip from Bangalore to London with a $3,000 budget. "
            "Only 5★ hotels with spa are acceptable. Prefer a non-stop flight (shortest duration). "
            "Add at least 3 activities mixing culture and entertainment. "
            "Provide a detailed confirmation message and finalize with a day-by-day schedule."
        ),
        "origin": "Bangalore",
        "destination": "London",
        "flight_key": "BLR_LON",
        "hotel_key": "LON",
        "activity_key": "LON",
        "duration_days": 3,
        "passengers": 1,
        "budget": 3000.0,
        "requirements": {
            "min_hotel_stars": 5,
            "max_hotel_stars": 5,
            "breakfast_required": True,
            "spa_required": True,
            "min_activities": 3,
            "required_activity_categories": ["culture", "entertainment"],
            "prefer_direct_flight": True,
            "only_5_star": True,
        },
    },
}

MAX_STEPS = 20


# ---------------------------------------------------------------------------
# Environment class
# ---------------------------------------------------------------------------


class TravelAgentEnv:
    """OpenEnv-compatible travel planning environment."""

    def __init__(self, task_id: str = "budget_flight_search"):
        if task_id not in TASKS:
            raise ValueError(f"Unknown task_id '{task_id}'. Choose from: {list(TASKS)}")
        self.task_id = task_id
        self._task = TASKS[task_id]
        self._state: dict[str, Any] = {}
        self._step_count = 0
        self._cumulative_reward = 0.0
        self._reward_breakdown: dict[str, float] = {}
        self._done = False
        self.reset()

    # ------------------------------------------------------------------
    # OpenEnv interface
    # ------------------------------------------------------------------

    def reset(self) -> dict[str, Any]:
        t = self._task
        self._step_count = 0
        self._cumulative_reward = 0.0
        self._reward_breakdown = {}
        self._done = False

        self._state = {
            "task_id": self.task_id,
            "step": 0,
            "goal": t["goal"],
            "budget_total": t["budget"],
            "budget_remaining": t["budget"],
            "origin": t["origin"],
            "destination": t["destination"],
            "duration_days": t["duration_days"],
            "passengers": t["passengers"],
            "requirements": t["requirements"],
            "available_flights": copy.deepcopy(FLIGHT_CATALOGUE[t["flight_key"]]),
            "available_hotels": copy.deepcopy(HOTEL_CATALOGUE[t["hotel_key"]]),
            "available_activities": copy.deepcopy(ACTIVITY_CATALOGUE[t["activity_key"]]),
            "selected_flight": None,
            "selected_hotel": None,
            "selected_activities": [],
            "messages_sent": [],
            "itinerary_finalized": False,
            "last_action_result": "Environment reset. Start planning the trip.",
            "episode_done": False,
        }
        return self._build_observation()

    def step(self, action: dict[str, Any]) -> dict[str, Any]:
        if self._done:
            return {
                "observation": self._build_observation(),
                "reward": 0.0,
                "done": True,
                "info": {"message": "Episode already done."},
            }

        self._step_count += 1
        self._state["step"] = self._step_count

        step_reward, result_msg = self._execute_action(action)
        self._cumulative_reward = min(1.0, self._cumulative_reward + step_reward)
        self._state["last_action_result"] = result_msg

        if self._step_count >= MAX_STEPS:
            self._done = True
            self._state["episode_done"] = True

        return {
            "observation": self._build_observation(),
            "reward": round(step_reward, 4),
            "done": self._done,
            "info": {
                "cumulative_reward": round(self._cumulative_reward, 4),
                "breakdown": self._reward_breakdown,
                "step": self._step_count,
            },
        }

    def state(self) -> dict[str, Any]:
        return copy.deepcopy(self._state)

    # ------------------------------------------------------------------
    # Action execution
    # ------------------------------------------------------------------

    def _execute_action(self, action: dict[str, Any]) -> tuple[float, str]:
        action_type = action.get("action_type", "")
        reward = 0.0

        if action_type == "search_flights":
            reward += 0.05
            self._add_reward("flight_searched", 0.05)
            flight_id = action.get("flight_id")
            if flight_id:
                flight = self._find_by_id(self._state["available_flights"], flight_id)
                if flight:
                    cost = flight["price"] * self._state["passengers"]
                    if cost <= self._state["budget_remaining"]:
                        self._state["selected_flight"] = flight
                        self._state["budget_remaining"] -= cost
                        reward += 0.10
                        self._add_reward("flight_selected", 0.10)
                        # Bonus for direct when preferred
                        if self._task["requirements"]["prefer_direct_flight"] and flight["stops"] == 0:
                            reward += 0.05
                            self._add_reward("direct_flight_bonus", 0.05)
                        return reward, f"Flight {flight_id} selected. Cost: ${cost}. Remaining: ${self._state['budget_remaining']:.0f}"
                    else:
                        return reward, f"Flight {flight_id} costs ${cost} — exceeds remaining budget ${self._state['budget_remaining']:.0f}"
                return reward, f"Flight {flight_id} not found."
            return reward, "Flights searched. Choose a flight_id to book."

        elif action_type == "book_hotel":
            hotel_id = action.get("hotel_id")
            if not hotel_id:
                return 0.0, "book_hotel requires hotel_id."
            hotel = self._find_by_id(self._state["available_hotels"], hotel_id)
            if not hotel:
                return 0.0, f"Hotel {hotel_id} not found."
            total_cost = hotel["price_per_night"] * self._state["duration_days"]
            if total_cost > self._state["budget_remaining"]:
                return -0.05, f"Hotel {hotel_id} costs ${total_cost} — exceeds remaining budget."
            self._state["selected_hotel"] = hotel
            self._state["budget_remaining"] -= total_cost
            reward += 0.10
            self._add_reward("hotel_booked", 0.10)
            req = self._task["requirements"]
            if req["min_hotel_stars"] <= hotel["stars"] <= req["max_hotel_stars"]:
                reward += 0.05
                self._add_reward("star_requirement_met", 0.05)
            if req["breakfast_required"] and hotel["breakfast"]:
                reward += 0.05
                self._add_reward("breakfast_included", 0.05)
            if req["spa_required"] and hotel["spa"]:
                reward += 0.05
                self._add_reward("spa_included", 0.05)
            return reward, f"Hotel '{hotel['name']}' booked. Cost: ${total_cost}. Remaining: ${self._state['budget_remaining']:.0f}"

        elif action_type == "add_activity":
            activity_id = action.get("activity_id")
            if not activity_id:
                return 0.0, "add_activity requires activity_id."
            activity = self._find_by_id(self._state["available_activities"], activity_id)
            if not activity:
                return 0.0, f"Activity {activity_id} not found."
            if any(a["id"] == activity_id for a in self._state["selected_activities"]):
                return 0.0, f"Activity {activity_id} already added."
            cost = activity["price"] * self._state["passengers"]
            if cost > self._state["budget_remaining"]:
                return -0.02, f"Activity costs ${cost} — exceeds remaining budget."
            self._state["selected_activities"].append(activity)
            self._state["budget_remaining"] -= cost
            reward += 0.08
            self._add_reward(f"activity_{activity_id}_added", 0.08)
            req_cats = self._task["requirements"]["required_activity_categories"]
            covered = {a["category"] for a in self._state["selected_activities"]}
            if activity["category"] in req_cats and activity["category"] in covered:
                reward += 0.03
                self._add_reward(f"category_{activity['category']}_covered", 0.03)
            return reward, f"Activity '{activity['name']}' added. Cost: ${cost}. Remaining: ${self._state['budget_remaining']:.0f}"

        elif action_type == "set_budget":
            amount = action.get("amount")
            if amount is None:
                return 0.0, "set_budget requires amount."
            self._state["budget_remaining"] = float(amount)
            return 0.0, f"Budget updated to ${amount}."

        elif action_type == "respond_to_user":
            message = action.get("message", "")
            if not message:
                return 0.0, "respond_to_user requires message."
            self._state["messages_sent"].append(message)
            reward += 0.05
            self._add_reward("user_response_sent", 0.05)
            return reward, f"Message sent to user: '{message[:80]}...'" if len(message) > 80 else f"Message sent: '{message}'"

        elif action_type == "finalize_itinerary":
            summary = action.get("summary", "")
            if not summary:
                return 0.0, "finalize_itinerary requires summary."
            self._state["itinerary_finalized"] = True
            self._done = True
            self._state["episode_done"] = True
            final_reward = self._compute_final_score()
            self._cumulative_reward = min(1.0, self._cumulative_reward + final_reward)
            self._add_reward("final_score", final_reward)
            return final_reward, f"Itinerary finalized! Final score component: {final_reward:.3f}"

        else:
            return -0.01, f"Unknown action_type: '{action_type}'"

    def _find_by_id(self, catalogue: list[dict], item_id: str) -> Optional[dict]:
        return next((x for x in catalogue if x["id"] == item_id), None)

    def _add_reward(self, key: str, value: float) -> None:
        self._reward_breakdown[key] = self._reward_breakdown.get(key, 0.0) + value

    # ------------------------------------------------------------------
    # Final score computation (called on finalize_itinerary)
    # ------------------------------------------------------------------

    def _compute_final_score(self) -> float:
        s = self._state
        req = self._task["requirements"]
        score = 0.0

        # Flight selection (20%)
        if s["selected_flight"]:
            score += 0.20
            if req["prefer_direct_flight"] and s["selected_flight"]["stops"] == 0:
                score += 0.0  # already rewarded above
        else:
            score += 0.0

        # Hotel quality/amenities (25%)
        h = s["selected_hotel"]
        hotel_score = 0.0
        if h:
            hotel_score += 0.15
            stars_ok = req["min_hotel_stars"] <= h["stars"] <= req["max_hotel_stars"]
            if stars_ok:
                hotel_score += 0.05
            if req["breakfast_required"] and h["breakfast"]:
                hotel_score += 0.03
            if req["spa_required"] and h["spa"]:
                hotel_score += 0.05
            if req["only_5_star"] and h["stars"] < 5:
                hotel_score -= 0.10
        score += hotel_score

        # Activities count + categories (20%)
        acts = s["selected_activities"]
        act_score = 0.0
        n = len(acts)
        min_acts = req["min_activities"]
        act_score += min(n / max(min_acts, 1), 1.0) * 0.12
        covered = {a["category"] for a in acts}
        req_cats = set(req["required_activity_categories"])
        if req_cats:
            matched = len(covered & req_cats) / len(req_cats)
            act_score += matched * 0.08
        else:
            act_score += 0.08
        score += act_score

        # Budget compliance (15%)
        total_spent = s["budget_total"] - s["budget_remaining"]
        over_pct = max(0, (total_spent - s["budget_total"]) / s["budget_total"])
        if over_pct == 0:
            score += 0.15
        elif over_pct <= 0.05:
            score += 0.10
        elif over_pct <= 0.10:
            score += 0.05
        else:
            score += 0.0

        # User communication (10%)
        if s["messages_sent"]:
            score += min(len(s["messages_sent"]) * 0.05, 0.10)

        # Itinerary finalized (10%) — trivially true here
        score += 0.10

        return round(min(score, 0.50), 4)  # cap final component at 0.5

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _build_observation(self) -> dict[str, Any]:
        return TravelObservation(**{
            k: v for k, v in self._state.items()
        }).model_dump()


# ---------------------------------------------------------------------------
# Agent graders (deterministic, 0.0–1.0)
# ---------------------------------------------------------------------------


def grade_episode(task_id: str, final_state: dict[str, Any]) -> float:
    """
    Programmatic grader — returns a score in [0.0, 1.0].
    Deterministic given the same final_state.
    """
    if task_id not in TASKS:
        return 0.0

    req = TASKS[task_id]["requirements"]
    task = TASKS[task_id]
    s = final_state
    score = 0.0
    max_score = 0.0

    # --- Flight (20 pts) ---
    max_score += 20
    if s.get("selected_flight"):
        score += 12
        if req["prefer_direct_flight"] and s["selected_flight"]["stops"] == 0:
            score += 8
        elif not req["prefer_direct_flight"]:
            score += 8

    # --- Hotel (25 pts) ---
    max_score += 25
    h = s.get("selected_hotel")
    if h:
        score += 10
        if req["min_hotel_stars"] <= h["stars"] <= req["max_hotel_stars"]:
            score += 7
        if req["breakfast_required"]:
            if h["breakfast"]:
                score += 4
        else:
            score += 4
        if req["spa_required"]:
            if h["spa"]:
                score += 4
        else:
            score += 4
        # Penalty: 5★-only task but <5★ booked
        if req["only_5_star"] and h["stars"] < 5:
            score -= 15

    # --- Activities (20 pts) ---
    max_score += 20
    acts = s.get("selected_activities", [])
    n = len(acts)
    min_acts = req["min_activities"]
    activity_pts = min(n / max(min_acts, 1), 1.0) * 12
    score += activity_pts
    covered = {a["category"] for a in acts}
    req_cats = set(req["required_activity_categories"])
    if req_cats:
        cat_pts = (len(covered & req_cats) / len(req_cats)) * 8
        score += cat_pts
    else:
        score += 8

    # --- Budget (15 pts) ---
    max_score += 15
    budget_total = task["budget"]
    budget_remaining = s.get("budget_remaining", budget_total)
    total_spent = budget_total - budget_remaining
    if total_spent <= 0:
        score += 5  # nothing spent — partial credit
    elif total_spent <= budget_total:
        score += 15
    elif total_spent <= budget_total * 1.05:
        score += 8
    elif total_spent <= budget_total * 1.10:
        score += 3

    # --- Communication (10 pts) ---
    max_score += 10
    msgs = s.get("messages_sent", [])
    score += min(len(msgs) * 5, 10)

    # --- Finalized (10 pts) ---
    max_score += 10
    if s.get("itinerary_finalized"):
        score += 10

    return round(max(0.0, min(score / max_score, 1.0)), 4)
