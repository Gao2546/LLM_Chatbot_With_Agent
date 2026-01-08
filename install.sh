#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Determine Package Manager ---
PKG_MANAGER=""
INSTALL_CMD=""
UPDATE_CMD=""
CHECK_PKG_CMD=""
INSTALL_OPTS="-y" # Common option for non-interactive install
NEEDS_UPDATE=false # Flag for apt

echo "Detecting package manager..."

if command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    # dnf often checks metadata automatically, explicit check-update is less critical before install
    UPDATE_CMD="dnf check-update"
    INSTALL_CMD="dnf install"
    CHECK_PKG_CMD="rpm -q"
    echo "Using dnf (Fedora/RHEL/CentOS Stream)."
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    UPDATE_CMD="yum check-update"
    INSTALL_CMD="yum install"
    CHECK_PKG_CMD="rpm -q"
    echo "Using yum (Older RHEL/CentOS)."
elif command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt"
    UPDATE_CMD="apt-get update"
    INSTALL_CMD="apt-get install"
    CHECK_PKG_CMD="dpkg -s"
    NEEDS_UPDATE=true # Mark that apt might need an update before installs
    echo "Using apt-get (Debian/Ubuntu)."
else
    echo "Error: Could not find a supported package manager (apt-get, dnf, or yum)." >&2
    exit 1
fi

# --- Helper Function to run commands with optional sudo ---
run_cmd() {
    local cmd_string="$*"
    local sudo_prefix=""

    if [[ $EUID -ne 0 ]]; then
        if command -v sudo &> /dev/null; then
            sudo_prefix="sudo "
        else
            echo "Warning: Running as non-root and sudo command not found. Operations might fail." >&2
            # Proceed without sudo, maybe permissions allow it
        fi
    fi

    echo "Running: ${sudo_prefix}${cmd_string}"
    # Use eval carefully, ensure cmd_string is constructed safely
    if ! eval "${sudo_prefix}${cmd_string}"; then
        echo "Error: Command failed: ${sudo_prefix}${cmd_string}" >&2
        return 1 # Use return code within function
    fi
    return 0
}


# --- Update package lists if needed (mainly for apt) ---
update_package_lists() {
    if [[ "$NEEDS_UPDATE" == "true" ]]; then
        echo "Running package list update ($UPDATE_CMD)..."
        if ! run_cmd "$UPDATE_CMD"; then
            echo "Error: Failed to update package lists." >&2
            exit 1
        fi
        # Set flag to false so we don't run it again for this script execution
        NEEDS_UPDATE=false
    fi
}

# --- Helper Function for Package Installation (Checks Command) ---
# Usage: ensure_cmd_installed <command_to_check> [package_name]
# If package_name is not provided, it defaults to command_to_check
ensure_cmd_installed() {
    local cmd_to_check="$1"
    local pkg_name="${2:-$1}" # Use command name as package name if not specified

    # Check if command exists
    if ! command -v "$cmd_to_check" &> /dev/null; then
        echo "Command '$cmd_to_check' not found. Attempting to install package '$pkg_name' using $PKG_MANAGER..."

        # Ensure package lists are updated if needed (relevant for apt)
        update_package_lists || exit 1 # Exit if update fails

        # Attempt installation
        if ! run_cmd "${INSTALL_CMD} ${INSTALL_OPTS} ${pkg_name}"; then
             echo "Error: Failed to install '$pkg_name' using $PKG_MANAGER."
             exit 1
        fi

        # Verify command again after installation attempt
        sleep 1 # Small delay just in case
        hash -r 2>/dev/null || true # Reset bash's command lookup cache

        if ! command -v "$cmd_to_check" &> /dev/null; then
            # Special case for pip potentially being pip3
            if [[ "$cmd_to_check" == "pip" ]] && command -v "pip3" &> /dev/null; then
                echo "Note: 'pip3' command found after install instead of 'pip'. Assuming pip3 is sufficient. Continuing..."
            else
              echo "Error: Package '$pkg_name' installed via $PKG_MANAGER, but command '$cmd_to_check' still not found."
              exit 1
            fi
        fi
        echo "'$pkg_name' installation successful (command '$cmd_to_check' is available)."
    else
        echo "Command '$cmd_to_check' is already available."
    fi
}


# --- Helper Function for Package Installation (Checks Package Name) ---
# Usage: ensure_pkg_installed <package_name>
ensure_pkg_installed() {
    local pkg_name="$1"
    local check_command="${CHECK_PKG_CMD} ${pkg_name}"
    local check_needs_sudo=false

    # Some check commands might need sudo if run as non-root (though less common for query)
    # We primarily need sudo for the *install* step if missing.

    echo "Checking for package '$pkg_name'..."
    # Use eval for check command as it varies (dpkg/rpm)
    # Redirect stdout/stderr to prevent clutter on success
    if ! eval "$check_command" &> /dev/null; then
        echo "Package '$pkg_name' not found. Attempting to install using $PKG_MANAGER..."

        # Ensure package lists are updated if needed (relevant for apt)
        update_package_lists || exit 1 # Exit if update fails

        # Attempt installation
        if ! run_cmd "${INSTALL_CMD} ${INSTALL_OPTS} ${pkg_name}"; then
             echo "Error: Failed to install '$pkg_name' using $PKG_MANAGER."
             exit 1
        fi

        # Verify package again after installation attempt
        sleep 1 # Small delay just in case
         if ! eval "$check_command" &> /dev/null; then
             echo "Error: Package '$pkg_name' installed via $PKG_MANAGER, but check command still fails."
             exit 1
         fi
        echo "'$pkg_name' installation successful."
    else
        echo "Package '$pkg_name' is already installed."
    fi
}


# --- Check and Install Prerequisites ---
echo "Checking prerequisites..."

# Package names mapping (adjust if needed for specific distros/versions)
PYTHON_PIP_PKG="python3-pip"
CURL_PKG="curl"
GIT_PKG="git"
PYTHON_CMD="python3"
PYTHON_PKG="python3" # Often just 'python3', sometimes more specific like 'python3.x'
CA_CERTS_PKG="ca-certificates"

# Define which package provides which command if different
ensure_cmd_installed curl "$CURL_PKG"
ensure_cmd_installed git "$GIT_PKG"
ensure_cmd_installed "$PYTHON_CMD" "$PYTHON_PKG"
ensure_cmd_installed pip "$PYTHON_PIP_PKG" # Checks for 'pip' command, installs 'python3-pip' package

# Check for ca-certificates package directly by name
ensure_pkg_installed "$CA_CERTS_PKG"

echo "Prerequisite check complete."
echo # Newline for readability

# --- Argument Parsing ---
INSTALL_COMPONENT=""

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    -i|--install)
      if [[ -z "$2" || "$2" == -* ]]; then # Check if value exists and is not another option
        echo "Error: Option '$1' requires a component name (e.g., all, env, docker)." >&2
        exit 1
      fi
      INSTALL_COMPONENT="$2"
      shift # past argument (-i)
      shift # past value (e.g., "all")
      ;;
    --) # End of options marker
      shift # Remove the --
      break # Stop processing options
      ;;
    -h|--help)
      echo "Usage: $0 -i <component>"
      echo "Components: all, env, docker, postgres, node"
      exit 0
      ;;
    -*)
      # Unknown option
      echo "Error: Unknown option '$1'" >&2
      echo "Use -h or --help for usage." >&2
      exit 1
      ;;
    *)
      # Handle unexpected positional arguments
      echo "Error: Unexpected argument '$1'" >&2
      echo "Use -h or --help for usage." >&2
      exit 1
      ;;
  esac
done

# --- Perform Installation Based on Argument ---
if [[ -n "$INSTALL_COMPONENT" ]]; then
    echo "Processing installation for component: $INSTALL_COMPONENT"
    # Define base directory relative to the script location for robustness
    SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

    case "$INSTALL_COMPONENT" in
        all)
            echo "Installing all components..."
            # Source scripts using the determined script directory
            if [ -f "$SCRIPT_DIR/installenv.sh" ]; then . "$SCRIPT_DIR/installenv.sh"; else echo "Warning: $SCRIPT_DIR/installenv.sh not found."; fi
            if [ -f "$SCRIPT_DIR/installdocker.sh" ]; then . "$SCRIPT_DIR/installdocker.sh"; else echo "Warning: $SCRIPT_DIR/installdocker.sh not found."; fi
            if [ -f "$SCRIPT_DIR/installpostgres.sh" ]; then . "$SCRIPT_DIR/installpostgres.sh"; else echo "Warning: $SCRIPT_DIR/installpostgres.sh not found."; fi
            if [ -f "$SCRIPT_DIR/installnode.sh" ]; then . "$SCRIPT_DIR/installnode.sh"; else echo "Warning: $SCRIPT_DIR/installnode.sh not found."; fi
            echo "Installation of all components attempted."
            ;;
        env)
            echo "Installing env component..."
            if [ -f "$SCRIPT_DIR/installenv.sh" ]; then . "$SCRIPT_DIR/installenv.sh"; else echo "Error: $SCRIPT_DIR/installenv.sh not found."; exit 1; fi
            ;;
        docker)
             echo "Installing docker component..."
            if [ -f "$SCRIPT_DIR/installdocker.sh" ]; then . "$SCRIPT_DIR/installdocker.sh"; else echo "Error: $SCRIPT_DIR/installdocker.sh not found."; exit 1; fi
            ;;
        postgres)
             echo "Installing postgres component..."
            if [ -f "$SCRIPT_DIR/installpostgres.sh" ]; then . "$SCRIPT_DIR/installpostgres.sh"; else echo "Error: $SCRIPT_DIR/installpostgres.sh not found."; exit 1; fi
            ;;
        node)
             echo "Installing node component..."
            if [ -f "$SCRIPT_DIR/installnode.sh" ]; then . "$SCRIPT_DIR/installnode.sh"; else echo "Error: $SCRIPT_DIR/installnode.sh not found."; exit 1; fi
            ;;
        *)
            echo "Error: Unknown installation component '$INSTALL_COMPONENT'" >&2
            echo "Available components: all, env, docker, postgres, node"
            exit 1
            ;;
    esac
else
    echo "No installation component specified. Use -i or --install option."
    echo "Use -h or --help for usage."
    # Decide if this is an error or just informational
    exit 1 # Exit with error if -i is mandatory
fi

echo "Script finished."