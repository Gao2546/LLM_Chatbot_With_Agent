#!/bin/bash

echo "--- Starting PostgreSQL and pgvector FIX Script ---"

# --- Configuration Variables ---
POSTGRES_VERSION="16"
DB_NAME="ai_agent"

# --- NEW: User Configuration ---
PGUSER_NAME="athip"
PGUSER_PASSWORD="123456"
# --- End Configuration Variables ---

# =================================================================
# FIX: Add Official PostgreSQL Repository (Keeping this section as-is)
# =================================================================
echo "## 🔧 Adding official PostgreSQL APT repository..."

# Install necessary tools for secure repository addition
apt update -y
apt install -y curl gnupg lsb-release

# 1. Import the repository signing key
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/keyrings/postgresql.gpg > /dev/null

# 2. Add the repository to the sources list
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/postgresql.list > /dev/null

# 3. Update package lists to include the new repository
apt update -y
echo "Repository added and package list updated."
echo "---"

# =================================================================
# SECTION 1: Install PostgreSQL and Dependencies (Rerun)
# =================================================================
echo "## 🐘 1. Installing PostgreSQL (v${POSTGRES_VERSION}) and dependencies..."

# Install PostgreSQL, contrib modules, and development headers
apt install -y postgresql-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION build-essential postgresql-server-dev-$POSTGRES_VERSION git

# The postgres service should start automatically after installation
service postgresql start

echo "✅ PostgreSQL core installation complete and service started."
echo "---"

# =================================================================
# SECTION 2: Install pgvector Extension (Rerun)
# =================================================================
echo "## ⚙️ 2. Installing and compiling pgvector..."

PGVECTOR_VERSION="v0.6.2" # Current stable version
git clone --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git
cd pgvector

echo "Compiling pgvector ${PGVECTOR_VERSION}..."
# Use the correct pg_config path
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION}
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION} install

cd ..
rm -rf pgvector

echo "✅ pgvector installed to PostgreSQL directories."
echo "---"

# =================================================================
# SECTION 3: Initialize/Enable pgvector extension (Rerun)
# =================================================================
echo "## ✨ 3. Creating database user, database, and enabling pgvector..."

# Run commands as the 'postgres' user
su - postgres <<EOF
# 1. Create the new user with a password
psql -c "CREATE USER ${PGUSER_NAME} WITH ENCRYPTED PASSWORD '${PGUSER_PASSWORD}';"

# 2. Create the database and set the owner
createdb ${DB_NAME} -O ${PGUSER_NAME}

# 3. Connect to the new database and enable the vector extension
psql -d ${DB_NAME} -c "CREATE EXTENSION vector;"
psql -d ${DB_NAME} -c "\dx"
EOF

# 4. Verification
echo "## ✅ Verifying PostgreSQL and pgvector setup..."
service postgresql status
echo "------------------------------------------"
echo "To connect to the sample DB:"
echo "User: ${PGUSER_NAME}"
echo "DB: ${DB_NAME}"
echo "Connection command (as root/sudo):"
echo "su - ${PGUSER_NAME} -c 'psql ${DB_NAME}'"
echo ""
echo "Or using the specified DATABASE_URL structure:"
echo "postgres://${PGUSER_NAME}:${PGUSER_PASSWORD}@localhost:5432/${DB_NAME}"

echo "--- 🎉 PostgreSQL and pgvector installation completed successfully! ---"