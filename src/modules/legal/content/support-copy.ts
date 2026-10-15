import { SUPPORT_EMAIL } from "@/modules/legal/content/support-contact";

export const supportSections = [
  {
    title: "Email",
    body: `For order issues, account access, billing questions, or privacy requests, email us at ${SUPPORT_EMAIL}. Include your registered email and order reference if applicable.`,
  },
  {
    title: "Response time",
    body: "We aim to reply within 1–2 business days. Urgent delivery issues: mention “Urgent” in the subject line and your order number.",
  },
  {
    title: "In the app",
    body: "Signed-in customers can use Account → Get Help to open email, view orders, and update delivery addresses. Push notification settings are under Account → Notifications.",
  },
  {
    title: "Account deletion",
    body: "You can delete your account from the app (Account → Delete account) or from our delete-account page. Open orders must be completed or cancelled first.",
  },
] as const;
