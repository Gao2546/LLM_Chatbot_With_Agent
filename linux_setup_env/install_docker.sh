#!/bin/bash

# Define the installation path and version
COMPOSE_INSTALL_PATH="/usr/local/bin/docker-compose"
# Get the latest stable version from Docker's GitHub releases
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | sed 's/^v//')

echo "Starting Docker Compose installation for version: ${COMPOSE_VERSION}"

# 1. Download the Docker Compose binary for Linux (x86_64)
# Since we are running as root, we do not need sudo to write to /usr/local/bin
curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o "${COMPOSE_INSTALL_PATH}"

# Check if the download was successful
if [ $? -ne 0 ]; then
    echo "Error: Failed to download Docker Compose binary."
    exit 1
fi

echo "Binary downloaded to ${COMPOSE_INSTALL_PATH}"

# 2. Apply executable permissions to the binary
# The file owner (root) can change its permissions without sudo
chmod +x "${COMPOSE_INSTALL_PATH}"

echo "Executable permissions set."

# 3. Verify the installation
echo "Verifying installation..."
docker-compose --version

# Check if verification succeeded
if [ $? -eq 0 ]; then
    echo "✅ Docker Compose installation complete and verified!"
else
    echo "❌ Error: Docker Compose is installed but the verification command failed. Please check the path and permissions."
    exit 1
fi