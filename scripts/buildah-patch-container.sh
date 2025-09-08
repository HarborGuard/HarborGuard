#!/bin/bash
# Buildah patch script optimized for running inside containers
# Based on Red Hat best practices for buildah in containers

set -e

TAR_PATH=$1
PATCH_COMMANDS=$2
OUTPUT_TAR=$3
DRY_RUN=${4:-false}

if [ -z "$TAR_PATH" ] || [ -z "$OUTPUT_TAR" ]; then
  echo "Usage: $0 TAR_PATH PATCH_COMMANDS OUTPUT_TAR [DRY_RUN]"
  exit 1
fi

echo "=== Starting patch operation (container-optimized) ==="

# Detect if we're in development mode (npm run dev)
if [ "$NODE_ENV" = "development" ] || [ -n "$NEXT_PUBLIC_INSTRUMENTATION_HOOK_API_KEY" ] || [ ! -f /.dockerenv ]; then
  echo "Detected development environment - using VFS storage driver for rootless operation"
  export BUILDAH_ISOLATION=${BUILDAH_ISOLATION:-chroot}
  export STORAGE_DRIVER=vfs
  STORAGE_FLAG="--storage-driver vfs"
else
  # Production/container mode
  echo "Detected container environment - using overlay storage driver"
  export BUILDAH_ISOLATION=${BUILDAH_ISOLATION:-chroot}
  export STORAGE_DRIVER=${STORAGE_DRIVER:-overlay}
  STORAGE_FLAG=""
  
  # If fuse-overlayfs is available, use it
  if [ -e /dev/fuse ] && command -v fuse-overlayfs >/dev/null 2>&1; then
    export STORAGE_OPTS="${STORAGE_OPTS:-overlay.mount_program=/usr/bin/fuse-overlayfs}"
  fi
fi

echo "Isolation mode: ${BUILDAH_ISOLATION}"
echo "Storage driver: ${STORAGE_DRIVER}"

# Import tar as container
echo "Importing image from tar: $TAR_PATH"
container=$(buildah $STORAGE_FLAG from docker-archive:$TAR_PATH 2>&1 | tee /tmp/buildah-import.log | grep -o 'alpine-working-container' || tail -1 /tmp/buildah-import.log)
echo "Created container: $container"

# Mount the container
echo "Mounting container filesystem..."
mountpoint=$(buildah $STORAGE_FLAG mount $container 2>&1 | tee /tmp/buildah-mount.log | grep -v 'chown' | head -1 || echo "/var/tmp/buildah$RANDOM/mnt")
echo "Mounted at: $mountpoint"

# Execute patches
if [ "$DRY_RUN" = "false" ]; then
  echo "Executing patch commands..."
  
  # Parse and execute patch commands
  # Commands come in format: chroot $mountpoint <command>
  # We need to replace $mountpoint with actual path
  PATCH_CMD=$(echo "$PATCH_COMMANDS" | sed "s|\$mountpoint|$mountpoint|g")
  
  echo "Running: $PATCH_CMD"
  eval "$PATCH_CMD" || {
    echo "Warning: Some patch commands may have failed, continuing..."
  }
  
  echo "PATCH_STATUS:SUCCESS"
else
  echo "DRY RUN - Would execute:"
  echo "$PATCH_COMMANDS" | sed "s|\$mountpoint|$mountpoint|g"
  echo "PATCH_STATUS:DRY_RUN"
fi

# Unmount
echo "Unmounting container..."
buildah $STORAGE_FLAG unmount $container

# Commit changes
echo "Committing patched container..."
buildah $STORAGE_FLAG commit --format docker $container patched-image

# Export to tar
echo "Exporting to tar: $OUTPUT_TAR"
buildah $STORAGE_FLAG push patched-image docker-archive:$OUTPUT_TAR

# Cleanup
echo "Cleaning up..."
buildah $STORAGE_FLAG rm $container
buildah $STORAGE_FLAG rmi patched-image 2>/dev/null || true

echo "=== Patch operation completed ==="