"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Minus, Plus, Trash2, ShieldCheck, Truck, Tag, ChevronRight,
  PackageOpen, LayoutDashboard, Pill, Loader2, AlertCircle,
  HeartPulse, LogOut
} from "lucide-react";
import { api } from "@/lib/api";
import { loadEnrichedCart, loadEnrichedPastOrders, type EnrichedCartItem } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Appointments", href: "/appointments" },
  { icon: MapPin, label: "Pharmacies", href: "/location" },
  { icon: Pill, label: "Medicines", href: "/medicines" },
  { icon: Calculator, label: "Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "Cart", href: "/cart", active: true },
];

const DELIVERY_FEE = 2.5;
const TAX_RATE = 0.05;

// ── Shared layout components ──────────────────────────────────
function NavBar({ logout }: { logout: () => void }) {
  return (
    <header className="h-16 bg-white/70 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-8 shrink-0 z-10">
      <div className="lg:hidden flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
          <HeartPulse size={16} className="text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
      </div>
      <div className="hidden lg:block" /> {/* Spacer */}
      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Bell size={18} className="text-zinc-500 hover:text-zinc-900" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white" />
        </button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Settings size={18} className="text-zinc-500 hover:text-zinc-900" />
        </button>
        <div className="w-px h-5 bg-zinc-200 mx-1" />
        <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm border border-indigo-700 ml-1 cursor-default">
          A
        </div>
        <button onClick={logout} title="Log out" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors ml-1">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 bg-white border-r border-zinc-200 flex-col shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="h-16 flex items-center px-6 border-b border-zinc-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
            <HeartPulse size={16} className="text-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
        </div>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ icon: Icon, label, href, active }) => (
          <a
            key={label}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <Icon size={18} className={active ? "text-indigo-400" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span className="text-sm font-medium">{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

// ── Main Page Component ───────────────────────────────────────
export default function CartPage() {
  const { patient, logout } = useAuth();
  const patientId = patient?.id ?? 1; // placeholder fallback for guest mode

  const [cart, setCart] = useState<EnrichedCartItem[]>([]);
  const [pastOrders, setPastOrders] = useState<EnrichedCartItem[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastLoaded, setPastLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderResult, setOrderResult] = useState<{ assigned: number; unassigned: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Record<number, boolean>>({});

  // Load the patient's pending cart on mount
  useEffect(() => {
    let cancelled = false;
    loadEnrichedCart(patientId)
      .then((items) => { if (!cancelled) setCart(items); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  // Quantity is local-only: the backend has no update-count endpoint, so the
  // adjusted counts are sent at checkout but not persisted to the cart row.
  const updateQty = (cartId: number, delta: number) =>
    setCart((prev) =>
      prev.map((item) =>
        item.cart_id === cartId ? { ...item, count: Math.max(1, item.count + delta) } : item
      )
    );

  const removeItem = useCallback(async (cartId: number) => {
    setRemoving((p) => ({ ...p, [cartId]: true }));
    const snapshot = cart;
    setCart((prev) => prev.filter((item) => item.cart_id !== cartId)); // optimistic
    try {
      await api.removeFromCart(cartId);
    } catch {
      setCart(snapshot); // rollback on failure
      setError("Couldn't remove that item. Please try again.");
    } finally {
      setRemoving((p) => { const n = { ...p }; delete n[cartId]; return n; });
    }
  }, [cart]);

  const clearAll = useCallback(async () => {
    const snapshot = cart;
    setCart([]); // optimistic
    try {
      await Promise.all(snapshot.map((item) => api.removeFromCart(item.cart_id)));
    } catch {
      setCart(snapshot);
      setError("Couldn't clear the cart. Please try again.");
    }
  }, [cart]);

  const placeOrder = useCallback(() => {
    if (cart.length === 0) return;
    setError(null);
    setPlacingOrder(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await api.checkout({
            patient_id: patientId,
            items: cart.map((c) => ({ medicine_id: c.medicine_id, count: c.count })),
            user_lat: pos.coords.latitude,
            user_lng: pos.coords.longitude,
          });
          setOrderResult({
            assigned: res.assignments.length,
            unassigned: res.unassigned_medicine_ids.length,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Checkout failed. Please try again.");
        } finally {
          setPlacingOrder(false);
        }
      },
      () => {
        setError("Location access denied. Enable location to assign nearby pharmacies.");
        setPlacingOrder(false);
      }
    );
  }, [cart, patientId]);

  // Lazily load past (non-pending) orders the first time the section is opened
  const togglePastOrders = useCallback(() => {
    setShowPast((v) => !v);
    if (!pastLoaded) {
      setPastLoading(true);
      loadEnrichedPastOrders(patientId)
        .then(setPastOrders)
        .finally(() => { setPastLoading(false); setPastLoaded(true); });
    }
  }, [pastLoaded, patientId]);

  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.count, 0);
  const discount = promoApplied ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * TAX_RATE;
  const total = subtotal - discount + tax + (cart.length > 0 ? DELIVERY_FEE : 0);

  // Prices come from the medicine's package_container and are in Taka
  const fmt = (n: number) => `৳${n.toFixed(2)}`;

  if (orderResult) {
    return (
      <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <NavBar logout={logout} />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />
          <main className="flex-1 flex items-center justify-center p-8">
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-12 max-w-md w-full flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-6">
                <ShieldCheck size={40} className="text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900 mb-3">Order Placed!</h2>
              <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                {orderResult.assigned} medicine{orderResult.assigned === 1 ? "" : "s"} assigned to nearby pharmacies.
                {orderResult.unassigned > 0
                  ? ` ${orderResult.unassigned} couldn't be matched to a pharmacy in range.`
                  : ""}
              </p>
              <a
                href="/dashboard"
                className="w-full py-3.5 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95 flex items-center justify-center"
              >
                Back to Dashboard
              </a>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <NavBar logout={logout} />
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start">

            {/* ── Cart Items List ── */}
            <div className="flex-1 w-full flex flex-col gap-6">
              
              <div className="flex items-end justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Your Cart</h1>
                  <p className="text-sm text-zinc-500 mt-2">
                    {cart.length} {cart.length === 1 ? "item" : "items"} in your order
                  </p>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-sm text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors font-semibold"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {error && (
                <p className="text-sm font-semibold text-red-600 bg-red-50 p-4 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </p>
              )}

              {loading ? (
                <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 flex flex-col items-center justify-center py-20 text-center">
                  <Loader2 size={32} className="text-indigo-500 animate-spin mb-4" />
                  <p className="text-sm font-medium text-zinc-500">Loading your cart…</p>
                </div>
              ) : cart.length === 0 ? (
                <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 flex flex-col items-center justify-center gap-4 text-center py-24 px-6">
                  <div className="w-20 h-20 rounded-3xl bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-2">
                    <PackageOpen size={32} className="text-zinc-400" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900">Your cart is empty</h2>
                  <p className="text-sm text-zinc-500 max-w-sm leading-relaxed mb-4">
                    Looks like you havent added any medicines yet. Browse our catalog or find pharmacies nearby.
                  </p>
                  <a href="/medicines" className="inline-flex items-center justify-center px-8 py-3.5 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95">
                    Browse Medicines
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {cart.map((item) => (
                    <div
                      key={item.cart_id}
                      className="bg-white rounded-3xl border border-zinc-200 p-6 flex flex-col sm:flex-row sm:items-center gap-6 shadow-sm hover:shadow-md transition-all"
                    >
                      {/* Medicine icon */}
                      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 hidden sm:flex">
                        <Pill size={24} className="text-indigo-600" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-1.5">
                          <p className="text-lg font-bold text-zinc-900">
                            {item.brand_name}{" "}
                            {item.strength && <span className="font-medium text-zinc-400">{item.strength}</span>}
                          </p>
                          {item.assigned_pharmacy_name && (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full tracking-wide">
                              {item.assigned_pharmacy_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-500 font-medium">{item.generic_name}</p>
                        {item.manufacturer_name && (
                          <p className="text-xs text-zinc-400 mt-1">{item.manufacturer_name}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 w-full sm:w-auto">
                        {/* Qty controls */}
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            onClick={() => updateQty(item.cart_id, -1)}
                            className="w-8 h-8 rounded-lg border border-zinc-200 bg-white flex items-center justify-center text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 transition-colors shadow-sm"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-bold text-zinc-900 w-6 text-center tabular-nums">
                            {item.count}
                          </span>
                          <button
                            onClick={() => updateQty(item.cart_id, 1)}
                            className="w-8 h-8 rounded-lg border border-zinc-200 bg-white flex items-center justify-center text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 transition-colors shadow-sm"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right shrink-0 min-w-[4rem]">
                          <p className="text-lg font-bold text-zinc-900 tabular-nums">
                            {fmt(item.unit_price * item.count)}
                          </p>
                          {item.count > 1 && (
                            <p className="text-xs text-zinc-400 font-medium tabular-nums mt-0.5">
                              {fmt(item.unit_price)} each
                            </p>
                          )}
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => removeItem(item.cart_id)}
                          disabled={removing[item.cart_id]}
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:bg-red-50 hover:text-red-600 transition-all shrink-0 disabled:opacity-50"
                        >
                          {removing[item.cart_id] ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Delivery info strip */}
              {cart.length > 0 && (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm px-6 py-4 flex items-center gap-4 shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <Truck size={18} className="text-indigo-600" />
                  </div>
                  <p className="text-sm text-zinc-600 font-medium">
                    Standard delivery <span className="font-bold text-zinc-900 mx-1">{fmt(DELIVERY_FEE)}</span>
                    {" · "}Estimated <span className="font-bold text-zinc-900 mx-1">2–4 hours</span>
                  </p>
                </div>
              )}

              {/* Past orders (GET /cart/past_orders) */}
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                <button
                  onClick={togglePastOrders}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                >
                  <span className="text-sm font-bold text-zinc-900 flex items-center gap-2.5">
                    <PackageOpen size={16} className="text-indigo-500" />
                    Past Orders
                  </span>
                  <ChevronRight
                    size={16}
                    className={`text-zinc-400 transition-transform ${showPast ? "rotate-90" : ""}`}
                  />
                </button>

                {showPast && (
                  <div className="border-t border-zinc-100 px-6 py-4 flex flex-col gap-3">
                    {pastLoading ? (
                      <div className="flex items-center gap-2 text-sm text-zinc-500 py-4 justify-center">
                        <Loader2 size={16} className="animate-spin" /> Loading past orders…
                      </div>
                    ) : pastOrders.length === 0 ? (
                      <p className="text-sm text-zinc-500 py-4 text-center">No past orders yet.</p>
                    ) : (
                      pastOrders.map((item) => (
                        <div
                          key={item.cart_id}
                          className="flex items-center justify-between gap-4 py-3 border-b border-zinc-50 last:border-0"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0">
                              <Pill size={15} className="text-indigo-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-zinc-900 truncate">
                                {item.brand_name}
                                {item.strength && <span className="font-medium text-zinc-400"> {item.strength}</span>}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">
                                ×{item.count}
                                {item.assigned_pharmacy_name ? ` · ${item.assigned_pharmacy_name}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-bold text-zinc-900 tabular-nums">
                              {fmt(item.unit_price * item.count)}
                            </span>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                              item.order_status === "confirmed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-zinc-100 text-zinc-600 border-zinc-200"
                            }`}>
                              {item.order_status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Order Summary Sidebar ── */}
            <div className="w-full lg:w-[360px] shrink-0 flex flex-col gap-6">
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-6">
                <h2 className="text-lg font-bold text-zinc-900">Order Summary</h2>

                {/* Line items */}
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Subtotal</span>
                    <span className="text-sm font-bold text-zinc-900 tabular-nums">{fmt(subtotal)}</span>
                  </div>
                  {promoApplied && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-emerald-600">Promo (10%)</span>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">−{fmt(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Delivery fee</span>
                    <span className="text-sm font-bold text-zinc-900 tabular-nums">
                      {cart.length > 0 ? fmt(DELIVERY_FEE) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Tax (5%)</span>
                    <span className="text-sm font-bold text-zinc-900 tabular-nums">{fmt(tax)}</span>
                  </div>
                </div>

                <div className="border-t border-zinc-100" />

                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-zinc-900">Total</span>
                  <span className="text-2xl font-bold text-zinc-900 tabular-nums">{fmt(total)}</span>
                </div>

                {/* Promo code */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Promo code"
                      disabled={promoApplied}
                      className="w-full h-12 pl-11 pr-4 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={() => promoCode.length > 0 && setPromoApplied((v) => !v)}
                    className={`px-6 rounded-xl text-sm font-bold transition-all shrink-0 ${
                      promoApplied
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 border border-zinc-200"
                    }`}
                  >
                    {promoApplied ? "Applied" : "Apply"}
                  </button>
                </div>

                {/* Place Order */}
                <button
                  disabled={cart.length === 0 || placingOrder}
                  onClick={placeOrder}
                  className="w-full py-4 bg-zinc-900 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {placingOrder ? <Loader2 size={18} className="animate-spin" /> : null}
                  {placingOrder ? "Placing order…" : "Place Order"}
                  {!placingOrder && <ChevronRight size={18} />}
                </button>
              </div>

              {/* Trust badges */}
              <div className="bg-zinc-50 border border-zinc-100 rounded-3xl p-6 flex flex-col gap-4">
                {[
                  { icon: ShieldCheck, label: "Verified pharmacy partners" },
                  { icon: Truck, label: "Same-day delivery available" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center shrink-0 shadow-sm">
                      <Icon size={18} className="text-indigo-500" />
                    </div>
                    <span className="text-sm font-medium text-zinc-600">{label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}