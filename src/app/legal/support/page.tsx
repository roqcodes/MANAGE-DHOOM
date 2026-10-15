import { LegalDocumentLayout } from "@/modules/legal/components/legal-document-layout";
import { SupportContactPanel } from "@/modules/legal/components/support-contact-panel";
import { supportSections } from "@/modules/legal/content/support-copy";

export const metadata = {
  title: "Support — DHOOM Trading",
  description: "Contact DHOOM Trading customer support for orders, accounts, and app help.",
};

export default function SupportPage() {
  return (
    <LegalDocumentLayout
      title="Customer support"
      intro="Get help with the DHOOM Trading mobile app and your customer account. This page is the public support URL for App Store and Google Play listings."
      sections={supportSections}
    >
      <SupportContactPanel />
    </LegalDocumentLayout>
  );
}
