#!/bin/bash
# Complete patch operation in buildah unshare environment

set -e

TAR_PATH=$1
PATCH_COMMANDS=$2
OUTPUT_TAR=$3
DRY_RUN=${4:-false}

if [ -z "$TAR_PATH" ] || [ -z "$OUTPUT_TAR" ]; then
  echo "Usage: $0 TAR_PATH PATCH_COMMANDS OUTPUT_TAR [DRY_RUN]"
  exit 1
fi

buildah unshare << EOF
set -e

echo "=== Starting patch operation in buildah unshare ==="

# Import tar as container
echo "Importing tar: $TAR_PATH"
container=\$(buildah --storage-driver vfs from docker-archive:$TAR_PATH)
echo "CONTAINER_ID:\$container"

# Mount the container
echo "Mounting container..."
mountpoint=\$(buildah --storage-driver vfs mount \$container)
echo "MOUNT_PATH:\$mountpoint"

# Apply patches if provided and not dry run
if [ ! -z "$PATCH_COMMANDS" ] && [ "$DRY_RUN" = "false" ]; then
  echo "=== Applying patches ==="
  # Execute patch commands (they should use \$mountpoint variable)
  eval "$PATCH_COMMANDS"
  echo "=== Patches applied ==="
else
  if [ "$DRY_RUN" = "true" ]; then
    echo "=== DRY RUN - Skipping actual patch application ==="
  else
    echo "=== No patch commands provided ==="
  fi
fi

# Commit the container
echo "Committing container..."
buildah --storage-driver vfs commit \$container patched-image

# Export to tar
echo "Exporting to: $OUTPUT_TAR"
buildah --storage-driver vfs push patched-image docker-archive:$OUTPUT_TAR

# Cleanup
echo "Cleaning up..."
buildah --storage-driver vfs umount \$container
buildah --storage-driver vfs rm \$container
buildah --storage-driver vfs rmi patched-image

echo "=== Patch operation complete ==="
echo "PATCH_STATUS:SUCCESS"
EOF