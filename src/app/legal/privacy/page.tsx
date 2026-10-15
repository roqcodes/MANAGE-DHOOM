import { LegalDocumentLayout } from "@/modules/legal/components/legal-document-layout";
import { privacySections } from "@/modules/legal/content/legal-copy";

export const metadata = {
  title: "Privacy Policy — DHOOM Trading",
  description: "How DHOOM Trading collects, uses, and deletes your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout
      title="Privacy Policy"
      intro="This policy describes how DHOOM Trading handles personal information in our customer app and related services. It is written for App Store, Google Play, and web users."
      sections={privacySections}
    />
  );
}
