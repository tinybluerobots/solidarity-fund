import { layout } from "./layout.ts";

export type LogRow = {
  global_position: number;
  created: string;
  message_type: string;
  message_data: string;
};

export function logsPage(
  rows: LogRow[],
  page: number,
  totalPages: number,
  totalCount: number,
): string {
  return layout(
    "Event Log",
    `
<div class="max-w-5xl mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="font-heading font-bold text-2xl">Event Log</h1>
      <p class="text-bark-muted text-sm mt-1">${totalCount} events · Page ${page} of ${totalPages}</p>
    </div>
    <a href="/dashboard" class="btn btn-secondary text-sm">← Dashboard</a>
  </div>

  ${paginationControls(page, totalPages)}

  <div class="card mt-4 overflow-hidden">
    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="bg-cream-100">
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-16">#</th>
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-32">Time</th>
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200 w-56">Type</th>
          <th class="px-3 py-2 text-left font-heading text-xs uppercase tracking-wide text-bark-muted border-b border-cream-200">Description</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? emptyRow() : rows.map(renderRow).join("")}
      </tbody>
    </table>
  </div>

  ${totalPages > 1 ? paginationControls(page, totalPages) : ""}
</div>
`,
  );
}

function emptyRow(): string {
  return `<tr><td colspan="4" class="px-3 py-8 text-center text-bark-muted text-sm">No events yet.</td></tr>`;
}

function renderRow(row: LogRow): string {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(row.message_data) as Record<string, unknown>;
  } catch {
    // leave data empty — describeEvent handles missing fields
  }

  const description = describeEvent(row.message_type, data);

  return `<tr class="border-b border-cream-200 hover:bg-cream-50 transition-colors">
    <td class="px-3 py-2 font-mono text-xs text-bark-muted">${row.global_position}</td>
    <td class="px-3 py-2 text-bark-muted whitespace-nowrap">${relativeTime(row.created)}</td>
    <td class="px-3 py-2"><span class="${badgeClass(row.message_type)} inline-block text-xs px-1.5 py-0.5 rounded font-mono font-semibold">${escapeHtml(row.message_type)}</span></td>
    <td class="px-3 py-2 text-bark-light">${description}</td>
  </tr>`;
}

function paginationControls(page: number, totalPages: number): string {
  const prev =
    page > 1
      ? `<a href="/logs?page=${page - 1}" class="btn btn-secondary text-xs">← Prev</a>`
      : `<span class="btn btn-secondary text-xs opacity-40 cursor-not-allowed">← Prev</span>`;

  const next =
    page < totalPages
      ? `<a href="/logs?page=${page + 1}" class="btn btn-secondary text-xs">Next →</a>`
      : `<span class="btn btn-secondary text-xs opacity-40 cursor-not-allowed">Next →</span>`;

  return `<div class="flex items-center gap-2">${prev}${next}</div>`;
}

function badgeClass(type: string): string {
  if (type === "ApplicationWindowOpened" || type === "ApplicationWindowClosed" || type.startsWith("Lottery")) {
    return "bg-pink-100 text-pink-800";
  }
  if (type.startsWith("Application")) return "bg-yellow-100 text-yellow-800";
  if (type.startsWith("Applicant")) return "bg-blue-100 text-blue-800";
  if (type.startsWith("Volunteer") || type === "PasswordChanged") return "bg-purple-100 text-purple-800";
  if (type.startsWith("Grant") || type === "VolunteerReimbursed") return "bg-green-100 text-green-800";
  return "bg-cream-200 text-bark-muted";
}

export function describeEvent(
  type: string,
  data: Record<string, unknown>,
): string {
  const appRef = () =>
    escapeHtml(String(data.applicationId ?? "").slice(0, 8));

  switch (type) {
    case "ApplicationSubmitted":
      return `Application submitted · ref <strong>${appRef()}</strong>`;
    case "ApplicationAccepted":
      return `Application <strong>${appRef()}</strong> accepted`;
    case "ApplicationRejected":
      return `Application <strong>${appRef()}</strong> rejected · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "ApplicationFlaggedForReview":
      return `Application <strong>${appRef()}</strong> flagged · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "ApplicationSelected":
      return `Application <strong>${appRef()}</strong> selected · rank ${escapeHtml(String(data.rank ?? ""))}`;
    case "ApplicationNotSelected":
      return `Application <strong>${appRef()}</strong> not selected`;
    case "ApplicationConfirmed":
      return `Application <strong>${appRef()}</strong> confirmed`;
    case "ApplicationWindowOpened":
      return `Application window opened · ${escapeHtml(String(data.monthCycle ?? ""))}`;
    case "ApplicationWindowClosed":
      return `Application window closed · ${escapeHtml(String(data.monthCycle ?? ""))}`;
    case "ApplicantCreated":
      return `Applicant <strong>${escapeHtml(String(data.name ?? ""))}</strong> created`;
    case "ApplicantUpdated":
      return `Applicant <strong>${escapeHtml(String(data.name ?? ""))}</strong> updated`;
    case "ApplicantDeleted":
      return `Applicant deleted`;
    case "VolunteerCreated":
      return `Volunteer <strong>${escapeHtml(String(data.name ?? ""))}</strong> created`;
    case "VolunteerUpdated":
      return `Volunteer <strong>${escapeHtml(String(data.name ?? ""))}</strong> updated`;
    case "VolunteerDisabled":
      return `Volunteer disabled`;
    case "VolunteerEnabled":
      return `Volunteer re-enabled`;
    case "PasswordChanged":
      return `Password changed`;
    case "GrantCreated":
      return `Grant created · ${escapeHtml(String(data.paymentPreference ?? ""))}`;
    case "GrantPaid":
      return `<strong>£${escapeHtml(String(data.amount ?? ""))}</strong> paid via ${escapeHtml(String(data.method ?? ""))}`;
    case "SlotReleased":
      return `Grant slot released · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "VolunteerAssigned":
      return `Volunteer assigned to grant`;
    case "BankDetailsUpdated":
      return `Bank details updated`;
    case "ProofOfAddressApproved":
      return `Proof of address approved`;
    case "ProofOfAddressRejected":
      return `Proof of address rejected · <em class="text-bark-muted">${escapeHtml(String(data.reason ?? ""))}</em>`;
    case "CashAlternativeOffered":
      return `Cash alternative offered`;
    case "CashAlternativeAccepted":
      return `Cash alternative accepted`;
    case "CashAlternativeDeclined":
      return `Cash alternative declined`;
    case "VolunteerReimbursed":
      return `Volunteer reimbursed · ref ${escapeHtml(String(data.expenseReference ?? ""))}`;
    case "LotteryDrawn": {
      const selected = Array.isArray(data.selected) ? data.selected.length : 0;
      return `<strong>${selected}</strong> selected · <strong>£${escapeHtml(String(data.grantAmount ?? ""))}</strong> each · cycle ${escapeHtml(String(data.monthCycle ?? ""))}`;
    }
    default:
      return "";
  }
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffHr < 48) return "Yesterday";

  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
