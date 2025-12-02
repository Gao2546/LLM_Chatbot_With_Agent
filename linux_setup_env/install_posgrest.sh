#!/bin/bash

echo "--- Starting PostgreSQL and pgvector FIX Script (V2) ---"

# --- GLOBAL CONFIGURATION VARIABLES ---
ENV_NAME="env"
PROJECT_DIR="../"
POSTGRES_VERSION="16" # Target version
NODE_MAJOR="20"
DB_NAME="ai_agent"
PGUSER_NAME="athip"
PGUSER_PASSWORD="123456"
# --- END CONFIGURATION ---

# =================================================================
# FIX 0: Stop old service and ensure v16 is primary
# =================================================================
echo "## ⚠️ Stopping and disabling old PostgreSQL service (if running)..."

# Attempt to stop the old service (often v14)
service postgresql stop 2>/dev/null || true
pg_ctlcluster 14 main stop 2>/dev/null || true

# Disable the old service (optional, but good practice)
# update-rc.d postgresql disable 2>/dev/null || true

echo "---"

# (Keeping sections 1 and 2 largely the same but ensuring dependencies are installed)

# =================================================================
# SECTION 1: Install PostgreSQL and Dependencies (Rerun)
# =================================================================
echo "## 🐘 1. Installing PostgreSQL (v${POSTGRES_VERSION}) and dependencies..."

# Add Official PostgreSQL Repository (Rerun for safety, though it looks OK)
apt update -y
apt install -y curl gnupg lsb-release
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor | tee /etc/apt/keyrings/postgresql.gpg > /dev/null
echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | tee /etc/apt/sources.list.d/postgresql.list > /dev/null
apt update -y

# Install PostgreSQL, contrib modules, and development headers
apt install -y postgresql-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION build-essential postgresql-server-dev-$POSTGRES_VERSION git

# Start the service (should now be v16)
service postgresql start

echo "✅ PostgreSQL core installation complete and service started (v${POSTGRES_VERSION})."
echo "---"

# =================================================================
# SECTION 2: Install pgvector Extension (FIXED COMPILATION)
# =================================================================
echo "## ⚙️ 2. Installing and compiling pgvector..."

PGVECTOR_VERSION="v0.6.2"
git clone --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git
cd pgvector

echo "Compiling pgvector ${PGVECTOR_VERSION}..."
# Use default 'pg_config' which should point to the correct version (16)
make 
make install

cd ..
rm -rf pgvector

echo "✅ pgvector installed to PostgreSQL directories."
echo "---"

# =================================================================
# SECTION 3: Initialize/Enable pgvector extension (UPDATED)
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

# =================================================================
# FIX 4: Update pg_hba.conf for MD5 Authentication
# =================================================================
echo "## 🔑 4. Updating pg_hba.conf for MD5 password authentication..."

# Path to the pg_hba.conf file for PostgreSQL 16 on Ubuntu
HBA_CONF="/etc/postgresql/${POSTGRES_VERSION}/main/pg_hba.conf"

# Change local peer authentication to md5 password authentication
# 1. Backup the original file
cp $HBA_CONF $HBA_CONF.bak

# 2. Modify the line for local connections (unix domain sockets)
# Replace 'peer' with 'md5' for local connections
sed -i.orig '/^local\s\+all\s\+all\s\+peer/c\local\t\tall\t\tall\t\t\t\tmd5' $HBA_CONF

# 3. Modify the line for localhost connections (TCP/IP)
# Replace 'scram-sha-256' or 'peer' with 'md5'
sed -i '/^host\s\+all\s\+all\s\+127.0.0.1\/32/c\host\t\tall\t\tall\t\t127.0.0.1/32\t\t\tmd5' $HBA_CONF
sed -i '/^host\s\+all\s\+all\s\+::1\/128/c\host\t\tall\t\tall\t\t::1/128\t\t\t\tmd5' $HBA_CONF

# 4. Restart the service for changes to take effect
service postgresql restart

echo "✅ Authentication set to MD5. Service restarted."
echo "---"

# =================================================================
# SECTION 5: Verification (UPDATED)
# =================================================================
echo "## ✅ Verifying PostgreSQL and pgvector setup..."

service postgresql status
echo "------------------------------------------"
echo "To connect to the sample DB:"
echo "User: ${PGUSER_NAME}"
echo "DB: ${DB_NAME}"
echo ""
echo "Connection command (using password):"
echo "psql -U ${PGUSER_NAME} -d ${DB_NAME} -h localhost -W"
echo ""
echo "Using the specified DATABASE_URL structure:"
echo "postgres://${PGUSER_NAME}:${PGUSER_PASSWORD}@localhost:5432/${DB_NAME}"

echo "--- 🎉 PostgreSQL and pgvector installation completed successfully! ---"