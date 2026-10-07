import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400">
        DHOOM Trading Manage
      </p>
      <h1 className="text-2xl font-black tracking-tight text-slate-900">
        You&apos;re offline
      </h1>
      <p className="max-w-md text-sm text-slate-600">
        The app shell is available, but ERP data and saves need a network
        connection. Reconnect and reload to continue working.
      </p>
      <Link
        href="/admin"
        className="rounded-xl bg-[#EB205F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#D01A54]"
      >
        Try admin home
      </Link>
    </main>
  );
}
