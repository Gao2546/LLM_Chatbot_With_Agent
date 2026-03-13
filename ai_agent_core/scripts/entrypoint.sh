#!/usr/bin/env bash

set -e  # Stop if error occurs

# Detect OS
OS_TYPE=$(uname -s)

echo "=== Checking for npm... ==="
if ! command -v npm >/dev/null 2>&1; then
    echo "npm not found. Installing Node.js and npm..."
    if [[ "$OS_TYPE" == "Linux" ]]; then
        if command -v apt >/dev/null 2>&1; then
            sudo apt update
            sudo apt install -y nodejs npm
        elif command -v yum >/dev/null 2>&1; then
            sudo yum install -y nodejs npm
        else
            echo "Unsupported Linux package manager. Install Node.js manually."
            exit 1
        fi
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        if ! command -v brew >/dev/null 2>&1; then
            echo "Homebrew not found. Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node
    else
        echo "Unsupported OS: $OS_TYPE"
        exit 1
    fi
else
    echo "npm found: $(npm -v)"
fi

# Create directory in HOME
INSTALL_DIR="$HOME/api_local_server"
mkdir -p "$INSTALL_DIR"

# Install package
echo "=== Installing api_local_server in $INSTALL_DIR ==="
cd "$INSTALL_DIR"
npm init -y >/dev/null 2>&1
npm i api_local_server

# Run package (adjust if it has a specific start script)
echo "=== Running api_local_server ==="
# npx api_local_server
node ./node_modules/api_local_server/build/index.js


# Wait for user input before exiting
read -n 1 -s -r -p "⏳ Press any key to exit..."
echo
