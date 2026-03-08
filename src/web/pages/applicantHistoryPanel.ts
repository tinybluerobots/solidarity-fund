export type HistoryEntry = {
	type: "ApplicantCreated" | "ApplicantUpdated" | "ApplicantDeleted";
	volunteerName: string | null;
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

function eventLabel(entry: HistoryEntry): string {
	switch (entry.type) {
		case "ApplicantCreated":
			return entry.volunteerName
				? `Created by <span class="font-semibold text-bark">${entry.volunteerName}</span>`
				: "Created via application";
		case "ApplicantUpdated":
			return `Updated by <span class="font-semibold text-bark">${entry.volunteerName ?? "unknown"}</span>`;
		case "ApplicantDeleted":
			return `Deleted by <span class="font-semibold text-bark">${entry.volunteerName ?? "unknown"}</span>`;
	}
}

function eventIcon(type: HistoryEntry["type"]): string {
	switch (type) {
		case "ApplicantCreated":
			return `<div class="w-2 h-2 rounded-full bg-green-500"></div>`;
		case "ApplicantUpdated":
			return `<div class="w-2 h-2 rounded-full bg-amber"></div>`;
		case "ApplicantDeleted":
			return `<div class="w-2 h-2 rounded-full bg-red-500"></div>`;
	}
}

export function historyPanel(entries: HistoryEntry[]): string {
	if (entries.length === 0) {
		return `<div id="history-content" class="py-8 text-center text-bark-muted text-sm">No history</div>`;
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
