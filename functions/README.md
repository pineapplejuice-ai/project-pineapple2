# AutoBridge Cloud Functions (sample)

- `onBookingWritten` – pushes FCM notifications on status changes (customer + assigned rider), keeps
  `slotCounts/{partnerId}_{epochDay}` in sync for slot availability, re-validates the commission snapshot, and
  recalculates the partner's AutoBridge rating + writes a review when a customer rates a booking.
- `setRole` – callable for ops to set the `role` custom claim (`partner` | `rider` | `ops`), plus `partnerId`/`riderId`.

Bootstrap the first ops user once with the Admin SDK (e.g. from a local script):

```ts
await getAuth().setCustomUserClaims("<uid>", { role: "ops" });
```

Deploy: `cd functions && npm install && npm run build && firebase deploy --only functions,firestore:rules,storage`
