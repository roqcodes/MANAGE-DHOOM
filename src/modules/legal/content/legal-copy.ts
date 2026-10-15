import { SUPPORT_EMAIL } from "@/modules/legal/content/support-contact";

export const LEGAL_LAST_UPDATED = "October 15, 2026";

export const privacySections = [
  {
    title: "Who we are",
    body: `DHOOM Trading ("we", "us") operates the DHOOM Trading mobile and web storefront and related order services. The DHOOM Manage console is used by our team for fulfillment and is separate from your customer account.`,
  },
  {
    title: "Information we collect",
    body: `Account data: name, email, phone, password (stored securely by our auth provider), and profile preferences.
Order data: items, quantities, prices, delivery addresses, order status, invoices, and payment status (including wallet balance and transaction references when wallet features are enabled).
Device data: push notification tokens if you enable notifications; basic device/OS information for app stability.
Usage data: actions needed to run the service (for example sign-in, cart, and checkout events) stored in our database hosted on Supabase.`,
  },
  {
    title: "How we use information",
    body: `We use your information to create and manage your account, process orders, deliver products, provide support, send service notifications you opt into, prevent fraud, and comply with law. We do not sell your personal information.`,
  },
  {
    title: "Sharing",
    body: `We share data with service providers that help us operate the app (hosting, authentication, email, and payment/wallet infrastructure where enabled). We may disclose information if required by law or to protect rights, safety, and security.`,
  },
  {
    title: "Retention",
    body: `We keep account profile data while your account is active. When you delete your account, we remove or anonymize app profile data. We may retain order, invoice, and tax records in anonymized or minimized form where required for accounting, disputes, chargebacks, or legal obligations—consistent with Google Play and Apple App Store data deletion requirements.`,
  },
  {
    title: "Your choices",
    body: `You can update profile details in the app, manage notification preferences, and request account deletion in the app (Account → Delete account) or on our delete-account page. You may contact us at ${SUPPORT_EMAIL} for privacy questions.`,
  },
  {
    title: "Security",
    body: `We use industry-standard measures including encrypted connections and access controls. No method of transmission or storage is 100% secure.`,
  },
  {
    title: "Children",
    body: `The service is not directed to children under 13 (or the minimum age in your region). We do not knowingly collect data from children.`,
  },
  {
    title: "International users",
    body: `If you use the service outside your home country, your information may be processed where our providers operate. By using the app you consent to this transfer where permitted by law.`,
  },
  {
    title: "Changes",
    body: `We may update this policy. We will post the new date at the top of this page. Continued use after changes means you accept the updated policy.`,
  },
  {
    title: "Contact",
    body: `Privacy questions: ${SUPPORT_EMAIL}`,
  },
] as const;

export const termsSections = [
  {
    title: "Agreement",
    body: `By creating an account or using DHOOM Trading, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the service.`,
  },
  {
    title: "Service",
    body: `DHOOM Trading is a B2B retail ordering platform. Product availability, pricing, and delivery areas are set by us and may change. We may suspend or modify features with reasonable notice where practical.`,
  },
  {
    title: "Account",
    body: `You must provide accurate information and keep credentials secure. You are responsible for activity under your account. Staff portal accounts (DHOOM Manage) are governed by separate employer policies.`,
  },
  {
    title: "Orders and payment",
    body: `Placing an order is an offer to purchase. We may accept or cancel orders (for example due to stock, pricing errors, or compliance). Payment may be via approved methods including in-app wallet where enabled. Taxes and fees may apply as shown at checkout.`,
  },
  {
    title: "Delivery and returns",
    body: `Delivery times are estimates. Return and refund rules follow our in-app return flow and applicable law. Open orders or returns may prevent account deletion until resolved.`,
  },
  {
    title: "Prohibited use",
    body: `You may not misuse the service, attempt unauthorized access, interfere with systems, or use the app for unlawful purposes.`,
  },
  {
    title: "Intellectual property",
    body: `App content, branding, and software are owned by us or licensors. You receive a limited license to use the app for its intended purpose.`,
  },
  {
    title: "Disclaimer",
    body: `The service is provided "as is" to the fullest extent permitted by law. We disclaim warranties not required by applicable consumer law.`,
  },
  {
    title: "Limitation of liability",
    body: `To the maximum extent permitted by law, we are not liable for indirect or consequential damages. Our total liability for a claim is limited to the amount you paid us for the order giving rise to the claim in the prior twelve months.`,
  },
  {
    title: "Termination",
    body: `You may stop using the service and delete your account at any time (subject to completing or cancelling open orders). We may suspend or terminate accounts for violations or risk.`,
  },
  {
    title: "Governing law",
    body: `These terms are governed by the laws of India, without regard to conflict-of-law rules, except where mandatory local consumer protections apply.`,
  },
  {
    title: "Contact",
    body: `Questions about these terms: ${SUPPORT_EMAIL}`,
  },
] as const;

export const deleteAccountBullets = [
  "Deletes your DHOOM Trading sign-in (email/password or linked provider) and app profile.",
  "Removes saved addresses, cart, lists, wallet profile row, and push tokens tied to your account.",
  "Anonymizes completed or cancelled orders so we can keep legally required sales records without your personal profile.",
  "Does not delete DHOOM Manage staff accounts—use your administrator for portal access.",
] as const;
