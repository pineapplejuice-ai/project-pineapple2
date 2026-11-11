'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { uid } from './utils';

export interface Sellable {
  variantId: string; name: string; sku: string; barcodes: string[]; hsnCode: string | null; gstRate: string; cessRate: string; taxExempt: boolean; priceIncludesTax: boolean;
  sellingPrice: string; mrp: string | null; stock: string; trackInventory: boolean; type: string; exactMatch?: boolean;
  baseUnit: { id: string; code: string; decimals: number }; units: Array<{ id: string; code: string; factorToBase: string; decimals: number }>;
}
export interface CartLine {
  key: string; item: Sellable; quantity: string; unitId: string | null; unitPrice: string; priceEdited: boolean; discountPct: string;
}
export interface CartCustomer { id: string; name: string; phone?: string | null; gstin?: string | null; stateCode?: string | null; balance?: string; creditLimit?: string | null }
export interface Cart { lines: CartLine[]; customer: CartCustomer | null; invoiceDiscount: string; notes: string }
export interface HeldCart extends Cart { id: string; heldAt: string; label: string }
/** A bill captured while offline. The idempotency key guarantees the server creates it at most once. */
export interface QueuedBill { idempotencyKey: string; payload: Record<string, unknown>; total: string; label: string; queuedAt: string; error?: string }

const emptyCart = (): Cart => ({ lines: [], customer: null, invoiceDiscount: '', notes: '' });
export const factorOf = (l: CartLine): string => l.item.units.find((u) => u.id === l.unitId)?.factorToBase ?? '1';
export const unitCodeOf = (l: CartLine): string => l.item.units.find((u) => u.id === l.unitId)?.code ?? l.item.baseUnit.code;

interface PosState {
  cart: Cart; held: HeldCart[]; queue: QueuedBill[]; catalog: Sellable[]; catalogAt: string | null;
  add: (item: Sellable, qty?: string) => void;
  update: (key: string, patch: Partial<CartLine>) => void;
  remove: (key: string) => void;
  setCart: (patch: Partial<Cart>) => void;
  clear: () => void;
  hold: () => void; resume: (id: string) => void; dropHeld: (id: string) => void;
  enqueue: (b: QueuedBill) => void; dequeue: (key: string) => void; markFailed: (key: string, error: string) => void;
  setCatalog: (items: Sellable[]) => void;
}
export const usePos = create<PosState>()(persist((set, get) => ({
  cart: emptyCart(), held: [], queue: [], catalog: [], catalogAt: null,
  add: (item, qty = '1') => set((s) => {
    const existing = s.cart.lines.find((l) => l.item.variantId === item.variantId && l.unitId === null && !l.priceEdited);
    const lines = existing
      ? s.cart.lines.map((l) => (l === existing ? { ...l, quantity: String(Number(l.quantity) + Number(qty)) } : l))
      : [...s.cart.lines, { key: uid(), item, quantity: qty, unitId: null, unitPrice: item.sellingPrice, priceEdited: false, discountPct: '' }];
    return { cart: { ...s.cart, lines } };
  }),
  update: (key, patch) => set((s) => ({ cart: { ...s.cart, lines: s.cart.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) } })),
  remove: (key) => set((s) => ({ cart: { ...s.cart, lines: s.cart.lines.filter((l) => l.key !== key) } })),
  setCart: (patch) => set((s) => ({ cart: { ...s.cart, ...patch } })),
  clear: () => set({ cart: emptyCart() }),
  hold: () => { const { cart } = get(); if (!cart.lines.length) return; set((s) => ({ held: [{ ...cart, id: uid(), heldAt: new Date().toISOString(), label: cart.customer?.name ?? `${cart.lines.length} item(s)` }, ...s.held], cart: emptyCart() })); },
  resume: (id) => set((s) => { const h = s.held.find((x) => x.id === id); if (!h) return s; const { id: _i, heldAt: _h, label: _l, ...cart } = h;
    const back = s.cart.lines.length ? [{ ...s.cart, id: uid(), heldAt: new Date().toISOString(), label: s.cart.customer?.name ?? `${s.cart.lines.length} item(s)` }] : [];
    return { cart, held: [...back, ...s.held.filter((x) => x.id !== id)] }; }),
  dropHeld: (id) => set((s) => ({ held: s.held.filter((x) => x.id !== id) })),
  enqueue: (b) => set((s) => ({ queue: [...s.queue, b] })),
  dequeue: (key) => set((s) => ({ queue: s.queue.filter((q) => q.idempotencyKey !== key) })),
  markFailed: (key, error) => set((s) => ({ queue: s.queue.map((q) => (q.idempotencyKey === key ? { ...q, error } : q)) })),
  setCatalog: (items) => set({ catalog: items, catalogAt: new Date().toISOString() }),
}), { name: 'nexbill-pos' }));
