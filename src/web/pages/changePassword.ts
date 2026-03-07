import { layout } from "./layout.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function changePasswordPage(error?: string): string {
	const errorHtml = error
		? `<div id="error-message" class="bg-red-50 border border-red-200 text-red-800 px-3 py-2.5 rounded-md text-sm mb-5">${escapeHtml(error)}</div>`
		: "";

	return layout(
		"Change Password",
		`
	<div class="flex items-center justify-center min-h-screen p-4">
		<div class="bg-cream-50 border border-cream-200 rounded-xl p-10 w-full max-w-sm shadow-sm animate-[fadeIn_0.4s_ease-out]">
			<h1 class="font-heading font-bold text-2xl text-bark mb-1">Change Password</h1>
			<p class="text-bark-muted text-sm mb-8">Please set a new password to continue.</p>

			<form method="POST" action="/change-password">
				${errorHtml}

				<label for="currentPassword" class="block text-sm font-semibold text-bark-light mb-1">Current Password</label>
				<input
					type="password"
					id="currentPassword"
					name="currentPassword"
					autocomplete="current-password"
					required
					class="w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-5 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
				>

				<label for="newPassword" class="block text-sm font-semibold text-bark-light mb-1">New Password</label>
				<input
					type="password"
					id="newPassword"
					name="newPassword"
					autocomplete="new-password"
					required
					class="w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-5 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
				>

				<label for="confirmPassword" class="block text-sm font-semibold text-bark-light mb-1">Confirm New Password</label>
				<input
					type="password"
					id="confirmPassword"
					name="confirmPassword"
					autocomplete="new-password"
					required
					class="w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 mb-5 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15"
				>

				<button type="submit" class="w-full py-3 bg-amber text-cream-50 rounded-md font-heading font-semibold cursor-pointer transition-colors hover:bg-amber-dark active:bg-amber-dark/90">
					Change Password
				</button>
			</form>
		</div>
	</div>

	<style>
		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(8px); }
			to { opacity: 1; transform: translateY(0); }
		}
		@keyframes shake {
			0%, 100% { transform: translateX(0); }
			20%, 60% { transform: translateX(-6px); }
			40%, 80% { transform: translateX(6px); }
		}
		#error-message {
			animation: shake 0.4s ease-out;
		}
	</style>
`,
	);
}
