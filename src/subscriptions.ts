import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import { createSmsClient } from "./infrastructure/sms/client.ts";
import { createNotificationService } from "./infrastructure/sms/notificationService.ts";

export async function startEventSubscriptions(
	eventStore: SQLiteEventStore,
	pool: ReturnType<typeof SQLiteConnectionPool>,
) {
	const client = createSmsClient();
	const notificationService = createNotificationService(client, pool);

	const consumer = eventStore.consumer();
	consumer.processor({
		processorId: "sms-notifications",
		version: 1,
		startFrom: "CURRENT",
		eachMessage: async (event) => {
			if (!event.kind || event.kind !== "Event") return;
			await notificationService.handle(event);
		},
	});

	await consumer.start();
	return consumer;
}
