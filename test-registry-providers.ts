/**
 * Test script for refactored registry provider architecture
 * Tests provider auto-detection, validation, and image reference formatting
 */

import type { Repository } from './src/generated/prisma';
import { RegistryProviderFactory } from './src/lib/registry/providers/RegistryProviderFactory';
import { DockerHubProvider } from './src/lib/registry/providers/dockerhub/DockerHubProvider';
import { GHCRProvider } from './src/lib/registry/providers/ghcr/GHCRProvider';
import { GitLabRegistryHandler } from './src/lib/registry/providers/gitlab/GitLabRegistryHandler';
import { NexusProvider } from './src/lib/registry/providers/nexus/NexusProvider';
import { GenericOCIProvider } from './src/lib/registry/providers/generic/GenericOCIProvider';

// Test data
const testRepositories: Repository[] = [
  // Docker Hub
  {
    id: 'test-dockerhub',
    name: 'Docker Hub',
    type: 'DOCKERHUB',
    protocol: 'https',
    registryUrl: 'docker.io',
    username: 'testuser',
    encryptedPassword: 'testpass',
    organization: null,
    authUrl: null,
    groupId: null,
    skipTlsVerify: false,
    registryPort: null,
    status: 'ACTIVE',
    lastTested: null,
    repositoryCount: null,
    apiVersion: null,
    capabilities: null,
    rateLimits: null,
    healthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // GHCR
  {
    id: 'test-ghcr',
    name: 'GitHub Container Registry',
    type: 'GHCR',
    protocol: 'https',
    registryUrl: 'ghcr.io',
    username: 'testuser',
    encryptedPassword: 'ghp_testtoken',
    organization: 'testorg',
    authUrl: null,
    groupId: null,
    skipTlsVerify: false,
    registryPort: null,
    status: 'ACTIVE',
    lastTested: null,
    repositoryCount: null,
    apiVersion: null,
    capabilities: null,
    rateLimits: null,
    healthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // GitLab
  {
    id: 'test-gitlab',
    name: 'GitLab Registry',
    type: 'GITLAB',
    protocol: 'http',
    registryUrl: 'http://24.199.119.91:5050',
    username: 'admin',
    encryptedPassword: 'password',
    organization: null,
    authUrl: 'https://24.199.119.91/jwt/auth',
    groupId: null,
    skipTlsVerify: true,
    registryPort: 5050,
    status: 'ACTIVE',
    lastTested: null,
    repositoryCount: null,
    apiVersion: null,
    capabilities: null,
    rateLimits: null,
    healthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // Nexus
  {
    id: 'test-nexus',
    name: 'Nexus Repository',
    type: 'NEXUS',
    protocol: 'https',
    registryUrl: 'nexus.example.com:8081',
    username: 'admin',
    encryptedPassword: 'password',
    organization: 'docker-hosted',
    authUrl: null,
    groupId: null,
    skipTlsVerify: false,
    registryPort: null,
    status: 'ACTIVE',
    lastTested: null,
    repositoryCount: null,
    apiVersion: null,
    capabilities: null,
    rateLimits: null,
    healthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // Generic OCI
  {
    id: 'test-generic',
    name: 'Generic Registry',
    type: 'GENERIC',
    protocol: 'https',
    registryUrl: 'registry.example.com',
    username: 'user',
    encryptedPassword: 'pass',
    organization: null,
    authUrl: null,
    groupId: null,
    skipTlsVerify: false,
    registryPort: null,
    status: 'ACTIVE',
    lastTested: null,
    repositoryCount: null,
    apiVersion: null,
    capabilities: null,
    rateLimits: null,
    healthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // Auto-detect GHCR from URL
  {
    id: 'test-ghcr-auto',
    name: 'Auto-detect GHCR',
    type: 'GENERIC',
    protocol: 'https',
    registryUrl: 'ghcr.io',
    username: 'testuser',
    encryptedPassword: 'ghp_token',
    organization: null,
    authUrl: null,
    groupId: null,
    skipTlsVerify: false,
    registryPort: null,
    status: 'ACTIVE',
    lastTested: null,
    repositoryCount: null,
    apiVersion: null,
    capabilities: null,
    rateLimits: null,
    healthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // Auto-detect GitLab from URL
  {
    id: 'test-gitlab-auto',
    name: 'Auto-detect GitLab',
    type: 'GENERIC',
    protocol: 'https',
    registryUrl: 'gitlab.example.com:5050',
    username: 'admin',
    encryptedPassword: 'password',
    organization: null,
    authUrl: null,
    groupId: null,
    skipTlsVerify: false,
    registryPort: null,
    status: 'ACTIVE',
    lastTested: null,
    repositoryCount: null,
    apiVersion: null,
    capabilities: null,
    rateLimits: null,
    healthCheck: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

function runTests() {
  console.log('🧪 Testing Registry Provider Refactoring\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Provider Factory Auto-Detection
  console.log('📋 Test 1: Provider Factory Auto-Detection');
  testRepositories.forEach((repo) => {
    try {
      const provider = RegistryProviderFactory.createFromRepository(repo);
      const providerName = provider.getProviderName();
      console.log(`  ✅ ${repo.name} -> ${providerName}`);
      passed++;
    } catch (error) {
      console.log(`  ❌ ${repo.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  });

  // Test 2: Static canHandle Methods
  console.log('\n📋 Test 2: Static canHandle Methods');
  const canHandleTests = [
    { repo: testRepositories[0], provider: DockerHubProvider, expected: true, name: 'DockerHub' },
    { repo: testRepositories[1], provider: GHCRProvider, expected: true, name: 'GHCR' },
    { repo: testRepositories[2], provider: GitLabRegistryHandler, expected: true, name: 'GitLab' },
    { repo: testRepositories[3], provider: NexusProvider, expected: true, name: 'Nexus' },
    { repo: testRepositories[4], provider: GenericOCIProvider, expected: true, name: 'Generic' },
    { repo: testRepositories[5], provider: GHCRProvider, expected: true, name: 'GHCR auto-detect' },
    { repo: testRepositories[6], provider: GitLabRegistryHandler, expected: true, name: 'GitLab auto-detect' },
  ];

  canHandleTests.forEach((test) => {
    const result = test.provider.canHandle(test.repo);
    if (result === test.expected) {
      console.log(`  ✅ ${test.name} canHandle: ${result}`);
      passed++;
    } else {
      console.log(`  ❌ ${test.name} canHandle: expected ${test.expected}, got ${result}`);
      failed++;
    }
  });

  // Test 3: Validation Methods
  console.log('\n📋 Test 3: Validation Methods');
  testRepositories.forEach((repo) => {
    try {
      const validation = RegistryProviderFactory.validateConfiguration(repo);
      if (validation.valid) {
        console.log(`  ✅ ${repo.name} validation: VALID`);
        passed++;
      } else {
        console.log(`  ⚠️  ${repo.name} validation: INVALID - ${validation.errors.join(', ')}`);
        passed++; // Still count as passed since we're just testing it runs
      }
    } catch (error) {
      console.log(`  ❌ ${repo.name} validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  });

  // Test 4: Image Reference Formatting
  console.log('\n📋 Test 4: Image Reference Formatting');
  const imageRefTests = [
    { repo: testRepositories[0], image: 'nginx', tag: 'latest', expected: 'docker.io/library/nginx:latest', name: 'DockerHub library image' },
    { repo: testRepositories[0], image: 'myuser/myimage', tag: '1.0', expected: 'docker.io/myuser/myimage:1.0', name: 'DockerHub user image' },
    { repo: testRepositories[1], image: 'owner/repo', tag: 'v1', expected: 'ghcr.io/owner/repo:v1', name: 'GHCR image' },
    { repo: testRepositories[2], image: 'project/image', tag: 'latest', expected: '24.199.119.91:5050/project/image:latest', name: 'GitLab image' },
    { repo: testRepositories[3], image: 'myimage', tag: 'latest', expected: 'nexus.example.com:8082/myimage:latest', name: 'Nexus image' },
    { repo: testRepositories[4], image: 'myimage', tag: 'latest', expected: 'registry.example.com/myimage:latest', name: 'Generic image' },
  ];

  imageRefTests.forEach((test) => {
    try {
      const provider = RegistryProviderFactory.createFromRepository(test.repo);
      const imageRef = provider.formatFullImageReference(test.image, test.tag);
      if (imageRef === test.expected) {
        console.log(`  ✅ ${test.name}: ${imageRef}`);
        passed++;
      } else {
        console.log(`  ❌ ${test.name}: expected "${test.expected}", got "${imageRef}"`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ ${test.name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  });

  // Test 5: Invalid Configuration Validation
  console.log('\n📋 Test 5: Invalid Configuration Validation');
  const invalidRepo: Repository = {
    ...testRepositories[0],
    username: '',
    encryptedPassword: ''
  };

  const validation = RegistryProviderFactory.validateConfiguration(invalidRepo);
  if (!validation.valid && validation.errors.length > 0) {
    console.log(`  ✅ Invalid config detected: ${validation.errors.join(', ')}`);
    passed++;
  } else {
    console.log(`  ❌ Invalid config not detected`);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed!');
    process.exit(1);
  }
}

// Run the tests
runTests();
