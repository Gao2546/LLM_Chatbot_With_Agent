#!/bin/bash

# Define the model list file
MODEL_LIST_FILE="listModel.txt"
OLLAMA_BINARY="/usr/local/bin/ollama"

echo "--- 🚀 Starting Ollama and Model Installation Script (FIXED) ---"
echo "--- ----------------------------------------------------------- ---"

# =================================================================
# SECTION 1: Ollama Installation and Manual Startup (FIXED)
# =================================================================
echo "## 1. Installing Ollama and starting the server..."

# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install Ollama."
    exit 1
fi

echo "--- Starting Ollama Server Manually (Fix for non-systemd environment) ---"

# 2. Start the Ollama server process in the background using nohup
# We run the binary directly, piping output to a log file.
nohup "${OLLAMA_BINARY}" serve > ollama_server.log 2>&1 &

# Capture the Process ID (PID)
OLLAMA_PID=$!

echo "Ollama Server started in the background (PID: ${OLLAMA_PID})."
echo "Waiting 5 seconds for the server to initialize..."
sleep 5

# 3. Verification
if pgrep -f "ollama serve" > /dev/null; then
    echo "✅ Ollama server is running."
else
    echo "❌ Error: Ollama server failed to start. Check ollama_server.log for details."
    exit 1
fi
echo "---"

# =================================================================
# SECTION 2: Model Installation from listModel.txt
# =================================================================

if [ ! -f "$MODEL_LIST_FILE" ]; then
    echo "❌ Error: Model list file '$MODEL_LIST_FILE' not found."
    # Attempt to kill the background server before exiting
    kill "$OLLAMA_PID" 2>/dev/null
    exit 1
fi

echo "## 2. Installing Models from $MODEL_LIST_FILE"

# The server is now running, so the ollama pull commands should succeed.
while IFS= read -r model_name; do
    # Trim leading/trailing whitespace
    MODEL=$(echo "$model_name" | tr -d '[:space:]')
    
    if [ -z "$MODEL" ]; then
        continue
    fi

    echo "--------------------------------------------------------"
    echo "➡️ Pulling model: ${MODEL}..."

    # Run the ollama pull command
    "${OLLAMA_BINARY}" pull "$MODEL"
    
    if [ $? -ne 0 ]; then
        echo "⚠️ Warning: Failed to pull model ${MODEL}."
    else
        echo "✅ Successfully pulled model: ${MODEL}"
    fi

done < "$MODEL_LIST_FILE"

echo "--------------------------------------------------------"
echo "--- 🎉 All models processed! ---"
echo "Ollama server (PID: ${OLLAMA_PID}) is still running in the background."
echo "To check your installed models, run: ${OLLAMA_BINARY} list"
echo "To stop the server when done, run: kill ${OLLAMA_PID}"