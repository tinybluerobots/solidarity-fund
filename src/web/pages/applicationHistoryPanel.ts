import type { ApplicationEvent } from "../../domain/application/types.ts";

export type ApplicationHistoryEntry = {
	type: "ApplicationConfirmed" | "ApplicationRejected";
	volunteerName: string | null;
	timestamp: string;
};

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

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

function eventLabel(entry: ApplicationHistoryEntry): string {
	const name = entry.volunteerName
		? `<span class="font-semibold text-bark">${escapeHtml(entry.volunteerName)}</span>`
		: "a volunteer";
	switch (entry.type) {
		case "ApplicationConfirmed":
			return `Confirmed by ${name}`;
		case "ApplicationRejected":
			return `Rejected by ${name}`;
	}
}

function eventIcon(type: ApplicationHistoryEntry["type"]): string {
	switch (type) {
		case "ApplicationConfirmed":
			return '<div class="w-2 h-2 rounded-full bg-green-500"></div>';
		case "ApplicationRejected":
			return '<div class="w-2 h-2 rounded-full bg-red-500"></div>';
	}
}

export function applicationHistoryPanel(
	entries: ApplicationHistoryEntry[],
): string {
	if (entries.length === 0) {
		return '<div id="history-content" class="py-8 text-center text-bark-muted text-sm">No review history</div>';
	}

	const sorted = [...entries].reverse();

	const items = sorted
		.map(
			(entry) => `
		<div class="flex items-start gap-3 py-3">
			<div class="mt-1.5">${eventIcon(entry.type)}</div>
			<div>
				<p class="text-sm font-body text-bark-muted">${eventLabel(entry)}</p>
				<p class="text-xs text-bark-muted/60 mt-0.5">${formatDate(entry.timestamp)} at ${formatTime(entry.timestamp)}</p>
			</div>
		</div>`,
		)
		.join("");

	return `<div id="history-content" class="divide-y divide-cream-200">${items}</div>`;
}

export function extractReviewHistory(
	events: ApplicationEvent[],
	volunteerNames: Map<string, string>,
): ApplicationHistoryEntry[] {
	return events
		.filter(
			(
				e,
			): e is Extract<
				ApplicationEvent,
				{ type: "ApplicationConfirmed" | "ApplicationRejected" }
			> =>
				e.type === "ApplicationConfirmed" || e.type === "ApplicationRejected",
		)
		.map((e) => {
			const volunteerId = e.data.volunteerId;
			const timestamp =
				e.type === "ApplicationConfirmed"
					? e.data.confirmedAt
					: e.data.rejectedAt;
			return {
				type: e.type,
				volunteerName: volunteerId
					? (volunteerNames.get(volunteerId) ?? "unknown")
					: null,
				timestamp,
			};
		});
}
