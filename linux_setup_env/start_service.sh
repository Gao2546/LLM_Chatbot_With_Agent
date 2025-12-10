#!/bin/bash

# This script is designed to start PostgreSQL, MinIO, and Ollama services
# as configured in the setup file, assuming the environment is already prepared.

# --- GLOBAL CONFIGURATION VARIABLES ---
# PostgreSQL
DB_NAME="ai_agent"
PGUSER_NAME="athip"
PGUSER_PASSWORD="123456"

# MinIO
MINIO_BINARY="/usr/local/bin/minio"
MINIO_DATA_DIR="/mnt/data/minio"
MINIO_ENDPOINT="127.0.0.1"
MINIO_PORT="9010"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"

# Ollama
OLLAMA_BINARY="/usr/local/bin/ollama"
# --- END CONFIGURATION ---

echo "--- 🚀 Starting Configured Services ---"

# =================================================================
# 1. Start PostgreSQL Service
# =================================================================
echo "## 🐘 1. Starting PostgreSQL..."
# Use the generic service command to start the managed service
service postgresql start 2>/dev/null
if service postgresql status 2>/dev/null | grep -q "active (running)"; then
    echo "✅ PostgreSQL is running."
else
    echo "⚠️ PostgreSQL startup check failed. Check logs."
fi
echo "---"

# =================================================================
# 2. Start MinIO Server (in background with nohup)
# =================================================================
echo "## 💾 2. Starting MinIO Server..."
if pgrep -f "minio server" > /dev/null; then
    echo "⚠️ MinIO is already running. Skipping startup."
else
    # Export root credentials for the MinIO process
    export MINIO_ROOT_USER="${MINIO_ACCESS_KEY}"
    export MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY}"
    
    # Start MinIO in the background, logging output to minio_nohup.log
    nohup "${MINIO_BINARY}" server --address "${MINIO_ENDPOINT}":"${MINIO_PORT}" "${MINIO_DATA_DIR}" > minio_nohup.log 2>&1 &
    MINIO_PID=$!
    sleep 1 # Wait briefly for process to start
    
    if pgrep -f "minio server" > /dev/null; then
        echo "✅ MinIO Server started (PID: ${MINIO_PID}). Console: http://${MINIO_ENDPOINT}:${MINIO_PORT}"
    else
        echo "❌ Error: MinIO Server failed to start. Check minio_nohup.log."
    fi
fi
echo "---"

# =================================================================
# 3. Start Ollama Server (in background with nohup)
# =================================================================
echo "## 🤖 3. Starting Ollama Server..."
if pgrep -f "ollama serve" > /dev/null; then
    echo "⚠️ Ollama is already running. Skipping startup."
else
    # Start Ollama in the background, logging output to ollama_server.log
    nohup "${OLLAMA_BINARY}" serve > ollama_server.log 2>&1 &
    OLLAMA_PID=$!
    sleep 3 # Give it time to initialize
    
    if pgrep -f "ollama serve" > /dev/null; then
        echo "✅ Ollama server started (PID: ${OLLAMA_PID})."
    else
        echo "❌ Error: Ollama server failed to start. Check ollama_server.log."
    fi
fi
echo "---"

echo "--- 🎉 All services have been instructed to start ---"
echo "### Management Commands ###"
echo "* To stop background services: **pkill minio && pkill ollama**"
echo "* To stop PostgreSQL: **service postgresql stop**"