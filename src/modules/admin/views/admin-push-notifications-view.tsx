"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  Copy,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import {
  FormError,
  inputCls,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
  textareaCls,
} from "@/modules/admin/components/modal";
import { adminDelete, adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import type {
  PushCampaignRow,
  PushTemplateRow,
  PushTopic,
} from "@/modules/admin/services/push-notifications.types";

type Overview = {
  activeTokens: number;
  customersWithPush: number;
  sentToday: number;
  scheduledCount: number;
  campaigns: PushCampaignRow[];
  templates: PushTemplateRow[];
};

const TOPICS: { id: PushTopic; label: string }[] = [
  { id: "promo", label: "Promotions" },
  { id: "system", label: "General" },
  { id: "order", label: "Orders" },
  { id: "wallet", label: "Wallet" },
];

const MERGE_TAGS = "{{customer_name}} {{order_ref}} {{amount}} {{status}} {{reference}} {{refund_note}}";

function topicLabel(topic: string) {
  return TOPICS.find((item) => item.id === topic)?.label ?? topic;
}

function statusTone(status: string) {
  if (status === "sent") return "bg-emerald-50 text-emerald-700";
  if (status === "scheduled") return "bg-sky-50 text-sky-700";
  if (status === "draft") return "bg-muted text-muted-foreground";
  if (status === "partial") return "bg-amber-50 text-amber-800";
  if (status === "failed" || status === "cancelled") return "bg-rose-50 text-rose-700";
  return "bg-muted text-muted-foreground";
}

function TemplateEditor({
  title,
  subtitle,
  initial,
  lockKind,
  onClose,
}: {
  title: string;
  subtitle: string;
  initial?: Partial<PushTemplateRow>;
  lockKind: "automation" | "campaign";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [topic, setTopic] = useState<PushTopic>((initial?.topic as PushTopic) ?? "promo");
  const [headline, setHeadline] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [href, setHref] = useState(initial?.href ?? "");
  const [sound, setSound] = useState(initial?.sound !== "none");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  function submit() {
    startTransition(async () => {
      try {
        await adminPost("push-templates", {
          id: initial?.id,
          kind: lockKind,
          name,
          topic,
          title: headline,
          body,
          href: href.trim() || null,
          sound,
          enabled,
        });
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pushNotifications() });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save template.");
      }
    });
  }

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} size="lg">
      <div className="space-y-3">
        <FormError message={error} />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Internal name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {lockKind === "campaign" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Topic</label>
            <select className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value as PushTopic)}>
              {TOPICS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Event <span className="font-medium text-foreground">{initial?.event_key}</span> · customers who opted into{" "}
            {topicLabel(topic).toLowerCase()} receive this automatically.
          </p>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Push title</label>
          <input className={inputCls} value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Message</label>
          <textarea className={textareaCls} rows={4} maxLength={240} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted-foreground">Merge tags: {MERGE_TAGS}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Open in app</label>
          <input className={inputCls} value={href} onChange={(e) => setHref(e.target.value)} placeholder="/orders" />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Play sound</span>
          <Switch checked={sound} onCheckedChange={setSound} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Enabled</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <SecondaryBtn onClick={onClose}>
            Cancel
          </SecondaryBtn>
          <PrimaryBtn type="button" disabled={isPending || !name.trim() || !headline.trim() || !body.trim()} onClick={submit}>
            {isPending ? "Saving…" : "Save template"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

function CampaignComposer({
  templates,
  initial,
  onClose,
}: {
  templates: PushTemplateRow[];
  initial?: PushCampaignRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showSuccess } = useAdminAlert();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const saved = templates.filter((item) => item.kind === "campaign");
  const [templateId, setTemplateId] = useState(initial ? "" : saved[0]?.id ?? "");
  const [name, setName] = useState(initial?.name || initial?.title || "");
  const [topic, setTopic] = useState<PushTopic>((initial?.topic as PushTopic) ?? "promo");
  const [headline, setHeadline] = useState(initial?.title ?? saved[0]?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? saved[0]?.body ?? "");
  const [href, setHref] = useState(initial?.href ?? saved[0]?.href ?? "");
  const [sound, setSound] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");

  function applyTemplate(id: string) {
    setTemplateId(id);
    const next = saved.find((item) => item.id === id);
    if (!next) return;
    setName(next.name);
    setTopic(next.topic);
    setHeadline(next.title);
    setBody(next.body);
    setHref(next.href ?? "");
  }

  function run(mode: "draft" | "schedule" | "send") {
    startTransition(async () => {
      try {
        const result = await adminPost<{ sent: number; failed: number; skipped: number; status: string }>(
          "push-notifications",
          {
            campaignId: initial?.id,
            name,
            title: headline,
            body,
            topic,
            href: href.trim() || null,
            sound,
            templateId: templateId || null,
            mode,
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          },
        );
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pushNotifications() });
        showSuccess(
          mode === "send"
            ? `Sent ${result.sent}. Skipped ${result.skipped}. Failed ${result.failed}.`
            : mode === "schedule"
              ? "Campaign scheduled."
              : "Draft saved.",
        );
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save campaign.");
      }
    });
  }

  return (
    <Modal title={initial ? "Edit campaign" : "New campaign"} subtitle="Send now, schedule, or save a draft." onClose={onClose} size="lg">
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="space-y-3">
          <FormError message={error} />
          {saved.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Start from template</label>
              <select className={inputCls} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Blank</option>
                {saved.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Campaign name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend kirana offer" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Topic</label>
              <select className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value as PushTopic)}>
                {TOPICS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Schedule (optional)</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <input className={inputCls} value={headline} maxLength={80} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Message</label>
            <textarea className={textareaCls} rows={5} maxLength={240} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Open in app</label>
            <input className={inputCls} value={href} onChange={(e) => setHref(e.target.value)} placeholder="/home" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
            Play sound
          </label>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
          <div className="mt-3 rounded-2xl border border-border bg-background p-3 shadow-sm">
            <p className="text-[11px] text-muted-foreground">DHOOM Trading</p>
            <p className="mt-1 text-sm font-semibold">{headline || "Title"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{body || "Message"}</p>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            Sends only to customers who enabled this topic in the app. Quiet hours still apply on the device for non-order alerts.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <SecondaryBtn onClick={onClose}>
          Cancel
        </SecondaryBtn>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => run("draft")}>
          Save draft
        </Button>
        <Button type="button" variant="outline" disabled={isPending || !scheduledAt} onClick={() => run("schedule")}>
          <CalendarClock className="size-3.5" aria-hidden />
          Schedule
        </Button>
        <PrimaryBtn type="button" disabled={isPending || !headline.trim() || !body.trim()} onClick={() => run("send")}>
          {isPending ? "Working…" : "Send now"}
        </PrimaryBtn>
      </div>
    </Modal>
  );
}

export function AdminPushNotificationsView() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useAdminAlert();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<PushCampaignRow | null>(null);
  const [templateModal, setTemplateModal] = useState<PushTemplateRow | "new" | "automation" | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isPending, startTransition] = useTransition();

  const { data, isLoading } = useQuery({
    queryKey: adminQueryKeys.pushNotifications(),
    queryFn: () => adminGet<Overview>("push-notifications"),
  });

  const automations = useMemo(
    () => (data?.templates ?? []).filter((item) => item.kind === "automation"),
    [data?.templates],
  );
  const library = useMemo(
    () => (data?.templates ?? []).filter((item) => item.kind === "campaign"),
    [data?.templates],
  );
  const campaigns = useMemo(() => {
    const rows = (data?.campaigns ?? []).filter((row) => row.origin !== "automation");
    if (statusFilter === "all") return rows;
    return rows.filter((row) => row.status === statusFilter);
  }, [data?.campaigns, statusFilter]);

  if (isLoading || !data) return <AdminPageSkeleton />;

  function toggleAutomation(item: PushTemplateRow, enabled: boolean) {
    startTransition(async () => {
      try {
        await adminPost("push-templates", { ...item, enabled, sound: item.sound !== "none" });
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pushNotifications() });
      } catch (error) {
        showError(error instanceof Error ? error.message : "Could not update.");
      }
    });
  }

  function campaignAction(action: "dispatch" | "cancel", campaignId: string) {
    startTransition(async () => {
      try {
        await adminPost("push-notifications", { action, campaignId });
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pushNotifications() });
        showSuccess(action === "cancel" ? "Campaign cancelled." : "Campaign sent.");
      } catch (error) {
        showError(error instanceof Error ? error.message : "Action failed.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <AdminBreadcrumb
        items={[
          { label: "Business", href: "/admin/business" },
          { label: "Push notifications" },
        ]}
        backHref="/admin/business"
      />

      <div className="mb-4 mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Push notifications</h1>
          <p className="text-sm text-muted-foreground">
            Automate order and wallet alerts, then run promotional campaigns to opted-in customers.
          </p>
        </div>
        <Button type="button" onClick={() => { setEditingCampaign(null); setComposerOpen(true); }}>
          <Megaphone className="size-4" aria-hidden />
          New campaign
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active devices", value: data.activeTokens },
          { label: "Customers opted in", value: data.customersWithPush },
          { label: "Delivered today", value: data.sentToday },
          { label: "Scheduled", value: data.scheduledCount },
        ].map((stat) => (
          <Card key={stat.label} className="border border-border py-0 ring-0">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="automations">Order & wallet</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          <Card className="border border-border ring-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Send className="size-4 text-muted-foreground" aria-hidden />
                Campaigns
              </CardTitle>
              <select className={`${inputCls} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="sent">Sent</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </CardHeader>
            <CardContent className="p-0">
              {campaigns.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No campaigns yet. Create an offer and send it or schedule it.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {campaigns.map((campaign) => (
                    <li key={campaign.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{campaign.name || campaign.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${statusTone(campaign.status)}`}>
                            {campaign.status}
                          </span>
                          <Badge variant="secondary">{topicLabel(campaign.topic)}</Badge>
                          {campaign.origin === "automation" ? (
                            <Badge variant="outline">Automation</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{campaign.body}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {campaign.sent_count} sent
                          {campaign.failed_count ? ` · ${campaign.failed_count} failed` : ""}
                          {campaign.skipped_count ? ` · ${campaign.skipped_count} skipped` : ""}
                          {campaign.scheduled_at ? ` · ${new Date(campaign.scheduled_at).toLocaleString()}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {campaign.status === "draft" || campaign.status === "scheduled" ? (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => { setEditingCampaign(campaign); setComposerOpen(true); }}>
                              <Pencil className="size-3.5" aria-hidden />
                              Edit
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => campaignAction("dispatch", campaign.id)}>
                              Send
                            </Button>
                            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => campaignAction("cancel", campaign.id)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCampaign({ ...campaign, id: "", status: "draft", name: `${campaign.name || campaign.title} copy` });
                              setComposerOpen(true);
                            }}
                          >
                            <Copy className="size-3.5" aria-hidden />
                            Duplicate
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="mt-4">
          <Card className="border border-border ring-0">
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Zap className="size-4 text-muted-foreground" aria-hidden />
                Automatic alerts
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                These send when an order status or wallet balance changes. Only customers who enabled Orders or Wallet in the app receive them.
              </p>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {automations.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.event_key}</p>
                    <p className="mt-2 text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.body}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Switch
                      checked={item.enabled}
                      disabled={isPending}
                      onCheckedChange={(checked) => toggleAutomation(item, checked)}
                      aria-label={`Toggle ${item.name}`}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => setTemplateModal(item)}>
                      <Pencil className="size-3.5" aria-hidden />
                      Edit copy
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Card className="border border-border ring-0">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Bell className="size-4 text-muted-foreground" aria-hidden />
                Saved offer templates
              </CardTitle>
              <Button type="button" size="sm" onClick={() => setTemplateModal("new")}>
                <Plus className="size-3.5" aria-hidden />
                New template
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {library.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Save reusable copy for festivals, restocks, and offers.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {library.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.title} — {item.body}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setTemplateModal(item)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${item.name}`}
                          onClick={() => {
                            startTransition(async () => {
                              try {
                                await adminDelete(`push-templates?id=${item.id}`);
                                await queryClient.invalidateQueries({ queryKey: adminQueryKeys.pushNotifications() });
                              } catch (error) {
                                showError(error instanceof Error ? error.message : "Could not delete.");
                              }
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {composerOpen ? (
        <CampaignComposer
          templates={data.templates}
          initial={editingCampaign}
          onClose={() => {
            setComposerOpen(false);
            setEditingCampaign(null);
          }}
        />
      ) : null}
      {templateModal && templateModal !== "new" && typeof templateModal === "object" ? (
        <TemplateEditor
          title={templateModal.kind === "automation" ? "Edit automation" : "Edit template"}
          subtitle={
            templateModal.kind === "automation"
              ? "This copy is used the next time the event fires."
              : "Reusable campaign copy."
          }
          initial={templateModal}
          lockKind={templateModal.kind}
          onClose={() => setTemplateModal(null)}
        />
      ) : null}
      {templateModal === "new" ? (
        <TemplateEditor
          title="New template"
          subtitle="Save an offer to reuse in campaigns."
          lockKind="campaign"
          onClose={() => setTemplateModal(null)}
        />
      ) : null}
    </div>
  );
}
