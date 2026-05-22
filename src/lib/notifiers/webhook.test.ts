import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import {
  WebhookNotifier,
  computeNewVulnerabilities,
  loadPriorScanCves,
  postWebhook,
  type WebhookPrismaShim,
} from './webhook';

type Finding = {
  cveId: string;
  severity: string;
  cvssScore: number | null;
  packageName: string;
  installedVersion: string | null;
  fixedVersion: string | null;
  description: string | null;
};

function findingsFor(...cveIds: string[]): Finding[] {
  return cveIds.map(id => ({
    cveId: id,
    severity: 'HIGH',
    cvssScore: 7.5,
    packageName: 'pkg',
    installedVersion: '1.0.0',
    fixedVersion: '1.0.1',
    description: 'desc',
  }));
}

function shim(opts: {
  priorScanId?: string;
  priorFindings?: Finding[];
  currentFindings: Finding[];
}): WebhookPrismaShim {
  return {
    scan: {
      async findFirst() {
        return opts.priorScanId ? { id: opts.priorScanId } : null;
      },
    },
    scanVulnerabilityFinding: {
      async findMany(args) {
        if (opts.priorScanId && args.where.scanId === opts.priorScanId) {
          return opts.priorFindings ?? [];
        }
        return opts.currentFindings;
      },
    },
  };
}

async function withServer(
  handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void,
  fn: (url: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}/`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe('computeNewVulnerabilities', () => {
  test('returns all current findings when there is no prior scan', () => {
    const current = findingsFor('CVE-1', 'CVE-2', 'CVE-3');
    const result = computeNewVulnerabilities(current, null);
    assert.equal(result.length, 3);
    assert.deepEqual(result.map(v => v.cveId).sort(), ['CVE-1', 'CVE-2', 'CVE-3']);
    // packageVersion is sourced from installedVersion in the shape mapper
    assert.equal(result[0].packageVersion, '1.0.0');
  });

  test('returns only the diff vs the prior scan', () => {
    const current = findingsFor('CVE-1', 'CVE-2', 'CVE-3');
    const prior = new Set(['CVE-1', 'CVE-3']);
    const result = computeNewVulnerabilities(current, prior);
    assert.equal(result.length, 1);
    assert.equal(result[0].cveId, 'CVE-2');
  });

  test('returns empty array when current ⊆ prior', () => {
    const current = findingsFor('CVE-1', 'CVE-2');
    const prior = new Set(['CVE-1', 'CVE-2', 'CVE-3']);
    assert.deepEqual(computeNewVulnerabilities(current, prior), []);
  });
});

describe('loadPriorScanCves', () => {
  test('returns null when no prior scan exists', async () => {
    const client = shim({ currentFindings: [] });
    const result = await loadPriorScanCves(client, 'image-1', 'latest', 'scan-current');
    assert.equal(result, null);
  });

  test('returns the prior scan id and its CVE set', async () => {
    const client = shim({
      priorScanId: 'scan-prior',
      priorFindings: findingsFor('CVE-X', 'CVE-Y'),
      currentFindings: [],
    });
    const result = await loadPriorScanCves(client, 'image-1', 'latest', 'scan-current');
    assert.notEqual(result, null);
    assert.equal(result!.priorScanId, 'scan-prior');
    assert.deepEqual([...result!.cves].sort(), ['CVE-X', 'CVE-Y']);
  });
});

describe('postWebhook', () => {
  test('returns true on a 2xx response', async () => {
    await withServer(
      (_req, res) => {
        res.writeHead(200);
        res.end();
      },
      async url => {
        const ok = await postWebhook(url, {}, '{}', 5000);
        assert.equal(ok, true);
      },
    );
  });

  test('does not retry on 4xx; returns false', async () => {
    let attempts = 0;
    await withServer(
      (_req, res) => {
        attempts += 1;
        res.writeHead(401);
        res.end();
      },
      async url => {
        const ok = await postWebhook(url, {}, '{}', 5000);
        assert.equal(ok, false);
        assert.equal(attempts, 1);
      },
    );
  });

  test('retries on 5xx and eventually succeeds', async () => {
    let attempts = 0;
    await withServer(
      (_req, res) => {
        attempts += 1;
        if (attempts < 3) {
          res.writeHead(503);
          res.end();
          return;
        }
        res.writeHead(200);
        res.end();
      },
      async url => {
        const ok = await postWebhook(url, {}, '{}', 5000);
        assert.equal(ok, true);
        assert.equal(attempts, 3);
      },
    );
  });

  test('retries on 5xx up to 4 attempts and reports failure', async () => {
    let attempts = 0;
    await withServer(
      (_req, res) => {
        attempts += 1;
        res.writeHead(500);
        res.end();
      },
      async url => {
        const ok = await postWebhook(url, {}, '{}', 5000);
        assert.equal(ok, false);
        assert.equal(attempts, 4);
      },
    );
  });

  test('forwards extra headers', async () => {
    let seenAuth: string | undefined;
    await withServer(
      (req, res) => {
        seenAuth = req.headers.authorization;
        res.writeHead(200);
        res.end();
      },
      async url => {
        await postWebhook(url, { Authorization: 'Bearer xyz' }, '{}', 5000);
        assert.equal(seenAuth, 'Bearer xyz');
      },
    );
  });

  test('aborts on timeout and reports failure', async () => {
    await withServer(
      (_req, res) => {
        // Hold the connection open past the timeout. Never end the response.
        setTimeout(() => res.end(), 5000);
      },
      async url => {
        const ok = await postWebhook(url, {}, '{}', 100);
        assert.equal(ok, false);
      },
    );
  });
});

describe('WebhookNotifier.notify', () => {
  test('skips when no URL is configured (returns true, makes no HTTP call)', async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const notifier = new WebhookNotifier(
      shim({ currentFindings: findingsFor('CVE-1') }),
      fakeFetch,
      { url: undefined, headers: {}, timeoutMs: 5000, allVulns: false },
    );
    const ok = await notifier.notify(
      {
        scanId: 'scan-1',
        image: 'alpine',
        tag: 'latest',
        registry: undefined,
        scannedAt: new Date('2026-01-01T00:00:00Z'),
      },
      'image-1',
    );
    assert.equal(ok, true);
    assert.equal(called, false);
  });

  test('no prior scan → all current vulns reported as new', async () => {
    let received: any;
    await withServer(
      (req, res) => {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          received = JSON.parse(body);
          res.writeHead(200);
          res.end();
        });
      },
      async url => {
        const notifier = new WebhookNotifier(
          shim({ currentFindings: findingsFor('CVE-1', 'CVE-2') }),
          fetch,
          { url, headers: {}, timeoutMs: 5000, allVulns: false },
        );
        const ok = await notifier.notify(
          {
            scanId: 'scan-1',
            image: 'alpine',
            tag: '3.20',
            registry: 'docker.io',
            scannedAt: new Date('2026-01-01T00:00:00Z'),
          },
          'image-1',
        );
        assert.equal(ok, true);
        assert.equal(received.event, 'new_vulnerabilities');
        assert.equal(received.scanId, 'scan-1');
        assert.equal(received.image, 'alpine');
        assert.equal(received.tag, '3.20');
        assert.equal(received.repository, 'docker.io');
        assert.equal(received.totalVulnerabilities, 2);
        assert.equal(received.comparisonScanId, null);
        assert.equal(received.newVulnerabilities.length, 2);
      },
    );
  });

  test('prior scan with overlap → only new CVEs reported', async () => {
    let received: any;
    await withServer(
      (req, res) => {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          received = JSON.parse(body);
          res.writeHead(200);
          res.end();
        });
      },
      async url => {
        const notifier = new WebhookNotifier(
          shim({
            priorScanId: 'scan-prior',
            priorFindings: findingsFor('CVE-1', 'CVE-3'),
            currentFindings: findingsFor('CVE-1', 'CVE-2', 'CVE-4'),
          }),
          fetch,
          { url, headers: {}, timeoutMs: 5000, allVulns: false },
        );
        const ok = await notifier.notify(
          {
            scanId: 'scan-1',
            image: 'alpine',
            tag: '3.20',
            scannedAt: new Date('2026-01-01T00:00:00Z'),
          },
          'image-1',
        );
        assert.equal(ok, true);
        assert.equal(received.totalVulnerabilities, 3);
        assert.equal(received.comparisonScanId, 'scan-prior');
        assert.deepEqual(
          received.newVulnerabilities.map((v: any) => v.cveId).sort(),
          ['CVE-2', 'CVE-4'],
        );
      },
    );
  });

  test('no new vulns + ALL_VULNS=false → no notification fired', async () => {
    let called = 0;
    const fakeFetch = (async () => {
      called += 1;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const notifier = new WebhookNotifier(
      shim({
        priorScanId: 'scan-prior',
        priorFindings: findingsFor('CVE-1', 'CVE-2'),
        currentFindings: findingsFor('CVE-1', 'CVE-2'),
      }),
      fakeFetch,
      { url: 'http://example.invalid/', headers: {}, timeoutMs: 5000, allVulns: false },
    );
    const ok = await notifier.notify(
      {
        scanId: 'scan-1',
        image: 'alpine',
        tag: '3.20',
        scannedAt: new Date('2026-01-01T00:00:00Z'),
      },
      'image-1',
    );
    assert.equal(ok, true);
    assert.equal(called, 0);
  });

  test('no new vulns + ALL_VULNS=true → still fires with empty newVulnerabilities', async () => {
    let received: any;
    await withServer(
      (req, res) => {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          received = JSON.parse(body);
          res.writeHead(200);
          res.end();
        });
      },
      async url => {
        const notifier = new WebhookNotifier(
          shim({
            priorScanId: 'scan-prior',
            priorFindings: findingsFor('CVE-1'),
            currentFindings: findingsFor('CVE-1'),
          }),
          fetch,
          { url, headers: {}, timeoutMs: 5000, allVulns: true },
        );
        const ok = await notifier.notify(
          {
            scanId: 'scan-1',
            image: 'alpine',
            tag: '3.20',
            scannedAt: new Date('2026-01-01T00:00:00Z'),
          },
          'image-1',
        );
        assert.equal(ok, true);
        assert.equal(received.totalVulnerabilities, 1);
        assert.equal(received.newVulnerabilities.length, 0);
        assert.equal(received.comparisonScanId, 'scan-prior');
      },
    );
  });

  test('5xx with retries exhausted → returns false but does not throw', async () => {
    let attempts = 0;
    await withServer(
      (_req, res) => {
        attempts += 1;
        res.writeHead(503);
        res.end();
      },
      async url => {
        const notifier = new WebhookNotifier(
          shim({ currentFindings: findingsFor('CVE-1') }),
          fetch,
          { url, headers: {}, timeoutMs: 1000, allVulns: false },
        );
        const ok = await notifier.notify(
          {
            scanId: 'scan-1',
            image: 'alpine',
            tag: '3.20',
            scannedAt: new Date(),
          },
          'image-1',
        );
        assert.equal(ok, false);
        assert.equal(attempts, 4);
      },
    );
  });

  test('4xx → no retry, returns false', async () => {
    let attempts = 0;
    await withServer(
      (_req, res) => {
        attempts += 1;
        res.writeHead(401);
        res.end();
      },
      async url => {
        const notifier = new WebhookNotifier(
          shim({ currentFindings: findingsFor('CVE-1') }),
          fetch,
          { url, headers: {}, timeoutMs: 1000, allVulns: false },
        );
        const ok = await notifier.notify(
          {
            scanId: 'scan-1',
            image: 'alpine',
            tag: '3.20',
            scannedAt: new Date(),
          },
          'image-1',
        );
        assert.equal(ok, false);
        assert.equal(attempts, 1);
      },
    );
  });
});
