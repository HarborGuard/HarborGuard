#!/bin/bash
# Test Alpine patching directly

set -e

echo "Testing Alpine patch operation..."

# Export node:14-alpine to tar
echo "Exporting node:14-alpine..."
docker save -o /tmp/test-node14.tar node:14-alpine

# Run patch with DNS setup
buildah unshare << 'EOF'
set -e

echo "=== Starting test patch ==="

# Import tar
container=$(buildah --storage-driver vfs from docker-archive:/tmp/test-node14.tar)
echo "Container: $container"

# Mount
mountpoint=$(buildah --storage-driver vfs mount $container)
echo "Mount: $mountpoint"

# Setup DNS
echo "Setting up DNS..."
cp /etc/resolv.conf $mountpoint/etc/resolv.conf

# Check current versions
echo "Current package versions:"
chroot $mountpoint apk list --installed | grep -E "lib(ssl|crypto)3"

# Test network connectivity
echo "Testing network..."
chroot $mountpoint wget -O /dev/null -q https://dl-cdn.alpinelinux.org/alpine/v3.17/main/x86_64/APKINDEX.tar.gz && echo "Network OK" || echo "Network FAILED"

# Try to update
echo "Updating APK..."
chroot $mountpoint apk update

# List available upgrades
echo "Available upgrades:"
chroot $mountpoint apk list --upgradable | grep -E "lib(ssl|crypto)3" || true

# Try to upgrade
echo "Upgrading packages..."
chroot $mountpoint apk upgrade libssl3 libcrypto3

# Check new versions
echo "New package versions:"
chroot $mountpoint apk list --installed | grep -E "lib(ssl|crypto)3"

# Cleanup
buildah --storage-driver vfs umount $container
buildah --storage-driver vfs rm $container

echo "=== Test complete ==="
EOF