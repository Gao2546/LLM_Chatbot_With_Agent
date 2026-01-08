#!/bin/bash

# --- Script Setup ---
# Exit immediately if a command exits with a non-zero status.
set -e
# Treat unset variables as an error when substituting (optional but recommended).
# set -u
# Cause pipelines to return the exit status of the last command that failed.
set -o pipefail

echo "--- NVM and Node.js Setup Script Started ---"

# --- Determine Package Manager & Sudo ---
PKG_MANAGER=""
INSTALL_CMD=""
UPDATE_CMD=""
INSTALL_OPTS="-y" # Common option for non-interactive install
SUDO_CMD=""
NEEDS_UPDATE=false # Flag for apt

echo "Detecting package manager and checking for sudo..."

# Check for sudo first
if [[ $EUID -ne 0 ]]; then
    if command -v sudo &> /dev/null; then
        SUDO_CMD="sudo"
        echo "Using sudo for privileged operations."
        # Refresh sudo timestamp proactively
        $SUDO_CMD -v
    else
        echo "ERROR: Running as non-root and 'sudo' command not found." >&2
        echo "Please install sudo (e.g., run as root: apt update && apt install sudo) and add your user to the sudo group." >&2
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
    NEEDS_UPDATE=true # Mark that apt might need an update
    echo "Using apt-get (Debian/Ubuntu)."
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    UPDATE_CMD="dnf check-update" # Optional explicit check
    INSTALL_CMD="dnf install"
    echo "Using dnf (Fedora/RHEL/CentOS Stream)."
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    UPDATE_CMD="yum check-update" # Optional explicit check
    INSTALL_CMD="yum install"
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

# --- Helper Function: Update package lists if needed (mainly for apt) ---
update_package_lists_if_needed() {
    if [[ "$NEEDS_UPDATE" == "true" ]]; then
        echo "Running package list update ($UPDATE_CMD)..."
        if ! run_cmd "$UPDATE_CMD"; then
            echo "Error: Failed to update package lists." >&2
            exit 1 # Exit script if update fails
        fi
        NEEDS_UPDATE=false # Prevent running update again
    fi
}

# --- Helper Function: Ensure a command provided by a package is installed ---
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
        # Verify after install
        if ! command -v "$cmd_to_check" &> /dev/null; then
             echo "ERROR: Package '$pkg_name' installed, but command '$cmd_to_check' still not found." >&2
             exit 1
        fi
        echo "Command '$cmd_to_check' (package '$pkg_name') installed successfully."
    else
        echo "Command '$cmd_to_check' is already available."
    fi
}

# --- Ensure Prerequisites ---
ensure_command_installed curl curl
# NVM install script also relies on git, although it might download a tarball if git is missing. Let's ensure git.
ensure_command_installed git git

# --- Install NVM (Node Version Manager) ---
# Use the official method which usually gets the latest release automatically
NVM_INSTALL_URL="https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh" # Fetches latest release tag
NVM_DIR="$HOME/.nvm"

echo "Checking if NVM is already installed in ${NVM_DIR}..."
if [ -d "${NVM_DIR}" ]; then
    echo "NVM directory already exists. Skipping NVM installation."
    echo "If you want to reinstall or update, remove '${NVM_DIR}' first, then re-run."
else
    echo "Installing the latest version of NVM..."
    # Download and execute the install script using the ensured 'curl'
    if ! curl -o- "${NVM_INSTALL_URL}" | bash; then
        echo "ERROR: NVM installation script failed." >&2
        exit 1
    fi
    echo "NVM installation script completed."
fi

# --- Source NVM script to make nvm command available in *this* script session ---
NVM_SCRIPT_PATH="${NVM_DIR}/nvm.sh"
echo "Attempting to source NVM script from ${NVM_SCRIPT_PATH}..."

# Check if the nvm script actually exists before trying to source it
if [ ! -f "${NVM_SCRIPT_PATH}" ]; then
   echo "ERROR: NVM script not found at '${NVM_SCRIPT_PATH}' after installation attempt." >&2
   echo "Something went wrong with the NVM installation or the path is incorrect." >&2
   exit 1
fi

# Source the nvm script. Use '.' which is equivalent to 'source'
# The '\' before '.' prevents potential alias conflicts for '.'
\. "${NVM_SCRIPT_PATH}" # This loads nvm into the current script's environment

# Verify nvm command is available
if ! command -v nvm &> /dev/null; then
    echo "ERROR: 'nvm' command is not available after sourcing. NVM setup failed." >&2
    exit 1
fi
echo "NVM sourced successfully. 'nvm' command is now available for this script."

# --- Install Node.js version 22 using NVM ---
NODE_VERSION="22"
echo "Checking if Node.js version ${NODE_VERSION} is already installed..."
# Use nvm ls to check installed versions without triggering installation
if nvm ls "${NODE_VERSION}" &> /dev/null; then
    echo "Node.js version ${NODE_VERSION} is already installed."
else
    echo "Installing Node.js version ${NODE_VERSION} using nvm..."
    if ! nvm install "${NODE_VERSION}"; then
        echo "ERROR: Failed to install Node.js version ${NODE_VERSION} using nvm." >&2
        exit 1
    fi
    echo "Node.js ${NODE_VERSION} installed successfully."
fi

# Use the installed version
echo "Using Node.js version ${NODE_VERSION}..."
if ! nvm use "${NODE_VERSION}"; then
    echo "ERROR: Failed to switch to Node.js version ${NODE_VERSION} using nvm." >&2
    # This might happen if install seemed successful but wasn't.
    exit 1
fi

# Set the installed version as the default
echo "Setting Node.js version ${NODE_VERSION} as default alias..."
if ! nvm alias default "${NODE_VERSION}"; then
    # This is often non-critical, so just warn
    echo "WARN: Failed to set Node.js ${NODE_VERSION} as default alias." >&2
fi

# Verify Node installation
echo "Verifying Node.js installation..."
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo "Node version: $(node -v)"
    echo "npm version: $(npm -v)"
else
    echo "ERROR: Node or npm command not found after installation and 'nvm use'." >&2
    exit 1
fi

echo "--- NVM and Node.js Setup Script Finished Successfully ---"
echo ""
echo "IMPORTANT:"
echo "NVM has been installed and Node.js ${NODE_VERSION} is configured for this session."
echo "To use 'nvm' and 'node' in your current terminal session outside this script,"
echo "you may need to either:"
echo "  1. Close and reopen your terminal."
echo "  2. Or run: source ${NVM_SCRIPT_PATH}"
echo "The NVM installer likely added sourcing lines to your ~/.bashrc, ~/.zshrc, or ~/.profile."