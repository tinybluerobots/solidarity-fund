import { createVolunteer } from "../domain/volunteer/commandHandlers.ts";
import { createEventStore } from "../infrastructure/eventStore.ts";
import { SQLiteVolunteerRepository } from "../infrastructure/volunteer/sqliteVolunteerRepository.ts";

const dbPath = process.env.DB_PATH ?? "csf.db";
const { store, pool } = createEventStore(dbPath);
const repo = await SQLiteVolunteerRepository(pool);

const existing = await repo.getByName("Test");
if (existing) {
	console.log("Test user already exists");
} else {
	await createVolunteer(
		{ name: "Test", password: "test", isAdmin: true },
		store,
	);
	console.log(
		"Created test user — name: Test, password: test (admin, requires password reset)",
	);
}

await pool.close();
