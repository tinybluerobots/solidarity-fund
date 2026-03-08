import { SQLiteApplicantRepository } from "../infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../infrastructure/eventStore.ts";
import { SQLiteSessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "./server.ts";

const dbPath = process.env.DB_PATH ?? "csf.db";

const { store: eventStore, pool } = createEventStore(dbPath);
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const applicantRepo = await SQLiteApplicantRepository(pool);

const server = startServer(
	sessionStore,
	volunteerRepo,
	applicantRepo,
	eventStore,
	pool,
);

console.log(`CSF server running at http://localhost:${server.port}`);
