import type { AlertItem } from "@/lib/types";
import { getHighSeverityNotificationTargets } from "@/lib/alerts";

export type AlertNotificationChannel = "slack" | "email";

export type AlertNotificationResult = {
  alertId: string;
  channel: AlertNotificationChannel;
  sent: boolean;
  error?: string;
};

export type AlertNotificationSender = {
  channel: AlertNotificationChannel;
  send: (alert: AlertItem) => Promise<void>;
};

export async function sendHighSeverityAlerts(
  alerts: AlertItem[],
  senders: AlertNotificationSender[],
): Promise<AlertNotificationResult[]> {
  const targets = getHighSeverityNotificationTargets(alerts);
  const results: AlertNotificationResult[] = [];

  for (const alert of targets) {
    for (const sender of senders) {
      try {
        await sender.send(alert);
        results.push({ alertId: alert.id, channel: sender.channel, sent: true });
      } catch (error) {
        results.push({
          alertId: alert.id,
          channel: sender.channel,
          sent: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}
