import type { Recipient } from "../../domain/recipient/types.ts";

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

const inputClass =
	"w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15";
const btnAmber =
	"px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";
const btnSecondary =
	"px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent";

export function viewPanel(r: Recipient): string {
	const bankFields =
		r.paymentPreference === "bank" && r.bankDetails
			? `${field("Sort Code", r.bankDetails.sortCode)}${field("Account Number", r.bankDetails.accountNumber)}`
			: "";

	const meetingField =
		r.paymentPreference === "cash" && r.meetingPlace
			? field("Meeting Place", r.meetingPlace)
			: "";

	const emailField = r.email ? field("Email", r.email) : "";
	const notesField = r.notes ? field("Notes", r.notes) : "";

	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">${escapeHtml(r.name)}</h2>
      <button class="${btnSecondary}" data-on-click="document.getElementById('panel').innerHTML=''">Close</button>
    </div>
    <dl>
      ${field("Phone", r.phone)}
      ${emailField}
      ${field("Payment Preference", r.paymentPreference === "bank" ? "Bank" : "Cash")}
      ${bankFields}
      ${meetingField}
      ${notesField}
    </dl>
    <div id="delete-area" class="flex gap-3 mt-6">
      <button class="${btnAmber}" data-on-click="@get('/recipients/${r.id}/edit')">Edit</button>
      <button class="${btnSecondary}" data-on-click="
        document.getElementById('delete-area').innerHTML=\`
          <span class='font-body text-bark-muted text-sm'>Are you sure?</span>
          <button class='${btnAmber}' data-on-click='@delete(\"/recipients/${r.id}\")'>Confirm</button>
          <button class='${btnSecondary}' data-on-click='@get(\"/recipients/${r.id}\")'>Cancel</button>
        \`
      ">Delete</button>
    </div>
  `);
}

function recipientForm(opts: {
	action: string;
	method: "@put" | "@post";
	submitLabel: string;
	name: string;
	phone: string;
	email: string;
	paymentPreference: "bank" | "cash";
	sortCode: string;
	accountNumber: string;
	meetingPlace: string;
	notes: string;
	cancelTarget: string;
}): string {
	const bankChecked = opts.paymentPreference === "bank" ? "checked" : "";
	const cashChecked = opts.paymentPreference === "cash" ? "checked" : "";

	return `
    <form data-on-submit__prevent="${opts.method}('${opts.action}')" data-store='{"formPref":"${opts.paymentPreference}"}'>
      <div class="mb-4">
        <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Name</label>
        <input class="${inputClass}" type="text" name="name" value="${escapeHtml(opts.name)}" required />
      </div>
      <div class="mb-4">
        <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Phone</label>
        <input class="${inputClass}" type="tel" name="phone" value="${escapeHtml(opts.phone)}" required />
      </div>
      <div class="mb-4">
        <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Email</label>
        <input class="${inputClass}" type="email" name="email" value="${escapeHtml(opts.email)}" />
      </div>
      <div class="mb-4">
        <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-2">Payment Preference</label>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
            <input type="radio" name="paymentPreference" value="bank" ${bankChecked} data-on-change="$formPref='bank'" />
            Bank
          </label>
          <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
            <input type="radio" name="paymentPreference" value="cash" ${cashChecked} data-on-change="$formPref='cash'" />
            Cash
          </label>
        </div>
      </div>
      <div data-show="$formPref==='bank'">
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Sort Code</label>
          <input class="${inputClass}" type="text" name="sortCode" value="${escapeHtml(opts.sortCode)}" />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Account Number</label>
          <input class="${inputClass}" type="text" name="accountNumber" value="${escapeHtml(opts.accountNumber)}" />
        </div>
      </div>
      <div data-show="$formPref==='cash'">
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Meeting Place</label>
          <input class="${inputClass}" type="text" name="meetingPlace" value="${escapeHtml(opts.meetingPlace)}" />
        </div>
      </div>
      <div class="mb-6">
        <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Notes</label>
        <textarea class="${inputClass}" name="notes" rows="3">${escapeHtml(opts.notes)}</textarea>
      </div>
      <div class="flex gap-3">
        <button type="submit" class="${btnAmber}">${opts.submitLabel}</button>
        <button type="button" class="${btnSecondary}" data-on-click="${opts.cancelTarget}">Cancel</button>
      </div>
    </form>
  `;
}

export function editPanel(r: Recipient): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Edit Recipient</h2>
      <button class="${btnSecondary}" data-on-click="document.getElementById('panel').innerHTML=''">Close</button>
    </div>
    ${recipientForm({
			action: `/recipients/${r.id}`,
			method: "@put",
			submitLabel: "Save",
			name: r.name,
			phone: r.phone,
			email: r.email ?? "",
			paymentPreference: r.paymentPreference,
			sortCode: r.bankDetails?.sortCode ?? "",
			accountNumber: r.bankDetails?.accountNumber ?? "",
			meetingPlace: r.meetingPlace ?? "",
			notes: r.notes ?? "",
			cancelTarget: `@get('/recipients/${r.id}')`,
		})}
  `);
}

export function createPanel(): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">New Recipient</h2>
      <button class="${btnSecondary}" data-on-click="document.getElementById('panel').innerHTML=''">Close</button>
    </div>
    ${recipientForm({
			action: "/recipients",
			method: "@post",
			submitLabel: "Create",
			name: "",
			phone: "",
			email: "",
			paymentPreference: "bank",
			sortCode: "",
			accountNumber: "",
			meetingPlace: "",
			notes: "",
			cancelTarget: "document.getElementById('panel').innerHTML=''",
		})}
  `);
}
