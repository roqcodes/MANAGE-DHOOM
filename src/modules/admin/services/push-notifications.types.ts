export type PushTopic = "order" | "promo" | "wallet" | "system";
export type PushAudience = "all_customers" | "selected";
export type PushCampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "partial"
  | "failed"
  | "cancelled";
export type PushTemplateKind = "automation" | "campaign";

export type PushCampaignRow = {
  id: string;
  name: string | null;
  title: string;
  body: string;
  topic: PushTopic;
  audience: PushAudience;
  href: string | null;
  status: PushCampaignStatus | string;
  origin: string;
  scheduled_at: string | null;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  sent_at: string | null;
};

export type PushTemplateRow = {
  id: string;
  kind: PushTemplateKind;
  event_key: string | null;
  name: string;
  topic: PushTopic;
  title: string;
  body: string;
  href: string | null;
  sound: string;
  enabled: boolean;
  updated_at: string;
};
