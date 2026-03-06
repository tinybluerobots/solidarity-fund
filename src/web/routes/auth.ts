import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/src/web/serverSentEventGenerator.js";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import {
	clearSessionCookie,
	setSessionCookie,
} from "../../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../../infrastructure/session/sqliteSessionStore.ts";

export function handleLogin(
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
) {
	return async (req: Request): Promise<Response> => {
		const result = await ServerSentEventGenerator.readSignals(req);
		if (!result.success) {
			return new Response("Bad request", { status: 400 });
		}

		const { name, password } = result.signals as {
			name: string;
			password: string;
		};

		const volunteer = await volunteerRepo.getByName(name);
		if (!volunteer) {
			return loginError("Invalid name or password");
		}

		const valid = await volunteerRepo.verifyPassword(volunteer.id, password);
		if (!valid) {
			return loginError("Invalid name or password");
		}

		const sessionId = await sessionStore.create(volunteer.id);
		const cookie = setSessionCookie(sessionId);

		return ServerSentEventGenerator.stream((sse) => {
			sse.executeScript(
				`document.cookie = '${cookie}'; window.location.href = '/'`,
			);
		});
	};
}

function loginError(message: string): Response {
	return ServerSentEventGenerator.stream((sse) => {
		sse.patchElements(
			`<div id="error-container"><div id="error-message">${escapeHtml(message)}</div></div>`,
		);
	});
}

export function handleLogout(sessionStore: SessionStore) {
	return async (req: Request): Promise<Response> => {
		const { getSessionId } = await import(
			"../../infrastructure/auth/cookie.ts"
		);
		const sid = getSessionId(req);
		if (sid) {
			await sessionStore.destroy(sid);
		}
		return new Response(null, {
			status: 302,
			headers: {
				Location: "/login",
				"Set-Cookie": clearSessionCookie(),
			},
		});
	};
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
