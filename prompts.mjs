import { BUSINESS, knowledgeBlock } from './data.mjs';

const JSON_RULES =
  'Reply with ONE JSON object and nothing else. No markdown, no code fences, no explanation.';

/** Fast tier: every turn, before the agent speaks. */
export function classifyMessages(callerText, history) {
  const recent = history
    .slice(-6)
    .map((m) => `${m.role === 'caller' ? 'Caller' : 'Agent'}: ${m.text}`)
    .join('\n');
  return [
    {
      role: 'system',
      content: [
        'You are the real-time routing layer of a customer support phone agent.',
        'You read the caller turn and return structured call state for the UI.',
        JSON_RULES,
        'Schema:',
        '{"intent": one of ["order_status","business_hours","faq","handoff","greeting","goodbye","off_topic","unclear"],',
        ' "sentiment": one of ["calm","happy","frustrated","angry"],',
        ' "urgency": integer 1-5 where 5 is a caller about to hang up or escalate,',
        ' "order_id": "ORD-1001" or null,',
        ' "company": "name of a company the caller mentions" or null,',
        ' "next_action": "max 8 words, what the agent should do next",',
        ' "escalate": true or false}',
        'Set escalate true only for an explicit request for a human, a complaint, or anger at urgency 4+.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `CONVERSATION SO FAR:\n${recent || '(call just started)'}\n\nCALLER NOW: ${callerText}`,
    },
  ];
}

/** Main tier: what the caller actually hears. */
export function replyMessages(history, analysis, context) {
  const turns = history.map((m) => ({
    role: m.role === 'caller' ? 'user' : 'assistant',
    content: m.text,
  }));

  const contextBlock = context?.length
    ? `\nLIVE WEB CONTEXT (unverified, use only if clearly relevant):\n${context
        .map((c) => `- ${c.title}: ${c.snippet}`)
        .join('\n')}`
    : '';

  return [
    {
      role: 'system',
      content: [
        `You are Aria, the voice assistant for ${BUSINESS.name}. You are on a live phone call.`,
        '',
        'APPROVED FACTS — the only source you may answer from:',
        knowledgeBlock(),
        contextBlock,
        '',
        'RULES:',
        '- Maximum 2 short sentences. This is spoken aloud, so no lists, no markdown, no emoji.',
        '- Never invent order status, prices, dates, policies or promises.',
        '- If the caller asks for something not in the approved facts, say you cannot check that and offer a human.',
        '- If call state says escalate, hand off warmly in one sentence and stop selling.',
        '- Do not repeat the caller question back to them. Do not say "As an AI language model".',
        '- Match the caller language: if they speak Urdu or Roman Urdu, answer in the same.',
        '',
        `CURRENT CALL STATE: intent=${analysis.intent}, sentiment=${analysis.sentiment}, urgency=${analysis.urgency}, escalate=${analysis.escalate}, next action="${analysis.next_action}"`,
      ].join('\n'),
    },
    ...turns,
  ];
}

/** Deep tier: after the call ends. */
export function summaryMessages(history, analysisLog) {
  const transcript = history
    .map((m) => `${m.role === 'caller' ? 'CALLER' : 'AGENT'}: ${m.text}`)
    .join('\n');
  const signals = analysisLog
    .map((a) => `- ${a.intent} / ${a.sentiment} / urgency ${a.urgency}${a.escalate ? ' / ESCALATED' : ''}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        'You write post-call records for a customer support CRM.',
        JSON_RULES,
        'Schema:',
        '{"headline":"max 10 words",',
        ' "summary":"2-3 sentences, past tense, factual",',
        ' "issue":"the concrete problem in one sentence",',
        ' "resolution":"what was agreed, or NOT RESOLVED",',
        ' "sentiment":"calm|happy|frustrated|angry",',
        ' "sentiment_shift":"improved|worsened|flat",',
        ' "actions":[{"owner":"agent|human_team|customer","action":"short"}],',
        ' "follow_up":"one concrete next step with timing, or null",',
        ' "risk":"low|medium|high",',
        ' "crm_note":"single paragraph a human agent can paste into the ticket"}',
        'Only state facts present in the transcript. Never invent order numbers or promises.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `TRANSCRIPT:\n${transcript}\n\nPER-TURN SIGNALS:\n${signals}`,
    },
  ];
}
