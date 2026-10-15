import { LegalDocumentLayout } from "@/modules/legal/components/legal-document-layout";
import { termsSections } from "@/modules/legal/content/legal-copy";

export const metadata = {
  title: "Terms & Conditions — DHOOM Trading",
  description: "Terms of use for the DHOOM Trading storefront app.",
};

export default function TermsPage() {
  return (
    <LegalDocumentLayout
      title="Terms & Conditions"
      intro="These terms apply to your use of the DHOOM Trading mobile and web storefront. By using the app you agree to these terms and our Privacy Policy."
      sections={termsSections}
    />
  );
}
