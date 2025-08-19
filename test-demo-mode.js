#!/usr/bin/env node

/**
 * Simple test script to verify demo mode functionality
 * Run with: DEMO_MODE=true node test-demo-mode.js
 */

const originalEnv = process.env.DEMO_MODE;

// Test 1: Demo mode disabled
console.log('Test 1: Demo mode disabled');
process.env.DEMO_MODE = 'false';
console.log('DEMO_MODE=false should allow write operations');
console.log('✓ Test 1 setup complete\n');

// Test 2: Demo mode enabled
console.log('Test 2: Demo mode enabled');
process.env.DEMO_MODE = 'true';
console.log('DEMO_MODE=true should block POST/PUT/DELETE/PATCH operations');
console.log('✓ Test 2 setup complete\n');

// Restore original environment
process.env.DEMO_MODE = originalEnv;

console.log('Demo mode functionality tests:');
console.log('1. Set DEMO_MODE=true in environment');
console.log('2. Start the application');
console.log('3. Try making a POST request to any /api/ endpoint');
console.log('4. Should receive 403 Forbidden with demo mode message');
console.log('5. GET requests should still work normally');
console.log('\nTo test manually:');
console.log('curl -X POST http://localhost:3000/api/scans (should be blocked)');
console.log('curl -X GET http://localhost:3000/api/scans (should work)');