# Devpost submission draft

Copy-paste material for the NVIDIA × Nebius Global AI Hackathon.

> **Track:** Best Apps and Agents
> **Project:** CallLens — live call intelligence with three Nemotron tiers

---

## 1. Inspiration

Every support call is two jobs at once: answer the person in front of you *now*, and
write down what happened *afterwards*. Most teams put one large model behind the whole
call, which makes every turn slow and expensive, and the ticket still gets written
badly — or not at all.

I had already built a Week 1 prototype of a support calling agent: Python, hand-written
keyword rules, template replies, no LLM. It worked, but it was rigid — any phrasing it
had not seen fell back to "please repeat". CallLens is what happens when that decision
layer is rebuilt around models that are actually sized for the job.

## 2. What it does

An agent named Aria answers a support call in a live browser console. As the call
happens, a second model tier shows the supervisor what is going on — intent, sentiment,
urgency, extracted order, next action — and a third tier writes the call record when the
line closes.

The agent only speaks from approved order and FAQ records. Anything outside them becomes
a human handoff instead of an invented answer.

## 3. How it works

Three NVIDIA Nemotron tiers on Nebius Token Factory, each on a different clock:

| Tier | Model | When | Why this size |
| --- | --- | --- | --- |
| Classify | Nemotron Nano | every turn, before the reply | must return in ~100 ms or the UI feels dead |
| Speak | Nemotron Super | every turn, streamed | quality of the words matters, but it streams so perceived latency stays low |
| Record | Nemotron 3 Ultra | once, after the call | the hardest reasoning, and nobody is waiting |

The browser makes **one** request per turn and receives an NDJSON stream: the Nano
classification, optional Tavily web context, then Super's reply deltas. Ultra runs on its
own endpoint at the end of the call. Model ids live in environment variables, so
swapping a Nemotron size is a config change, not a code change.

Grounding is enforced in the system prompt with a closed knowledge block, and the
`escalate` flag is produced by the classification tier rather than guessed in the UI.

## 4. How we used NVIDIA and Nebius

- **Nebius Token Factory** serves every model call through its OpenAI-compatible
  `/chat/completions` endpoint, including streamed responses. `npm run models` lists what
  the key can see, so model ids are never guessed.
- **NVIDIA Nemotron** does all reasoning. The tiering is the product: the smallest model
  is on the latency path, the mid model is on the quality path, the largest runs when the
  call is over. That is what keeps a demo feeling instant without giving up on the
  record quality afterwards.
- **Tavily** (optional) adds live web context when the caller names a company.
- Deployed as a plain Node service; no training, no GPU management — the whole point of
  Token Factory for a two-day build.

## 5. What was updated during the submission period

The Week 1 prototype was a Python, standard-library, rule-based CLI agent (27 unit tests,
no LLM, no audio). During the submission period the entire intelligence and interface
layer was rebuilt in this repository:

- keyword rules → Nemotron Nano classification per turn
- template replies → Nemotron Super streamed, grounded replies
- no post-call artefact → Nemotron 3 Ultra structured record and CRM note
- terminal → live browser console with an analysis rail
- typed input only → browser speech recognition for the caller and spoken replies
- no external context → optional Tavily enrichment
- no live model → real Token Factory calls, with an explicit mock fallback for offline dev

The use case, the fictional sample data and the "never guess, hand off instead" rule were
deliberately carried over.

## 6. Challenges

- **Streaming one turn without three requests.** Solved with a single NDJSON response that
  emits typed events (analysis → context → delta → done), so the UI can update three
  panels from one call.
- **Keeping the demo alive.** A model timeout during a live demo is fatal, so every call
  has a hard timeout, the UI surfaces model errors instead of freezing, and a mock mode
  exists for development. The badge always states which mode is active — mock output is
  never presented as a live model.
- **Grounding.** A support agent that invents a delivery date is worse than one that says
  "let me get a human". The reply prompt receives only the approved facts and is told
  that everything else is a handoff.

## 7. What we learned

- Model *tiering* is not a cost trick, it is a latency design. The classification call is
  what makes the interface feel alive; the big model is only worth its latency when
  nobody is waiting for it.
- Structured output from a small model is more reliable when the schema is short and the
  temperature is zero — and the app must still merge the result onto defaults, because a
  single malformed field should never break a turn.
- A "working demo" is a product requirement, not a formality: no build step, one command,
  clear setup. Judges will run it.

## 8. What's next

- Speech-to-text and text-to-speech around the same tiers (the interface already streams,
  which is what a voice pipeline needs).
- Real CRM writes instead of a copy button.
- Retrieval over the client's approved documents instead of a static knowledge block.
- Latency budget tracking per tier, surfaced on the routing panel.

---

## 9. Feedback on Nebius Token Factory / NVIDIA tools

> **Fill this in from your own testing before submitting — it is judged separately, and
> it must be your experience, not a template.** Answer concretely, including anything that
> annoyed you. Specific is credible; praise is not.

Answer these four, in this order:

1. **Setup** — how long from signup to the first successful completion? Where did you get
   stuck (docs, keys, model list, quotas)?
2. **The API** — what worked well about the OpenAI-compatible surface, and what did not
   match your expectation?
3. **The models** — which tier surprised you? Where did Nano do better or worse than you
   expected on structured JSON? Any latency numbers you measured are gold here.
4. **What you would change** — one concrete thing: a missing endpoint, a clearer error
   message, better streaming semantics, a model list that is easier to discover.

Keep it to 150–250 words. Negative-but-specific beats positive-and-vague.

---

## 10. Submission checklist

- [ ] Public repo with **Apache 2.0 visible at the top of the repo page** (README badge + LICENSE file)
- [ ] README has setup steps a stranger can follow (`npm start`, `.env`, model ids)
- [ ] Working demo URL (Render / Docker) — open it in incognito and click through once
- [ ] YouTube video, **public**, ≤ 3:00, showing a real call and the `Token Factory · live` badge
- [ ] Track selected: Best Apps and Agents
- [ ] "What was updated during the submission period" section included (above, §5)
- [ ] Feedback section filled in with real testing notes (§9)
- [ ] If you attended a Builders & Brews event, select the city for the City Winner Award
- [ ] Nothing secret committed: `git status` clean of `.env`, keys, logs
