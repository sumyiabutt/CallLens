// Offline stand-in for the Nemotron tiers. Same shapes as the real models so
// the UI, the streaming path and the demo work before an API key exists.

import { FAQ, ORDERS, findOrder, hoursSentence } from './data.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COMPANIES = ['daraz', 'shopify', 'amazon', 'foodpanda', 'acme', 'careem'];

const HANDOFF_HINT = /\b(human|agent|representative|manager|complain|complaint)\b/;
const FAQ_HINT = /\b(return|refund|exchange|warranty|guarantee|payment|pay|card|cash on delivery|charges?|fees?|cost|price|shipping)\b/;
const HOURS_HINT = /\b(hours?|open|opening|close|closed|timing|timings?|sunday|saturday|weekend)\b/;
const ORDER_HINT = /\b(order|ord|parcel|package|shipment|tracking|courier)\b/;
const DELIVERY_HINT = /\b(deliver|delivery|arrive|arriving|dispatch|shipped)\b/;
const FOLLOW_UP = /^(it|that|this|they|still|where|when|how long)\b/;
const FAQ_ROUTES = [
  [/charges?|fees?|cost|price|how much/, 'delivery_charges'],
  [/how long|working days|dispatch|shipping time|delivery time/, 'shipping_time'],
  [/return|refund|exchange|money back/, 'returns'],
  [/payment|pay|card|cash on delivery|bank/, 'payment'],
  [/warranty|guarantee|damaged|broken|repair/, 'warranty'],
];

function faqAnswer(text) {
  const match = FAQ_ROUTES.find(([pattern]) => pattern.test(text));
  const entry = match ? FAQ.find((f) => f.id === match[1]) : null;
  return entry ? entry.answer : null;
}

export async function mockClassify(callerText, history = []) {
  await sleep(120);
  const text = String(callerText || '').toLowerCase();
  const earlier = history.map((m) => m.text).join(' ');
  // Carrying the order id across turns is what makes a real conversation feel
  // continuous instead of forgetting the number the caller just gave. But a new
  // question about charges or returns must still be answered as that question.
  const explicitOrder = findOrder(callerText);
  const orderRef = explicitOrder || findOrder(earlier);
  const words = text.split(/\s+/).filter(Boolean).length;

  let intent = 'unclear';
  if (HANDOFF_HINT.test(text)) intent = 'handoff';
  else if (explicitOrder) intent = 'order_status';
  else if (FAQ_HINT.test(text)) intent = 'faq';
  else if (HOURS_HINT.test(text)) intent = 'business_hours';
  else if (ORDER_HINT.test(text)) intent = 'order_status';
  else if (DELIVERY_HINT.test(text) && orderRef) intent = 'order_status';
  else if (orderRef && (FOLLOW_UP.test(text) || words <= 4)) intent = 'order_status';
  else if (DELIVERY_HINT.test(text)) intent = 'faq';
  else if (/\b(hi|hello|salam|assalam|hey)\b/.test(text)) intent = 'greeting';
  else if (/\b(bye|thanks|thank you|that's all)\b/.test(text)) intent = 'goodbye';

  const angry = /\b(useless|terrible|ridiculous|worst|furious|nonsense|shut up|scam)\b/.test(text);
  const frustrated =
    angry || /\b(late|again|still|waiting|nobody|no one|three times|third time|twice|second time)\b/.test(text);
  const sentiment = angry ? 'angry' : frustrated ? 'frustrated' : 'calm';

  const escalate = intent === 'handoff' || angry;
  const nextAction = {
    order_status: 'Read the order status',
    business_hours: 'Read support hours',
    faq: 'Answer from approved FAQ',
    handoff: 'Transfer to human team',
    greeting: 'Greet and offer help',
    goodbye: 'Close the call politely',
    off_topic: 'Decline and offer a human',
    unclear: 'Ask the caller to repeat',
  }[intent];

  return {
    intent,
    sentiment,
    urgency: escalate ? 5 : frustrated ? 4 : orderRef ? 3 : 2,
    order_id: orderRef?.id || null,
    company: COMPANIES.find((c) => text.includes(c)) || null,
    next_action: escalate ? 'Transfer to a human now' : nextAction,
    escalate,
  };
}

export function mockReplyText(callerText, analysis) {
  const orderRef = analysis.order_id ? { id: analysis.order_id, order: ORDERS[analysis.order_id] } : null;
  const sorry = analysis.sentiment === 'frustrated' || analysis.sentiment === 'angry';

  if (analysis.escalate) {
    return 'Of course — I am connecting you to a human colleague now, please stay on the line.';
  }
  switch (analysis.intent) {
    case 'order_status':
      if (!orderRef) return 'I can check that. Could you read me the order number, for example O-R-D one zero zero one?';
      if (!orderRef.order) return `I could not find ${orderRef.id} in our records. Let me get a human colleague to check it for you.`;
      return `${sorry ? 'I am sorry for the wait. ' : ''}Order ${orderRef.id} is marked as ${orderRef.order.status}. ${orderRef.order.statusDetail}`;
    case 'business_hours':
      return `Our support line is open ${hoursSentence()}`;
    case 'faq':
      return faqAnswer(String(callerText).toLowerCase()) || 'Let me get a colleague who can answer that accurately for you.';
    case 'handoff':
      return 'Connecting you to a human colleague now, please stay on the line.';
    case 'greeting':
      return 'Hello, and thank you for calling Sample Store Support. I am an AI assistant. How can I help you today?';
    case 'goodbye':
      return 'Thank you for calling Sample Store Support. Goodbye!';
    case 'unclear':
      return 'Sorry, I did not catch that. Could you say it again for me?';
    default:
      return 'I cannot check that from here, but I can connect you to a human colleague who can help.';
  }
}

export async function* mockReplyStream(callerText, analysis) {
  const text = mockReplyText(callerText, analysis);
  await sleep(180);
  for (const chunk of text.match(/\S+\s*/g) || []) {
    await sleep(35);
    yield chunk;
  }
}

export async function mockSummary(history) {
  await sleep(400);
  const callerLines = history.filter((m) => m.role === 'caller');
  const callerTexts = callerLines.map((m) => m.text);
  const firstCaller = callerTexts[0] || 'No caller speech captured.';
  const lastCaller = callerLines.at(-1)?.text || firstCaller;
  const orderRef = findOrder(callerTexts.join(' '));
  const orderTurns = callerTexts.filter((t) => /order|ord[\s-]?\d|parcel|tracking|courier|arriv/i.test(t));
  const headline = !orderRef
    ? 'Support call handled by Aria'
    : orderTurns.length >= callerTexts.length
      ? `Order status check: ${orderRef.id}`
      : `Call about ${orderRef.id}, plus a policy question`;
  const resolved = !/human|complain|angry|useless/i.test(lastCaller);
  return {
    headline,
    summary: `The caller contacted Sample Store Support about: "${firstCaller.slice(0, 120)}". ${
      resolved
        ? 'The agent answered from approved records and the caller stayed satisfied.'
        : 'The caller escalated and the agent arranged a human handoff.'
    }`,
    issue: firstCaller.slice(0, 160),
    resolution: resolved
      ? 'Answered from approved records; no follow-up required.'
      : 'Escalated to a human colleague.',
    sentiment: resolved ? 'calm' : 'frustrated',
    sentiment_shift: resolved ? 'flat' : 'worsened',
    actions: [
      { owner: 'agent', action: 'Answered using approved order and FAQ data' },
      ...(resolved ? [] : [{ owner: 'human_team', action: 'Call back the customer today' }]),
    ],
    follow_up: resolved ? null : 'Human team to call back within 4 working hours.',
    risk: resolved ? 'low' : 'medium',
    crm_note: `Caller: ${firstCaller.slice(0, 140)} Agent Aria answered from approved records. ${
      resolved ? 'No escalation needed.' : 'Caller escalated; human callback required.'
    }`,
  };
}
