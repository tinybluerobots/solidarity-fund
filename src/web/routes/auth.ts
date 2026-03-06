import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import {
	clearSessionCookie,
	setSessionCookie,
} from "../../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../../infrastructure/session/sqliteSessionStore.ts";
import { loginPage } from "../pages/login.ts";

export function handleLogin(
	sessionStore: SessionStore,
	volunteerRepo: VolunteerRepository,
) {
	return async (req: Request): Promise<Response> => {
		const form = await req.formData();
		const name = form.get("name") as string;
		const password = form.get("password") as string;

		if (!name || !password) {
			return loginResponse("Name and password are required");
		}

		const volunteer = await volunteerRepo.getByName(name);
		if (!volunteer) {
			return loginResponse("Invalid name or password");
		}

		const valid = await volunteerRepo.verifyPassword(volunteer.id, password);
		if (!valid) {
			return loginResponse("Invalid name or password");
		}

		const sessionId = await sessionStore.create(volunteer.id);
		return new Response(null, {
			status: 302,
			headers: {
				Location: "/",
				"Set-Cookie": setSessionCookie(sessionId),
			},
		});
	};
}

function loginResponse(error: string): Response {
	return new Response(loginPage(error), {
		status: 401,
		headers: { "Content-Type": "text/html" },
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
