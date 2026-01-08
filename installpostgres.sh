#!/bin/bash

# --- Script Setup ---
set -e  # Exit immediately if a command exits with a non-zero status.
# set -u # Treat unset variables as an error (can be noisy, commented out)
set -o pipefail # Causes a pipeline to return the exit status of the last command that exited with a non-zero status

echo "--- PostgreSQL User and Database Setup Script Started ---"

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
        # Update sudo timestamp initially
        if ! $SUDO_CMD -v; then
             echo "ERROR: Failed to validate sudo credentials." >&2
             exit 1
        fi
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
    # Assuming standard package names for Debian/Ubuntu
    PG_SERVER_PKG="postgresql"
    PG_CLIENT_PKG="postgresql-client"
    PG_SERVICE_NAME="postgresql" # systemd service name
    NEEDS_UPDATE=true
    echo "Using apt-get (Debian/Ubuntu)."
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
    UPDATE_CMD="dnf check-update" # Just checks, doesn't update metadata unless needed by install
    INSTALL_CMD="dnf install"
    # Assuming standard package names for Fedora/RHEL Stream
    PG_SERVER_PKG="postgresql-server"
    PG_CLIENT_PKG="postgresql" # Client tools often in main postgresql pkg
    PG_SERVICE_NAME="postgresql" # systemd service name
    # DNF usually doesn't require a separate update command before install
    echo "Using dnf (Fedora/RHEL/CentOS Stream)."
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
    UPDATE_CMD="yum check-update" # Just checks
    INSTALL_CMD="yum install"
    # Assuming standard package names for older RHEL/CentOS
    PG_SERVER_PKG="postgresql-server"
    PG_CLIENT_PKG="postgresql"
    PG_SERVICE_NAME="postgresql"
    echo "Using yum (Older RHEL/CentOS)."
else
    echo "Error: Could not find a supported package manager (apt-get, dnf, or yum)." >&2
    exit 1
fi

# --- Helper Function: Run command with sudo if needed ---
run_cmd() {
    local cmd_string="$*"
    echo "Running: ${SUDO_CMD} ${cmd_string}"
    # Use eval carefully, ensure cmd_string is controlled
    if ! eval "${SUDO_CMD} ${cmd_string}"; then
        echo "Error: Command failed: ${SUDO_CMD} ${cmd_string}" >&2
        return 1
    fi
    return 0
}

# --- Helper Function: Run psql command as postgres user ---
run_psql_cmd() {
    local sql_command="$1"
    local db_name="${2:-postgres}" # Default to 'postgres' db for meta commands
    echo "Running psql command in db '${db_name}': ${sql_command}"
    # Use PGPASSWORD= for peer authentication, -X to ignore .psqlrc
    if ! ${SUDO_CMD} -u postgres PGPASSWORD= psql -X -d "${db_name}" -c "${sql_command}"; then
        echo "Error: psql command failed: ${sql_command}" >&2
        return 1
    fi
    return 0
}

# --- Helper Function: Run psql query (tuples only) as postgres user ---
run_psql_query() {
    local sql_query="$1"
    local db_name="${2:-postgres}" # Default to 'postgres' db
    local result
    # Use PGPASSWORD= for peer authentication, -X ignore .psqlrc, -t tuples only, -A unaligned, -c query
    result=$(${SUDO_CMD} -u postgres PGPASSWORD= psql -X -tAc "${sql_query}" -d "${db_name}" 2>/dev/null)
    local exit_status=$?
    if [[ $exit_status -ne 0 ]]; then
        echo "WARN: psql query failed to execute: ${sql_query}" >&2
        # Return non-zero status but let caller decide if it's fatal
        return $exit_status
    fi
    echo "$result" # Output the result
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
        NEEDS_UPDATE=false # Only update once
    fi
}

# --- Helper Function: Ensure PostgreSQL is installed ---
# Installs both server and client if 'psql' command is missing
ensure_postgresql_installed() {
    echo "Checking for psql command (needed from package '$PG_CLIENT_PKG')..."
    if ! command -v psql &> /dev/null; then
        echo "'psql' command not found. Attempting to install PostgreSQL server and client..."
        update_package_lists_if_needed || exit 1

        # Install both server and client packages
        echo "Installing $PG_SERVER_PKG and $PG_CLIENT_PKG..."
        if ! run_cmd "${INSTALL_CMD} ${INSTALL_OPTS} ${PG_SERVER_PKG} ${PG_CLIENT_PKG}"; then
            echo "ERROR: Failed to install PostgreSQL packages." >&2
            exit 1
        fi

        # Special handling for RHEL/CentOS/Fedora: Initialize DB and enable/start service
        if [[ "$PKG_MANAGER" == "dnf" || "$PKG_MANAGER" == "yum" ]]; then
            # Find the data directory more reliably *after* installation if psql is now available
            # Need to potentially start service first to query it. Risky if initdb needed.
            # Let's try initdb first if default dir looks empty.
             DEFAULT_PG_DATA_DIR="/var/lib/pgsql/data" # Common default on RHEL-likes
             PG_DATA_DIR="$DEFAULT_PG_DATA_DIR"
             if [ ! -f "${PG_DATA_DIR}/postgresql.conf" ]; then
                 echo "PostgreSQL data directory (${PG_DATA_DIR}) seems uninitialized. Attempting initialization..."
                # Find the setup binary (path might vary slightly)
                PG_SETUP_BIN=$(find /usr/ -name "postgresql*-initdb" -o -name "postgresql*-setup" | head -n 1)
                if [[ -n "$PG_SETUP_BIN" ]] && [[ -x "$PG_SETUP_BIN" ]]; then
                    # Different setup commands might exist
                    if [[ "$PG_SETUP_BIN" == *"-setup" ]]; then
                        if ! run_cmd "$PG_SETUP_BIN initdb"; then # RHEL 7 style
                            echo "ERROR: Failed to initialize PostgreSQL database using $PG_SETUP_BIN initdb." >&2
                             exit 1
                        fi
                    elif [[ "$PG_SETUP_BIN" == *"-initdb" ]]; then
                         # May need to be run as postgres user or specify data dir
                         if ! run_cmd "$PG_SETUP_BIN"; then # Newer style? Might auto-detect or use defaults
                              echo "WARN: $PG_SETUP_BIN failed. Trying with -D explicitly." >&2
                              # This often needs to run as postgres user
                              if ! run_cmd "sudo -u postgres $PG_SETUP_BIN -D $PG_DATA_DIR"; then
                                  echo "ERROR: Failed to initialize PostgreSQL database using $PG_SETUP_BIN -D." >&2
                                  exit 1
                              fi
                         fi
                    else
                         echo "WARN: Unrecognized setup binary format: $PG_SETUP_BIN" >&2
                         # Attempt standard initdb as fallback
                         if command -v initdb &> /dev/null; then
                             echo "Attempting standard initdb..."
                             # initdb usually needs to run as the postgres user
                             if ! run_cmd "sudo -u postgres initdb -D $PG_DATA_DIR"; then
                                echo "ERROR: standard initdb failed." >&2
                                exit 1
                             fi
                         else
                              echo "ERROR: Cannot find a suitable initdb command." >&2
                              exit 1
                         fi
                    fi
                    echo "PostgreSQL database initialized."
                 else
                     echo "WARN: Could not find postgresql*-setup or postgresql*-initdb binary to initialize DB automatically." >&2
                     if command -v initdb &> /dev/null; then
                          echo "Attempting standard initdb..."
                          if ! run_cmd "sudo -u postgres initdb -D $PG_DATA_DIR"; then
                             echo "ERROR: standard initdb failed." >&2
                             exit 1
                          fi
                          echo "PostgreSQL database initialized via standard initdb."
                     else
                         echo "ERROR: Cannot find initdb binary. Cannot initialize PostgreSQL DB." >&2
                         exit 1
                     fi
                 fi
            fi

            # Enable and start the service *after* potential initdb
            echo "Ensuring PostgreSQL service (${PG_SERVICE_NAME}) is enabled and started..."
            run_cmd "systemctl enable ${PG_SERVICE_NAME}" || echo "WARN: Failed to enable service ${PG_SERVICE_NAME}."
            if ! run_cmd "systemctl start ${PG_SERVICE_NAME}"; then
                echo "WARN: Failed to start service ${PG_SERVICE_NAME}. Checking status..." >&2
                run_cmd "systemctl status ${PG_SERVICE_NAME}" || true # Show status even if start failed
                # Don't exit yet, maybe it started but reported error?
            fi
        fi

        # Verify psql again after installation and potential service start
        if ! command -v psql &> /dev/null; then
             echo "ERROR: PostgreSQL packages installed, but 'psql' command still not found. Installation failed." >&2
             exit 1
        fi
        echo "PostgreSQL installed successfully."

        # Wait briefly for service to become fully active
        echo "Waiting briefly for the PostgreSQL service to stabilize..."
        sleep 5 # Simple wait, adjust if needed

        # More robust check for service status
        if command -v systemctl &> /dev/null; then
            echo "Checking service status (${PG_SERVICE_NAME})..."
            if ! run_cmd "systemctl is-active --quiet ${PG_SERVICE_NAME}"; then
                 echo "WARN: PostgreSQL service (${PG_SERVICE_NAME}) does not appear to be active after installation and start attempt." >&2
                 echo "Attempting to start it again..."
                 run_cmd "systemctl start ${PG_SERVICE_NAME}" || echo "WARN: Failed to start service again."
                 sleep 3
                 # Final status check
                 if run_cmd "systemctl is-active --quiet ${PG_SERVICE_NAME}"; then
                     echo "PostgreSQL service is now active."
                 else
                     echo "ERROR: PostgreSQL service (${PG_SERVICE_NAME}) failed to start. Please check logs:" >&2
                     run_cmd "systemctl status ${PG_SERVICE_NAME}" || true
                     run_cmd "journalctl -u ${PG_SERVICE_NAME} -n 50 --no-pager" || true
                     exit 1
                 fi
            else
                echo "PostgreSQL service is active."
            fi
        else
             echo "WARN: systemctl not found. Cannot verify service status automatically."
        fi

    else
        echo "'psql' command found. Assuming PostgreSQL server is installed."
        # Optional: Check service status even if psql exists, but don't fail if it's inactive initially
        if command -v systemctl &> /dev/null; then
             if ! ${SUDO_CMD} systemctl is-active --quiet ${PG_SERVICE_NAME}; then
                  echo "INFO: 'psql' found, but service '${PG_SERVICE_NAME}' is not currently active."
                  # Attempt to start it? Or just warn? Let's try starting it gently.
                  echo "Attempting to start service '${PG_SERVICE_NAME}'..."
                  if run_cmd "systemctl start ${PG_SERVICE_NAME}"; then
                      sleep 2
                      if ${SUDO_CMD} systemctl is-active --quiet ${PG_SERVICE_NAME}; then
                          echo "Service '${PG_SERVICE_NAME}' started successfully."
                      else
                          echo "WARN: Service '${PG_SERVICE_NAME}' failed to start. Manual check needed." >&2
                          run_cmd "systemctl status ${PG_SERVICE_NAME}" || true
                      fi
                  else
                       echo "WARN: Failed to issue start command for service '${PG_SERVICE_NAME}'. Manual check needed." >&2
                  fi
             else
                 echo "PostgreSQL service '${PG_SERVICE_NAME}' is active."
             fi
        fi
    fi
}

# --- Ensure PostgreSQL is Installed and Running ---
ensure_postgresql_installed

# --- Get Database User Credentials ---
DEFAULT_DB_USER="athip"
read -p "Enter PostgreSQL username to create [${DEFAULT_DB_USER}]: " DB_USER
DB_USER="${DB_USER:-$DEFAULT_DB_USER}" # Use default if empty

# Validate username (basic check: avoid empty, spaces, starting with dash)
if [[ -z "$DB_USER" ]] || [[ "$DB_USER" =~ \s ]] || [[ "$DB_USER" == -* ]]; then
    echo "ERROR: Invalid username specified." >&2
    exit 1
fi

# Prompt for password securely
while true; do
    read -sp "Enter password for user '${DB_USER}': " DB_PASSWORD
    echo # Newline after prompt
    read -sp "Confirm password: " DB_PASSWORD_CONFIRM
    echo # Newline after prompt
    if [[ "$DB_PASSWORD" == "$DB_PASSWORD_CONFIRM" ]]; then
        if [[ -z "$DB_PASSWORD" ]]; then
            echo "Password cannot be empty. Please try again."
        else
            break # Passwords match and are not empty
        fi
    else
        echo "Passwords do not match. Please try again."
    fi
done


# --- Create the PostgreSQL user ---
echo "Checking if PostgreSQL user '${DB_USER}' already exists..."
USER_EXISTS=$(run_psql_query "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'")

if [[ "$USER_EXISTS" == "1" ]]; then
    echo "PostgreSQL user '${DB_USER}' already exists. Skipping creation."
    # Optional: Offer to update password?
    # read -p "User '${DB_USER}' exists. Update password? (y/N): " UPDATE_PW
    # if [[ "$UPDATE_PW" =~ ^[Yy]$ ]]; then
    #     echo "Updating password for user '${DB_USER}'..."
    #     SQL_SAFE_PASSWORD=$(echo "$DB_PASSWORD" | sed "s/'/''/g")
    #     ALTER_SQL="ALTER USER \"${DB_USER}\" WITH PASSWORD '${SQL_SAFE_PASSWORD}';"
    #     if ! run_psql_cmd "$ALTER_SQL"; then
    #         echo "ERROR: Failed to update password for user '${DB_USER}'." >&2
    #         # Consider exiting or just warning
    #     else
    #          echo "Password for user '${DB_USER}' updated."
    #     fi
    # fi
else
    echo "User '${DB_USER}' does not exist. Creating..."
    # Escape single quotes within the password for SQL
    SQL_SAFE_PASSWORD=$(echo "$DB_PASSWORD" | sed "s/'/''/g")

    # Execute the CREATE USER command - Use double quotes for the username identifier
    CREATE_SQL="CREATE USER \"${DB_USER}\" WITH PASSWORD '${SQL_SAFE_PASSWORD}' CREATEDB;"
    if run_psql_cmd "$CREATE_SQL"; then
        echo "PostgreSQL user '${DB_USER}' created successfully."
    else
        echo "ERROR: Failed to create PostgreSQL user '${DB_USER}'." >&2
        # Double-check if it exists now, in case of non-fatal error reporting
        POST_CREATE_CHECK=$(run_psql_query "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'")
        if [[ "$POST_CREATE_CHECK" != "1" ]]; then
             exit 1 # Exit if creation truly failed
        else
             echo "WARN: User '${DB_USER}' seems to exist now despite reported error during creation." >&2
        fi
    fi
fi

# --- Create the PostgreSQL Database ---
DEFAULT_DB_NAME="${DB_USER}" # Default database name same as user
read -p "Enter PostgreSQL database name to create [${DEFAULT_DB_NAME}]: " DB_NAME
DB_NAME="${DB_NAME:-$DEFAULT_DB_NAME}"

# Validate database name (similar basic check to username)
if [[ -z "$DB_NAME" ]] || [[ "$DB_NAME" =~ \s ]] || [[ "$DB_NAME" == -* ]]; then
    echo "ERROR: Invalid database name specified." >&2
    exit 1
fi

echo "Checking if PostgreSQL database '${DB_NAME}' already exists..."
DB_EXISTS=$(run_psql_query "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")

DATABASE_CREATED=false
if [[ "$DB_EXISTS" == "1" ]]; then
    echo "PostgreSQL database '${DB_NAME}' already exists. Skipping creation."
else
    echo "Database '${DB_NAME}' does not exist. Creating..."
    # Use double quotes for the database identifier
    CREATE_DB_SQL="CREATE DATABASE \"${DB_NAME}\";"
    if run_psql_cmd "$CREATE_DB_SQL"; then
        echo "PostgreSQL database '${DB_NAME}' created successfully."
        DATABASE_CREATED=true
    else
        echo "ERROR: Failed to create PostgreSQL database '${DB_NAME}'." >&2
        # Check if it exists now anyway
        POST_CREATE_DB_CHECK=$(run_psql_query "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")
        if [[ "$POST_CREATE_DB_CHECK" != "1" ]]; then
             exit 1 # Exit if creation truly failed
        else
             echo "WARN: Database '${DB_NAME}' seems to exist now despite reported error during creation." >&2
             DATABASE_CREATED=true # Assume it's usable if it exists
        fi
    fi
fi

# --- Grant Ownership of the Database ---
# Only attempt if the DB exists (either pre-existing or just created)
if [[ "$DB_EXISTS" == "1" || "$DATABASE_CREATED" == true ]]; then
    echo "Checking ownership of database '${DB_NAME}'..."
    # Get current owner ID (oid), then map oid to username
    OWNER_OID=$(run_psql_query "SELECT datdba FROM pg_database WHERE datname='${DB_NAME}'")
    CURRENT_OWNER=""
    if [[ -n "$OWNER_OID" ]]; then
        CURRENT_OWNER=$(run_psql_query "SELECT rolname FROM pg_roles WHERE oid = ${OWNER_OID}")
    fi

    if [[ "$CURRENT_OWNER" == "$DB_USER" ]]; then
        echo "User '${DB_USER}' already owns database '${DB_NAME}'. Skipping ownership grant."
    else
        echo "Assigning ownership of database '${DB_NAME}' to user '${DB_USER}'..."
        # Use double quotes for both identifiers
        OWNER_SQL="ALTER DATABASE \"${DB_NAME}\" OWNER TO \"${DB_USER}\";"
        if run_psql_cmd "$OWNER_SQL"; then
            echo "Ownership of database '${DB_NAME}' granted to user '${DB_USER}'."
        else
            echo "ERROR: Failed to grant ownership of database '${DB_NAME}' to user '${DB_USER}'." >&2
            # This might not be fatal, but indicates a potential issue
            # Exit 1 # Decide if this should be fatal
        fi
    fi
else
     echo "Skipping ownership grant because database '${DB_NAME}' was not found or creation failed."
fi


# --- Optional: Grant other privileges ---
# Example: Grant all privileges on the new database to the new user
# This is a common requirement after creating a user/db pair.
GRANT_ALL_SQL="GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";"
echo "Granting ALL privileges on database '${DB_NAME}' to user '${DB_USER}'..."
# Need to connect to the specific database to grant privileges *within* it (like on tables)
# But GRANT ALL ON DATABASE is a database-level command run from 'postgres' or another db.
if run_psql_cmd "$GRANT_ALL_SQL"; then
    echo "ALL privileges granted on database '${DB_NAME}' to '${DB_USER}'."
    echo "Note: This grants privileges *on the database object itself* (like CONNECT)."
    echo "To grant privileges on tables *within* the database, connect to '${DB_NAME}' and run e.g.:"
    echo "GRANT ALL ON ALL TABLES IN SCHEMA public TO \"${DB_USER}\";"
    echo "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO \"${DB_USER}\";"
    echo "GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO \"${DB_USER}\";"
else
    echo "WARN: Failed to grant ALL privileges on database '${DB_NAME}'. Manual check needed." >&2
fi


echo "--- PostgreSQL User and Database Setup Script Finished ---"
echo "User '${DB_USER}' and database '${DB_NAME}' should now be configured."
echo "Ownership assigned: Yes (if created or needed)"
echo "Basic privileges granted: Yes (if successful)"

exit 0