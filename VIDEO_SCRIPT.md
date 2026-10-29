# Demo video script — 3:00 max

Hard limit is 3 minutes. Aim for **2:45** and stop talking at 2:50.
The judges must see: a working call, the three models, and why the split matters.

## Before you hit record

- [ ] `NEBIUS_API_KEY` is set and the badge reads **Token Factory · live** — a green badge
      in frame is the fastest proof that this runs on Nebius.
- [ ] Browser at 1440×900, zoom 110%, bookmarks bar hidden, other tabs closed.
- [ ] Fresh page load so the empty state and the chips are visible.
- [ ] Do a full dry run once. Note where the reply words land so your voice and the
      screen stay together.
- [ ] Recording: OBS at 30 fps, 1080p, mic checked. Record voice live while you drive —
      a re-recorded voice-over sounds distant.

## Shot list

### 0:00 – 0:18 · The problem (screen: the empty console)

> "Every support call has two jobs: answer the customer *right now*, and write down what
> happened *afterwards*. Today teams do both with one large model, on every single turn —
> it is slow, it is expensive, and the ticket still gets written badly."

### 0:18 – 0:40 · What CallLens is (point at the right rail)

> "CallLens splits that into three NVIDIA Nemotron tiers on Nebius Token Factory.
> Nano classifies every turn in about a hundred milliseconds. Super speaks, token by
> token, so the caller hears a reply immediately. Ultra only wakes up when the call
> ends, and writes the record. One model on the latency path, one on the quality path,
> one when nobody is waiting."

### 0:40 – 1:35 · Live call — turn 1 and 2

**Speak into the mic** if it works cleanly on your machine — a voice answer on camera is
worth more than any architecture slide. If recognition misfires, fall back to typing the
same line; do not re-record the whole video for it.

Click the mic, say: *"Where is my order, one zero zero one?"* → it sends itself.

> "The caller asks about an order. Watch the rail: Nano has already tagged the intent,
> pulled the order number out, and set the next action — before Super has finished
> speaking."

Then type turn 2: `This is the third time I am calling. It was meant to arrive on the 2nd.`

> "Second turn. The order number carries over without the caller repeating it.
> Sentiment flips to frustrated and urgency rises — that is the routing layer reading the
> room, which is what a supervisor would want to see live."

### 1:35 – 2:00 · Turn 3 — escalation

Type: `I want to speak to a human right now.`

> "When someone asks for a person, the escalate flag fires and Super hands off in one
> sentence. The agent never invents a status, a price or a promise — anything outside the
> approved records becomes a human handoff."

### 2:00 – 2:30 · End call → Ultra

Click **End call**. Let the modal fill. Point at the CRM note.

> "Now Ultra — the largest tier — takes the whole transcript and the per-turn signals and
> writes the record: issue, resolution, follow-up, risk, and a note a human agent can
> paste straight into the ticket. This is the part nobody has time to do at the end of a
> shift."

Click **Copy CRM note** (the toast proves it works).

### 2:30 – 2:50 · Close

> "Every model call goes through Nebius Token Factory's OpenAI-compatible endpoint,
> including the streamed replies. Model ids are configuration, so any Nemotron size can
> be swapped in without touching application logic. Text and code are in the public repo
> under Apache 2.0. Next step is the voice pipeline — the tiering does not change."

## Rules of thumb

- **Never** show a long pause without narrating. If a model stalls, talk over it.
- Say **"Nemotron Nano / Super / Ultra"** and **"Token Factory"** out loud, at least twice.
- Do not read the code on screen. Show the product, mention the repo.
- If mock mode ever appears in the badge, stop and fix the key — then re-record.
- Upload to YouTube as **Public** (not unlisted, not private). Check it in an incognito
  window before submitting.
