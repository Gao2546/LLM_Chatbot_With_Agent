#!/bin/bash

echo "--- 🐳 Starting Docker Engine (CE) Installation ---"

# 1. Update package lists and install necessary dependencies
echo "1. Installing core dependencies..."
apt update -y
apt install -y ca-certificates curl gnupg lsb-release

# 2. Add Docker's official GPG key
echo "2. Adding Docker's official GPG key..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# 3. Set up the Docker repository
echo "3. Setting up the Docker stable repository..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install the Docker Engine
echo "4. Installing Docker Engine, CLI, and containerd..."
apt update -y
apt install -y docker-ce docker-ce-cli containerd.io

# 5. Start and Enable the Docker Service
# On systems where 'service docker status' fails, we use systemctl directly, 
# which is the underlying management tool on modern Ubuntu systems.
echo "5. Starting and enabling the Docker service..."
systemctl start docker
systemctl enable docker

# 6. Verification
echo "6. Verifying installation and service status..."

if systemctl is-active --quiet docker; then
    echo "✅ Docker Engine is installed and running successfully."
    echo "Output of 'docker ps':"
    docker ps
else
    echo "❌ Error: Docker Engine service failed to start. Please check system logs."
    exit 1
fi

echo "--- Installation Complete! ---"