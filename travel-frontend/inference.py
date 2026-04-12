#!/usr/bin/env python3
"""
inference.py — TravelAgentEnv baseline inference script.

Runs an LLM agent against all 3 tasks and reports scores.

Required environment variables:
    API_BASE_URL   The API endpoint for the LLM.
    MODEL_NAME     The model identifier to use for inference.
    HF_TOKEN       Your Hugging Face / API key.

Usage:
    python inference.py
"""

from __future__ import annotations

import json
import os
import sys
import textwrap
import traceback
from typing import Any

import requests
from openai import OpenAI

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE_URL: str = os.environ.get("API_BASE_URL", "https://router.huggingface.co/v1")
API_KEY: str = os.environ.get("HF_TOKEN") or os.environ.get("API_KEY", "")
MODEL_NAME: str = os.environ.get("MODEL_NAME", "meta-llama/Llama-3.3-70B-Instruct")
ENV_BASE_URL: str = os.environ.get("ENV_BASE_URL", "http://localhost:7860")

MAX_STEPS = 15
TEMPERATURE = 0.2
MAX_TOKENS = 512

TASK_IDS = ["budget_flight_search", "multi_preference_tokyo", "complex_london_vip"]

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = textwrap.dedent("""
You are an AI travel agent. Your job is to plan a complete trip using the available actions.

At each step you MUST respond with a single valid JSON object (no markdown, no extra text) like:
{
  "action_type": "<action>",
  "<param>": "<value>"
}

Available actions and their parameters:
- search_flights: {}  or  {"flight_id": "F001"}
- book_hotel: {"hotel_id": "H001"}
- add_activity: {"activity_id": "A001"}
- respond_to_user: {"message": "Your message here"}
- finalize_itinerary: {"summary": "Full day-by-day summary here"}

Strategy:
1. Always search_flights first (optionally select a flight by providing flight_id)
2. Book the cheapest suitable hotel
3. Add the required number of activities
4. Respond to the user explaining your choices
5. Finalize the itinerary with a detailed summary

Never exceed the budget. Always prefer cheaper options unless quality is specifically required.
""").strip()


def build_user_prompt(obs: dict[str, Any], step: int) -> str:
    flights = json.dumps(obs.get("available_flights", []), indent=2)
    hotels = json.dumps(obs.get("available_hotels", []), indent=2)
    activities = json.dumps(obs.get("available_activities", []), indent=2)
    selected_flight = obs.get("selected_flight")
    selected_hotel = obs.get("selected_hotel")
    selected_activities = obs.get("selected_activities", [])
    messages_sent = obs.get("messages_sent", [])

    return textwrap.dedent(f"""
        Step {step} | Budget remaining: ${obs['budget_remaining']:.0f} / ${obs['budget_total']:.0f}

        GOAL: {obs['goal']}

        Trip: {obs['origin']} → {obs['destination']}
        Duration: {obs['duration_days']} days | Passengers: {obs['passengers']}
        Requirements: {json.dumps(obs['requirements'])}

        Last action result: {obs.get('last_action_result', '')}

        === AVAILABLE FLIGHTS ===
        {flights}

        === AVAILABLE HOTELS ===
        {hotels}

        === AVAILABLE ACTIVITIES ===
        {activities}

        === CURRENT SELECTIONS ===
        Flight: {json.dumps(selected_flight)}
        Hotel: {json.dumps(selected_hotel)}
        Activities: {json.dumps(selected_activities)}
        Messages sent: {len(messages_sent)}

        Respond with exactly one JSON action object.
    """).strip()


# ---------------------------------------------------------------------------
# Environment client (HTTP)
# ---------------------------------------------------------------------------

class EnvClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def reset(self, task_id: str) -> dict[str, Any]:
        r = requests.post(f"{self.base_url}/reset", json={"task_id": task_id}, timeout=30)
        r.raise_for_status()
        return r.json()

    def step(self, action: dict[str, Any]) -> dict[str, Any]:
        r = requests.post(f"{self.base_url}/step", json=action, timeout=30)
        r.raise_for_status()
        return r.json()

    def state(self) -> dict[str, Any]:
        r = requests.get(f"{self.base_url}/state", timeout=30)
        r.raise_for_status()
        return r.json()

    def grade(self, task_id: str, final_state: dict[str, Any]) -> float:
        r = requests.post(
            f"{self.base_url}/grade",
            json={"task_id": task_id, "final_state": final_state},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["score"]

    def health(self) -> bool:
        try:
            r = requests.get(f"{self.base_url}/health", timeout=10)
            return r.status_code == 200
        except Exception:
            return False


# ---------------------------------------------------------------------------
# Local environment fallback (no server needed)
# ---------------------------------------------------------------------------

def get_env_client_or_local(base_url: str):
    """Try HTTP client first; fall back to in-process env if server not running."""
    client = EnvClient(base_url)
    if client.health():
        return client
    else:
        return LocalEnvClient()


class LocalEnvClient:
    """Wraps TravelAgentEnv directly, same interface as EnvClient."""

    def __init__(self):
        try:
            from server.travel_env import TravelAgentEnv, grade_episode
        except ImportError:
            import importlib.util, pathlib
            spec = importlib.util.spec_from_file_location(
                "travel_env",
                pathlib.Path(__file__).parent / "server" / "travel_env.py",
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            TravelAgentEnv = mod.TravelAgentEnv
            grade_episode = mod.grade_episode

        self._TravelAgentEnv = TravelAgentEnv
        self._grade_episode = grade_episode
        self._env = None

    def reset(self, task_id: str) -> dict[str, Any]:
        self._env = self._TravelAgentEnv(task_id)
        obs = self._env.reset()
        return {"observation": obs, "task_id": task_id}

    def step(self, action: dict[str, Any]) -> dict[str, Any]:
        return self._env.step(action)

    def state(self) -> dict[str, Any]:
        return self._env.state()

    def grade(self, task_id: str, final_state: dict[str, Any]) -> float:
        return self._grade_episode(task_id, final_state)

    def health(self) -> bool:
        return True


# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------

def run_agent_on_task(
    task_id: str,
    client: OpenAI,
    env,
) -> float:

    # ── [START] ──────────────────────────────────────────────────────────────
    print(f"[START] task={task_id} env=travel-agent-env model={MODEL_NAME}", flush=True)

    try:
        reset_result = env.reset(task_id)
        obs = reset_result["observation"]
    except Exception as e:
        print(f"[END] success=false steps=0 score=0.00 rewards=", flush=True)
        return 0.0

    done = False
    step = 0
    cumulative_reward = 0.0
    all_rewards: list[float] = []
    last_error: str = "null"

    while not done and step < MAX_STEPS:
        step += 1
        user_prompt = build_user_prompt(obs, step)
        last_error = "null"

        # --- Call LLM ---
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=TEMPERATURE,
                max_tokens=MAX_TOKENS,
            )
            raw = response.choices[0].message.content or ""
        except Exception as e:
            raw = '{"action_type": "search_flights"}'
            last_error = str(e).replace("\n", " ")

        # --- Parse action ---
        try:
            clean = raw.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            action = json.loads(clean.strip())
        except json.JSONDecodeError:
            action = {"action_type": "search_flights"}
            last_error = f"json_parse_error: {raw[:60]}"

        action_str = action.get("action_type", "unknown")

        # --- Execute action ---
        reward = 0.0
        try:
            result = env.step(action)
            obs = result["observation"]
            reward = result.get("reward", 0.0)
            done = result.get("done", False)
            cumulative_reward += reward
            all_rewards.append(reward)

            # ── [STEP] ───────────────────────────────────────────────────────
            print(
                f"[STEP] step={step} action={action_str} reward={reward:.2f} "
                f"done={'true' if done else 'false'} error={last_error}",
                flush=True,
            )
        except Exception as e:
            last_error = str(e).replace("\n", " ")
            all_rewards.append(0.0)
            # ── [STEP] on error ──────────────────────────────────────────────
            print(
                f"[STEP] step={step} action={action_str} reward=0.00 "
                f"done=false error={last_error}",
                flush=True,
            )
            break

    # --- Grade episode ---
    score = 0.0
    success = False
    try:
        final_state = env.state()
        score = env.grade(task_id, final_state)
        success = score >= 0.5
    except Exception as e:
        pass

    rewards_str = ",".join(f"{r:.2f}" for r in all_rewards) if all_rewards else "0.00"

    # ── [END] ────────────────────────────────────────────────────────────────
    print(
        f"[END] success={'true' if success else 'false'} steps={step} "
        f"score={score:.2f} rewards={rewards_str}",
        flush=True,
    )

    return score


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not API_KEY:
        print("[END] success=false steps=0 score=0.00 rewards=", flush=True)
        sys.exit(1)

    client = OpenAI(base_url=API_BASE_URL, api_key=API_KEY)
    env = get_env_client_or_local(ENV_BASE_URL)

    scores: dict[str, float] = {}
    for task_id in TASK_IDS:
        try:
            score = run_agent_on_task(task_id, client, env)
            scores[task_id] = score
        except Exception:
            traceback.print_exc(file=sys.stderr)
            # Emit [END] even on crash so validator always sees it
            print(f"[END] success=false steps=0 score=0.00 rewards=", flush=True)
            scores[task_id] = 0.0

    avg = sum(scores.values()) / len(scores) if scores else 0.0
    print(f"\nAverage score: {avg:.4f}", flush=True)


if __name__ == "__main__":
    main()
