export type InvoiceChannel = "online" | "pos" | "sales_order" | "erp" | "order";

export function invoiceChannelLabel(source: string | null | undefined): string {
  switch (source) {
    case "online":
    case "order":
      return "Online";
    case "pos":
      return "Physical store";
    case "sales_order":
      return "Sales order";
    case "erp":
      return "Direct";
    default:
      return "Direct";
  }
}

export function invoiceChannelVariant(
  source: string | null | undefined,
): "default" | "secondary" | "outline" {
  switch (source) {
    case "online":
    case "order":
      return "default";
    case "pos":
      return "secondary";
    case "sales_order":
      return "outline";
    default:
      return "outline";
  }
}
