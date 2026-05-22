/**
 * Generic outbound webhook notifier.
 *
 * Posts a structured JSON payload to a user-configured URL whenever a scan
 * run produces vulnerabilities that were not present in the most recent
 * prior completed scan of the same image:tag. The diff-against-prior
 * behaviour is the point of this notifier: existing notifiers (Teams,
 * Slack, Gotify, Apprise, Discord, ntfy) deliver human-readable summaries
 * for every high-severity scan; this one delivers a machine-readable feed
 * of *new* findings so users can wire it into their own automation
 * (ticketing, SIEM, on-call paging, etc.) without re-parsing summary text.
 *
 * Configured via four env vars, all optional:
 *   WEBHOOK_NOTIFIER_URL          — destination URL; absence disables the notifier
 *   WEBHOOK_NOTIFIER_HEADERS      — JSON object of extra headers (e.g. auth)
 *   WEBHOOK_NOTIFIER_TIMEOUT_MS   — per-request timeout, default 10000
 *   WEBHOOK_NOTIFIER_ALL_VULNS    — `true` to fire on every scan even when
 *                                   no new vulns vs. prior scan (default off)
 *
 * Transport behaviour: 3 retries with exponential backoff on transient
 * failures (5xx + network errors); 4xx responses fail fast with no retry.
 */

import { config } from '../config';
import { logger } from '../logger';
import { prisma } from '../prisma';

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 4; // 1 initial + 3 retries
const BASE_BACKOFF_MS = 500;

export interface WebhookScanContext {
  scanId: string;
  image: string;
  tag: string;
  registry?: string;
  scannedAt: Date;
}

export interface WebhookVulnerability {
  cveId: string;
  severity: string;
  cvssScore: number | null;
  packageName: string;
  packageVersion: string | null;
  fixedVersion: string | null;
  description: string | null;
}

export interface WebhookPayload {
  event: 'new_vulnerabilities';
  scanId: string;
  image: string;
  tag: string;
  repository: string | null;
  scannedAt: string;
  newVulnerabilities: WebhookVulnerability[];
  totalVulnerabilities: number;
  comparisonScanId: string | null;
}

export interface WebhookNotifierOptions {
  url?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  allVulns?: boolean;
}

interface PriorScanQuery {
  findFirst(args: {
    where: { imageId: string; tag: string; status: 'SUCCESS'; id: { not: string } };
    orderBy: { finishedAt: 'desc' };
    select: { id: true };
  }): Promise<{ id: string } | null>;
}

interface VulnerabilityFindingQuery {
  findMany(args: {
    where: { scanId: string };
    select: {
      cveId: true;
      severity: true;
      cvssScore: true;
      packageName: true;
      installedVersion: true;
      fixedVersion: true;
      description: true;
    };
  }): Promise<Array<{
    cveId: string;
    severity: string;
    cvssScore: number | null;
    packageName: string;
    installedVersion: string | null;
    fixedVersion: string | null;
    description: string | null;
  }>>;
}

export interface WebhookPrismaShim {
  scan: PriorScanQuery;
  scanVulnerabilityFinding: VulnerabilityFindingQuery;
}

/**
 * Fetch the most recent successfully-completed prior scan for the same
 * image:tag (excluding the current scan), and return its set of CVE IDs.
 * Returns null when no prior scan exists.
 */
export async function loadPriorScanCves(
  client: WebhookPrismaShim,
  imageId: string,
  tag: string,
  currentScanId: string,
): Promise<{ priorScanId: string; cves: Set<string> } | null> {
  const prior = await client.scan.findFirst({
    where: { imageId, tag, status: 'SUCCESS', id: { not: currentScanId } },
    orderBy: { finishedAt: 'desc' },
    select: { id: true },
  });
  if (!prior) return null;

  const findings = await client.scanVulnerabilityFinding.findMany({
    where: { scanId: prior.id },
    select: {
      cveId: true,
      severity: true,
      cvssScore: true,
      packageName: true,
      installedVersion: true,
      fixedVersion: true,
      description: true,
    },
  });

  return {
    priorScanId: prior.id,
    cves: new Set(findings.map(f => f.cveId)),
  };
}

/**
 * Compute the set of "new" vulnerabilities — the findings present in the
 * current scan that were not present in the prior scan. With no prior
 * scan, every current finding is new.
 */
export function computeNewVulnerabilities(
  current: Array<{
    cveId: string;
    severity: string;
    cvssScore: number | null;
    packageName: string;
    installedVersion: string | null;
    fixedVersion: string | null;
    description: string | null;
  }>,
  priorCves: Set<string> | null,
): WebhookVulnerability[] {
  const novel = priorCves
    ? current.filter(f => !priorCves.has(f.cveId))
    : current;

  return novel.map(f => ({
    cveId: f.cveId,
    severity: f.severity,
    cvssScore: f.cvssScore,
    packageName: f.packageName,
    packageVersion: f.installedVersion,
    fixedVersion: f.fixedVersion,
    description: f.description,
  }));
}

/**
 * POST the payload with timeout + retry. Retries 5xx and network errors
 * up to MAX_ATTEMPTS with exponential backoff; 4xx responses are
 * permanent and fail immediately. Returns true on a 2xx, false otherwise.
 *
 * Fetch is taken as a parameter to make the function unit-testable
 * without monkey-patching globals.
 */
export async function postWebhook(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) return true;

      // 4xx — permanent. Don't retry.
      if (response.status >= 400 && response.status < 500) {
        logger.error(
          `Webhook notifier: ${response.status} ${response.statusText} (no retry on 4xx)`,
        );
        return false;
      }

      lastError = `${response.status} ${response.statusText}`;
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_ATTEMPTS) {
      const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  logger.error(`Webhook notifier: giving up after ${MAX_ATTEMPTS} attempts (${lastError})`);
  return false;
}

/**
 * Parse WEBHOOK_NOTIFIER_HEADERS as a JSON object. Returns an empty
 * object on failure with a warning logged — bad config should not block
 * notifications, just strip the broken auth header.
 */
function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
    logger.warn('WEBHOOK_NOTIFIER_HEADERS is not a JSON object; ignoring.');
    return {};
  } catch {
    logger.warn('WEBHOOK_NOTIFIER_HEADERS is not valid JSON; ignoring.');
    return {};
  }
}

function readOptionsFromConfig(): WebhookNotifierOptions {
  return {
    url: config.webhookNotifierUrl,
    headers: parseHeaders(config.webhookNotifierHeaders),
    timeoutMs: config.webhookNotifierTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    allVulns: !!config.webhookNotifierAllVulns,
  };
}

export class WebhookNotifier {
  constructor(
    private readonly client: WebhookPrismaShim = prisma as unknown as WebhookPrismaShim,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly options: WebhookNotifierOptions = readOptionsFromConfig(),
  ) {}

  /**
   * Fire the webhook for a completed scan. Returns true on a successful
   * delivery (2xx) or when the call is intentionally skipped (no diff,
   * no URL configured); returns false on a non-recoverable transport
   * failure. Never throws — failures are logged but do not block scan
   * completion.
   */
  async notify(
    context: WebhookScanContext,
    imageId: string,
  ): Promise<boolean> {
    const { url, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, allVulns = false } = this.options;

    if (!url) return true;

    try {
      const currentFindings = await this.client.scanVulnerabilityFinding.findMany({
        where: { scanId: context.scanId },
        select: {
          cveId: true,
          severity: true,
          cvssScore: true,
          packageName: true,
          installedVersion: true,
          fixedVersion: true,
          description: true,
        },
      });

      const prior = await loadPriorScanCves(this.client, imageId, context.tag, context.scanId);
      const newVulns = computeNewVulnerabilities(currentFindings, prior?.cves ?? null);

      if (newVulns.length === 0 && !allVulns) {
        logger.debug(
          `Webhook notifier: no new vulnerabilities for ${context.image}:${context.tag} vs prior scan, skipping.`,
        );
        return true;
      }

      const payload: WebhookPayload = {
        event: 'new_vulnerabilities',
        scanId: context.scanId,
        image: context.image,
        tag: context.tag,
        repository: context.registry ?? null,
        scannedAt: context.scannedAt.toISOString(),
        newVulnerabilities: newVulns,
        totalVulnerabilities: currentFindings.length,
        comparisonScanId: prior?.priorScanId ?? null,
      };

      const ok = await postWebhook(
        url,
        headers,
        JSON.stringify(payload),
        timeoutMs,
        this.fetchImpl,
      );
      if (ok) {
        logger.webhook(
          `Successfully sent webhook notifier (${newVulns.length} new of ${currentFindings.length} total)`,
        );
      }
      return ok;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Webhook notifier failed:', msg);
      return false;
    }
  }
}

export const webhookNotifier = new WebhookNotifier();
