import type { Recipient } from "../../domain/recipient/types.ts";

function escapeSignalValue(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function panelWrapper(content: string): string {
	return `<div id="panel" class="fixed top-0 right-0 h-full w-96 bg-cream-50 border-l border-cream-200 shadow-lg overflow-y-auto animate-[slideIn_0.2s_ease-out] z-50">
  <div class="p-6">${content}</div>
  <style>@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }</style>
</div>`;
}

const inputClass =
	"w-full px-3 py-2.5 border border-cream-300 rounded-md font-body text-bark bg-cream-50 transition-all focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/15";
const btnAmber =
	"px-4 py-2 bg-amber text-cream-50 rounded-md font-heading font-semibold text-sm cursor-pointer transition-colors hover:bg-amber-dark border-none";
const btnSecondary =
	"px-4 py-2 rounded-md font-heading font-semibold text-sm border border-cream-200 text-bark hover:bg-cream-100 cursor-pointer transition-colors bg-transparent";

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
	deleteAction?: string;
}): string {
	const bankChecked = opts.paymentPreference === "bank" ? "checked" : "";
	const cashChecked = opts.paymentPreference === "cash" ? "checked" : "";

	return `
    <div data-signals="{name: '${escapeSignalValue(opts.name)}', phone: '${escapeSignalValue(opts.phone)}', email: '${escapeSignalValue(opts.email)}', paymentPreference: '${opts.paymentPreference}', sortCode: '${escapeSignalValue(opts.sortCode)}', accountNumber: '${escapeSignalValue(opts.accountNumber)}', meetingPlace: '${escapeSignalValue(opts.meetingPlace)}', notes: '${escapeSignalValue(opts.notes)}'}">
      <form data-on-submit__prevent="${opts.method}('${opts.action}')">
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Name</label>
          <input class="${inputClass}" type="text" data-bind-name required />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Phone</label>
          <input class="${inputClass}" type="tel" data-bind-phone required pattern="[0-9]*" inputmode="numeric" />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Email</label>
          <input class="${inputClass}" type="email" data-bind-email />
        </div>
        <div class="mb-4">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-2">Payment Preference</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
              <input type="radio" name="paymentPreference" value="bank" ${bankChecked} data-bind-payment-preference />
              Bank
            </label>
            <label class="flex items-center gap-2 font-body text-bark cursor-pointer">
              <input type="radio" name="paymentPreference" value="cash" ${cashChecked} data-bind-payment-preference />
              Cash
            </label>
          </div>
        </div>
        <div data-show="$paymentPreference==='bank'">
          <div class="mb-4">
            <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Sort Code</label>
            <input class="${inputClass}" type="text" data-bind-sort-code />
          </div>
          <div class="mb-4">
            <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Account Number</label>
            <input class="${inputClass}" type="text" data-bind-account-number />
          </div>
        </div>
        <div data-show="$paymentPreference==='cash'">
          <div class="mb-4">
            <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Meeting Place</label>
            <input class="${inputClass}" type="text" data-bind-meeting-place />
          </div>
        </div>
        <div class="mb-6">
          <label class="block text-xs font-heading font-semibold text-bark-muted uppercase tracking-wide mb-1">Notes</label>
          <textarea class="${inputClass}" data-bind-notes rows="3"></textarea>
        </div>
        <div class="flex gap-3" data-signals="{confirmDelete: false}">
          <button type="submit" class="${btnAmber}">${opts.submitLabel}</button>
          ${
						opts.deleteAction
							? `<button type="button" class="${btnSecondary} ml-auto" data-show="!$confirmDelete" data-on-click="$confirmDelete = true">Delete</button>
          <span data-show="$confirmDelete" class="flex items-center gap-2 ml-auto" style="display:none">
            <span class="font-body text-bark-muted text-sm">Sure?</span>
            <button type="button" class="px-3 py-1 rounded-md text-sm font-semibold bg-red-600 text-white cursor-pointer border-none hover:bg-red-700 transition-colors" data-on-click="${opts.deleteAction}">Confirm</button>
            <button type="button" class="${btnSecondary}" data-on-click="$confirmDelete = false">No</button>
          </span>`
							: ""
					}
        </div>
      </form>
    </div>
  `;
}

export function editPanel(r: Recipient): string {
	return panelWrapper(`
    <div data-signals="{activeTab: 'details', historyLoaded: false}">
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">Edit Recipient</h2>
      <button class="${btnSecondary}" data-on-click="@get('/recipients/close')">Close</button>
    </div>
    <div class="flex gap-1 mb-4 border-b border-cream-200">
      <button type="button"
        class="px-3 py-1.5 text-sm font-heading font-semibold cursor-pointer transition-colors border-b-2 border-transparent text-bark-muted hover:text-bark"
        data-class-border-amber="$activeTab==='details'"
        data-class-text-amber="$activeTab==='details'"
        data-on-click="$activeTab='details'">Details</button>
      <button type="button"
        class="px-3 py-1.5 text-sm font-heading font-semibold cursor-pointer transition-colors border-b-2 border-transparent text-bark-muted hover:text-bark"
        data-class-border-amber="$activeTab==='history'"
        data-class-text-amber="$activeTab==='history'"
        data-on-click="$activeTab='history'; if(!$historyLoaded){$historyLoaded=true; @get('/recipients/${r.id}/history')}">History</button>
    </div>
    <div data-show="$activeTab==='details'">
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

			deleteAction: `@delete('/recipients/${r.id}')`,
		})}
    </div>
    <div data-show="$activeTab==='history'" style="display:none">
      <div id="history-content" class="py-8 text-center text-bark-muted text-sm">Loading...</div>
    </div>
    </div>
  `);
}

export function createPanel(): string {
	return panelWrapper(`
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-heading font-bold text-xl text-bark">New Recipient</h2>
      <button class="${btnSecondary}" data-on-click="@get('/recipients/close')">Close</button>
    </div>
    ${recipientForm({
			action: "/recipients",
			method: "@post",
			submitLabel: "Create",
			name: "",
			phone: "",
			email: "",
			paymentPreference: "cash",
			sortCode: "",
			accountNumber: "",
			meetingPlace: "",
			notes: "",
		})}
  `);
}
