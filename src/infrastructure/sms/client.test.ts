import { expect, test } from "bun:test";
import { resetSmsConfig } from "../../config.ts";
import {
	ClickSendSmsClient,
	createSmsClient,
	NullSmsClient,
	toE164,
} from "./client.ts";

test("NullSmsClient returns success", async () => {
	const client = new NullSmsClient();
	const result = await client.send({ to: "+14445556666", body: "test" });
	expect(result.success).toBe(true);
});

test("createSmsClient returns NullSmsClient when disabled", () => {
	using _ = withEnv({ SMS_ENABLED: "false" });
	const client = createSmsClient();
	expect(client).toBeInstanceOf(NullSmsClient);
});

test("createSmsClient returns ClickSendSmsClient when enabled", () => {
	using _ = withEnv({
		SMS_ENABLED: "true",
		CLICKSEND_USERNAME: "user",
		CLICKSEND_API_KEY: "key",
	});
	const client = createSmsClient();
	expect(client).toBeInstanceOf(ClickSendSmsClient);
});

test("toE164 normalises UK mobile", () => {
	expect(toE164("07777 777777")).toBe("+447777777777");
	expect(toE164("+447777777777")).toBe("+447777777777");
	expect(toE164("1-555-555-5555")).toBe("+15555555555");
});

function withEnv(vars: Record<string, string>) {
	const previous = { ...process.env };
	for (const [k, v] of Object.entries(vars)) {
		process.env[k] = v;
	}
	resetSmsConfig();
	return {
		[Symbol.dispose]() {
			for (const k of Object.keys(vars)) {
				if (previous[k] === undefined) {
					delete process.env[k];
				} else {
					process.env[k] = previous[k];
				}
			}
			resetSmsConfig();
		},
	};
}
