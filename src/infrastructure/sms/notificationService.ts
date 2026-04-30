import type { AnyEvent, ReadEvent } from "@event-driven-io/emmett";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { getSmsConfig } from "../../config.ts";
import { renderSmsNotification } from "./notificationRenderer.ts";

type SmsNotificationLogLevel = "silent" | "warn" | "info" | "debug";

function shouldLog(
	configLevel: SmsNotificationLogLevel,
	msgLevel: SmsNotificationLogLevel,
): boolean {
	const levels = ["silent", "warn", "info", "debug"];
	return levels.indexOf(msgLevel) <= levels.indexOf(configLevel);
}

function logSms(level: SmsNotificationLogLevel, message: string) {
	const { logLevel } = getSmsConfig();
	if (!shouldLog(logLevel, level)) return;
	if (level === "warn") console.warn(`[sms] ${message}`);
	else console.log(`[sms] ${message}`);
}

export function createNotificationService(
	client: SmsClient,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async handle(event: ReadEvent<AnyEvent>): Promise<void> {
			const notification = await renderSmsNotification(event, pool);
			if (!notification) return;

			logSms(
				"info",
				`Sending SMS to ${notification.recipient}: ${notification.body.slice(0, 40)}...`,
			);

			try {
				const result = await client.send({
					to: notification.recipient,
					body: notification.body,
				});
				if (result.success) {
					logSms("info", `SMS sent to ${notification.recipient}`);
				} else {
					logSms(
						"warn",
						`SMS failed for ${notification.recipient}: ${result.error ?? "unknown error"}`,
					);
				}
			} catch (err) {
				logSms(
					"warn",
					`SMS threw for ${notification.recipient}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},
	};
}
