#!/bin/bash
# Test actual patching of Ubuntu CVE-2025-4802

set -e

echo "Testing real patch for Ubuntu CVE-2025-4802 (libc packages)"

# Export Ubuntu image
echo "Exporting Ubuntu 20.04 to tar..."
docker save -o /tmp/ubuntu-original.tar ubuntu:20.04

# Run patch with actual commands
echo "Applying patches in buildah unshare environment..."

buildah unshare << 'EOF'
set -e

# Import tar as container
echo "Importing tar..."
container=$(buildah --storage-driver vfs from docker-archive:/tmp/ubuntu-original.tar)
echo "Container: $container"

# Mount the container
mountpoint=$(buildah --storage-driver vfs mount $container)
echo "Mounted at: $mountpoint"

# Check current versions
echo "Current libc versions:"
chroot $mountpoint dpkg -l | grep -E "libc-bin|libc6" | head -2

# Update package lists
echo "Updating package lists..."
chroot $mountpoint apt-get update

# Apply the patches for CVE-2025-4802
echo "Installing fixed versions..."
chroot $mountpoint apt-get install -y libc-bin=2.31-0ubuntu9.18 libc6=2.31-0ubuntu9.18 || {
  echo "Failed to install specific versions, trying upgrade instead..."
  chroot $mountpoint apt-get upgrade -y libc-bin libc6
}

# Clean apt cache
chroot $mountpoint apt-get clean
chroot $mountpoint rm -rf /var/lib/apt/lists/*

# Check new versions
echo "Updated libc versions:"
chroot $mountpoint dpkg -l | grep -E "libc-bin|libc6" | head -2

# Commit the container
echo "Committing patched container..."
buildah --storage-driver vfs commit $container ubuntu-patched:latest

# Export to tar
echo "Exporting to tar..."
buildah --storage-driver vfs push ubuntu-patched:latest docker-archive:/tmp/ubuntu-really-patched.tar

# Cleanup
buildah --storage-driver vfs umount $container
buildah --storage-driver vfs rm $container

echo "Patch complete!"
EOF

echo "Loading patched image into Docker..."
docker load -i /tmp/ubuntu-really-patched.tar

echo "Done! Image 'ubuntu-patched:latest' is ready for scanning"