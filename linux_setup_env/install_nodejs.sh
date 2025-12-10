#!/bin/bash

echo "Starting Node.js and npm installation..."

# 1. Install necessary dependencies (for adding repositories)
apt update -y
apt install -y ca-certificates curl gnupg

# 2. Add the NodeSource PPA for the latest stable Node.js version (e.g., Node 20)
# This adds the repository key
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

# This adds the repository file
NODE_MAJOR=20 # You can change this to 18, 22, etc. if needed
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" > /etc/apt/sources.list.d/nodesource.list

# 3. Update the package list and install Node.js (which includes npm)
apt update -y
apt install -y nodejs

# 4. Verify installation
echo "Verifying installation..."
node -v
npm -v

echo "✅ Node.js and npm installation complete!"