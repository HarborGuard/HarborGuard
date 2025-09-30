#!/bin/bash
# Robust script to execute patch commands
# This script is designed to be sourced or executed with proper variable substitution

set -e

# Arguments
MOUNTPOINT="$1"
COMMANDS_FILE="$2"

if [ -z "$MOUNTPOINT" ] || [ -z "$COMMANDS_FILE" ]; then
  echo "Usage: $0 MOUNTPOINT COMMANDS_FILE"
  exit 1
fi

if [ ! -f "$COMMANDS_FILE" ]; then
  echo "Error: Commands file not found: $COMMANDS_FILE"
  exit 1
fi

echo "Executing patch commands for mountpoint: $MOUNTPOINT"

# Read the commands file line by line and execute each command
# This approach avoids shell quote parsing issues
while IFS= read -r line || [ -n "$line" ]; do
  if [ -n "$line" ]; then
    # Replace $mountpoint placeholder with actual mountpoint
    cmd="${line//\$mountpoint/$MOUNTPOINT}"
    echo "Executing: $cmd"
    eval "$cmd" || {
      echo "Warning: Command failed, continuing: $cmd"
    }
  fi
done < "$COMMANDS_FILE"

echo "All patch commands executed"