#!/bin/bash

echo "--- Starting PostgreSQL and pgvector FIX Script (V3 - Pre-Cleanup) ---"

# --- Configuration Variables ---
POSTGRES_VERSION="16"
DB_NAME="ai_agent"
PGUSER_NAME="athip"
PGUSER_PASSWORD="123456"
# --- End Configuration Variables ---

# =================================================================
# SECTION 1: Cleanup (Uninstall PostgreSQL 14)
# =================================================================
echo "## 🗑️ 1. Removing conflicting PostgreSQL 14 packages and clusters..."

# Stop the generic PostgreSQL service
service postgresql stop 2>/dev/null || true

# Purge (uninstall and remove config files) PostgreSQL 14 packages
# We use 'purge' to ensure configuration and data files are also removed.
apt purge -y postgresql-14 postgresql-contrib-14 postgresql-server-dev-14 2>/dev/null || true

# Remove any remaining data directories for v14 to be safe
rm -rf /var/lib/postgresql/14/main

echo "✅ PostgreSQL 14 successfully removed."
echo "---"

# =================================================================
# FIX 2: Add Official PostgreSQL Repository (Rerun for safety)
# =================================================================
echo "## 🔧 2. Adding official PostgreSQL APT repository..."

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
# SECTION 3: Install PostgreSQL and Dependencies
# =================================================================
echo "## 🐘 3. Installing PostgreSQL (v${POSTGRES_VERSION}) and dependencies..."

# Install PostgreSQL, contrib modules, and development headers
apt install -y postgresql-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION build-essential postgresql-server-dev-$POSTGRES_VERSION git

# Start the postgres service (This will now initialize and start v16 on port 5432)
service postgresql start

echo "✅ PostgreSQL core installation complete and service started."
echo "---"

# =================================================================
# SECTION 4: Install pgvector Extension (FIXED COMPILATION)
# =================================================================
echo "## ⚙️ 4. Installing and compiling pgvector..."

PGVECTOR_VERSION="v0.6.2" # Current stable version
git clone --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git
cd pgvector

echo "Compiling pgvector ${PGVECTOR_VERSION}..."
# FIX: Use default make path
make
make install

cd ..
rm -rf pgvector

echo "✅ pgvector installed to PostgreSQL directories."
echo "---"

# =================================================================
# SECTION 5: Initialize/Enable pgvector extension (UPDATED USER)
# =================================================================
echo "## ✨ 5. Creating database user, database, and enabling pgvector..."

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
# FIX 6: Update pg_hba.conf for MD5 Authentication
# =================================================================
echo "## 🔑 6. Updating pg_hba.conf for MD5 password authentication..."

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

echo "## ✅ Verifying PostgreSQL and pgvector setup..."
service postgresql status
echo "------------------------------------------"
echo "To connect to the sample DB:"
echo "User: ${PGUSER_NAME}"
echo "DB: ${DB_NAME}"
echo "Connection string: postgres://${PGUSER_NAME}:${PGUSER_PASSWORD}@localhost:5432/${DB_NAME}"
echo ""
echo "Shell command (using password): psql -U ${PGUSER_NAME} -d ${DB_NAME} -h localhost -W"

echo "--- 🎉 PostgreSQL and pgvector installation completed successfully! ---"