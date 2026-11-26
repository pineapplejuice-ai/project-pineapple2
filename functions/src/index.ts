/**
 * AutoBridge Cloud Functions (sample).
 *
 * - onBookingWritten: push notification to the customer (and the assigned rider) whenever a booking's status changes,
 *   keeps public slot counters in sync, and recalculates partner ratings when a booking gets rated.
 * - setRole: callable for ops to grant role claims (partner|rider|ops).
 *
 * Deploy: cd functions && npm install && npm run build && firebase deploy --only functions
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

const STATUS_TITLES: Record<string, string> = {
  CONFIRMED: "Booking confirmed",
  DECLINED: "Booking declined by partner",
  RIDER_ASSIGNED: "Rider assigned",
  PICKUP_EN_ROUTE: "Rider on the way",
  PICKED_UP: "Vehicle picked up",
  AT_WORKSHOP: "Vehicle at the workshop",
  ESTIMATE_SHARED: "Estimate ready – please approve",
  IN_SERVICE: "Service in progress",
  READY: "Your vehicle is ready",
  DROP_EN_ROUTE: "Out for delivery",
  COMPLETED: "Completed – rate your experience",
  CANCELLED: "Booking cancelled",
};

const ACTIVE = new Set(["REQUESTED", "CONFIRMED", "RIDER_ASSIGNED", "PICKUP_EN_ROUTE", "PICKED_UP", "AT_WORKSHOP",
  "ESTIMATE_SHARED", "IN_SERVICE", "READY", "DROP_EN_ROUTE"]);

interface BookingDoc {
  id: string;
  customerId: string;
  partnerId: string;
  riderId?: string | null;
  status: string;
  slot: { epochDay: number; slotId: string };
  partner: { name: string };
  vehicle: { name: string };
  ratings?: { partner?: number | null; rider?: number | null; comment?: string };
  customerName?: string;
}

async function tokensFor(uid: string | null | undefined): Promise<string[]> {
  if (!uid) return [];
  const snap = await db.collection("users").doc(uid).get();
  return (snap.get("fcmTokens") as string[] | undefined) ?? [];
}

async function push(uids: (string | null | undefined)[], title: string, body: string, bookingId: string) {
  const tokens = (await Promise.all(uids.map(tokensFor))).flat();
  if (tokens.length === 0) return;
  await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { bookingId, title, body },
    android: { notification: { channelId: "booking_updates" } },
  });
}

async function adjustSlot(b: BookingDoc | undefined, delta: number) {
  if (!b || !ACTIVE.has(b.status)) return;
  await db.collection("slotCounts").doc(`${b.partnerId}_${b.slot.epochDay}`)
    .set({ [b.slot.slotId]: FieldValue.increment(delta) }, { merge: true });
}

/** Recomputes the AutoBridge rating from rated, completed bookings. Google ratings are never mixed in. */
async function recalculatePartnerRating(partnerId: string) {
  const snap = await db.collection("bookings").where("partnerId", "==", partnerId).where("status", "==", "COMPLETED").get();
  const ratings = snap.docs.map((d) => d.get("ratings.partner") as number | null).filter((r): r is number => typeof r === "number");
  const count = ratings.length;
  const avg = count === 0 ? 0 : ratings.reduce((a, b) => a + b, 0) / count;
  await db.collection("partners").doc(partnerId).update({ rating: Math.round(avg * 10) / 10, reviewCount: count });
}

export const onBookingWritten = onDocumentWritten("bookings/{bookingId}", async (event) => {
  const before = event.data?.before.data() as BookingDoc | undefined;
  const after = event.data?.after.data() as BookingDoc | undefined;
  const bookingId = event.params.bookingId;

  // Slot counters: release the old slot, take the new one.
  const slotChanged = before?.slot?.epochDay !== after?.slot?.epochDay || before?.slot?.slotId !== after?.slot?.slotId;
  const activeChanged = (before && ACTIVE.has(before.status)) !== (after && ACTIVE.has(after.status));
  if (slotChanged || activeChanged) {
    await adjustSlot(before, -1);
    await adjustSlot(after, +1);
  }

  if (!after) return;

  // Validate the commission snapshot against the partner document (clients can't be trusted with it).
  if (!before) {
    const partner = await db.collection("partners").doc(after.partnerId).get();
    const commission = (partner.get("commissionPercent") as number | undefined) ?? 10;
    await event.data!.after.ref.update({ commissionPercent: commission });
  }

  if (before?.status !== after.status) {
    const title = STATUS_TITLES[after.status];
    if (title) {
      await push([after.customerId], title, `${after.partner.name} · ${after.vehicle.name}`, bookingId);
    }
    if (after.status === "RIDER_ASSIGNED" && after.riderId) {
      await push([after.riderId], "New job assigned", `${after.vehicle.name} · ${after.partner.name}`, bookingId);
    }
  }

  const ratingChanged = before?.ratings?.partner !== after.ratings?.partner;
  if (ratingChanged && typeof after.ratings?.partner === "number") {
    await db.collection("partners").doc(after.partnerId).collection("reviews").doc(bookingId).set({
      id: bookingId,
      partnerId: after.partnerId,
      authorName: (after.customerName ?? "Customer").split(" ")[0],
      rating: after.ratings.partner,
      text: after.ratings.comment ?? "",
      createdAtMillis: Date.now(),
      bookingId,
    });
    await recalculatePartnerRating(after.partnerId);
  }
});

/** Ops-only: grant a role. data = { uid, role: 'partner'|'rider'|'ops'|'customer', partnerId?, riderId? } */
export const setRole = onCall(async (req) => {
  if (req.auth?.token.role !== "ops") throw new HttpsError("permission-denied", "Ops only");
  const { uid, role, partnerId, riderId } = req.data as { uid: string; role: string; partnerId?: string; riderId?: string };
  if (!["partner", "rider", "ops", "customer"].includes(role)) throw new HttpsError("invalid-argument", "Bad role");
  await getAuth().setCustomUserClaims(uid, role === "customer" ? {} : { role, partnerId, riderId });
  return { ok: true };
});
