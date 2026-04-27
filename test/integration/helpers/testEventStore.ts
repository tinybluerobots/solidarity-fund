import type {
	SQLiteConnectionPool,
	SQLiteEventStore,
} from "@event-driven-io/emmett-sqlite";
import type { ApplicantRepository } from "../../../src/domain/applicant/repository.ts";
import type {
	VolunteerCredentialsStore,
	VolunteerRepository,
} from "../../../src/domain/volunteer/repository.ts";
import { SQLiteApplicantRepository } from "../../../src/infrastructure/applicant/sqliteApplicantRepository.ts";
import { createEventStore } from "../../../src/infrastructure/eventStore.ts";
import { SQLiteVolunteerCredentialsStore } from "../../../src/infrastructure/volunteer/sqliteVolunteerCredentialsStore.ts";
import { SQLiteVolunteerRepository } from "../../../src/infrastructure/volunteer/sqliteVolunteerRepository.ts";

export type TestEnv = {
	eventStore: SQLiteEventStore;
	pool: ReturnType<typeof SQLiteConnectionPool>;
	applicantRepo: ApplicantRepository;
	volunteerRepo: VolunteerRepository;
	credentialsStore: VolunteerCredentialsStore;
	cleanup: () => Promise<void>;
};

export async function createTestEnv(): Promise<TestEnv> {
	const es = createEventStore(":memory:");
	const applicantRepo = await SQLiteApplicantRepository(es.pool);
	const volunteerRepo = await SQLiteVolunteerRepository(es.pool);
	const credentialsStore = await SQLiteVolunteerCredentialsStore(es.pool);
	return {
		eventStore: es.store,
		pool: es.pool,
		applicantRepo,
		volunteerRepo,
		credentialsStore,
		cleanup: () => es.pool.close(),
	};
}
