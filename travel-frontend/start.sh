#!/usr/bin/env bash
# =============================================
# TravelAgent AI — Quick Start Script
# =============================================

echo "✈️  TravelAgent AI — Starting..."
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌ Python 3 not found. Please install Python 3.9+"
  exit 1
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."
pip install fastapi uvicorn pydantic --quiet 2>/dev/null || true

echo ""
echo "🚀 Starting server on http://localhost:7860"
echo "🌐 Open your browser at: http://localhost:7860/ui"
echo "📚 API docs at: http://localhost:7860/docs"
echo ""
echo "Press Ctrl+C to stop."
echo ""

# Run server
cd "$(dirname "$0")"
python3 -m uvicorn server.app:app --host 0.0.0.0 --port 7860 --reload
