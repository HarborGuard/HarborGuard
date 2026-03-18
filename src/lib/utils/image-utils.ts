/**
 * Parse a Docker image reference into name and tag.
 * Handles formats like:
 * - "nginx" -> { name: "nginx", tag: "latest" }
 * - "nginx:1.21" -> { name: "nginx", tag: "1.21" }
 * - "registry.io/namespace/image:tag" -> { name: "registry.io/namespace/image", tag: "tag" }
 */
export function parseImageRef(ref: string): { name: string; tag: string } {
  if (!ref) return { name: '', tag: 'latest' };
  const lastColon = ref.lastIndexOf(':');
  // If no colon, or colon is part of a port (has / after it), treat whole thing as name
  if (lastColon === -1 || (ref.includes('/') && lastColon < ref.lastIndexOf('/'))) {
    return { name: ref, tag: 'latest' };
  }
  return { name: ref.substring(0, lastColon), tag: ref.substring(lastColon + 1) };
}

export function getImageName(ref: string): string {
  return parseImageRef(ref).name;
}

export function getImageTag(ref: string): string {
  return parseImageRef(ref).tag;
}
