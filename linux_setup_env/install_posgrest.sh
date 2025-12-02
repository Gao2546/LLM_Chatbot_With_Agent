#!/bin/bash

echo "Starting PostgreSQL and pgvector installation..."

# 1. Install PostgreSQL and related development packages
# postgresql-contrib includes useful modules
# postgresql-server-dev-XX is needed to build/install extensions like pgvector
POSTGRES_VERSION="16" # Use a stable version

apt update -y
apt install -y postgresql-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION build-essential postgresql-server-dev-$POSTGRES_VERSION git

# 2. Install pgvector (from source)
# Clone the pgvector repository
git clone --branch v0.6.2 https://github.com/pgvector/pgvector.git
cd pgvector

# Compile and install the extension
# Use the correct pg_config path for the installed version
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION}
make PG_CONFIG=/usr/bin/pg_config-${POSTGRES_VERSION} install

cd ..
rm -rf pgvector

echo "pgvector installed to PostgreSQL directories."

# 3. Initialize/Enable pgvector extension (Run as the 'postgres' user)

# Create a sample database and enable the extension for demonstration
su - postgres <<EOF
createdb my_vector_db
psql -d my_vector_db -c "CREATE EXTENSION vector;"
psql -d my_vector_db -c "\dx"
EOF

# 4. Verification
echo "Verifying PostgreSQL and pgvector setup..."
service postgresql status
echo "------------------------------------------"
echo "To connect to the sample DB: su - postgres -c 'psql my_vector_db'"

echo "✅ PostgreSQL and pgvector installation complete!"