#!/bin/bash
# Properly patch Ubuntu with network access for apt

set -e

echo "Patching Ubuntu 20.04 with proper apt update..."

# First, let's use Docker to create a properly patched image
docker run --name ubuntu-patch-temp ubuntu:20.04 bash -c "
  apt-get update && 
  apt-get install -y libc-bin=2.31-0ubuntu9.18 libc6=2.31-0ubuntu9.18 &&
  apt-get clean &&
  rm -rf /var/lib/apt/lists/*
"

# Commit the patched container
docker commit ubuntu-patch-temp ubuntu-patched-proper:latest

# Clean up
docker rm ubuntu-patch-temp

# Export to tar for buildah workflow
docker save -o /tmp/ubuntu-patched-proper.tar ubuntu-patched-proper:latest

echo "Patched image saved to /tmp/ubuntu-patched-proper.tar"
echo "Now scanning the properly patched image..."