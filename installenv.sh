#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e
# Treat unset variables as an error when substituting.
# set -u # You might want to enable this, but be careful with VIRTUAL_ENV checks below
# Cause pipelines to return the exit status of the last command that failed.
set -o pipefail

echo "--- Setup Script Started ---"

# --- Check for sudo and update package lists ---
echo "Checking for sudo..."
if ! command -v sudo &> /dev/null; then
    echo "ERROR: 'sudo' command not found."
    echo "Please install sudo first (e.g., run as root: apt update && apt install sudo) and add your user to the sudo group."
    exit 1
fi

echo "Updating package lists using sudo..."
if ! sudo apt-get update; then
    echo "ERROR: 'sudo apt-get update' failed. Please check your internet connection and apt configuration."
    exit 1
fi
# Optional: uncomment the line below to also upgrade packages
# echo "Upgrading packages (optional)..."
# sudo apt-get upgrade -y || echo "WARN: 'sudo apt-get upgrade' failed."

# --- Uncomment these lines if you want to clone the repo ---
# REPO_DIR="learning_AI"
# if [ ! -d "$REPO_DIR" ]; then
#   echo "Cloning repository..."
#   git clone https://github.com/Gao2546/learning_AI.git || { echo "ERROR: Failed to clone repository."; exit 1; }
# else
#   echo "Repository directory '$REPO_DIR' already exists. Skipping clone."
# fi
# cd "$REPO_DIR" || { echo "ERROR: Failed to enter repository directory '$REPO_DIR'."; exit 1; }
# echo "Current directory: $(pwd)"

# --- Create .env directory if it doesn't exist ---
# Note: Storing a venv inside a directory named '.env' can be confusing,
# as '.env' usually holds environment variable *files*. Consider naming it '.venv' instead.
# Let's stick to '.env' as per your original script for now.
VENV_PARENT_DIR=".env"
VENV_DIR="${VENV_PARENT_DIR}/pytorch"

echo "Checking for virtual environment directory: ${VENV_DIR}"
if [ ! -d "${VENV_PARENT_DIR}" ]; then
    echo "Creating directory: ${VENV_PARENT_DIR}"
    mkdir -p "${VENV_PARENT_DIR}"
fi

# --- Create Python virtual environment if it doesn't exist ---
if [ ! -d "${VENV_DIR}" ]; then
    echo "Creating Python virtual environment: ${VENV_DIR}"
    # Ensure python3 and python3-venv are installed
    if ! command -v python3 &> /dev/null; then
        echo "ERROR: python3 command not found. Please install Python 3."
        exit 1
    fi
    if ! python3 -c "import venv" &> /dev/null; then
         echo "WARN: python3 venv module not found. Attempting to install python3-venv..."
         sudo apt-get install -y python3-venv || { echo "ERROR: Failed to install python3-venv. Please install it manually."; exit 1; }
    fi
    python3 -m venv "${VENV_DIR}" || { echo "ERROR: Failed to create virtual environment."; exit 1; }
else
    echo "Virtual environment '${VENV_DIR}' already exists."
fi

# --- Activate the virtual environment ---
echo "Activating virtual environment: ${VENV_DIR}"
# Check if the activation script exists before sourcing
if [ ! -f "${VENV_DIR}/bin/activate" ]; then
    echo "ERROR: Activation script not found at '${VENV_DIR}/bin/activate'. Venv creation might have failed."
    exit 1
fi
source "${VENV_DIR}/bin/activate"

# Verify activation (optional but recommended)
if [ -z "$VIRTUAL_ENV" ]; then
    echo "ERROR: Virtual environment activation failed (VIRTUAL_ENV variable not set)."
    exit 1
else
    echo "Virtual environment activated: $VIRTUAL_ENV"
    echo "Python executable: $(which python)"
    echo "Pip executable: $(which pip)"
fi

# --- Install requirements ---
REQUIREMENTS_FILE="requirement.txt" # Corrected filename
echo "Checking for requirements file: ${REQUIREMENTS_FILE}"
if [ ! -f "${REQUIREMENTS_FILE}" ]; then
    echo "ERROR: Requirements file '${REQUIREMENTS_FILE}' not found in the current directory ($(pwd))."
    echo "Make sure you are running this script from your project's root directory and the file exists."
    deactivate || echo "WARN: Failed to deactivate venv." # Attempt cleanup
    exit 1
fi

echo "Installing requirements from ${REQUIREMENTS_FILE}..."
if ! pip install -r "${REQUIREMENTS_FILE}"; then
    echo "ERROR: Failed to install requirements from '${REQUIREMENTS_FILE}'."
    deactivate || echo "WARN: Failed to deactivate venv." # Attempt cleanup
    exit 1
fi
echo "Requirements installed successfully."

# --- Install Jupyter kernel ---
echo "Installing Jupyter kernel..."
if ! python -m ipykernel install --user --name=pytorch --display-name "Python (pytorch)"; then
    echo "ERROR: Failed to install Jupyter kernel."
    deactivate || echo "WARN: Failed to deactivate venv." # Attempt cleanup
    exit 1
fi
echo "Jupyter kernel 'pytorch' installed successfully."

echo "--- Setup Script Finished Successfully ---"
echo "To use the environment, run: source ${VENV_DIR}/bin/activate"