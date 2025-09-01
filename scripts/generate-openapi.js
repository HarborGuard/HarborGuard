#!/usr/bin/env node

/**
 * Generate a static OpenAPI specification at build time
 */

const fs = require('fs');
const path = require('path');

// We need to use dynamic import for ESM modules
async function generateStaticSpec() {
  try {
    console.log('[Build] Generating static OpenAPI specification...');
    
    // Import the dynamic spec generator
    const { generateDynamicOpenApiSpec } = await import('../src/lib/openapi-dynamic.ts');
    
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
    
  } catch (error) {
    console.error('[Build] Failed to generate OpenAPI spec:', error);
    // Don't fail the build, just warn
    console.warn('[Build] Using fallback OpenAPI spec');
  }
}

// Run if called directly
if (require.main === module) {
  generateStaticSpec();
}

module.exports = { generateStaticSpec };