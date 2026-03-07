import type { SQLiteEventStore } from "@event-driven-io/emmett-sqlite";
import { changePassword } from "../../domain/volunteer/commandHandlers.ts";
import type { VolunteerRepository } from "../../domain/volunteer/repository.ts";
import {
	clearSessionCookie,
	setSessionCookie,
} from "../../infrastructure/auth/cookie.ts";
import type { SessionStore } from "../../infrastructure/session/sqliteSessionStore.ts";
import { changePasswordPage } from "../pages/changePassword.ts";
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
		const location = volunteer.requiresPasswordReset ? "/change-password" : "/";
		return new Response(null, {
			status: 302,
			headers: {
				Location: location,
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

function changePasswordResponse(error: string): Response {
	return new Response(changePasswordPage(error), {
		status: 400,
		headers: { "Content-Type": "text/html" },
	});
}

export function handleChangePassword(
	volunteerRepo: VolunteerRepository,
	eventStore: SQLiteEventStore,
) {
	return async (req: Request, volunteerId: string): Promise<Response> => {
		const form = await req.formData();
		const currentPassword = form.get("currentPassword") as string;
		const newPassword = form.get("newPassword") as string;
		const confirmPassword = form.get("confirmPassword") as string;

		if (!currentPassword || !newPassword || !confirmPassword) {
			return changePasswordResponse("All fields are required");
		}
		if (newPassword !== confirmPassword) {
			return changePasswordResponse("New passwords do not match");
		}
		if (newPassword.length < 4) {
			return changePasswordResponse("Password must be at least 4 characters");
		}
		const valid = await volunteerRepo.verifyPassword(
			volunteerId,
			currentPassword,
		);
		if (!valid) {
			return changePasswordResponse("Current password is incorrect");
		}
		await changePassword(volunteerId, newPassword, eventStore);
		return new Response(null, {
			status: 302,
			headers: { Location: "/" },
		});
	};
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
