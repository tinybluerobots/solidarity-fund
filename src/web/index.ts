import { createEventStore } from "../infrastructure/eventStore.ts";
import { SQLiteRecipientRepository } from "../infrastructure/recipient/sqliteRecipientRepository.ts";
import { SQLiteSessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerRepository } from "../infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "./server.ts";

const dbPath = process.env.DB_PATH ?? "csf.db";

const { store: eventStore, pool } = createEventStore(dbPath);
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const recipientRepo = await SQLiteRecipientRepository(pool);

const server = startServer(sessionStore, volunteerRepo, recipientRepo, eventStore);

console.log(`CSF server running at http://localhost:${server.port}`);
