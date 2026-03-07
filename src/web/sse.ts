type PatchOptions = {
	selector?: string;
	mode?: "outer" | "inner" | "replace" | "prepend" | "append" | "before" | "after" | "remove";
};

export function patchElements(html: string, options?: PatchOptions): string {
	let event = "event: datastar-patch-elements\n";
	if (options?.selector) event += `data: selector ${options.selector}\n`;
	if (options?.mode) event += `data: mode ${options.mode}\n`;
	const lines = html.split("\n");
	for (const line of lines) {
		event += `data: elements ${line}\n`;
	}
	event += "\n";
	return event;
}

export function patchSignals(signals: Record<string, unknown>): string {
	return `event: datastar-patch-signals\ndata: signals ${JSON.stringify(signals)}\n\n`;
}

export function sseResponse(...events: string[]): Response {
	return new Response(events.join(""), {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
		},
	});
}
