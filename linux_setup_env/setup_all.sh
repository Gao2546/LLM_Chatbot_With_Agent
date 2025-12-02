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
# --- END CONFIGURATION ---

echo "--- 🚀 Starting Comprehensive Ubuntu Setup Script (as root) ---"
echo "--- ---------------------------------------------------- ---"

# =================================================================
# SECTION 1: Docker Engine Installation
# =================================================================
echo "## 🐳 1. Installing Docker Engine (Required for docker-compose)..."
apt update -y
apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Set up the Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update -y
apt install -y docker-ce docker-ce-cli containerd.io

# Start and Enable the Docker Service
systemctl start docker 2>/dev/null || echo "Note: systemctl start failed (expected in minimal environments)."
systemctl enable docker 2>/dev/null || echo "Note: systemctl enable failed (expected in minimal environments)."

echo "✅ Docker Engine installation complete."
echo "---"

# =================================================================
# SECTION 2: Docker Compose Installation (FIXED & Verified)
# =================================================================
echo "## 🛠️ 2. Installing Docker Compose..."

COMPOSE_INSTALL_PATH="/usr/local/bin/docker-compose"
# Get the latest stable version
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$COMPOSE_VERSION" ]; then
    echo "❌ Error: Could not determine the latest Docker Compose version."
    exit 1
fi

DOWNLOAD_URL="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)"
echo "Downloading Docker Compose version: ${COMPOSE_VERSION}"

# Download and set executable permissions
curl -fL "${DOWNLOAD_URL}" -o "${COMPOSE_INSTALL_PATH}"
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to download Docker Compose binary from GitHub."
    exit 1
fi

chmod +x "${COMPOSE_INSTALL_PATH}"
echo "✅ Docker Compose installation complete."
docker-compose --version
echo "---"

# =================================================================
# SECTION 3: Node.js (with npm) Installation
# =================================================================
echo "## ⚡ 3. Installing Node.js (v${NODE_MAJOR}) and npm..."

apt install -y build-essential

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
# SECTION 4: PostgreSQL and pgvector Extension Installation
# =================================================================
echo "## 🐘 4. Installing PostgreSQL (v${POSTGRES_VERSION}) and pgvector..."

# --- FIX: Add Official PostgreSQL Repository ---
echo "--- Adding official PostgreSQL APT repository..."
# 1. Import the repository signing key
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/keyrings/postgresql.gpg > /dev/null

# 2. Add the repository to the sources list
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/postgresql.list > /dev/null

# 3. Update package lists to include the new repository
apt update -y
echo "--- PostgreSQL Repository added successfully."
# ---------------------------------------------

# 1. Install PostgreSQL and development packages
apt install -y postgresql-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION postgresql-server-dev-$POSTGRES_VERSION git

# Start the PostgreSQL service
service postgresql start

# 2. Install pgvector (from source)
PGVECTOR_VERSION="v0.6.2"
echo "Compiling and installing pgvector ${PGVECTOR_VERSION}..."

git clone --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git
cd pgvector

# Compile and install using the correct pg_config path
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION}
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION} install

cd ..
rm -rf pgvector

# 3. Create sample DB and enable extension (as 'postgres' user)
DB_NAME="my_vector_db"
su - postgres <<EOF
createdb ${DB_NAME}
psql -d ${DB_NAME} -c "CREATE EXTENSION vector;"
psql -d ${DB_NAME} -c "\dx"
EOF

echo "✅ PostgreSQL and pgvector setup complete. Sample DB: ${DB_NAME}"
echo "---"

# =================================================================
# SECTION 5: MinIO Server Installation (Standalone & FIXED for non-systemd)
# =================================================================
echo "## 💾 5. Installing MinIO Object Storage Server (Standalone)..."

# 1. Installation of MinIO Binary
echo "--- Downloading and installing MinIO binary..."
curl -fL https://dl.min.io/server/minio/release/linux-amd64/minio -o "${MINIO_BINARY}"
if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to download MinIO binary."
    exit 1
fi
chmod +x "${MINIO_BINARY}"

# 2. Setup User, Group, and Directories
echo "--- Setting up user, group, and directories..."
if ! id -g "$MINIO_GROUP" >/dev/null 2>&1; then groupadd "$MINIO_GROUP"; fi
if ! id -u "$MINIO_USER" >/dev/null 2>&1; then useradd -s /sbin/nologin -g "$MINIO_GROUP" "$MINIO_USER"; fi

mkdir -p "${MINIO_DATA_DIR}"
chown -R "$MINIO_USER":"$MINIO_GROUP" "${MINIO_DATA_DIR}"
echo "--- User/group and directories created."

# 3. Start MinIO Server directly in the background (Fix for non-systemd environments)
echo "--- Starting MinIO Server (using nohup for background execution)..."

# Export the necessary environment variables for the background process
export MINIO_ROOT_USER="${MINIO_ACCESS_KEY}"
export MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY}"

# Use 'nohup' and '&' to run the MinIO server in the background
nohup "${MINIO_BINARY}" server --address "${MINIO_ENDPOINT}":"${MINIO_PORT}" "${MINIO_DATA_DIR}" > minio_nohup.log 2>&1 &

MINIO_PID=$!
echo "✅ MinIO Server started in the background (PID: ${MINIO_PID})"
echo "MinIO Console is available at: http://${MINIO_ENDPOINT}:${MINIO_PORT}"
echo "Output is logged to: minio_nohup.log"
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

# Check for requirements.txt or create a dummy one
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
echo "4. MinIO Console: http://${MINIO_ENDPOINT}:${MINIO_PORT} (User: ${MINIO_ACCESS_KEY}, Pass: ${MINIO_SECRET_KEY})"
echo "5. To stop MinIO later, use: kill ${MINIO_PID}"