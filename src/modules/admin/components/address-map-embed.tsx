export function AddressMapEmbed({
  latitude,
  longitude,
  label,
}: {
  latitude: number;
  longitude: number;
  label?: string;
}) {
  const src = `https://maps.google.com/maps?q=${latitude},${longitude}&z=18&output=embed`;
  const href = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <iframe
        title={label ?? "Map pin"}
        src={src}
        className="h-44 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block border-t bg-muted/30 px-3 py-1.5 text-center text-xs font-medium text-primary hover:underline"
      >
        Open exact pin in Google Maps
      </a>
    </div>
  );
}
