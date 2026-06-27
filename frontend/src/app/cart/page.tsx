"use client";

import { useState } from "react";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Minus, Plus, Trash2, ShieldCheck, Truck, Tag, ChevronRight,
  PackageOpen, LayoutDashboard, Pill,
} from "lucide-react";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Book Appointment", href: "/appointments" },
  { icon: MapPin, label: "Find Pharmacies", href: "/location" },
  { icon: Pill, label: "Search Medicine", href: "/medicines" },
  { icon: Calculator, label: "Dosage Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "View Cart", href: "/cart", active: true },
];

interface CartItem {
  id: number;
  brandName: string;
  genericName: string;
  manufacturer: string;
  strength: string;
  unitPrice: number;
  quantity: number;
  rxRequired: boolean;
}

const INITIAL_CART: CartItem[] = [
  {
    id: 1,
    brandName: "Azithromycin",
    genericName: "Azithromycin Dihydrate",
    manufacturer: "Beximco Pharmaceuticals",
    strength: "500mg",
    unitPrice: 12.5,
    quantity: 1,
    rxRequired: true,
  },
  {
    id: 2,
    brandName: "Paracetamol",
    genericName: "Acetaminophen",
    manufacturer: "Square Pharmaceuticals",
    strength: "500mg",
    unitPrice: 3.2,
    quantity: 2,
    rxRequired: false,
  },
  {
    id: 3,
    brandName: "Cetirizine",
    genericName: "Cetirizine Hydrochloride",
    manufacturer: "Renata Limited",
    strength: "10mg",
    unitPrice: 5.8,
    quantity: 1,
    rxRequired: false,
  },
];

const DELIVERY_FEE = 2.5;
const TAX_RATE = 0.05;

export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>(INITIAL_CART);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [ordered, setOrdered] = useState(false);

  const updateQty = (id: number, delta: number) =>
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      )
    );

  const removeItem = (id: number) => setCart((prev) => prev.filter((item) => item.id !== id));

  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discount = promoApplied ? subtotal * 0.1 : 0;
  const tax = (subtotal - discount) * TAX_RATE;
  const total = subtotal - discount + tax + (cart.length > 0 ? DELIVERY_FEE : 0);

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  if (ordered) {
    return (
      <div className="flex flex-col h-screen bg-[#EDF1F9] overflow-hidden">
        <NavBar />
        <div className="flex flex-1 gap-4 p-4 overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-[#E6F7F0] flex items-center justify-center">
                <ShieldCheck size={30} className="text-[#22A06B]" />
              </div>
              <h2 className="text-[20px] font-bold text-[#1B2A4A]">Order Placed!</h2>
              <p className="text-[13px] text-[#9DAABF] max-w-[280px] leading-relaxed">
                Your medicines have been ordered. You'll receive a confirmation shortly.
              </p>
              <button
                onClick={() => { setOrdered(false); setCart(INITIAL_CART); }}
                className="aura-btn-primary px-6 py-2.5 text-[13px] font-semibold mt-2"
              >
                Back to Cart
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#EDF1F9] overflow-hidden">
      <NavBar />

      <div className="flex flex-1 gap-4 p-4 overflow-hidden">
        <Sidebar />

        {/* ── Main Content ── */}
        <div className="flex-1 flex gap-4 overflow-hidden min-w-0">

          {/* ── Cart Items ── */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0">
            <div className="flex items-baseline justify-between shrink-0">
              <div>
                <h1 className="text-[20px] font-bold text-[#1B2A4A] tracking-tight">Your Cart</h1>
                <p className="text-[12px] text-[#9DAABF] mt-0.5">
                  {cart.length} {cart.length === 1 ? "item" : "items"} in your order
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-[12px] text-[#D94F4F] hover:underline font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                  <PackageOpen size={26} className="text-[#B8D4F5]" />
                </div>
                <p className="text-[14px] font-semibold text-[#1B2A4A]">Your cart is empty</p>
                <p className="text-[12px] text-[#9DAABF]">Add medicines from the search or pharmacy page.</p>
                <a href="/medicines" className="aura-btn-primary px-5 py-2.5 text-[13px] font-medium mt-1 inline-block">
                  Browse Medicines
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-[18px] border border-[rgba(215,225,245,0.70)] shadow-[0_2px_16px_rgba(140,158,205,0.09)] p-5 flex items-center gap-5"
                  >
                    {/* Medicine icon placeholder */}
                    <div className="w-12 h-12 rounded-2xl bg-[#EAF2FF] flex items-center justify-center shrink-0">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="8" width="18" height="13" rx="3" fill="#B8D4F5" />
                        <path d="M8 8V6a4 4 0 018 0v2" stroke="#4D8ED6" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="12" cy="14" r="2" fill="#4D8ED6" />
                      </svg>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-semibold text-[#1B2A4A]">
                          {item.brandName} <span className="font-normal text-[#9DAABF]">{item.strength}</span>
                        </p>
                        {item.rxRequired && (
                          <span className="text-[9.5px] font-bold text-[#4D8ED6] bg-[#EAF2FF] px-2 py-0.5 rounded-full tracking-wide">
                            Rx REQUIRED
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#9DAABF] mt-0.5">{item.genericName}</p>
                      <p className="text-[11px] text-[#B8C4D8] mt-0.5">{item.manufacturer}</p>
                    </div>

                    {/* Qty controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="w-7 h-7 rounded-lg border border-[#E6ECF7] bg-white flex items-center justify-center text-[#6A7898] hover:border-[#4D8ED6] hover:text-[#4D8ED6] transition-colors"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-[14px] font-semibold text-[#1B2A4A] w-6 text-center tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(item.id, 1)}
                        className="w-7 h-7 rounded-lg border border-[#E6ECF7] bg-white flex items-center justify-center text-[#6A7898] hover:border-[#4D8ED6] hover:text-[#4D8ED6] transition-colors"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0 w-20">
                      <p className="text-[15px] font-bold text-[#1B2A4A] tabular-nums">
                        {fmt(item.unitPrice * item.quantity)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-[10.5px] text-[#9DAABF] tabular-nums">
                          {fmt(item.unitPrice)} each
                        </p>
                      )}
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-[#C8D0E0] hover:bg-[#FDEAEA] hover:text-[#D94F4F] transition-all shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Delivery info strip */}
            {cart.length > 0 && (
              <div className="bg-white rounded-[18px] border border-[rgba(215,225,245,0.70)] shadow-[0_2px_16px_rgba(140,158,205,0.09)] px-5 py-3.5 flex items-center gap-3 shrink-0">
                <Truck size={16} className="text-[#4D8ED6] shrink-0" />
                <p className="text-[12px] text-[#6A7898]">
                  Standard delivery <span className="font-semibold text-[#1B2A4A]">{fmt(DELIVERY_FEE)}</span>
                  {" · "}Estimated <span className="font-semibold text-[#1B2A4A]">2–4 hours</span>
                </p>
              </div>
            )}
          </div>

          {/* ── Order Summary ── */}
          <div className="w-[300px] shrink-0 flex flex-col gap-3">
            <div className="bg-white rounded-[22px] border border-[rgba(215,225,245,0.70)] shadow-[0_2px_20px_rgba(140,158,205,0.11),0_1px_4px_rgba(140,158,205,0.06)] p-5 flex flex-col gap-4">
              <h2 className="text-[14px] font-bold text-[#1B2A4A]">Order Summary</h2>

              {/* Line items */}
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-[12.5px] text-[#6A7898]">Subtotal</span>
                  <span className="text-[12.5px] font-medium text-[#1B2A4A] tabular-nums">{fmt(subtotal)}</span>
                </div>
                {promoApplied && (
                  <div className="flex justify-between items-center">
                    <span className="text-[12.5px] text-[#22A06B]">Promo (10%)</span>
                    <span className="text-[12.5px] font-medium text-[#22A06B] tabular-nums">−{fmt(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-[12.5px] text-[#6A7898]">Delivery fee</span>
                  <span className="text-[12.5px] font-medium text-[#1B2A4A] tabular-nums">
                    {cart.length > 0 ? fmt(DELIVERY_FEE) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12.5px] text-[#6A7898]">Tax (5%)</span>
                  <span className="text-[12.5px] font-medium text-[#1B2A4A] tabular-nums">{fmt(tax)}</span>
                </div>
              </div>

              <div className="border-t border-[#E6ECF7]" />

              <div className="flex justify-between items-center">
                <span className="text-[14px] font-bold text-[#1B2A4A]">Total</span>
                <span className="text-[18px] font-bold text-[#1B2A4A] tabular-nums">{fmt(total)}</span>
              </div>

              {/* Promo code */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9DAABF] pointer-events-none" />
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Promo code"
                    disabled={promoApplied}
                    className="w-full h-9 pl-8 pr-3 bg-[#F3F5FB] border border-[#E6ECF7] rounded-xl text-[12px] text-[#1B2A4A] placeholder:text-[#9DAABF] focus:outline-none focus:border-[#4D8ED6] focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>
                <button
                  onClick={() => promoCode.length > 0 && setPromoApplied((v) => !v)}
                  className={`px-3 rounded-xl text-[12px] font-semibold transition-colors shrink-0 ${
                    promoApplied
                      ? "bg-[#E6F7F0] text-[#22A06B]"
                      : "bg-[#EAF2FF] text-[#4D8ED6] hover:bg-[#D5E9FF]"
                  }`}
                >
                  {promoApplied ? "Applied" : "Apply"}
                </button>
              </div>

              {/* Place Order */}
              <button
                disabled={cart.length === 0}
                onClick={() => setOrdered(true)}
                className="aura-btn-primary w-full py-3 text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
              >
                Place Order
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Trust badges */}
            <div className="bg-white rounded-[18px] border border-[rgba(215,225,245,0.70)] shadow-[0_1px_8px_rgba(140,158,205,0.07)] px-4 py-3.5 flex flex-col gap-2.5">
              {[
                { icon: ShieldCheck, label: "Verified pharmacy partners" },
                { icon: Truck, label: "Same-day delivery available" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-[#EAF2FF] flex items-center justify-center shrink-0">
                    <Icon size={12} className="text-[#4D8ED6]" />
                  </div>
                  <span className="text-[11.5px] text-[#6A7898]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared layout components ──────────────────────────────────

function NavBar() {
  return (
    <header className="bg-white border-b border-[#E6ECF7] shadow-[0_1px_12px_rgba(140,158,205,0.09)] flex items-center justify-between px-6 py-3 shrink-0 z-10">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5AA6E8] to-[#3A78C4] flex items-center justify-center shadow-sm shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 21C12 21 3 14 3 8.5C3 5.46 5.46 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.54 3 23 5.46 23 8.5C23 14 12 21 12 21Z" fill="white" />
          </svg>
        </div>
        <span className="text-[17px] font-semibold text-[#1B2A4A] tracking-tight">AuraMed</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#EAF2FF] transition-colors">
          <Bell size={18} className="text-[#6A7898]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4D8ED6] border-2 border-white" />
        </button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#EAF2FF] transition-colors">
          <Settings size={18} className="text-[#6A7898]" />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-white text-sm font-semibold">A</div>
      </div>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="bg-white rounded-[22px] shadow-[0_2px_20px_rgba(140,158,205,0.11),0_1px_4px_rgba(140,158,205,0.06)] border border-[rgba(215,225,245,0.70)] w-[196px] shrink-0 flex flex-col gap-1.5 p-3">
      {NAV_ITEMS.map(({ icon: Icon, label, href, active }) => (
        <a
          key={label}
          href={href}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all group ${
            active
              ? "bg-[#EAF2FF] text-[#4D8ED6]"
              : "text-[#6A7898] hover:bg-[#EAF2FF] hover:text-[#4D8ED6]"
          }`}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            active ? "bg-[#D5E9FF]" : "bg-[#EAF2FF] group-hover:bg-[#D5E9FF]"
          }`}>
            <Icon size={15} className="text-[#4D8ED6]" />
          </div>
          <span className={`text-[12.5px] font-medium leading-tight ${active ? "font-semibold" : ""}`}>
            {label}
          </span>
        </a>
      ))}
    </aside>
  );
}
