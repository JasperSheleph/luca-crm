/**
 * WhatsApp Cloud API sender.
 *
 * Ships disabled and does nothing until three separate things are true: the
 * `whatsapp_enabled` setting is on, both env vars are present, and Meta has
 * approved the template. Any one of them missing is a *skip*, never an error —
 * the notification has already been written to notifications_log by the time
 * this is called, so the in-app centre shows it either way and nobody loses a
 * message because a token expired.
 *
 * No SDK. This is one HTTP POST, and a dependency here would be one more thing
 * to keep up to date for no benefit.
 */

export interface WhatsAppResult {
  status: "sent" | "failed" | "skipped";
  error: string | null;
}

/** Pinned. Meta retires Graph versions on a schedule; a floating one breaks silently. */
const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 10_000;

export function whatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export async function sendWhatsApp(
  to: string,
  templateName: string,
  params: string[],
): Promise<WhatsAppResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) return { status: "skipped", error: null };
  if (!to) return { status: "skipped", error: "no phone number on file" };

  // Cloud API wants the number with country code and no punctuation.
  const recipient = to.replace(/\D/g, "");

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name: templateName,
            language: { code: "en" },
            components: params.length
              ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
              : [],
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { status: "failed", error: `${response.status} ${detail}`.slice(0, 500) };
    }
    return { status: "sent", error: null };
  } catch (error) {
    // A network failure must not take down the job that was sending. The row
    // is already in notifications_log with the error attached.
    return { status: "failed", error: (error as Error).message.slice(0, 500) };
  }
}
