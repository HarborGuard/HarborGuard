#!/bin/bash

# Build the buildah-enabled image
echo "Building HarborGuard with Buildah support..."
docker build -t harborguard:buildah -f Dockerfile.buildah .

# Stop and remove existing container if it exists
docker stop harborguard-buildah 2>/dev/null || true
docker rm harborguard-buildah 2>/dev/null || true

# Run with all necessary permissions for buildah
echo "Starting HarborGuard with Buildah support..."
docker run -d \
  --name harborguard-buildah \
  --hostname harborguard \
  --cap-add SYS_ADMIN \
  --cap-add SYS_RESOURCE \
  --cap-add SETUID \
  --cap-add SETGID \
  --cap-add SYS_CHROOT \
  --cap-add MKNOD \
  --cap-add AUDIT_WRITE \
  --cap-add SETFCAP \
  --cap-add DAC_OVERRIDE \
  --cap-add FOWNER \
  --cap-add CHOWN \
  --cap-add NET_RAW \
  --cap-add FSETID \
  --security-opt seccomp=unconfined \
  --security-opt apparmor=unconfined \
  --device /dev/fuse \
  --sysctl kernel.unprivileged_userns_clone=1 \
  --sysctl user.max_user_namespaces=28633 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v harborguard-images:/workspace/images \
  -v harborguard-patches:/workspace/patches \
  -v buildah-storage:/home/harborguard/.local/share/containers \
  -e DATABASE_URL="${DATABASE_URL:-postgresql://postgres:testpass@host.docker.internal:5432/harborguard}" \
  -e NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-your-secret-key-here}" \
  -e NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}" \
  -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  harborguard:buildah

echo "HarborGuard is starting..."
echo "Access the application at http://localhost:3000"
echo ""
echo "To view logs:"
echo "  docker logs -f harborguard-buildah"
echo ""
echo "To test buildah functionality:"
echo "  docker exec -it harborguard-buildah buildah --version"
echo "  docker exec -it --user harborguard harborguard-buildah buildah images"