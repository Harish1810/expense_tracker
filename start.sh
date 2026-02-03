#!/bin/bash
set -e

echo "=== STARTING APP ==="
echo "Current directory: $(pwd)"
echo "User: $(whoami)"
echo "Environment PORT: '$PORT'"

# Fallback to 5000 if PORT is not set
SERVER_PORT=${PORT:-5000}
echo "Selected Port: $SERVER_PORT"

echo "--- Directory Listing ---"
ls -la
echo "-------------------------"

echo "--- Frontend Build Check ---"
if [ -d "frontend_build" ]; then
    echo "Directory 'frontend_build' exists."
    ls -la frontend_build
else
    echo "CRITICAL: Directory 'frontend_build' MISSING!"
fi
echo "----------------------------"

echo "Starting Gunicorn on 0.0.0.0:$SERVER_PORT..."
# Using --log-level debug to catch any startup issues
exec gunicorn -w 1 -b 0.0.0.0:$SERVER_PORT --access-logfile - --error-logfile - --log-level debug app:app
