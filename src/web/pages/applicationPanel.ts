import type { ApplicationRow } from "../../domain/application/repository.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="fixed top-0 right-0 h-full w-96 bg-cream-50 border-l border-cream-200 shadow-lg overflow-y-auto animate-[slideIn_0.2s_ease-out] z-50">
  <div class="p-6">${content}</div>
  <style>@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }</style>
</div>`;
}

function field(label: string, value: string): string {
	return `<div class="mb-4">
    <dt class="text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">${label}</dt>
    <dd class="font-body text-bark">${escapeHtml(value)}</dd>
  </div>`;
}

const btnSecondary =
	"px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent";
const btnAmber =
	"px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";
const btnDanger =
	"px-4 py-2 rounded-md text-sm font-semibold bg-red-600 text-white cursor-pointer border-none hover:bg-red-700 transition-colors";

function formatStatus(status: string): string {
	return status
		.split("_")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function formatPaymentPreference(pref: string): string {
	if (pref === "bank") return "Bank Transfer";
	if (pref === "cash") return "Cash";
	return pref;
}

function formatDate(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	return d.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function detailFields(app: ApplicationRow): string {
	const fields = [
		field("Name", app.name ?? "—"),
		field("Phone", app.phone ?? "—"),
		field("Status", formatStatus(app.status)),
		field("Payment Preference", formatPaymentPreference(app.paymentPreference)),
		field("Month Cycle", app.monthCycle),
		field("Applied", formatDate(app.appliedAt)),
	];

	if (app.rejectReason) {
		fields.push(field("Reject Reason", app.rejectReason));
	}

	if (app.rank != null) {
		fields.push(field("Lottery Rank", String(app.rank)));
	}

	return fields.join("\n");
}

export function viewPanel(app: ApplicationRow): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(app.name ?? "Application")}</h2>
      <button class="${btnSecondary}" data-on-click="@get('/applications/close')">Close</button>
    </div>
    <dl>
      ${detailFields(app)}
    </dl>
  `);
}

export function reviewPanel(app: ApplicationRow): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(app.name ?? "Review Application")}</h2>
      <button class="${btnSecondary}" data-on-click="@get('/applications/close')">Close</button>
    </div>
    <dl>
      ${detailFields(app)}
    </dl>
    <div class="flex gap-3 mt-6">
      <button class="${btnAmber}" data-on-click="@post('/applications/${encodeURIComponent(app.id)}/review?decision=confirm')">Confirm</button>
      <button class="${btnDanger}" data-on-click="@post('/applications/${encodeURIComponent(app.id)}/review?decision=reject')">Reject</button>
    </div>
  `);
}
