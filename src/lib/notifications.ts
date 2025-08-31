/**
 * Notification utilities for Harbor Guard
 * Supports Teams and Slack webhooks for high severity findings
 */

import { config } from './config';
import { logger } from './logger';

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
    switch (severity) {
      case 'critical': return '#FF0000';  // Red
      case 'high': return '#FF8C00';      // Dark Orange
      case 'medium': return '#FFD700';    // Gold
      case 'low': return '#32CD32';       // Lime Green
      case 'info': return '#1E90FF';      // Dodger Blue
      default: return '#808080';          // Gray
    }
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