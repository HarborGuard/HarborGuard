#!/usr/bin/env node

/**
 * Test script to demonstrate the scan queue functionality
 * This script will attempt to start multiple scans and show how they are queued
 */

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

async function testQueue() {
  console.log('Testing scan queue with maxConcurrentScans...\n');
  console.log('Note: maxConcurrentScans is set to', process.env.MAX_CONCURRENT_SCANS || 3);
  console.log('-------------------------------------------\n');

  const testImages = [
    { image: 'nginx', tag: 'latest' },
    { image: 'alpine', tag: '3.18' },
    { image: 'ubuntu', tag: '22.04' },
    { image: 'node', tag: '18-alpine' },
    { image: 'redis', tag: '7-alpine' },
    { image: 'postgres', tag: '15-alpine' }
  ];

  const scanRequests = [];

  // Start all scans rapidly
  console.log('Starting 6 scan requests...\n');
  
  for (const img of testImages) {
    try {
      const response = await fetch(`${API_BASE}/api/scans/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: img.image,
          tag: img.tag,
          source: 'registry'
        })
      });

      const data = await response.json();
      scanRequests.push(data);
      
      if (data.queued) {
        console.log(`✓ ${img.image}:${img.tag} - QUEUED at position ${data.queuePosition}`);
        if (data.estimatedWaitTime) {
          console.log(`  Estimated wait: ${Math.round(data.estimatedWaitTime / 1000)}s`);
        }
      } else {
        console.log(`✓ ${img.image}:${img.tag} - STARTED immediately`);
      }
    } catch (error) {
      console.error(`✗ ${img.image}:${img.tag} - Failed:`, error.message);
    }
  }

  console.log('\n-------------------------------------------');
  console.log('Checking queue status...\n');

  // Check queue status
  try {
    const response = await fetch(`${API_BASE}/api/scans/queue`);
    const queueStatus = await response.json();
    
    console.log('Queue Statistics:');
    console.log(`  Running: ${queueStatus.stats.running}`);
    console.log(`  Queued: ${queueStatus.stats.queued}`);
    console.log(`  Completed: ${queueStatus.stats.completed}`);
    
    if (queueStatus.queued.length > 0) {
      console.log('\nQueued Scans:');
      queueStatus.queued.forEach(scan => {
        console.log(`  - ${scan.image} (position: ${scan.position})`);
      });
    }
    
    if (queueStatus.running.length > 0) {
      console.log('\nRunning Scans:');
      queueStatus.running.forEach(scan => {
        console.log(`  - ${scan.image}`);
      });
    }
  } catch (error) {
    console.error('Failed to get queue status:', error.message);
  }

  console.log('\n-------------------------------------------');
  console.log('Test complete!');
  console.log('\nThe queue ensures that only maxConcurrentScans images');
  console.log('are scanned at once, with others waiting in the queue.');
  console.log('\nAs scans complete, queued scans automatically start.');
}

// Run the test
testQueue().catch(console.error);