import type { AnyEvent, ReadEvent } from "@event-driven-io/emmett";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import type { OutboxChannel } from "../outbox/types.ts";
import { getSmsTemplate, getTemplateVariables } from "./templates.ts";

export interface SmsNotification {
	channel: OutboxChannel;
	recipient: string;
	body: string;
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

export async function renderSmsNotification(
	event: ReadEvent<AnyEvent>,
	pool: ReturnType<typeof SQLiteConnectionPool>,
): Promise<SmsNotification | null> {
	const template = getSmsTemplate(event.type);
	if (!template) return null;

	const vars = getTemplateVariables(event);
	if (!vars) return null;

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

	if (!phone) return null;

	const { body } = template(vars);

	return { channel: "sms", recipient: phone, body };
}
