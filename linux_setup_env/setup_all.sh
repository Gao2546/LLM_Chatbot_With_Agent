#!/bin/bash

# --- GLOBAL CONFIGURATION VARIABLES ---
ENV_NAME="env"
PROJECT_DIR="../"
POSTGRES_VERSION="16"
NODE_MAJOR="20"

# --- POSTGRES CONFIGURATION ---
DB_NAME="ai_agent"
PGUSER_NAME="athip"
PGUSER_PASSWORD="123456"
# --- END POSTGRES CONFIGURATION ---

# --- MINIO CONFIGURATION ---
MINIO_USER="minio"
MINIO_GROUP="minio"
MINIO_DATA_DIR="/mnt/data/minio"
MINIO_BINARY="/usr/local/bin/minio"
MINIO_ENDPOINT="127.0.0.1"
MINIO_PORT="9010"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"

# --- OLLAMA CONFIGURATION ---
MODEL_LIST_FILE="listModel.txt"
OLLAMA_BINARY="/usr/local/bin/ollama"
# --- END CONFIGURATION ---

echo "--- 🚀 Starting Comprehensive Ubuntu Setup Script (as root) ---"
echo "--- ---------------------------------------------------- ---"

# =================================================================
# SECTION 1: Docker Engine & Compose
# =================================================================
echo "## 🐳 1. Installing Docker Engine & Compose..."
apt update -y
apt install -y ca-certificates curl gnupg lsb-release build-essential git

# --- Docker Engine ---
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update -y
apt install -y docker-ce docker-ce-cli containerd.io
systemctl start docker 2>/dev/null || echo "Note: systemctl start failed (expected in minimal environments)."
systemctl enable docker 2>/dev/null || echo "Note: systemctl enable failed (expected in minimal environments)."

# --- Docker Compose ---
COMPOSE_INSTALL_PATH="/usr/local/bin/docker-compose"
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
DOWNLOAD_URL="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)"
curl -fL "${DOWNLOAD_URL}" -o "${COMPOSE_INSTALL_PATH}"
chmod +x "${COMPOSE_INSTALL_PATH}"
echo "✅ Docker Engine & Compose installed."
docker-compose --version
echo "---"

# =================================================================
# SECTION 2: Node.js (with npm)
# =================================================================
echo "## ⚡ 2. Installing Node.js (v${NODE_MAJOR}) and npm..."

# Add the NodeSource PPA
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list > /dev/null

# Install Node.js
apt update -y
apt install -y nodejs

echo "✅ Node.js and npm installation complete."
node -v
npm -v
echo "---"

# =================================================================
# SECTION 3: PostgreSQL and pgvector Extension (FIXED)
# =================================================================
echo "## 🐘 3. Installing PostgreSQL (v${POSTGRES_VERSION}) and pgvector..."

# --- FIX 3.1: Cleanup (Uninstall PostgreSQL 14) ---
echo "--- 🗑️ Removing conflicting PostgreSQL 14 packages and clusters..."

# Stop the generic PostgreSQL service
service postgresql stop 2>/dev/null || true

# Purge (uninstall and remove config files) PostgreSQL 14 packages
apt purge -y postgresql-14 postgresql-contrib-14 postgresql-server-dev-14 2>/dev/null || true

# Remove any remaining data directories for v14 to be safe
rm -rf /var/lib/postgresql/14/main

echo "PostgreSQL 14 successfully removed."
# --- END FIX 3.1 ---


# Add Official PostgreSQL Repository
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/keyrings/postgresql.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/postgresql.list > /dev/null
apt update -y

# Install PostgreSQL and dependencies
apt install -y postgresql-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION postgresql-server-dev-$POSTGRES_VERSION

# Install pgvector (from source)
PGVECTOR_VERSION="v0.6.2"
git clone --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git
cd pgvector
echo "Compiling pgvector ${PGVECTOR_VERSION}..."
# FIX: Use default make path
make
make install
cd ..
rm -rf pgvector

# Start the service (should now start v16 and take port 5432)
service postgresql start

echo "--- Creating user ${PGUSER_NAME} and database ${DB_NAME}..."
su - postgres <<EOF
# 1. Create the new user with a password
psql -c "CREATE USER ${PGUSER_NAME} WITH ENCRYPTED PASSWORD '${PGUSER_PASSWORD}';"

# 2. Create the database and set the owner
createdb ${DB_NAME} -O ${PGUSER_NAME}

# 3. Connect to the new database and enable the vector extension
psql -d ${DB_NAME} -c "CREATE EXTENSION vector;"
psql -d ${DB_NAME} -c "\dx"
EOF

# --- FIX 3.2: Update pg_hba.conf for MD5 Authentication ---
echo "## 🔑 Updating pg_hba.conf for MD5 password authentication..."

# Path to the pg_hba.conf file for PostgreSQL 16 on Ubuntu
HBA_CONF="/etc/postgresql/${POSTGRES_VERSION}/main/pg_hba.conf"

# 1. Backup the original file
cp $HBA_CONF $HBA_CONF.bak

# 2. Modify the line for local connections (unix domain sockets) to use md5
sed -i.orig '/^local\s\+all\s\+all\s\+peer/c\local\t\tall\t\tall\t\t\t\tmd5' $HBA_CONF

# 3. Modify the line for localhost connections (TCP/IP) to use md5
sed -i '/^host\s\+all\s\+all\s\+127.0.0.1\/32/c\host\t\tall\t\tall\t\t127.0.0.1/32\t\t\tmd5' $HBA_CONF
sed -i '/^host\s\+all\s\+all\s\+::1\/128/c\host\t\tall\t\tall\t\t::1/128\t\t\t\tmd5' $HBA_CONF

# 4. Restart the service for changes to take effect
service postgresql restart

echo "✅ PostgreSQL and pgvector setup complete. DB: ${DB_NAME} | User: ${PGUSER_NAME}"
echo "---"
# --- END FIX 3.2 ---

# =================================================================
# SECTION 4: MinIO Server Installation (Standalone & FIXED)
# =================================================================
echo "## 💾 4. Installing MinIO Object Storage Server (Standalone)..."

# 1. Installation of MinIO Binary
curl -fL https://dl.min.io/server/minio/release/linux-amd64/minio -o "${MINIO_BINARY}"
chmod +x "${MINIO_BINARY}"

# 2. Setup User, Group, and Directories
if ! id -g "$MINIO_GROUP" >/dev/null 2>&1; then groupadd "$MINIO_GROUP"; fi
if ! id -u "$MINIO_USER" >/dev/null 2>&1; then useradd -s /sbin/nologin -g "$MINIO_GROUP" "$MINIO_USER"; fi
mkdir -p "${MINIO_DATA_DIR}"
chown -R "$MINIO_USER":"$MINIO_GROUP" "${MINIO_DATA_DIR}"

# 3. Start MinIO Server directly in the background (Fix for non-systemd)
echo "--- Starting MinIO Server (using nohup)..."
export MINIO_ROOT_USER="${MINIO_ACCESS_KEY}"
export MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY}"
nohup "${MINIO_BINARY}" server --address "${MINIO_ENDPOINT}":"${MINIO_PORT}" "${MINIO_DATA_DIR}" > minio_nohup.log 2>&1 &
MINIO_PID=$!
sleep 1 # Give it a moment to detach

echo "✅ MinIO Server started in the background (PID: ${MINIO_PID})."
echo "MinIO Console: http://${MINIO_ENDPOINT}:${MINIO_PORT}"
echo "---"

# =================================================================
# SECTION 5: Ollama and Model Installation (FIXED)
# =================================================================
echo "## 🤖 5. Installing Ollama and pulling models..."

# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Start the Ollama server process manually (Fix for non-systemd)
echo "--- Starting Ollama Server Manually (Fix for non-systemd environment) ---"
nohup "${OLLAMA_BINARY}" serve > ollama_server.log 2>&1 &
OLLAMA_PID=$!
sleep 5 # Wait for the server to initialize

if ! pgrep -f "ollama serve" > /dev/null; then
    echo "❌ Error: Ollama server failed to start. Attempting to continue."
    OLLAMA_PID="N/A (Error)"
fi
echo "✅ Ollama server is running (PID: ${OLLAMA_PID})."

# 3. Model Installation from listModel.txt
if [ ! -f "$MODEL_LIST_FILE" ]; then
    echo "❌ Error: Model list file '$MODEL_LIST_FILE' not found. Skipping model download."
else
    echo "--- Installing Models from $MODEL_LIST_FILE ---"
    while IFS= read -r model_name; do
        MODEL=$(echo "$model_name" | tr -d '[:space:]')
        if [ -z "$MODEL" ]; then continue; fi
        
        echo "➡️ Pulling model: ${MODEL}..."
        "${OLLAMA_BINARY}" pull "$MODEL"
        if [ $? -ne 0 ]; then
            echo "⚠️ Warning: Failed to pull model ${MODEL}. Check Ollama server status."
        else
            echo "✅ Pulled model: ${MODEL}"
        fi
    done < "$MODEL_LIST_FILE"
fi

echo "---"

# =================================================================
# SECTION 6: Python Virtual Environment Setup
# =================================================================
echo "## 🐍 6. Setting up Python Virtual Environment..."

# 1. Install python3-venv package
apt install -y python3-venv

# 2. Create project directory and requirement.txt
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

if [ ! -f requirement.txt ]; then
    echo "Warning: requirement.txt not found. Creating a minimal dummy file."
    echo "fastapi" > requirement.txt
    echo "psycopg2-binary" >> requirement.txt
    echo "minio" >> requirement.txt
fi

# 3. Create the virtual environment
python3 -m venv $ENV_NAME

# 4. Activate and install requirements
echo "Installing packages from requirement.txt into '$ENV_NAME'..."
source $ENV_NAME/bin/activate
pip install --upgrade pip
pip install -r requirement.txt
deactivate

echo "✅ Python environment setup complete. Project directory: ${PROJECT_DIR}"
echo "---"

echo "--- 🎉 ALL INSTALLATIONS COMPLETE ---"
echo "### Environment Access Details ###"
echo "1. Change directory: cd ${PROJECT_DIR}"
echo "2. Activate Python environment: source ${ENV_NAME}/bin/activate"
echo "3. Connect to PostgreSQL (Password: ${PGUSER_PASSWORD}):"
echo "   - Connection string: postgres://${PGUSER_NAME}:${PGUSER_PASSWORD}@localhost:5432/${DB_NAME}"
echo "   - Shell command: psql -U ${PGUSER_NAME} -d ${DB_NAME} -h localhost -W"
echo "4. MinIO Console: http://${MINIO_ENDPOINT}:${MINIO_PORT}"
echo "5. Ollama status: Running in background (PID: ${OLLAMA_PID})"
echo "6. To stop background services, use: pkill minio && pkill ollama"

---
This video discusses building AI agents using shell scripts and a vector database, which is relevant to your project's goal of setting up an environment for an LLM Chatbot with an Agent.
[Building Ai Agents with Shell Scripts by Laurent Doguin](https://www.youtube.com/watch?v=KUAeISXsbe4)


http://googleusercontent.com/youtube_content/0