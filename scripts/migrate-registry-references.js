#!/usr/bin/env node
/**
 * Migration script to update all code references from image.registry to image.primaryRepository.registryUrl
 * Run this after applying the database migration to remove the registry field
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Files that need updating based on our grep analysis
const filesToUpdate = [
  'scripts/replicate-test-data.ts',
  'src/contexts/AppContext.tsx',
  'src/components/new-scan-modal.tsx',
  'src/components/bulk-scan-modal.tsx',
  'src/components/data-table.tsx',
  'src/app/image/[name]/page.tsx',
  'src/lib/type-utils.ts',
  'src/lib/patcher/PatchExecutorTarUnshare.ts',
  'src/lib/patcher/PatchExecutor.ts',
  'src/components/historical-scans-table.tsx',
  'src/lib/patcher/PatchExecutorTar.ts',
  'src/app/api/scans/upload/route.ts',
  'src/app/api/scans/start/route.ts',
  'src/lib/scanner/DatabaseAdapter.ts',
  'src/app/api/images/name/[name]/route.ts',
  'src/lib/bulk/BulkScanService.ts',
  'src/lib/scanner/ScanExecutor.ts'
];

// Common replacement patterns
const replacements = [
  // Direct property access
  {
    pattern: /\.registry(\s*\|\|||\s*\?\?|\s*\||)/g,
    replacement: '.primaryRepository?.registryUrl$1'
  },
  // Registry checks
  {
    pattern: /image\.registry === 'local'/g,
    replacement: 'image.primaryRepository?.registryUrl === \'local\''
  },
  // Registry concatenation
  {
    pattern: /\$\{image\.registry\}/g,
    replacement: '${image.primaryRepository?.registryUrl}'
  },
  // Registry existence checks
  {
    pattern: /image\.registry(\s*)&&/g,
    replacement: 'image.primaryRepository?.registryUrl$1&&'
  },
  {
    pattern: /image\.registry(\s*)!==(\s*)null/g,
    replacement: 'image.primaryRepository?.registryUrl$1!==$2null'
  },
  // Object spread with registry
  {
    pattern: /registry:\s*([a-zA-Z_$][a-zA-Z0-9_$]*\.)?registry/g,
    replacement: 'registry: $1primaryRepository?.registryUrl'
  }
];

function updateFile(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Apply replacements
  replacements.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      modified = true;
    }
  });

  // Special case handling for complex scenarios
  if (filePath.includes('DatabaseAdapter.ts')) {
    // Handle registry parameter in function signatures
    content = content.replace(
      /request\.registry/g, 
      'request.primaryRepository?.registryUrl'
    );
  }

  if (filePath.includes('ScanExecutor.ts')) {
    // Handle registry parameter checks
    content = content.replace(
      /request\.registry\s*&&\s*request\.registry\s*!==\s*'docker\.io'/g,
      'request.primaryRepository?.registryUrl && request.primaryRepository.registryUrl !== \'docker.io\''
    );
  }

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Updated: ${filePath}`);
    return true;
  } else {
    console.log(`ℹ️  No changes needed: ${filePath}`);
    return false;
  }
}

function addRequiredIncludes() {
  console.log('\n📝 Adding required Prisma includes for primaryRepository...\n');
  
  // Common queries that will need the include
  const queryFilesToUpdate = [
    'src/lib/scanner/DatabaseAdapter.ts',
    'src/app/api/images/name/[name]/route.ts',
    'src/contexts/AppContext.tsx'
  ];

  queryFilesToUpdate.forEach(filePath => {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) return;

    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Add include where Image queries are made
    if (content.includes('prisma.image.findMany') || content.includes('prisma.image.findUnique')) {
      if (!content.includes('primaryRepository: true')) {
        console.log(`⚠️  MANUAL UPDATE NEEDED: Add 'include: { primaryRepository: true }' to Image queries in ${filePath}`);
      }
    }
  });
}

function main() {
  console.log('🚀 Starting migration of registry references...\n');

  let totalUpdated = 0;

  filesToUpdate.forEach(filePath => {
    if (updateFile(filePath)) {
      totalUpdated++;
    }
  });

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Total files checked: ${filesToUpdate.length}`);
  console.log(`   Files updated: ${totalUpdated}`);
  
  addRequiredIncludes();
  
  console.log('\n⚠️  IMPORTANT MANUAL STEPS:');
  console.log('   1. Add Prisma includes for primaryRepository in all Image queries');
  console.log('   2. Update any TypeScript interfaces that reference the registry field');
  console.log('   3. Test all functionality thoroughly before deploying');
  console.log('   4. Run the database migration after code updates are complete');
  
  console.log('\n✨ Migration script completed!');
}

if (require.main === module) {
  main();
}