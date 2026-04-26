import { createChallenge } from "altcha-lib/v1";

export function createAltchaRoutes(hmacKey: string) {
	return {
		async challenge(): Promise<Response> {
			const challenge = await createChallenge({
				hmacKey,
				maxNumber: 50000,
				expires: new Date(Date.now() + 2 * 60 * 1000),
			});
			return new Response(JSON.stringify(challenge), {
				headers: { "Content-Type": "application/json" },
			});
		},
	};
}
