/**
 * Notification utilities for Harbor Guard
 * Supports Teams and Slack webhooks for high severity findings
 */

import { config } from './config';
import { logger } from './logger';
import { getSeverityHashColor } from './utils/severity-utils';

interface NotificationPayload {
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  scanId?: string;
  imageId?: string;
  imageName?: string;
  vulnerabilityCount?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export class NotificationService {
  /**
   * Send notification to configured webhooks
   */
  async sendNotification(payload: NotificationPayload): Promise<void> {
    // Only send notifications for high severity findings if configured
    if (!config.notifyOnHighSeverity || !this.shouldNotify(payload.severity)) {
      logger.debug(`Skipping notification for ${payload.severity} severity`);
      return;
    }

    const promises: Promise<void>[] = [];

    if (config.teamsWebhookUrl) {
      promises.push(this.sendTeamsNotification(payload));
    }

    if (config.slackWebhookUrl) {
      promises.push(this.sendSlackNotification(payload));
    }

    if (config.gotifyServerUrl && config.gotifyAppToken) {
      promises.push(this.sendGotifyNotification(payload));
    }

    if (config.appriseApiUrl) {
      promises.push(this.sendAppriseNotification(payload));
    }

    if (config.discordWebhookUrl) {
      promises.push(this.sendDiscordNotification(payload));
    }

    if (config.ntfyServerUrl) {
      promises.push(this.sendNtfyNotification(payload));
    }

    if (promises.length === 0) {
      logger.debug('No webhook URLs configured, skipping notifications');
      return;
    }

    try {
      await Promise.allSettled(promises);
      logger.info(`Sent notifications for ${payload.severity} severity finding`);
    } catch (error) {
      logger.error('Failed to send notifications:', error);
    }
  }

  /**
   * Check if we should notify for this severity level
   */
  private shouldNotify(severity: string): boolean {
    return severity === 'critical' || severity === 'high';
  }

  /**
   * Send notification to Microsoft Teams
   */
  private async sendTeamsNotification(payload: NotificationPayload): Promise<void> {
    if (!config.teamsWebhookUrl) return;

    try {
      const teamsMessage = this.formatTeamsMessage(payload);
      
      const response = await fetch(config.teamsWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(teamsMessage),
      });

      if (!response.ok) {
        throw new Error(`Teams webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.webhook('Successfully sent Teams notification');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send Teams notification:', errorMessage);
      throw error;
    }
  }

  /**
   * Send notification to Slack
   */
  private async sendSlackNotification(payload: NotificationPayload): Promise<void> {
    if (!config.slackWebhookUrl) return;

    try {
      const slackMessage = this.formatSlackMessage(payload);
      
      const response = await fetch(config.slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackMessage),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.webhook('Successfully sent Slack notification');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send Slack notification:', errorMessage);
      throw error;
    }
  }

  /**
   * Format message for Microsoft Teams
   */
  private formatTeamsMessage(payload: NotificationPayload): any {
    const severityColor = this.getSeverityColor(payload.severity);
    const severityIcon = this.getSeverityIcon(payload.severity);

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: severityColor,
      summary: payload.title,
      sections: [
        {
          activityTitle: `${severityIcon} ${payload.title}`,
          activitySubtitle: `Harbor Guard Security Alert - ${payload.severity.toUpperCase()}`,
          facts: [
            {
              name: 'Severity',
              value: payload.severity.toUpperCase()
            },
            ...(payload.imageName ? [{
              name: 'Image',
              value: payload.imageName
            }] : []),
            ...(payload.vulnerabilityCount ? [{
              name: 'Vulnerabilities',
              value: `Critical: ${payload.vulnerabilityCount.critical}, High: ${payload.vulnerabilityCount.high}, Medium: ${payload.vulnerabilityCount.medium}, Low: ${payload.vulnerabilityCount.low}`
            }] : []),
            {
              name: 'Timestamp',
              value: new Date().toISOString()
            }
          ],
          text: payload.message
        }
      ]
    };
  }

  /**
   * Format message for Slack
   */
  private formatSlackMessage(payload: NotificationPayload): any {
    const severityColor = this.getSeverityColor(payload.severity);
    const severityIcon = this.getSeverityIcon(payload.severity);

    return {
      text: `${severityIcon} ${payload.title}`,
      attachments: [
        {
          color: severityColor,
          title: payload.title,
          text: payload.message,
          fields: [
            {
              title: 'Severity',
              value: payload.severity.toUpperCase(),
              short: true
            },
            ...(payload.imageName ? [{
              title: 'Image',
              value: payload.imageName,
              short: true
            }] : []),
            ...(payload.vulnerabilityCount ? [{
              title: 'Vulnerabilities',
              value: `Critical: ${payload.vulnerabilityCount.critical} | High: ${payload.vulnerabilityCount.high} | Medium: ${payload.vulnerabilityCount.medium} | Low: ${payload.vulnerabilityCount.low}`,
              short: false
            }] : [])
          ],
          footer: 'Harbor Guard',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };
  }

  /**
   * Get color for severity level
   */
  private getSeverityColor(severity: string): string {
    return getSeverityHashColor(severity);
  }

  /**
   * Get icon for severity level
   */
  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return '📝';
      case 'info': return 'ℹ️';
      default: return '📋';
    }
  }

  /**
   * Send notification to Gotify
   */
  private async sendGotifyNotification(payload: NotificationPayload): Promise<void> {
    if (!config.gotifyServerUrl || !config.gotifyAppToken) return;

    try {
      const gotifyMessage = this.formatGotifyMessage(payload);
      
      const response = await fetch(`${config.gotifyServerUrl}/message?token=${config.gotifyAppToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gotifyMessage),
      });

      if (!response.ok) {
        throw new Error(`Gotify API returned ${response.status}: ${response.statusText}`);
      }

      logger.webhook('Successfully sent Gotify notification');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send Gotify notification:', errorMessage);
      throw error;
    }
  }

  /**
   * Send notification via Apprise
   */
  private async sendAppriseNotification(payload: NotificationPayload): Promise<void> {
    if (!config.appriseApiUrl) return;

    try {
      const appriseMessage = this.formatAppriseMessage(payload);
      
      // Determine the endpoint based on configuration
      let endpoint = `${config.appriseApiUrl}/notify`;
      if (config.appriseConfigKey) {
        endpoint = `${config.appriseApiUrl}/notify/${config.appriseConfigKey}`;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(appriseMessage),
      });

      if (!response.ok) {
        throw new Error(`Apprise API returned ${response.status}: ${response.statusText}`);
      }

      logger.webhook('Successfully sent Apprise notification');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send Apprise notification:', errorMessage);
      throw error;
    }
  }

  /**
   * Format message for Gotify
   */
  private formatGotifyMessage(payload: NotificationPayload): any {
    const priority = this.getGotifyPriority(payload.severity);
    const severityIcon = this.getSeverityIcon(payload.severity);

    let message = `${severityIcon} ${payload.message}\n\n`;
    
    if (payload.imageName) {
      message += `Image: ${payload.imageName}\n`;
    }
    
    if (payload.vulnerabilityCount) {
      message += `\nVulnerabilities Found:\n`;
      message += `• Critical: ${payload.vulnerabilityCount.critical}\n`;
      message += `• High: ${payload.vulnerabilityCount.high}\n`;
      message += `• Medium: ${payload.vulnerabilityCount.medium}\n`;
      message += `• Low: ${payload.vulnerabilityCount.low}\n`;
    }
    
    message += `\nTimestamp: ${new Date().toISOString()}`;

    return {
      title: payload.title,
      message,
      priority,
      extras: {
        'client::display': {
          contentType: 'text/markdown'
        },
        ...(payload.scanId && { scanId: payload.scanId }),
        ...(payload.imageId && { imageId: payload.imageId }),
        severity: payload.severity
      }
    };
  }

  /**
   * Format message for Apprise
   */
  private formatAppriseMessage(payload: NotificationPayload): any {
    const severityIcon = this.getSeverityIcon(payload.severity);
    const appriseType = this.getAppriseType(payload.severity);

    let body = `${severityIcon} ${payload.message}\n\n`;
    
    if (payload.imageName) {
      body += `**Image:** ${payload.imageName}\n`;
    }
    
    if (payload.vulnerabilityCount) {
      body += `\n**Vulnerabilities Found:**\n`;
      body += `• Critical: ${payload.vulnerabilityCount.critical}\n`;
      body += `• High: ${payload.vulnerabilityCount.high}\n`;
      body += `• Medium: ${payload.vulnerabilityCount.medium}\n`;
      body += `• Low: ${payload.vulnerabilityCount.low}\n`;
    }
    
    body += `\n_Timestamp: ${new Date().toISOString()}_`;

    const message: any = {
      title: payload.title,
      body,
      type: appriseType,
      format: 'markdown'
    };

    // If specific URLs are configured, use them
    if (config.appriseUrls) {
      message.urls = config.appriseUrls;
    }

    return message;
  }

  /**
   * Get Gotify priority based on severity
   */
  private getGotifyPriority(severity: string): number {
    switch (severity) {
      case 'critical': return 10;  // Max priority
      case 'high': return 8;
      case 'medium': return 5;
      case 'low': return 3;
      case 'info': return 1;
      default: return 0;
    }
  }

  /**
   * Get Apprise notification type based on severity
   */
  private getAppriseType(severity: string): string {
    switch (severity) {
      case 'critical': return 'failure';
      case 'high': return 'warning';
      case 'medium': return 'warning';
      case 'low': return 'info';
      case 'info': return 'info';
      default: return 'info';
    }
  }

  /**
   * Send scan completion notification
   */
  async notifyScanComplete(
    imageName: string,
    scanId: string,
    vulnerabilities: { critical: number; high: number; medium: number; low: number }
  ): Promise<void> {
    if (vulnerabilities.critical > 0 || vulnerabilities.high > 0) {
      const severity = vulnerabilities.critical > 0 ? 'critical' : 'high';
      
      await this.sendNotification({
        title: 'High-Risk Vulnerabilities Detected',
        message: `Scan completed for ${imageName} with ${vulnerabilities.critical + vulnerabilities.high} high-risk vulnerabilities found.`,
        severity,
        scanId,
        imageName,
        vulnerabilityCount: vulnerabilities
      });
    }
  }

  /**
   * Send notification to a Discord channel via its incoming webhook URL.
   *
   * Discord webhooks accept a JSON body with optional `embeds`. We use a
   * single rich embed so the severity color and key facts (image, scanId,
   * vuln counts) render with the standard Discord styling, mirroring the
   * fact-rich shape of the Teams card and Slack attachment.
   *
   * See HarborGuard issue #155.
   */
  private async sendDiscordNotification(payload: NotificationPayload): Promise<void> {
    if (!config.discordWebhookUrl) return;

    try {
      const discordMessage = this.formatDiscordMessage(payload);

      const response = await fetch(config.discordWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordMessage),
      });

      if (!response.ok) {
        throw new Error(`Discord webhook returned ${response.status}: ${response.statusText}`);
      }

      logger.webhook('Successfully sent Discord notification');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send Discord notification:', errorMessage);
      throw error;
    }
  }

  /**
   * Send notification to ntfy.
   *
   * ntfy accepts the message body as raw text on POST to
   * `<server>/<topic>`, with optional metadata in HTTP headers (Title,
   * Priority, Tags). When NTFY_TOPIC is set we treat NTFY_SERVER_URL as
   * the bare server origin and append the topic; otherwise we assume the
   * full topic URL was supplied.
   *
   * See https://docs.ntfy.sh/publish/ and HarborGuard issue #155.
   */
  private async sendNtfyNotification(payload: NotificationPayload): Promise<void> {
    if (!config.ntfyServerUrl) return;

    try {
      const url = config.ntfyTopic
        ? `${config.ntfyServerUrl.replace(/\/$/, '')}/${encodeURIComponent(config.ntfyTopic)}`
        : config.ntfyServerUrl;

      const headers: Record<string, string> = {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: payload.title,
        Priority: String(this.getNtfyPriority(payload.severity)),
        Tags: this.getNtfyTags(payload.severity).join(','),
      };
      if (config.ntfyAccessToken) {
        headers.Authorization = `Bearer ${config.ntfyAccessToken}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: this.formatNtfyBody(payload),
      });

      if (!response.ok) {
        throw new Error(`ntfy server returned ${response.status}: ${response.statusText}`);
      }

      logger.webhook('Successfully sent ntfy notification');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send ntfy notification:', errorMessage);
      throw error;
    }
  }

  /**
   * Format message for Discord. Color is the same hex string the rest of
   * the app uses, converted to the integer Discord expects (it doesn't
   * accept the leading `#`).
   */
  private formatDiscordMessage(payload: NotificationPayload): unknown {
    const colorHex = this.getSeverityColor(payload.severity).replace('#', '');
    const color = parseInt(colorHex, 16);
    const severityIcon = this.getSeverityIcon(payload.severity);

    const fields: Array<{ name: string; value: string; inline?: boolean }> = [
      { name: 'Severity', value: payload.severity.toUpperCase(), inline: true },
    ];
    if (payload.imageName) {
      fields.push({ name: 'Image', value: payload.imageName, inline: true });
    }
    if (payload.scanId) {
      fields.push({ name: 'Scan ID', value: payload.scanId, inline: true });
    }
    if (payload.vulnerabilityCount) {
      const v = payload.vulnerabilityCount;
      fields.push({
        name: 'Vulnerabilities',
        value: `Critical: ${v.critical} · High: ${v.high} · Medium: ${v.medium} · Low: ${v.low}`,
        inline: false,
      });
    }

    return {
      username: 'Harbor Guard',
      embeds: [
        {
          title: `${severityIcon} ${payload.title}`,
          description: payload.message,
          color: Number.isNaN(color) ? undefined : color,
          fields,
          footer: { text: 'Harbor Guard' },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  /**
   * Format the body for ntfy. ntfy renders the body as plain text, so a
   * compact multi-line summary reads well on the mobile + web clients.
   */
  private formatNtfyBody(payload: NotificationPayload): string {
    const lines = [payload.message];
    if (payload.imageName) {
      lines.push(`Image: ${payload.imageName}`);
    }
    if (payload.scanId) {
      lines.push(`Scan: ${payload.scanId}`);
    }
    if (payload.vulnerabilityCount) {
      const v = payload.vulnerabilityCount;
      lines.push(`Vulns: critical=${v.critical} high=${v.high} medium=${v.medium} low=${v.low}`);
    }
    return lines.join('\n');
  }

  /**
   * Map severity → ntfy priority (1=min, 5=max). Mirrors the Gotify
   * priority mapping shape so users get the same ordering across both
   * push systems.
   */
  private getNtfyPriority(severity: string): number {
    switch (severity) {
      case 'critical': return 5;
      case 'high':     return 4;
      case 'medium':   return 3;
      case 'low':      return 2;
      case 'info':     return 1;
      default:         return 3;
    }
  }

  /**
   * Map severity → ntfy tag emojis (used by ntfy clients to render an
   * inline glyph).
   */
  private getNtfyTags(severity: string): string[] {
    switch (severity) {
      case 'critical': return ['rotating_light', 'shield'];
      case 'high':     return ['warning', 'shield'];
      case 'medium':   return ['zap'];
      case 'low':      return ['memo'];
      case 'info':     return ['information_source'];
      default:         return ['shield'];
    }
  }

  /**
   * Send system alert notification
   */
  async notifySystemAlert(title: string, message: string, severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info'): Promise<void> {
    await this.sendNotification({
      title,
      message,
      severity
    });
  }
}

// Create singleton instance
export const notificationService = new NotificationService();