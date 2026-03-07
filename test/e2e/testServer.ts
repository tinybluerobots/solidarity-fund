import { createVolunteer } from "../../src/domain/volunteer/commandHandlers.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../../src/infrastructure/recipient/sqliteRecipientRepository.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "../../src/web/server.ts";

const port = Number(process.env.TEST_PORT ?? 3001);

const { store: eventStore, pool } = createEventStore(":memory:");
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const recipientRepo = await SQLiteRecipientRepository(pool);

await createVolunteer({ name: "Test", password: "test" }, eventStore);

const server = startServer(
	sessionStore,
	volunteerRepo,
	recipientRepo,
	eventStore,
	port,
);

console.log(`TEST_SERVER_READY:${server.port}`);
