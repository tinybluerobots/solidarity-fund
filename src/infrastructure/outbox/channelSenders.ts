import type { SmsClient } from "../sms/client.ts";
import type { ChannelSender } from "./types.ts";

export function buildChannelSenders(
	smsClient: SmsClient,
): Map<string, ChannelSender> {
	const senders = new Map<string, ChannelSender>();
	senders.set("sms", {
		send: (recipient: string, body: string) =>
			smsClient.send({ to: recipient, body }),
	});
	return senders;
}
