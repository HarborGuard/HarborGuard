#!/bin/bash
# Wrapper script to run buildah patching operations in unshare environment

set -e

OPERATION=$1
TAR_PATH=$2
PATCH_COMMANDS=$3
OUTPUT_TAR=$4

case "$OPERATION" in
  patch)
    buildah unshare << EOF
# Import tar as container
container=\$(buildah --storage-driver vfs from docker-archive:$TAR_PATH)
echo "CONTAINER_ID:\$container"

# Mount the container
mountpoint=\$(buildah --storage-driver vfs mount \$container)
echo "MOUNT_PATH:\$mountpoint"

# Apply patches (commands passed as argument)
if [ ! -z "$PATCH_COMMANDS" ]; then
  echo "Executing patch commands..."
  eval "$PATCH_COMMANDS"
fi

# Commit the container
buildah --storage-driver vfs commit \$container patched-image

# Export to tar
buildah --storage-driver vfs push patched-image docker-archive:$OUTPUT_TAR

# Cleanup
buildah --storage-driver vfs umount \$container
buildah --storage-driver vfs rm \$container

echo "PATCH_COMPLETE"
EOF
    ;;

  mount)
    buildah unshare << EOF
container=\$(buildah --storage-driver vfs from docker-archive:$TAR_PATH)
mountpoint=\$(buildah --storage-driver vfs mount \$container)
echo "\$container|\$mountpoint"
EOF
    ;;

  *)
    echo "Usage: $0 {patch|mount} TAR_PATH [PATCH_COMMANDS] [OUTPUT_TAR]"
    exit 1
    ;;
esac