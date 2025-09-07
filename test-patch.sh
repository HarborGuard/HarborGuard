#!/bin/bash

# Test script for buildah patching in unshare environment

echo "Setting up buildah unshare environment..."

buildah unshare << 'EOF'
echo "Inside unshare environment"

# Create working container
container=$(buildah --storage-driver vfs from ubuntu:20.04)
echo "Created container: $container"

# Mount the container
mountpoint=$(buildah --storage-driver vfs mount $container)
echo "Mounted at: $mountpoint"

# Show what needs patching
echo "Checking for libc packages..."
chroot $mountpoint dpkg -l | grep libc

# Simulate patching (dry run)
echo "Would run: chroot $mountpoint apt-get update"
echo "Would run: chroot $mountpoint apt-get install -y libc-bin=2.31-0ubuntu9.18 libc6=2.31-0ubuntu9.18"

# Cleanup
buildah --storage-driver vfs umount $container
buildah --storage-driver vfs rm $container

echo "Test completed"
EOF