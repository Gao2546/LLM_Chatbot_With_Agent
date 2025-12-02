#!/bin/bash

# Define the model list file
MODEL_LIST_FILE="listModel.txt"

echo "--- 🚀 Starting Ollama and Model Installation Script ---"
echo "--- ---------------------------------------------------- ---"

# =================================================================
# SECTION 1: Ollama Installation
# =================================================================
echo "## 1. Installing Ollama..."

# The official Ollama installation command downloads the binary and sets up the service
# The 'sh' pipe automatically runs as root if the script is run by root.
curl -fsSL https://ollama.com/install.sh | sh

# Check if Ollama installation was successful
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install Ollama."
    exit 1
fi

echo "✅ Ollama installation complete."
echo "---"

# =================================================================
# SECTION 2: Model Installation from listModel.txt
# =================================================================

if [ ! -f "$MODEL_LIST_FILE" ]; then
    echo "❌ Error: Model list file '$MODEL_LIST_FILE' not found in the current directory."
    echo "Please ensure the file exists before running the script."
    exit 1
fi

echo "## 2. Installing Models from $MODEL_LIST_FILE"

# Read the file line by line
while IFS= read -r model_name; do
    # Trim leading/trailing whitespace (crucial for model names in the file)
    MODEL=$(echo "$model_name" | tr -d '[:space:]')
    
    # Skip empty lines or lines consisting only of whitespace
    if [ -z "$MODEL" ]; then
        continue
    fi

    echo "--------------------------------------------------------"
    echo "➡️ Pulling model: ${MODEL}..."

    # Run the ollama pull command
    ollama pull "$MODEL"
    
    if [ $? -ne 0 ]; then
        echo "⚠️ Warning: Failed to pull model ${MODEL}. Check the model name and internet connection."
    else
        echo "✅ Successfully pulled model: ${MODEL}"
    fi

done < "$MODEL_LIST_FILE"

echo "--------------------------------------------------------"
echo "--- 🎉 All models processed! ---"
echo "To check your installed models, run: ollama list"