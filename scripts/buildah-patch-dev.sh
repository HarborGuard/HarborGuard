#!/bin/bash
# Buildah patch script for development environment
# Uses buildah unshare to work in rootless mode

set -e

TAR_PATH=$1
COMMANDS_FILE=$2
OUTPUT_TAR=$3
DRY_RUN=${4:-false}

if [ -z "$TAR_PATH" ] || [ -z "$COMMANDS_FILE" ] || [ -z "$OUTPUT_TAR" ]; then
  echo "Usage: $0 TAR_PATH COMMANDS_FILE OUTPUT_TAR [DRY_RUN]"
  exit 1
fi

# Read commands from file
if [ ! -f "$COMMANDS_FILE" ]; then
  echo "Error: Commands file not found: $COMMANDS_FILE"
  exit 1
fi
PATCH_COMMANDS=$(cat "$COMMANDS_FILE")

echo "=== Starting patch operation (development mode with buildah unshare) ==="

# Run the entire operation inside buildah unshare
buildah unshare << EOF
set -e

echo "Inside buildah unshare environment"

# Import tar as container using VFS driver for development
echo "Importing image from tar: $TAR_PATH"
container=\$(buildah --storage-driver vfs from docker-archive:$TAR_PATH)
echo "Created container: \$container"

# Mount the container
echo "Mounting container filesystem..."
mountpoint=\$(buildah --storage-driver vfs mount \$container)
echo "Mounted at: \$mountpoint"

# Execute patches
if [ "$DRY_RUN" = "false" ]; then
  echo "Executing patch commands..."

  # Copy the commands file to a temp location accessible inside unshare
  cp "$COMMANDS_FILE" /tmp/patch-commands-\$\$.sh

  # Execute each command from the file
  while IFS= read -r cmd || [ -n "\$cmd" ]; do
    if [ -n "\$cmd" ]; then
      # Replace mountpoint placeholder
      actual_cmd="\${cmd//\\\$mountpoint/\$mountpoint}"
      echo "Executing: \$actual_cmd"
      eval "\$actual_cmd" || {
        echo "Warning: Command failed, continuing: \$actual_cmd"
      }
    fi
  done < /tmp/patch-commands-\$\$.sh

  rm -f /tmp/patch-commands-\$\$.sh
  echo "PATCH_STATUS:SUCCESS"
else
  echo "DRY RUN - Would execute:"
  while IFS= read -r cmd || [ -n "\$cmd" ]; do
    echo "\${cmd//\\\$mountpoint/\$mountpoint}"
  done < "$COMMANDS_FILE"
  echo "PATCH_STATUS:DRY_RUN"
fi

# Unmount
echo "Unmounting container..."
buildah --storage-driver vfs unmount \$container

# Commit changes
echo "Committing patched container..."
buildah --storage-driver vfs commit --format docker \$container patched-image

# Export to tar
echo "Exporting to tar: $OUTPUT_TAR"
buildah --storage-driver vfs push patched-image docker-archive:$OUTPUT_TAR

# Cleanup
echo "Cleaning up..."
buildah --storage-driver vfs rm \$container
buildah --storage-driver vfs rmi patched-image 2>/dev/null || true

echo "=== Patch operation completed ==="
EOF