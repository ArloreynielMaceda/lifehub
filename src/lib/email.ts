import "server-only";

/**
 * Minimal transactional-email integration for reminder digests. Uses Resend's REST API when
 * RESEND_API_KEY and EMAIL_FROM are configured; otherwise email is disabled and the app only
 * shows in-app notifications. Delivery is not claimed until this is configured and tested.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ ok: boolean; error?: string }>;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function getEmailProvider(): EmailProvider | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;

  return {
    async send(message) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        });
        if (!response.ok) return { ok: false, error: `status ${response.status}` };
        return { ok: true };
      } catch {
        return { ok: false, error: "network" };
      }
    },
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildReminderDigest(
  name: string,
  items: { title: string; body: string }[],
  siteUrl: string,
): Omit<EmailMessage, "to"> {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const subject = items.length === 1 ? `Reminder: ${items[0]!.title}` : `${items.length} things need your attention`;
  const text = [
    greeting,
    "",
    "Here's what's due in LifeHub:",
    ...items.map((item) => `• ${item.title} (${item.body})`),
    "",
    `Open LifeHub: ${siteUrl}/dashboard`,
    "",
    "You can turn these emails off in Settings.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1b1f1d">
<p>${escapeHtml(greeting)}</p><p>Here's what's due in LifeHub:</p>
<ul>${items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong> <span style="color:#5f6360">(${escapeHtml(item.body)})</span></li>`).join("")}</ul>
<p><a href="${escapeHtml(siteUrl)}/dashboard" style="color:#1d6746">Open LifeHub</a></p>
<p style="color:#5f6360;font-size:13px">You can turn these emails off in Settings.</p></div>`;
  return { subject, text, html };
}
