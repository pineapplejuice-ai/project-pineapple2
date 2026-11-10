# Saath — MVP scope

> **Saath** (साथ, "together") helps adult children in metros or abroad look after ageing
> parents in India's tier-2 towns: a daily voice check-in in the parent's language,
> trusted local helpers (*Sahayaks*), and one shared view for the whole family.

Status: concept. Every price, number and claim below is a **hypothesis to test** in the
[validation plan](VALIDATION_PLAN.md), not a fact.

---

## 1. Who it's for

| Role | Example | What they need | Device |
|---|---|---|---|
| **Buyer** — the adult child | Priya, 34, product manager in Bengaluru. Brother Karthik in Singapore. | Know her parents are okay without calling three times a day. Get practical help to them fast. | Smartphone (Android in India; many NRIs on iPhone) |
| **User** — the parent | Lakshmi, 66, and K. Raghavendra, 72, in Kuvempunagar, Mysuru. Kannada first. | Stay independent at home. Not feel watched. Get help without a fuss. | Often a basic phone or a shared, lightly used smartphone |
| **Local guardian** | Shobha Rao, neighbour, 2 min walk | A clear, occasional ask ("can you look in on Amma?") | Smartphone / WhatsApp |
| **Sahayak** (helper) | Ravi Kumar, verified and trained, works within 5 km | Clear tasks, fair pay, safety | Android |

Pilot geography: **Mysuru**, with children mainly in **Bengaluru** (3 hours away) and abroad.
Mysuru has a large retired population and a strong Bengaluru connection, so both sides are reachable.

## 2. The problem, in the family's words

- "I call every morning. If Amma doesn't pick up, I panic and call the neighbour."
- "Appa has a cardiology review on Tuesday. Who takes him? I can't take leave every month."
- "The doctor said something about the dose. Appa doesn't remember. The prescription is lost."
- "My brother is abroad. I end up doing everything and paying for most of it."
- Parent: "I don't want to be a burden. I don't want a camera in my house."

**What they do today:** daily phone calls, neighbours and relatives, a full-time attendant
(expensive, hard to trust), premium eldercare concierges (mostly metro-only), or moving the
parents, which many refuse.

## 3. Why this can work now, in India

- **Voice in Indian languages** is now practical: automated calls in Kannada, Hindi, Tamil and Telugu
  with keypad (DTMF) answers work on *any* phone. Parents need no app and no reading.
- **"Missed call" culture.** People already trigger services by giving a missed call.
  A missed call to the Saath number can be the parent's Help button on a basic phone.
- **UPI and UPI AutoPay** make small recurring payments and per-visit payments frictionless for the buyer.
- **India's digital public infrastructure:** ABHA/ABDM for health records (later), and
  DigiLocker or Aadhaar-based e-KYC for verifying Sahayaks.
- **DPDP Act 2023** sets clear consent rules. Following them well is a trust advantage, not just a cost.

## 4. Product principles

1. **The parent's dignity comes first.** Explicit consent, recorded in their language. They can pause calls by pressing 0. No cameras, no location tracking.
2. **Works on any phone.** Voice call first; app second.
3. **Humans do the help; software does the coordination.**
4. **Never medical advice.** Saath reminds, records and escalates. Doctors decide.
5. **One city, done properly,** before a second city.

## 5. MVP features

### Must have (pilot launch)

| # | Feature | Details | In prototype |
|---|---|---|---|
| 1 | **Family onboarding + parent consent** | Child signs up and adds parents. A consent call in the parent's language explains what happens; parent presses 1 to agree. Consent is logged. | Check-in settings shows consent date |
| 2 | **Daily voice check-in** | Scheduled automated call per parent. Questions: medicines taken? how are you feeling? Answers by keypad: 1 / 2, and 9 for help. Kannada, Hindi, English at launch. | Amma's phone → voice call |
| 3 | **Escalation ladder** | No answer → retry after 15 min (×2) → notify children → ask local guardian → dispatch Sahayak (Care plan). Configurable per parent. | Check-in settings |
| 4 | **Help trigger for parents** | Missed call to the Saath number, press 9 during a call, or a big Help button in the simple parent app. Alerts children, guardian and nearest Sahayak together. | Amma presses Help |
| 5 | **Child app: Today view** | Both parents' status, medicines, appointments and gaps. Push notifications for check-ins and alerts. | Priya's Today |
| 6 | **Sahayak booking** | Four services at launch: doctor-visit companion, medicines and groceries, bank/bills/pension work, wellbeing visit. Ops dispatches manually in the pilot. | Book a Sahayak |
| 7 | **Visit tracking + notes** | Sahayak updates status (on the way, arrived with photo check-in, done), writes the doctor's advice, and uploads the prescription. | Follow the visit |
| 8 | **Records + emergency card** | Photo upload of prescriptions and reports. Emergency card (blood group, allergies, conditions, medicines, contacts) with a time-limited QR link for hospitals. | Records |
| 9 | **Payments** | UPI AutoPay mandate for plans; UPI collect for visits. Request a payment from a sibling. | Pay with UPI |
| 10 | **Family circle** | Invite siblings and the local guardian with role-based access. Shared alerts. Monthly cost split shown with a UPI request link. | Family |
| 11 | **Ops console (internal)** | Today's calls and answers, open escalations, Sahayak dispatch, visit log. Ops is the heart of the pilot. | Not shown |

### Should have (after pilot, if validated)

- Medicine refill pick-up with a local pharmacy, using a prescription on file.
- Tamil and Telugu calls; WhatsApp as an optional channel for tech-comfortable parents.
- Monthly wellbeing summary for children (answer rate, mood trend, visits).
- Children abroad paying by international card.

### Not in the MVP (on purpose)

Fall detection and wearables · telemedicine or in-house doctors · AI health advice ·
insurance · ABHA/ABDM integration (needs sandbox and certification; plan for v2) ·
ONDC pharmacy ordering · a second city.

## 6. Plans (pricing hypotheses)

| Plan | Price / month (both parents) | Includes |
|---|---|---|
| Basic | ₹499 | Daily voice check-ins, escalation to family and guardian, medicine reminders, records, emergency card |
| Care | ₹1,499 | Basic + 2 Sahayak visits a month + emergency Sahayak response within 60 min (Mysuru) + monthly summary |
| Pay as you go | ₹199–₹399 per visit · ₹999/day hospital support | For Basic users or extra visits |

Test willingness to pay at three levels in the pilot. Also offer a "founding family" price.

## 7. Unit economics: what to measure, not guess

Monthly cost per family on the Care plan ≈

```
calls      = parents × 30 days × avg call minutes × per-minute telephony rate
             (+ retries and escalation calls)
messages   = SMS/WhatsApp notifications × rate (DLT-registered templates)
visits     = included visits × (Sahayak pay per visit + travel)
payments   = gateway / mandate fees
support    = ops minutes per family × ops cost per minute
```

Get real per-minute and per-message rates from two or three Indian cloud-telephony providers
during validation. Track `ops minutes per family per week` from day 1. It decides whether
this is a business.

## 8. Tech approach (lean)

- **Child app:** cross-platform (Flutter or React Native). Many buyers abroad use iPhones, so
  Android-only would miss a key segment. The clickable prototype in this folder is the UX reference.
- **Parent side:** cloud-telephony IVR with regional-language recordings by native voice artists
  (not robotic TTS for the first version). Missed-call number for Help. Optional simple Android app
  with big buttons.
- **Backend:** one service plus Postgres, a call scheduler and an internal ops console.
  Host in India.
- **Sahayak app:** start with a simple mobile web form (status, photo, notes). Make it native later.
- **Payments:** a gateway that supports UPI AutoPay e-mandates.

## 9. Compliance, safety and trust

| Area | What we do |
|---|---|
| **DPDP Act 2023** | Consent notice in the parent's language; purpose limited to care; data access, correction and deletion on request; health data visible to roles on a need-to-know basis (a Sahayak sees visit-related records only). |
| **Telecom rules** | Calls are service calls made with consent, never promotional. Register SMS templates on DLT. Confirm current TRAI rules with the telephony provider. |
| **Medical** | No diagnosis or dosing advice anywhere in the product. Emergencies always route to 112/108 and family. |
| **Sahayak safety** | ID verification, police verification, reference checks, first-aid training, insurance. **No cash handling**: UPI only. Random audit calls to parents after visits. Clear rules on what a Sahayak may and may not do. |
| **Elder-abuse safeguards** | Parents can always reach Saath directly. Any complaint from a parent suspends the Sahayak pending review. |

## 10. MVP success metrics (pilot, 8 weeks)

| Metric | Target |
|---|---|
| Parents who answer the daily call | ≥ 85% of scheduled calls |
| Parents who say they like the call (week-4 survey, in their language) | ≥ 80% |
| Escalations resolved (someone reaches the parent) | ≤ 30 min median |
| Sahayak on time | ≥ 90% of visits |
| Families paying for month 2 | ≥ 70% |
| Ops minutes per family per week | Measure; trend down |

## 11. Team for pilot

Founder (product + sales) · 1 full-stack engineer · 1 ops lead in Mysuru (Kannada-speaking) ·
3–5 part-time Sahayaks · advisers: a geriatrician and a lawyer for DPDP and employment contracts.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Parents feel monitored and refuse | Consent call, parent controls, framing as "company, not surveillance"; test in interviews first |
| Sahayak quality or safety incident | Rigorous verification, training, insurance, audits, no cash; start small |
| Ops cost eats the margin | Track ops minutes from day 1; automate the most frequent manual steps first |
| Children want it but won't pay | Paid reservations and paid pilot before building; test a B2B channel (employers offering eldercare as a benefit) |
| Competition from metro eldercare firms | Win on tier-2 depth, language and price; partner where useful |
| Name or trademark conflict | Check "Saath" availability before any public launch |

## 13. Open questions

- Basic phone vs smartphone split among parents in Mysuru?
- Do children prefer one plan for both parents, or per parent?
- Will local pharmacies and clinics cooperate (prescriptions, appointment slots)?
- Is employer-paid eldercare a faster channel than direct-to-consumer?
