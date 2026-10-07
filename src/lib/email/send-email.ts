import "server-only";

import { buildErpEmailHtml, type ErpEmailPayload } from "@/lib/email/erp-email-template";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "DHOOM TRADING <onboarding@resend.dev>";
  return { apiKey, from };
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  const { apiKey, from } = getEmailConfig();
  if (!apiKey) {
    console.warn("[sendEmail] RESEND_API_KEY not set — email not sent:", input.subject);
    return { ok: false, error: "Email service not configured. Set RESEND_API_KEY and EMAIL_FROM." };
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[sendEmail] Resend error:", response.status, body);
    return { ok: false, error: `Email failed (${response.status})` };
  }

  return { ok: true };
}

export async function sendErpTemplatedEmail(
  to: string,
  payload: ErpEmailPayload,
): Promise<{ ok: boolean; error?: string }> {
  const text = [payload.heading, ...payload.bodyLines, payload.footerNote ?? ""]
    .filter(Boolean)
    .join("\n\n");

  return sendEmail({
    to,
    subject: payload.subject,
    html: buildErpEmailHtml(payload),
    text,
  });
}
