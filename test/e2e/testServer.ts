import {
	changePassword,
	createVolunteer,
} from "../../src/domain/volunteer/commandHandlers.ts";
import { SQLiteApplicantRepository } from "../../src/infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { SQLiteSessionStore } from "../../src/infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "../../src/web/server.ts";

const port = Number(process.env.TEST_PORT ?? 3001);

const { store: eventStore, pool } = createEventStore(":memory:");
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const applicantRepo = await SQLiteApplicantRepository(pool);

const { id } = await createVolunteer(
	{ name: "Test", password: "test", isAdmin: true },
	eventStore,
);
await changePassword(id, "test", eventStore);

const server = startServer(
	sessionStore,
	volunteerRepo,
	applicantRepo,
	eventStore,
	pool,
	port,
);

console.log(`TEST_SERVER_READY:${server.port}`);
