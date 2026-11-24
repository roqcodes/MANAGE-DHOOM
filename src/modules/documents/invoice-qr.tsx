import QRCode from "qrcode";

export function InvoiceQr({
  value,
  size = 88,
}: {
  value: string;
  size?: number;
}) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const parts: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return (
    <svg
      className="bh-inv-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      aria-label="Invoice QR"
      role="img"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={parts.join("")} fill="#000" />
    </svg>
  );
}
