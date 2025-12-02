#!/bin/bash

# --- Configuration Variables ---
ENV_NAME="env"
PROJECT_DIR="/opt/my_project"
POSTGRES_VERSION="16"
NODE_MAJOR="20"
# --- End Configuration Variables ---

echo "--- 🚀 Starting Comprehensive Ubuntu Setup Script (as root) ---"
echo "--- ---------------------------------------------------- ---"

# =================================================================
# SECTION 1: Docker Compose Installation
# =================================================================
echo "## 🛠️ 1. Installing Docker Compose..."

COMPOSE_INSTALL_PATH="/usr/local/bin/docker-compose"
# Get the latest stable version
COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' | sed 's/^v//')

echo "Downloading Docker Compose version: ${COMPOSE_VERSION}"

# Download and set executable permissions
curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o "${COMPOSE_INSTALL_PATH}"
chmod +x "${COMPOSE_INSTALL_PATH}"

echo "✅ Docker Compose installation complete."
docker-compose --version
echo "---"

# =================================================================
# SECTION 2: Node.js (with npm) Installation
# =================================================================
echo "## ⚡ 2. Installing Node.js (v${NODE_MAJOR}) and npm..."

# 1. Update and install dependencies
apt update -y
apt install -y ca-certificates curl gnupg build-essential # build-essential is useful here too

# 2. Add the NodeSource PPA
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" > /etc/apt/sources.list.d/nodesource.list

# 3. Install Node.js
apt update -y
apt install -y nodejs

echo "✅ Node.js and npm installation complete."
node -v
npm -v
echo "---"

# =================================================================
# SECTION 3: PostgreSQL and pgvector Extension Installation
# =================================================================
echo "## 🐘 3. Installing PostgreSQL (v${POSTGRES_VERSION}) and pgvector..."

# 1. Install PostgreSQL and development packages
apt install -y postgresql-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION postgresql-server-dev-$POSTGRES_VERSION git

# 2. Install pgvector (from source)
PGVECTOR_VERSION="v0.6.2" # Current stable version at the time of writing
echo "Compiling and installing pgvector ${PGVECTOR_VERSION}..."

git clone --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git
cd pgvector
# Use the correct pg_config path
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
# SECTION 4: Python Virtual Environment Setup
# =================================================================
echo "## 🐍 4. Setting up Python Virtual Environment..."

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
echo "To begin work:"
echo "1. Change directory: cd ${PROJECT_DIR}"
echo "2. Activate Python environment: source ${ENV_NAME}/bin/activate"
echo "3. Connect to PostgreSQL: su - postgres -c 'psql ${DB_NAME}'"