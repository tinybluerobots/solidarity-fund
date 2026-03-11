import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { SQLiteConnectionPool } from "@event-driven-io/emmett-sqlite";
import { createEventStore } from "../../src/infrastructure/eventStore.ts";
import { DocumentStore } from "../../src/infrastructure/projections/documents.ts";

describe("DocumentStore", () => {
	let pool: ReturnType<typeof SQLiteConnectionPool>;
	let docStore: ReturnType<typeof DocumentStore>;

	beforeEach(async () => {
		const es = createEventStore(":memory:");
		pool = es.pool;
		docStore = DocumentStore(pool);
		await docStore.init();
	});

	afterEach(async () => {
		await pool.close();
	});

	test("store and retrieve a document by id", async () => {
		const data = Buffer.from("test-image-data");
		await docStore.store({
			id: "doc-1",
			entityId: "entity-1",
			type: "proof_of_address",
			data,
			mimeType: "image/png",
		});

		const doc = await docStore.getById("doc-1");
		expect(doc).not.toBeNull();
		expect(doc?.entityId).toBe("entity-1");
		expect(doc?.type).toBe("proof_of_address");
		expect(doc?.mimeType).toBe("image/png");
		expect(Buffer.from(doc?.data ?? []).toString()).toBe("test-image-data");
	});

	test("getById returns null for unknown document", async () => {
		const doc = await docStore.getById("nonexistent");
		expect(doc).toBeNull();
	});

	test("getByEntityId returns all documents for an entity", async () => {
		const data = Buffer.from("test");
		await docStore.store({
			id: "doc-1",
			entityId: "e1",
			type: "proof_of_address",
			data,
			mimeType: "image/png",
		});
		await docStore.store({
			id: "doc-2",
			entityId: "e1",
			type: "proof_of_address",
			data,
			mimeType: "image/jpeg",
		});
		await docStore.store({
			id: "doc-3",
			entityId: "e2",
			type: "proof_of_address",
			data,
			mimeType: "image/png",
		});

		const docs = await docStore.getByEntityId("e1");
		expect(docs).toHaveLength(2);
	});

	test("getByEntityId returns empty array for unknown entity", async () => {
		const docs = await docStore.getByEntityId("nonexistent");
		expect(docs).toEqual([]);
	});

	test("application-time upload found when queried by same id used as grantId", async () => {
		const applicationId = "app-123";
		const data = Buffer.from("poa-file");
		await docStore.store({
			id: "doc-poa",
			entityId: applicationId,
			type: "proof_of_address",
			data,
			mimeType: "application/pdf",
		});

		const docs = await docStore.getByEntityId(applicationId);
		expect(docs).toHaveLength(1);
		expect(docs[0]!.entityId).toBe(applicationId);
	});
});
