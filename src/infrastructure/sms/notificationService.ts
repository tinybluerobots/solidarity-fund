import type { AnyEvent, ReadEvent } from "@event-driven-io/emmett";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { getSmsConfig } from "../../config.ts";
import { getSmsTemplate, getTemplateVariables } from "./templates.ts";

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

async function getApplicantPhone(
	pool: ReturnType<typeof SQLiteConnectionPool>,
	applicantId: string,
): Promise<string | null> {
	return pool.withConnection(async (conn) => {
		const row = await conn.querySingle<{ phone: string }>(
			"SELECT phone FROM applicants WHERE id = ?",
			[applicantId],
		);
		return row?.phone ?? null;
	});
}

export function createNotificationService(
	client: SmsClient,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	return {
		async handle(event: ReadEvent<AnyEvent>): Promise<void> {
			const template = getSmsTemplate(event.type);
			if (!template) return;

			const vars = getTemplateVariables(event);
			if (!vars) return;

			let phone: string | null = null;
			if (
				event.type === "ApplicationSubmitted" &&
				"identity" in event.data &&
				event.data.identity
			) {
				phone = event.data.identity.phone;
			} else if ("applicantId" in event.data) {
				phone = await getApplicantPhone(pool, event.data.applicantId);
			}

			if (!phone) {
				logSms("warn", `No phone found for ${event.type}; skipping SMS`);
				return;
			}

			const { body } = template(vars);
			logSms("info", `Sending SMS to ${phone}: ${body.slice(0, 40)}...`);

			try {
				const result = await client.send({ to: phone, body });
				if (result.success) {
					logSms("info", `SMS sent to ${phone}`);
				} else {
					logSms(
						"warn",
						`SMS failed for ${phone}: ${result.error ?? "unknown error"}`,
					);
				}
			} catch (err) {
				logSms(
					"warn",
					`SMS threw for ${phone}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},
	};
}
