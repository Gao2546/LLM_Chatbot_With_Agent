#!/usr/bin/env bash
set -e

echo "🔍 Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Installing..."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://get.docker.com | sh
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "👉 Please install Docker from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
fi

echo "🐳 Running Local Agent container..."

docker run --rm \
    --name local_api_agent \
    --user "$(id -u):$(id -g)" \
    -v "$HOME:/app/files" \
    -p 3333:3333 \
    gao2546/local_api_agent:latest

echo "✅ Agent is running at http://localhost:3333"

# Wait for user input before exiting
read -n 1 -s -r -p "⏳ Press any key to exit..."
echo
