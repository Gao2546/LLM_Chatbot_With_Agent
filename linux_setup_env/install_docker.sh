#!/bin/bash

echo "--- Starting Docker Compose Reinstallation and Verification ---"

# Define the installation path
COMPOSE_INSTALL_PATH="/usr/local/bin/docker-compose"

# 1. Determine the latest stable version
echo "1. Fetching the latest Docker Compose version..."
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$COMPOSE_VERSION" ]; then
    echo "❌ Error: Could not determine the latest Docker Compose version."
    exit 1
fi

DOWNLOAD_URL="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)"
echo "Found version: ${COMPOSE_VERSION}. Downloading from: ${DOWNLOAD_URL}"

# 2. Download the Docker Compose binary
# Use -f to fail fast on HTTP errors
curl -fL "${DOWNLOAD_URL}" -o "${COMPOSE_INSTALL_PATH}"

# Check if the download was successful (curl returns 0 on success with -f)
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to download Docker Compose binary from GitHub."
    echo "Please check the network connection and the download URL."
    exit 1
fi

echo "2. Binary downloaded to ${COMPOSE_INSTALL_PATH}"

# 3. Apply executable permissions
chmod +x "${COMPOSE_INSTALL_PATH}"
echo "3. Executable permissions set."

# 4. Verify the installation
echo "4. Verifying installation..."
docker-compose --version

if [ $? -eq 0 ]; then
    echo "✅ Docker Compose installation successful and verified!"
else
    echo "❌ Error: Docker Compose verification failed after installation."
    exit 1
fi

echo "--- Reinstallation Complete ---"