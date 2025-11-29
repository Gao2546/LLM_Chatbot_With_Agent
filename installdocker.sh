#!/bin/bash

# --- Script Setup ---
set -e
# set -u
set -o pipefail

echo "--- Prerequisite Check Script Started ---"

# --- Determine Package Manager & Sudo ---
PKG_MANAGER=""
INSTALL_CMD=""
UPDATE_CMD=""
CHECK_PKG_CMD=""
INSTALL_OPTS="-y"
SUDO_CMD=""
NEEDS_UPDATE=false

echo "Detecting package manager and checking for sudo..."

# Check for sudo first
if [[ $EUID -ne 0 ]]; then
    if command -v sudo &> /dev/null; then
        SUDO_CMD="sudo"
        echo "Using sudo for privileged operations."
        $SUDO_CMD -v
    else
        echo "ERROR: Running as non-root and 'sudo' command not found." >&2
        exit 1
    fi
else
    echo "Running as root."
fi

# Detect package manager
if command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt"
    UPDATE_CMD="apt-get update"
    INSTALL_CMD="apt-get install"
    CHECK_PKG_CMD="dpkg -s" # Check command for apt
    NEEDS_UPDATE=true
    echo "Using apt-get (Debian/Ubuntu)."
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    UPDATE_CMD="dnf check-update"
    INSTALL_CMD="dnf install"
    CHECK_PKG_CMD="rpm -q" # Check command for dnf/yum
    echo "Using dnf (Fedora/RHEL/CentOS Stream)."
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    UPDATE_CMD="yum check-update"
    INSTALL_CMD="yum install"
    CHECK_PKG_CMD="rpm -q"
    echo "Using yum (Older RHEL/CentOS)."
else
    echo "Error: Could not find a supported package manager (apt-get, dnf, or yum)." >&2
    exit 1
fi

# --- Helper Function: Run command with sudo if needed ---
run_cmd() {
    local cmd_string="$*"
    echo "Running: ${SUDO_CMD} ${cmd_string}"
    if ! eval "${SUDO_CMD} ${cmd_string}"; then
        echo "Error: Command failed: ${SUDO_CMD} ${cmd_string}" >&2
        return 1
    fi
    return 0
}

# --- Helper Function: Update package lists if needed ---
update_package_lists_if_needed() {
    if [[ "$NEEDS_UPDATE" == "true" ]]; then
        echo "Running package list update ($UPDATE_CMD)..."
        if ! run_cmd "$UPDATE_CMD"; then
            echo "Error: Failed to update package lists." >&2
            exit 1
        fi
        NEEDS_UPDATE=false
    fi
}

# --- Helper Function: Ensure a command is available ---
# Usage: ensure_command_installed <command_to_check> <package_name>
ensure_command_installed() {
    local cmd_to_check="$1"
    local pkg_name="$2"

    echo "Checking for command '$cmd_to_check' (package '$pkg_name')..."
    if ! command -v "$cmd_to_check" &> /dev/null; then
        echo "Command '$cmd_to_check' not found. Attempting to install package '$pkg_name'..."
        update_package_lists_if_needed || exit 1
        if ! run_cmd "${INSTALL_CMD} ${INSTALL_OPTS} ${pkg_name}"; then
            echo "ERROR: Failed to install package '$pkg_name'." >&2
            exit 1
        fi
        if ! command -v "$cmd_to_check" &> /dev/null; then
             echo "ERROR: Package '$pkg_name' installed, but command '$cmd_to_check' still not found." >&2
             exit 1
        fi
        echo "Command '$cmd_to_check' (package '$pkg_name') installed successfully."
    else
        echo "Command '$cmd_to_check' is already available."
    fi
}

# --- Helper Function: Ensure a package is installed (using package name) ---
# Usage: ensure_package_installed <package_name>
ensure_package_installed() {
    local pkg_name="$1"
    local check_command="${CHECK_PKG_CMD} ${pkg_name}"

    echo "Checking for package '$pkg_name'..."
    # Run the check command, suppress output on success
    if ! eval "$check_command" &> /dev/null; then
        echo "Package '$pkg_name' not found. Attempting to install..."
        update_package_lists_if_needed || exit 1
        if ! run_cmd "${INSTALL_CMD} ${INSTALL_OPTS} ${pkg_name}"; then
             echo "ERROR: Failed to install package '$pkg_name'." >&2
             exit 1
        fi
        # Verify install
        if ! eval "$check_command" &> /dev/null; then
             echo "ERROR: Package '$pkg_name' installed, but check command still fails." >&2
             exit 1
        fi
        echo "Package '$pkg_name' installed successfully."
    else
         echo "Package '$pkg_name' is already installed."
    fi
}

# --- Check and Install Core Prerequisites ---
echo "Checking core prerequisites..."
ensure_command_installed curl curl
ensure_package_installed ca-certificates

# --- Check for Docker and Docker Compose (V2) ---
# We will *not* install these automatically, just check and warn.
echo "Checking for Docker and Docker Compose (V2)..."
DOCKER_MISSING=false
COMPOSE_MISSING=false

if ! command -v docker &> /dev/null; then
    echo "WARNING: 'docker' command not found."
    DOCKER_MISSING=true
else
    echo "'docker' command found."
fi

# Check for 'docker compose' (V2 plugin)
# Need to run 'docker compose version' as 'command -v docker compose' doesn't work reliably
if ! docker-compose version &> /dev/null; then
     echo "WARNING: 'docker compose' (V2) command failed or not found."
     COMPOSE_MISSING=true
else
    echo "'docker compose' (V2) command found."
fi

# Provide instructions if missing
if [[ "$DOCKER_MISSING" = true || "$COMPOSE_MISSING" = true ]]; then
    sudo apt-get install docker-compose -y
    echo ""
    echo "Docker Engine and/or Docker Compose V2 are missing."
    echo "Please install Docker Engine for your distribution."
    echo "See: https://docs.docker.com/engine/install/"
    echo "Docker Compose V2 is typically included with Docker Desktop or can be installed as a plugin."
    echo "See: https://docs.docker.com/compose/install/"
    echo "This script will not attempt to install Docker automatically."
    # Optionally exit if Docker is strictly required by subsequent steps
    # echo "ERROR: Docker is required to proceed." >&2
    # exit 1
fi

# --- Helper Function: Install NVIDIA Container Toolkit (Debian/Ubuntu only) ---
install_nvidia_toolkit() {
    if [[ "$PKG_MANAGER" != "apt" ]]; then
        echo "Skipping NVIDIA Container Toolkit installation (not using apt)."
        return 0
    fi

    echo "--- Installing NVIDIA Container Toolkit ---"

    # Check if already installed using the standard check command
    local check_command="${CHECK_PKG_CMD} nvidia-container-toolkit"
    if eval "$check_command" &> /dev/null; then
        echo "NVIDIA Container Toolkit is already installed."
        return 0
    fi

    echo "Adding NVIDIA Container Toolkit repository..."
    # Add GPG key using run_cmd
    if ! run_cmd "curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg"; then
        echo "ERROR: Failed to add NVIDIA GPG key." >&2
        return 1 # Use return instead of exit inside function
    fi

    # Add repository source list
    # Use a temporary file to avoid permission issues with tee inside pipe and handle sudo
    local temp_list_file
    temp_list_file=$(mktemp)
    if ! curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > "$temp_list_file"; then
        echo "ERROR: Failed to download NVIDIA repository list." >&2
        rm -f "$temp_list_file"
        return 1
    fi
    # Use cat and pipe to tee within run_cmd to handle sudo correctly for the destination file
    if ! run_cmd "tee /etc/apt/sources.list.d/nvidia-container-toolkit.list < $temp_list_file"; then
         echo "ERROR: Failed to write NVIDIA repository list." >&2
         rm -f "$temp_list_file"
         return 1
    fi
    # Clean up the temporary file regardless of tee success/failure
    rm -f "$temp_list_file"
    echo "NVIDIA repository added."

    echo "Updating package lists for NVIDIA repository..."
    # Use run_cmd which already calls the correct update command
    if ! run_cmd "$UPDATE_CMD"; then
        echo "Error: Failed to update package lists after adding NVIDIA repo." >&2
        return 1
    fi

    echo "Installing nvidia-container-toolkit package..."
    # Use run_cmd which already calls the correct install command
    if ! run_cmd "${INSTALL_CMD} ${INSTALL_OPTS} nvidia-container-toolkit"; then
        echo "ERROR: Failed to install nvidia-container-toolkit." >&2
        return 1
    fi

    # Verify install
    if ! eval "$check_command" &> /dev/null; then
         echo "ERROR: Package 'nvidia-container-toolkit' installed, but check command still fails." >&2
         return 1
    fi

    echo "NVIDIA Container Toolkit installed successfully."
    echo "Configuring NVIDIA Container Toolkit for Docker..."
    # Check if nvidia-ctk is available
    if ! command -v nvidia-ctk &> /dev/null; then
        echo "ERROR: 'nvidia-ctk' command not found after installation." >&2
        return 1
    fi
    # Configure the runtime for Docker
    if ! run_cmd "nvidia-ctk runtime configure --runtime=docker"; then
        echo "ERROR: Failed to configure NVIDIA Container Toolkit for Docker." >&2
        return 1
    fi
    echo "NVIDIA Container Toolkit configured for Docker successfully."
    # Restart Docker to apply changes
    echo "Restarting Docker service..."
    if ! run_cmd "systemctl restart docker"; then
        echo "ERROR: Failed to restart Docker service." >&2
        return 1
    fi
    echo "Docker service restarted."

    echo "--- NVIDIA Container Toolkit Installation Finished ---"
    return 0
}

# --- Install NVIDIA Toolkit if applicable ---
echo "Checking and installing NVIDIA Container Toolkit if needed..."
install_nvidia_toolkit || exit 1 # Exit script if NVIDIA install fails

echo ""
echo "--- Prerequisite Check Script Finished ---"
exit 0