/**
 * Static OpenAPI specification for production builds
 * This is generated at build time and embedded in the code
 */

import generatedSpec from '@/generated/openapi.json';

export function getStaticOpenApiSpec() {
  return generatedSpec;
}