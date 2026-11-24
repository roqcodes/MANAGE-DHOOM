/** Bilingual labels — match KSA tax-invoice wording exactly. */

export const TAX_INVOICE_TITLE_AR = "فاتورة ضريبية";
export const TAX_INVOICE_TITLE_EN = "TAX INVOICE";

export const PURCHASE_ORDER_TITLE_AR = "أمر شراء";
export const PURCHASE_ORDER_TITLE_EN = "PURCHASE ORDER";

export const INVOICE_PRINT_LABELS = {
  invoiceNumber: { en: "Invoice #", ar: "رقم الفاتورة" },
  invoiceDate: { en: "Invoice Date", ar: "تاريخ إصدار الفاتورة" },
  dueDate: { en: "Due Date", ar: "تاريخ الاستحقاق" },
  poNumber: { en: "PO #", ar: "رقم أمر الشراء" },
  poDate: { en: "PO Date", ar: "تاريخ أمر الشراء" },
  vendorInvoice: { en: "Vendor Invoice #", ar: "رقم فاتورة المورد" },
  seller: { en: "Seller", ar: "المورد" },
  buyer: { en: "Buyer", ar: "عميل" },
  name: { en: "Name", ar: "الاسم" },
  address: { en: "Address", ar: "عنوان" },
  street: { en: "Street", ar: "اسم الشارع" },
  city: { en: "City", ar: "المدينة" },
  phone: { en: "Phone", ar: "رقم هاتف" },
  vatNumber: { en: "VAT Number", ar: "رقم ضريبة القيمة المضافة" },
  lineNo: { en: "#", ar: "رقم" },
  nature: {
    en: "Nature of goods or services",
    ar: "طبيعة البضائع والخدمات",
  },
  unitPrice: { en: "Unit Price", ar: "سعر الوحدة" },
  quantity: { en: "Quantity", ar: "الكمية" },
  taxableAmount: { en: "Taxable Amount", ar: "المبلغ الخاضع للضريبة" },
  taxRate: { en: "Tax Rate", ar: "نسبة الضريبة" },
  taxAmount: { en: "Tax Amount", ar: "مبلغ الضريبة" },
  itemSubtotal: {
    en: "Item Subtotal (Including VAT)",
    ar: "الإجمالي الفرعي للصنف متضمناً ضريبة القيمة المضافة",
  },
  totalAmounts: { en: "Total amounts:", ar: "إجمالي المبالغ" },
  totalTaxable: {
    en: "Total Taxable Amount (Excluding VAT)",
    ar: "إجمالي المبلغ الخاضع للضريبة (باستثناء ضريبة القيمة المضافة)",
  },
  totalVat: { en: "Total VAT", ar: "إجمالي ضريبة القيمة المضافة" },
  totalAmount: { en: "Total Amount", ar: "المبلغ الإجمالي" },
  amountPaid: { en: "Amount Paid", ar: "المبلغ المدفوع" },
  balanceDue: { en: "Balance Due", ar: "الرصيد المستحق" },
  discount: { en: "Discount", ar: "الخصم" },
  landedCosts: { en: "Landed costs", ar: "التكاليف الإضافية" },
  itemsInTotal: { en: "Items In Total", ar: "" },
  customerBalance: {
    en: "Total Customer Balance Including This Invoice",
    ar: "",
  },
  vendorBalance: {
    en: "Total Vendor Balance Including This Invoice",
    ar: "",
  },
  thanks: { en: "Thank you for doing business with us", ar: "" },
} as const;

export type PartyCard = {
  name: string;
  address: string;
  street: string;
  city: string;
  phone: string;
  vatNumber: string;
};

export function dash(value: string | null | undefined): string {
  const v = value?.trim();
  return v ? v : "—";
}
