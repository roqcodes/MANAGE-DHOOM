"use client";

import { useEffect, useState } from "react";
import { Package, MapPin, Phone, CheckCircle, X } from "lucide-react";
import { currencyLabel, formatCurrencyAmount } from "@/lib/format-currency";

interface OrderItem {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string | null;
    image_url: string | null;
  };
  variant: {
    id: string;
    name: string | null;
    price: number | null;
  };
}

interface ShippingAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  label?: string;
}

interface DeliveryOrder {
  id: string;
  order_number: string;
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  total_amount: number;
  created_at: string;
  shipping_address: ShippingAddress;
  order_items: OrderItem[];
}

interface OrdersResponse {
  orders: DeliveryOrder[];
  count: number;
}

export default function DeliveryDashboardPage() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);

  useEffect(() => {
    fetch("/api/delivery/orders")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch orders");
        return res.json();
      })
      .then((result) => {
        setData(result);
        setIsError(false);
      })
      .catch((err) => {
        console.error(err);
        setIsError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleUpdateStatus = async (orderId: string, newStatus: "shipped" | "delivered") => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/delivery/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // Refresh data
        const result = await fetch("/api/delivery/orders");
        setData(await result.json());
      } else {
        alert("Failed to update order status");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update order status");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatMoney = (n: number) =>
    formatCurrencyAmount(n, { minimumFractionDigits: 2 });

  const statusColors: Record<string, string> = {
    confirmed: "bg-blue-100 text-blue-800",
    processing: "bg-purple-100 text-purple-800",
    shipped: "bg-indigo-100 text-indigo-800",
    delivered: "bg-emerald-100 text-emerald-800",
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 animate-spin text-slate-400" />
          <p className="mt-4 text-sm text-slate-500">Loading deliveries...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Package className="mx-auto h-16 w-16 text-slate-300" />
          <h1 className="mt-4 text-xl font-bold text-slate-900">Failed to load deliveries</h1>
          <p className="mt-2 text-sm text-slate-500">Please try again later</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <Package className="h-6 w-6 text-slate-900" />
          <h1 className="text-lg font-bold text-slate-900">Delivery Dashboard</h1>
          <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
            {data.count} order{data.count !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {data.orders.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
            <div className="text-center">
              <Package className="mx-auto h-12 w-12 text-slate-300" />
              <h2 className="mt-4 text-lg font-bold text-slate-900">No deliveries assigned</h2>
              <p className="mt-2 text-sm text-slate-500">
                You&apos;ll see your assigned deliveries here
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {data.orders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                {/* Header */}
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">
                        Order #{order.order_number}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          statusColors[order.status] || "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(order.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">{currencyLabel("Total")}</p>
                    <p className="text-lg font-bold text-slate-900">
                      {formatMoney(order.total_amount)}
                    </p>
                  </div>
                </div>

                {/* Items */}
                <div className="mb-4 rounded-lg bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">Items</p>
                  <div className="flex flex-wrap gap-2">
                    {order.order_items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-lg bg-white px-3 py-2"
                      >
                        {item.product.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name ?? "Product"}
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-200">
                            <Package className="h-4 w-4 text-slate-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            {item.product.name ?? "Product"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Qty: {item.quantity}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delivery Address */}
                <div className="mb-4 rounded-lg bg-slate-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">
                      {order.shipping_address.label || "Delivery Address"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {order.shipping_address.line1}
                    {order.shipping_address.line2 && `, ${order.shipping_address.line2}`}
                  </p>
                  <p className="text-sm text-slate-600">
                    {order.shipping_address.city}, {order.shipping_address.state} -{" "}
                    {order.shipping_address.pincode}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-600">
                      {order.shipping_address.phone}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View Details
                  </button>
                  {order.status === "confirmed" && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, "shipped")}
                      disabled={updatingId === order.id}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark Shipped
                    </button>
                  )}
                  {order.status === "shipped" && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, "delivered")}
                      disabled={updatingId === order.id}
                      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Mark Delivered
                    </button>
                  )}
                  {order.status === "delivered" && (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle className="h-4 w-4" />
                      Completed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                Order #{selectedOrder.order_number}
              </h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    statusColors[selectedOrder.status] || "bg-slate-100 text-slate-800"
                  }`}
                >
                  {selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1)}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500">Items</p>
                <div className="mt-2 space-y-2">
                  {selectedOrder.order_items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-slate-700">
                        {item.product.name ?? "Product"} × {item.quantity}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {formatMoney((item.variant.price ?? 0) * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Delivery Address</p>
                <p className="mt-1 text-sm text-slate-900">
                  {selectedOrder.shipping_address.line1}
                  {selectedOrder.shipping_address.line2 && `, ${selectedOrder.shipping_address.line2}`}
                </p>
                <p className="text-sm text-slate-900">
                  {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.state} -{" "}
                  {selectedOrder.shipping_address.pincode}
                </p>
                <p className="mt-1 text-sm text-slate-900">
                  Phone: {selectedOrder.shipping_address.phone}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
