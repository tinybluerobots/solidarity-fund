import { setFundName } from "../config.ts";
import { createVolunteer } from "../domain/volunteer/commandHandlers.ts";
import { SQLiteApplicantRepository } from "../infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../infrastructure/eventStore.ts";
import { SQLiteSessionStore } from "../infrastructure/session/sqliteSessionStore.ts";
import { SQLiteVolunteerCredentialsStore } from "../infrastructure/volunteer/sqliteVolunteerCredentialsStore.ts";
import { SQLiteVolunteerRepository } from "../infrastructure/volunteer/sqliteVolunteerRepository.ts";
import { startServer } from "./server.ts";

const dbPath = process.env.DB_PATH ?? "csf.db";
const fundName = process.env.FUND_NAME ?? "Community Solidarity Fund";
setFundName(fundName);

const { store: eventStore, pool } = createEventStore(dbPath);
const sessionStore = await SQLiteSessionStore(pool);
const volunteerRepo = await SQLiteVolunteerRepository(pool);
const applicantRepo = await SQLiteApplicantRepository(pool);
const credentialsStore = await SQLiteVolunteerCredentialsStore(pool);

const admins = await volunteerRepo.getAdmins();
if (admins.length === 0) {
	const adminPassword = process.env.ADMIN_PASSWORD;
	if (!adminPassword) {
		throw new Error(
			"ADMIN_PASSWORD environment variable is required when no admin account exists",
		);
	}
	await createVolunteer(
		{ name: "admin", password: adminPassword, isAdmin: true },
		eventStore,
		credentialsStore,
	);
	console.log("No admin found — created default account (name: admin).");
}

const server = await startServer(
	sessionStore,
	volunteerRepo,
	applicantRepo,
	eventStore,
	pool,
);

console.log(`${fundName} server running at http://localhost:${server.port}`);
