import type { ApplicationRow } from "../../domain/application/repository.ts";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="panel">
  <div class="p-6">${content}</div>
</div>`;
}

function field(label: string, value: string): string {
	return `<div class="mb-4">
    <dt class="label">${label}</dt>
    <dd class="font-body text-bark">${escapeHtml(value)}</dd>
  </div>`;
}

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

	if (app.acceptedAt) fields.push(field("Accepted", formatDate(app.acceptedAt)));
	if (app.selectedAt) fields.push(field("Selected", formatDate(app.selectedAt)));
	if (app.rejectedAt) fields.push(field("Rejected", formatDate(app.rejectedAt)));
	if (app.rank != null) fields.push(field("Lottery Rank", String(app.rank)));
	if (app.rejectReason) fields.push(field("Reject Reason", app.rejectReason));

	if (app.sortCode) fields.push(field("Sort Code", app.sortCode));
	if (app.accountNumber) fields.push(field("Account Number", app.accountNumber));

	if (app.poaRef) {
		fields.push(
			`<div class="mb-4">
    <dt class="label">Proof of Address</dt>
    <dd><a href="/applications/${encodeURIComponent(app.id)}/documents/poa" target="_blank" class="text-sm text-blue-600 hover:text-blue-800 underline">View document</a></dd>
  </div>`,
		);
	}

	return fields.join("\n");
}

function applicantLink(applicantId: string | null): string {
	if (!applicantId) return "";
	return `<a href="/applicants/${encodeURIComponent(applicantId)}/edit" class="text-sm text-blue-600 hover:text-blue-800 underline">View Applicant</a>`;
}

export function viewPanel(
	app: ApplicationRow,
	applicantId: string | null = null,
): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(app.name ?? "Application")}</h2>
        ${applicantLink(applicantId)}
      </div>
      <button class="btn btn-secondary" data-on-click="@get('/applications/close')">Close</button>
    </div>
    <dl>
      ${detailFields(app)}
    </dl>
  `);
}

export function reviewPanel(
	app: ApplicationRow,
	applicantId: string | null = null,
): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(app.name ?? "Review Application")}</h2>
        ${applicantLink(applicantId)}
      </div>
      <button class="btn btn-secondary" data-on-click="@get('/applications/close')">Close</button>
    </div>
    <dl>
      ${detailFields(app)}
    </dl>
    <div class="flex gap-3 mt-6">
      <button class="btn btn-primary" data-on-click="@post('/applications/${encodeURIComponent(app.id)}/review?decision=confirm')">Confirm</button>
      <button class="btn btn-danger" data-on-click="@post('/applications/${encodeURIComponent(app.id)}/review?decision=reject')">Reject</button>
    </div>
  `);
}
