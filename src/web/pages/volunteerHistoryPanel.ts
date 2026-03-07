import type { VolunteerEventType } from "../../domain/volunteer/types.ts";

export type VolunteerHistoryEntry = {
	type: VolunteerEventType;
	timestamp: string;
};

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function eventLabel(type: VolunteerEventType): string {
	switch (type) {
		case "VolunteerCreated":
			return "Account created";
		case "VolunteerUpdated":
			return "Details updated";
		case "VolunteerDisabled":
			return "Account disabled";
		case "VolunteerEnabled":
			return "Account enabled";
		case "PasswordChanged":
			return "Password changed";
	}
}

function eventIcon(type: VolunteerEventType): string {
	switch (type) {
		case "VolunteerCreated":
			return '<div class="w-2 h-2 rounded-full bg-green-500"></div>';
		case "VolunteerUpdated":
			return '<div class="w-2 h-2 rounded-full bg-amber"></div>';
		case "VolunteerDisabled":
			return '<div class="w-2 h-2 rounded-full bg-red-500"></div>';
		case "VolunteerEnabled":
			return '<div class="w-2 h-2 rounded-full bg-green-500"></div>';
		case "PasswordChanged":
			return '<div class="w-2 h-2 rounded-full bg-blue-500"></div>';
	}
}

export function volunteerHistoryPanel(
	entries: VolunteerHistoryEntry[],
): string {
	if (entries.length === 0) {
		return '<div id="history-content" class="py-8 text-center text-bark-muted text-sm">No history</div>';
	}

	const sorted = [...entries].reverse();

	const items = sorted
		.map(
			(entry) => `
		<div class="flex items-start gap-3 py-3">
			<div class="mt-1.5">${eventIcon(entry.type)}</div>
			<div>
				<p class="text-sm font-body text-bark-muted">${eventLabel(entry.type)}</p>
				<p class="text-xs text-bark-muted/60 mt-0.5">${formatDate(entry.timestamp)} at ${formatTime(entry.timestamp)}</p>
			</div>
		</div>`,
		)
		.join("");

	return `<div id="history-content" class="divide-y divide-cream-200">${items}</div>`;
}
