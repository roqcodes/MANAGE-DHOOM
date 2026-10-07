export type ErpEmailPayload = {
  subject: string;
  heading: string;
  bodyLines: string[];
  actionLabel?: string;
  actionUrl?: string;
  footerNote?: string;
};

export function buildErpEmailHtml(payload: ErpEmailPayload): string {
  const actionBlock =
    payload.actionLabel && payload.actionUrl
      ? `<p style="margin:24px 0 0;">
          <a href="${payload.actionUrl}"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">
            ${payload.actionLabel}
          </a>
        </p>`
      : "";

  const lines = payload.bodyLines
    .map((line) => `<p style="margin:0 0 8px;color:#334155;line-height:1.5;">${line}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#0f172a;color:#fff;padding:20px 24px;">
              <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">DHOOM Trading Manage</p>
              <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;">${payload.heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              ${lines}
              ${actionBlock}
              ${payload.footerNote ? `<p style="margin:24px 0 0;font-size:12px;color:#64748b;">${payload.footerNote}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
              This is an automated message from DHOOM Trading Manage. Please do not reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
