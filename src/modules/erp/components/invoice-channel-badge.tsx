"use client";

import { Badge } from "@/components/ui/badge";
import {
  invoiceChannelLabel,
  invoiceChannelVariant,
} from "@/lib/invoice-channel";

export function InvoiceChannelBadge({ source }: { source: string | null | undefined }) {
  return (
    <Badge variant={invoiceChannelVariant(source)} className="font-normal">
      {invoiceChannelLabel(source)}
    </Badge>
  );
}
