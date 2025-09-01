#!/usr/bin/env tsx

/**
 * Generate a static OpenAPI specification at build time
 */

import fs from 'fs';
import path from 'path';
import { generateDynamicOpenApiSpec } from '../src/lib/openapi-dynamic';

async function generateStaticSpec() {
  try {
    console.log('[Build] Generating static OpenAPI specification...');
    
    // Generate the spec
    const spec = generateDynamicOpenApiSpec();
    
    // Write to a JSON file that can be imported at runtime
    const outputPath = path.join(process.cwd(), 'src', 'generated', 'openapi.json');
    
    // Ensure the directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write the spec
    fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
    
    console.log(`[Build] OpenAPI spec generated successfully with ${Object.keys(spec.paths || {}).length} paths`);
    console.log(`[Build] Written to: ${outputPath}`);
    
    return true;
  } catch (error) {
    console.error('[Build] Failed to generate OpenAPI spec:', error);
    // Don't fail the build, just warn
    console.warn('[Build] Using fallback OpenAPI spec');
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateStaticSpec().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { generateStaticSpec };