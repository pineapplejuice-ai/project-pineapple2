'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SessionState {
  /** access token lives in memory only; the refresh token is an httpOnly cookie */
  token: string | null;
  businessId: string | null; branchId: string | null; warehouseId: string | null;
  sidebarCollapsed: boolean; theme: 'light' | 'dark';
  set: (p: Partial<Omit<SessionState, 'set'>>) => void;
}
export const useSession = create<SessionState>()(persist(
  (set) => ({ token: null, businessId: null, branchId: null, warehouseId: null, sidebarCollapsed: false, theme: 'light', set: (p) => set(p) }),
  { name: 'nexbill-session', partialize: ({ businessId, branchId, warehouseId, sidebarCollapsed, theme }) => ({ businessId, branchId, warehouseId, sidebarCollapsed, theme }) },
));
