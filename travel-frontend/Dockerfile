FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY openenv.yaml ./
COPY pyproject.toml ./

RUN pip install --no-cache-dir \
    "openenv-core>=0.2.0" \
    "fastapi>=0.110.0" \
    "uvicorn[standard]>=0.29.0" \
    "pydantic>=2.0.0" \
    "openai>=1.0.0" \
    "requests>=2.31.0"

COPY __init__.py ./
COPY app.py ./
COPY travel_env.py ./
COPY inference.py ./
COPY README.md ./
COPY uv.lock ./

RUN pip install --no-cache-dir -e .

EXPOSE 7860

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
