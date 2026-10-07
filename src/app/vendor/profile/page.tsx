import { PageHeader } from "@/modules/admin/components/page-header";
import { VendorProfilePanel } from "@/modules/vendor/components/vendor-profile-panel";
import { getMyVendorProfilePage } from "@/modules/vendor/services/vendor-profile.service";

export const dynamic = "force-dynamic";

export default async function VendorProfilePage() {
  const { user, vendor } = await getMyVendorProfilePage();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10">
      <PageHeader
        title="Profile"
        subtitle="Your account and how you appear as a supplier on DHOOM TRADING."
      />
      <div className="mt-2 sm:mt-4">
        <VendorProfilePanel user={user} vendor={vendor} />
      </div>
    </div>
  );
}
