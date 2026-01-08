#!/bin/bash

# --- Configuration Variables ---
MINIO_USER="minio"
MINIO_GROUP="minio"
MINIO_DATA_DIR="/mnt/data/minio"
MINIO_CONFIG_DIR="/etc/minio"
MINIO_BINARY="/usr/local/bin/minio"

# User-specified MinIO settings
MINIO_ENDPOINT="127.0.0.1"
MINIO_PORT="9010"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="user-files"
MINIO_USE_SSL="false"

echo "--- 🚀 Starting MinIO Standalone Installation Script ---"
echo "Data Directory: ${MINIO_DATA_DIR}"
echo "Endpoint: ${MINIO_ENDPOINT}:${MINIO_PORT}"
echo "--------------------------------------------------------"

# =================================================================
# 1. Installation of MinIO Binary
# =================================================================
echo "## 1. Downloading and installing MinIO binary..."

# Download the latest stable minio binary
curl -fL https://dl.min.io/server/minio/release/linux-amd64/minio -o "${MINIO_BINARY}"
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to download MinIO binary."
    exit 1
fi

# Make the binary executable
chmod +x "${MINIO_BINARY}"
echo "✅ MinIO binary installed to ${MINIO_BINARY}"
echo "---"

# =================================================================
# 2. Setup User, Group, and Directories
# =================================================================
echo "## 2. Setting up user, group, and directories..."

# Create a dedicated user and group for security
if ! id -g "$MINIO_GROUP" >/dev/null 2>&1; then
    groupadd "$MINIO_GROUP"
fi
if ! id -u "$MINIO_USER" >/dev/null 2>&1; then
    useradd -s /sbin/nologin -g "$MINIO_GROUP" "$MINIO_USER"
fi

# Create data and config directories
mkdir -p "${MINIO_DATA_DIR}"
mkdir -p "${MINIO_CONFIG_DIR}"

# Set ownership and permissions
chown -R "$MINIO_USER":"$MINIO_GROUP" "${MINIO_DATA_DIR}" "${MINIO_CONFIG_DIR}"
echo "✅ User/group and directories created."
echo "---"

# =================================================================
# 3. Create Systemd Service File
# =================================================================
echo "## 3. Creating systemd service file..."

SERVICE_FILE="/etc/systemd/system/minio.service"

cat > "${SERVICE_FILE}" << EOF
[Unit]
Description=MinIO Object Storage Server
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target

[Service]
# User and group that will run the service
User=${MINIO_USER}
Group=${MINIO_GROUP}

# Environment variables for access
Environment=MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
Environment=MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}

# The command to start MinIO server.
# The server listens on the specified port.
# The first argument is the data directory.
ExecStart=${MINIO_BINARY} server --address ${MINIO_ENDPOINT}:${MINIO_PORT} ${MINIO_DATA_DIR}

# Restart behavior
Type=simple
Restart=always
TimeoutStopSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Reload the systemd daemon to pick up the new service file
systemctl daemon-reload
echo "✅ Systemd service file created and daemon reloaded."
echo "---"

# =================================================================
# 4. Start MinIO Service and Create Bucket
# =================================================================
echo "## 4. Starting MinIO server without systemd..."

# Export the necessary environment variables
export MINIO_ROOT_USER="${MINIO_ACCESS_KEY}"
export MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY}"

# Use 'nohup' and '&' to run the MinIO server in the background, 
# ensuring it doesn't stop when your shell session exits.

nohup "${MINIO_BINARY}" server --address "${MINIO_ENDPOINT}":"${MINIO_PORT}" "${MINIO_DATA_DIR}" &

# Capture the Process ID (PID)
MINIO_PID=$!

echo "✅ MinIO Server started in the background (PID: ${MINIO_PID})"
echo "MinIO Console is available at: http://${MINIO_ENDPOINT}:${MINIO_PORT}"
echo "Check the nohup.out file for server output."
echo "---"

# To stop MinIO later, use: kill ${MINIO_PID}