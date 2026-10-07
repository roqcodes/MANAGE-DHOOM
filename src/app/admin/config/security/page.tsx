import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { SecuritySettingsCard } from "@/modules/settings/components/security-settings-card";

export default function AdminSecurityConfigPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <AdminBreadcrumb
        items={[
          { label: "Account settings", href: "/admin/config" },
          { label: "Security" },
        ]}
        className="mb-4"
        backHref="/admin/config"
      />
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account password and reset options.
        </p>
      </div>
      <SecuritySettingsCard />
    </div>
  );
}
