#!/bin/bash

# --- GLOBAL CONFIGURATION VARIABLES ---
ENV_NAME="env"
PROJECT_DIR="/opt/my_project"
POSTGRES_VERSION="16"
NODE_MAJOR="20"

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
# SECTION 3: PostgreSQL and pgvector Extension
# =================================================================
echo "## 🐘 3. Installing PostgreSQL (v${POSTGRES_VERSION}) and pgvector..."

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
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION}
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION} install
cd ..
rm -rf pgvector

# Start the service and create sample DB
service postgresql start
DB_NAME="my_vector_db"
su - postgres <<EOF
createdb ${DB_NAME}
psql -d ${DB_NAME} -c "CREATE EXTENSION vector;"
psql -d ${DB_NAME} -c "\dx"
EOF

echo "✅ PostgreSQL and pgvector setup complete. Sample DB: ${DB_NAME}"
echo "---"

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
    echo "❌ Error: Ollama server failed to start."
    exit 1
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
            echo "⚠️ Warning: Failed to pull model ${MODEL}."
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

# 2. Create project directory and requirements.txt
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

if [ ! -f requirements.txt ]; then
    echo "Warning: requirements.txt not found. Creating a minimal dummy file."
    echo "fastapi" > requirements.txt
    echo "psycopg2-binary" >> requirements.txt
    echo "minio" >> requirements.txt
fi

# 3. Create the virtual environment
python3 -m venv $ENV_NAME

# 4. Activate and install requirements
echo "Installing packages from requirements.txt into '$ENV_NAME'..."
source $ENV_NAME/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

echo "✅ Python environment setup complete. Project directory: ${PROJECT_DIR}"
echo "---"

echo "--- 🎉 ALL INSTALLATIONS COMPLETE ---"
echo "### Environment Access Details ###"
echo "1. Change directory: cd ${PROJECT_DIR}"
echo "2. Activate Python environment: source ${ENV_NAME}/bin/activate"
echo "3. Connect to PostgreSQL: su - postgres -c 'psql ${DB_NAME}'"
echo "4. MinIO Console: http://${MINIO_ENDPOINT}:${MINIO_PORT}"
echo "5. Ollama status: Running in background (PID: ${OLLAMA_PID})"
echo "6. To stop MinIO or Ollama, use the 'kill <PID>' command, or 'pkill minio' / 'pkill ollama'."