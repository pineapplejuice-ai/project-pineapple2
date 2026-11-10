# Saath — validation plan (8 weeks, before building the real product)

**Rule: no production code until a family has paid for a hand-run version.**

## The four riskiest assumptions

| # | Assumption | If it's wrong |
|---|---|---|
| A1 | Adult children feel this pain often and will **pay ₹499–₹1,499 a month** | No business |
| A2 | Parents **accept and answer** a daily automated call and don't feel watched | No product |
| A3 | We can recruit **trustworthy Sahayaks** and deliver visits **below the price** we charge | No margin; risk of harm |
| A4 | We can **reach** these children cheaply (Mysuru natives in Bengaluru and abroad) | Growth too expensive |

Each phase below tests specific assumptions and has pass/fail numbers decided **in advance**.

---

## Phase 1 · Weeks 1–2 · Problem interviews (A1, A2, A4)

**Talk to:** 20 adult children · 10 parents · 5 local people (pharmacist, clinic receptionist,
RWA or residents' association member, a nurse or attendant, a bank branch staffer who sees pensioners).

**Where to find children:** Mysuru alumni groups of engineering and medical colleges, Bengaluru
WhatsApp and Telegram groups of Mysuru natives, LinkedIn posts, workplace communities,
Kannada associations abroad, friends of friends. Keep a log of which channel produced
interviews. That's your first CAC signal (A4).

**Rules:** 30 minutes. No pitching for the first 20 minutes. Ask about **the past, not the future**.
Record (with permission) and write notes the same day.

### Child interview script

1. Tell me about your parents: where they live, their health, who's around them.
2. **Tell me about the last time you were worried about them.** What happened? What did you do? How long did it take?
3. How do you check on them today? How often? Who else helps?
4. The last time they needed to see a doctor: who took them? How did you hear what the doctor said?
5. What do you spend today, in money and time, on their care? (Attendant, driver, travel, leave days.)
6. How do you and your siblings share this?
7. Have you tried any service for this? What happened?
8. *(Last 10 minutes only.)* Show the prototype video. "What would you change? What would worry you?
   What would your parents say?"
9. "If this were in Mysuru next month, would you reserve a pilot spot today for ₹99, refundable?"
   This is a commitment test, not a compliment.

### Parent interview script (in Kannada; ideally in person, with consent)

1. Tell me about a normal day.
2. When you need something (a doctor, the bank, a repair), how does it get done?
3. How do your children check on you? How do you feel about that?
4. **Play a 30-second sample call.** "Would you answer this every morning? What would you change?"
5. "If you pressed a button for help, who would you want to come?"
6. What would make you *not* want this?

### Listen for

- Specific incidents in the last 3 months (strong signal) vs. general worry (weak).
- Money or effort already spent on workarounds. That's evidence of willingness to pay.
- Parents' words about **dignity, burden, being watched**: copy their exact phrases into the product.
- Basic phone vs smartphone use, and whose phone it is.

### Pass if

- ≥ 12 of 20 children describe a specific incident in the last 3 months
- ≥ 8 of 20 already pay for some help (attendant, driver, concierge, frequent travel)
- ≥ 6 of 10 parents say they'd answer the daily call
- ≥ 5 children pay the ₹99 refundable reservation on the spot

---

## Phase 2 · Weeks 2–3 · Smoke test (A1, A4)

- One landing page in **English and Kannada**: the prototype video, three plans, and a
  "Reserve a pilot spot · ₹99 refundable (UPI)" button. Add a WhatsApp number for questions.
- Share it in the same channels as Phase 1, plus a small paid test (₹10–15k) on social ads
  aimed at Bengaluru with Mysuru interest.
- Track: visits → WhatsApp chats → reservations, **per channel**.

**Pass if:** ≥ 300 visits, ≥ 10% leave contact details, ≥ 25 paid reservations, and at least
one channel brings reservations at under ~₹1,000 each.

---

## Phase 3 · Weeks 3–8 · Concierge pilot ("Wizard of Oz") (A1, A2, A3)

Run the service **by hand** for **10–15 Mysuru families**, charging real money (founding price,
e.g. ₹999/month Care-lite, plus visits at full price).

| Product feature | How it's faked in the pilot |
|---|---|
| Daily voice check-in | An ops person calls each parent at the agreed time, following a script in Kannada, or a simple IVR from a cloud-telephony trial account |
| Escalation | A written ladder; ops follows it and logs times |
| Child's Today view | A WhatsApp message to the family group each morning: "✅ Amma 9:16 · medicine taken · feeling fine" |
| Sahayak booking | WhatsApp request → ops assigns one of 2–3 part-time Sahayaks |
| Visit notes | Sahayak sends photo + voice note → ops writes a short summary to the family |
| Records | A shared folder per family; emergency card as a PDF |
| Payments | UPI payment links |

**Before the first visit:** Sahayak ID and police verification, reference checks, a half-day
training (elder etiquette, first aid basics, what not to do, no cash), insurance quote, written
consent from every parent.

### Track daily (one shared sheet)

`date · family · parent · call scheduled · answered (Y/N) · answers · retries · escalation level
reached · minutes to resolve · visits · Sahayak on time · ops minutes spent · issues · quotes`

### Weekly

Call each child (10 min) and each parent (in Kannada): what worked, what annoyed, would you
recommend it? At week 4, ask parents: "Do you like the morning call?"

### Pass if (by week 8)

| Signal | Target |
|---|---|
| Parents answer the call | ≥ 85% |
| Parents like the call | ≥ 80% |
| Families pay for month 2 | ≥ 7 of 10 |
| At least one referral to another family | ≥ 3 families |
| Sahayak visits on time and with no safety issue | ≥ 90% on time, 0 serious issues |
| Ops minutes per family per week | Known, with a credible path to < 30 |

---

## Phase 4 · Week 8 · Decide

| What you saw | Decision |
|---|---|
| All Phase 3 targets met | **Build the MVP** ([scope](MVP_SCOPE.md)), starting with the parts that cost ops the most time |
| Children love it, parents resist daily calls | Shift to **on-demand Sahayak + emergency** first; make check-ins weekly or opt-in |
| Families love it but won't pay enough | Test **employer-paid eldercare** (HR benefit) and **NRI-focused premium** pricing |
| Sahayak supply or quality fails | Partner with an existing home-care agency for supply; stay the coordination layer |
| Weak pain in interviews (Phase 1 fails) | Stop. Go back to the idea list. |

## Ethics during validation

- Never record or call a parent without their informed consent, in their language.
- Never present the pilot as a medical or emergency service. Always give 112/108 first.
- Refund every ₹99 reservation on request, no questions.
- Store pilot data minimally; delete it if the family leaves.

## Calendar at a glance

| Week | Focus | Output |
|---|---|---|
| 1 | 12 interviews · landing page draft | Interview notes, top 5 quotes |
| 2 | 18 interviews · smoke test live | Reservations per channel |
| 3 | Recruit and verify Sahayaks · onboard first 5 families | Consent forms, training done |
| 4–5 | Run pilot · 10–15 families | Daily sheet, week-4 parent survey |
| 6–7 | Run pilot · fix the biggest ops pain | Ops minutes trend |
| 8 | Month-2 renewals · decide | Go / adjust / stop memo |
