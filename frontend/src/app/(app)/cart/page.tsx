"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2, Loader2, MapPin, Store, AlertCircle, PackageCheck } from "lucide-react";
import { api, geolocate, km, taka, type CartRow, type CheckoutResponse, type OrderGroup } from "@/lib/api";

export default function CartPage() {
  const [tab, setTab] = useState<"cart" | "orders">("cart");
  const [items, setItems] = useState<CartRow[] | null>(null);
  const [orders, setOrders] = useState<OrderGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResponse | null>(null);

  const load = useCallback(() => api.cart().then(setItems).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab === "orders" && orders === null) api.pastOrders().then(setOrders).catch(() => setOrders([]));
  }, [tab, orders]);

  const setCount = async (row: CartRow, count: number) => {
    if (count < 1) return;
    setItems((xs) => xs && xs.map((x) => (x.cart_id === row.cart_id ? { ...x, count } : x)));
    try {
      await api.updateCount(row.cart_id, count);
    } catch {
      void load();
    }
  };
  const remove = async (row: CartRow) => {
    setItems((xs) => xs && xs.filter((x) => x.cart_id !== row.cart_id));
    try {
      await api.removeFromCart(row.cart_id);
    } catch {
      void load();
    }
  };

  const checkout = async () => {
    setBusy(true);
    setErr(null);
    try {
      let coords: { user_lat?: number; user_lng?: number } = {};
      try {
        const p = await geolocate();
        coords = { user_lat: p.coords.latitude, user_lng: p.coords.longitude };
      } catch {
        /* backend home_location e fallback kore */
      }
      const r = await api.checkout(coords);
      setResult(r);
      setOrders(null);
      void load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const subtotal = items?.reduce((s, i) => s + (i.unit_price ?? 0) * i.count, 0) ?? 0;
  const unpriced = items?.filter((i) => i.unit_price == null).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Orders</p>
          <h1 className="text-3xl mt-1">Cart</h1>
        </div>
        <div className="flex sheet p-0.5 text-sm">
          {(["cart", "orders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`h-8 px-3 rounded-md ${tab === t ? "bg-ink text-paper" : "text-ink-2"}`}>
              {t === "cart" ? `Cart${items?.length ? ` (${items.length})` : ""}` : "Past orders"}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className={`sheet p-4 text-sm ${result.status === "nothing_available" ? "border-rx/40" : "border-green/40"}`}>
          <div className="flex items-center gap-2 font-medium">
            <PackageCheck size={16} className={result.status === "nothing_available" ? "text-rx" : "text-green"} />
            {result.status === "checkout_complete" ? "Order placed" : result.status === "partial" ? "Partly placed" : "Nothing could be ordered"}
          </div>
          {result.assignments.length > 0 && (
            <ul className="mt-2 space-y-1 text-ink-2">
              {result.assignments.map((a) => (
                <li key={a.cart_id} className="flex justify-between gap-2">
                  <span className="truncate">{a.count}× {a.brand_name} <span className="text-ink-3">· {a.pharmacy_name}, {km(a.distance_meters)}</span></span>
                  <span className="num">{taka(a.line_total)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-line pt-1 font-medium text-ink"><span>Total</span><span className="num">{taka(result.total_cost)}</span></li>
            </ul>
          )}
          {result.unassigned.length > 0 && (
            <p className="mt-2 text-xs text-amber flex gap-1">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              No nearby stock for {result.unassigned.map((u) => u.brand_name).join(", ")}. They stay in your cart. Try <Link href="/location" className="underline">a wider search</Link>.
            </p>
          )}
          <button onClick={() => setResult(null)} className="btn-ghost h-7 text-xs mt-2 -ml-2">Dismiss</button>
        </div>
      )}

      {tab === "cart" && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
          {items === null ? (
            <div className="sheet h-40 animate-pulse" />
          ) : items.length === 0 ? (
            <div className="sheet p-8 text-center text-sm text-ink-2">
              Your cart is empty.{" "}
              <Link href="/medicines" className="text-green underline underline-offset-2">Find medicines</Link>
            </div>
          ) : (
            <ul className="sheet divide-y divide-line">
              {items.map((it) => (
                <li key={it.cart_id} className="p-4 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/medicines/${it.medicine_id}`} className="font-medium hover:text-green">{it.brand_name} <span className="num text-xs text-ink-2">{it.strength}</span></Link>
                    <div className="text-xs text-ink-3 flex items-center gap-1 mt-0.5">
                      {it.dosage_form}
                      {it.assigned_pharmacy_name && <span className="flex items-center gap-1 ml-2 text-green"><Store size={11} /> {it.assigned_pharmacy_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center sheet h-8">
                    <button onClick={() => setCount(it, it.count - 1)} className="w-8 h-full grid place-items-center text-ink-2 hover:text-ink"><Minus size={13} /></button>
                    <span className="num text-sm w-7 text-center">{it.count}</span>
                    <button onClick={() => setCount(it, it.count + 1)} className="w-8 h-full grid place-items-center text-ink-2 hover:text-ink"><Plus size={13} /></button>
                  </div>
                  <div className="num text-sm w-20 text-right">{it.unit_price == null ? <span className="text-ink-3 text-xs">no price</span> : taka(it.unit_price * it.count)}</div>
                  <button onClick={() => remove(it)} className="btn-ghost h-8 w-8 p-0 text-ink-3 hover:text-rx"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}

          <aside className="sheet p-4 space-y-3 text-sm lg:sticky lg:top-20">
            <div className="flex justify-between"><span className="text-ink-2">Items</span><span className="num">{items?.reduce((s, i) => s + i.count, 0) ?? 0}</span></div>
            <div className="flex justify-between text-base font-medium border-t border-line pt-3"><span>Subtotal</span><span className="num">{taka(subtotal)}</span></div>
            {unpriced > 0 && <p className="text-xs text-amber">{unpriced} item{unpriced > 1 ? "s have" : " has"} no listed price; pay at pharmacy.</p>}
            <p className="text-xs text-ink-3">Prices are the listed MRP. Pickup from the assigned pharmacy, no delivery fee.</p>
            <button onClick={checkout} disabled={busy || !items?.length} className="btn-primary w-full">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />} Place order at nearest pharmacy
            </button>
            {err && <p className="text-xs text-rx">{err}</p>}
            {!!items?.length && <button onClick={() => api.clearCart().then(load)} className="btn-ghost w-full text-xs text-ink-3">Clear cart</button>}
          </aside>
        </div>
      )}

      {tab === "orders" && (
        orders === null ? <div className="sheet h-40 animate-pulse" /> : orders.length === 0 ? <p className="text-sm text-ink-3">No past orders yet.</p> : (
          <ul className="space-y-3">
            {orders.map((o, i) => (
              <li key={i} className="sheet">
                <header className="px-4 h-11 flex items-center justify-between border-b border-line text-sm">
                  <span className="flex items-center gap-2"><Store size={14} className="text-ink-3" /> {o.pharmacy_name ?? "Unassigned"}</span>
                  <span className="num text-xs text-ink-3">{o.ordered_at ? new Date(o.ordered_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} · <span className="uppercase">{o.status}</span></span>
                </header>
                <ul className="divide-y divide-line text-sm">
                  {o.items.map((it) => (
                    <li key={it.cart_id} className="px-4 py-2 flex justify-between gap-2">
                      <span className="truncate">{it.count}× {it.brand_name} <span className="num text-xs text-ink-2">{it.strength}</span></span>
                      <span className="num">{taka((it.unit_price ?? 0) * it.count)}</span>
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-2 border-t border-line flex justify-between text-sm font-medium"><span>Total</span><span className="num">{taka(o.total)}</span></div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
