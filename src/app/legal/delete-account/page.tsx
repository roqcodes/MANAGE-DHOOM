import { DeleteAccountPanel } from "@/modules/legal/components/delete-account-panel";
import { LegalDocumentLayout } from "@/modules/legal/components/legal-document-layout";
import {
  deleteAccountBullets,
  privacySections,
} from "@/modules/legal/content/legal-copy";

const deleteSections = [
  {
    title: "Before you delete",
    body: `You must resolve open orders (placed, processing, or shipped), in-progress returns, and wallet balance before deletion. This matches common app-store account deletion practice (including Google Play's guidance on incomplete purchases).`,
  },
  {
    title: "What deletion does",
    body: deleteAccountBullets.map((line) => `• ${line}`).join("\n"),
  },
  {
    title: "Data we may keep",
    body: privacySections.find((s) => s.title === "Retention")?.body ?? "",
  },
];

export const metadata = {
  title: "Delete account — DHOOM Trading",
  description:
    "Request permanent deletion of your DHOOM Trading app account and associated data.",
};

export default function DeleteAccountPage() {
  return (
    <LegalDocumentLayout
      title="Delete your account"
      intro="Use this page to permanently delete your DHOOM Trading customer account. This URL can be submitted to Google Play (Data safety → account deletion) and linked from the iOS app per App Store Guideline 5.1.1(v)."
      sections={deleteSections}
    >
      <DeleteAccountPanel />
    </LegalDocumentLayout>
  );
}
