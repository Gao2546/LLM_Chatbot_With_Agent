#!/bin/bash

ENV_NAME="env"
PROJECT_DIR="../" # Example project directory

echo "Starting Python environment setup..."

# 1. Install python3-venv package (if not already installed)
apt update -y
apt install -y python3-venv

# 2. Create the project directory (if it doesn't exist)
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# 3. Create a dummy requirement.txt for demonstration if missing
if [ ! -f requirement.txt ]; then
    echo "Warning: requirements.txt not found. Creating a dummy one."
    echo "fastapi" >> requirement.txt
    echo "uvicorn" >> requirement.txt
    echo "psycopg2-binary" >> requirement.txt # For PostgreSQL
fi

# 4. Create the virtual environment
python3 -m venv $ENV_NAME

echo "Virtual environment '$ENV_NAME' created in $PROJECT_DIR"

# 5. Activate the environment and install requirements
# The 'source' command is run inside a non-interactive shell to execute subsequent commands in that context
source $ENV_NAME/bin/activate
pip install --upgrade pip
pip install -r requirement.txt
deactivate

# 6. Verification
echo "Verifying environment contents..."
ls $ENV_NAME/bin
echo "------------------------------------------"
echo "To use the environment, navigate to $PROJECT_DIR and run:"
echo "source $ENV_NAME/bin/activate"

echo "✅ Python virtual environment setup complete!"