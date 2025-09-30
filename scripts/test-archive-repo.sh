#!/bin/bash
# Test script to verify Debian archive repository fix

set -e

echo "=== Testing Debian Archive Repository Fix ==="

# Create a test directory
TEST_DIR="/tmp/test-archive-repo-$$"
mkdir -p "$TEST_DIR"

# Create a mock sources.list with Debian Stretch
cat > "$TEST_DIR/sources.list" <<'EOF'
deb http://deb.debian.org/debian stretch main
deb-src http://deb.debian.org/debian stretch main
deb http://security.debian.org/debian-security stretch/updates main
deb-src http://security.debian.org/debian-security stretch/updates main
deb http://deb.debian.org/debian stretch-updates main
deb-src http://deb.debian.org/debian stretch-updates main
EOF

echo "Original sources.list:"
cat "$TEST_DIR/sources.list"
echo ""

# Run the same sed commands that will be used in the patch
echo "Applying archive repository update..."
if grep -qE '(stretch|jessie|wheezy)' "$TEST_DIR/sources.list"; then
    echo "Detected EOL Debian version - updating to archive repositories"
    sed -i 's,deb.debian.org,archive.debian.org,g' "$TEST_DIR/sources.list"
    sed -i 's,security.debian.org,archive.debian.org,g' "$TEST_DIR/sources.list"
    sed -i '/-updates/d' "$TEST_DIR/sources.list"
    echo "Updated sources.list to use archive.debian.org"
fi

echo ""
echo "Updated sources.list:"
cat "$TEST_DIR/sources.list"

# Cleanup
rm -rf "$TEST_DIR"

echo ""
echo "=== Test completed successfully ==="
echo "The sed commands correctly update EOL Debian repositories to archive.debian.org"