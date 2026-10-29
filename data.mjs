// Fictional support data carried over from the Week 1 prototype.
// Nothing here is real customer data. Replace with a CRM or approved source
// before any live use — the agent is told it may only use these facts.

export const BUSINESS = {
  name: 'Sample Store Support',
  timeZone: 'Asia/Karachi',
  hours: {
    Monday: ['09:00', '18:00'],
    Tuesday: ['09:00', '18:00'],
    Wednesday: ['09:00', '18:00'],
    Thursday: ['09:00', '18:00'],
    Friday: ['09:00', '18:00'],
    Saturday: ['10:00', '14:00'],
    Sunday: null,
  },
};

export const ORDERS = {
  'ORD-1001': {
    product: 'Wireless Headphones',
    status: 'Shipped',
    statusDetail: 'It left the warehouse and is with the courier.',
    expectedDelivery: '30 October 2026',
    trackingNumber: 'TRK-SAMPLE-1001',
  },
  'ORD-1002': {
    product: 'Cotton Bedsheet Set',
    status: 'Processing',
    statusDetail: 'Payment is confirmed and the order is being packed.',
    expectedDelivery: '2 November 2026',
    trackingNumber: null,
  },
  'ORD-1003': {
    product: 'Stainless Steel Water Bottle',
    status: 'Delivered',
    statusDetail: 'It was delivered to the address on file on 26 October 2026.',
    expectedDelivery: null,
    trackingNumber: 'TRK-SAMPLE-1003',
  },
  'ORD-1004': {
    product: 'Desk Lamp',
    status: 'Out for delivery',
    statusDetail: 'It is with the delivery rider and is expected today.',
    expectedDelivery: '28 October 2026',
    trackingNumber: 'TRK-SAMPLE-1004',
  },
  'ORD-1005': {
    product: 'Bluetooth Speaker',
    status: 'Cancelled',
    statusDetail: 'It was cancelled at the customer request and the refund is in progress.',
    expectedDelivery: null,
    trackingNumber: null,
  },
};

export const FAQ = [
  {
    id: 'shipping_time',
    question: 'How long does delivery take?',
    answer:
      'Standard delivery takes 3 to 5 working days after dispatch. Orders placed before 2 PM are usually dispatched the same working day.',
  },
  {
    id: 'delivery_charges',
    question: 'What are the delivery charges?',
    answer:
      'Standard delivery is free for orders above 3,000 rupees. Below that, a flat sample fee of 250 rupees applies.',
  },
  {
    id: 'returns',
    question: 'What is the return and refund policy?',
    answer:
      'You can request a return within 7 days of delivery if the item is unused and in its original packaging. Approved refunds are processed within 5 to 7 working days.',
  },
  {
    id: 'payment',
    question: 'Which payment methods are accepted?',
    answer:
      'Cash on delivery, debit or credit card, and bank transfer. Card details are never collected over the phone.',
  },
  {
    id: 'warranty',
    question: 'Is there a warranty on the products?',
    answer:
      'Items carry a 6-month limited warranty that covers manufacturing defects. Damage caused by misuse is not covered.',
  },
];

export function hoursSentence() {
  return 'Monday to Friday 9 AM to 6 PM, Saturday 10 AM to 2 PM, closed on Sunday (Asia/Karachi).';
}

/** Flatten the approved facts into the compact block the models are allowed to cite. */
export function knowledgeBlock() {
  const orderLines = Object.entries(ORDERS)
    .map(
      ([id, o]) =>
        `${id}: ${o.product} — ${o.status}. ${o.statusDetail}` +
        (o.expectedDelivery ? ` Expected delivery ${o.expectedDelivery}.` : '') +
        (o.trackingNumber ? ` Tracking ${o.trackingNumber}.` : ''),
    )
    .join('\n');
  const faqLines = FAQ.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n');
  return [
    `BUSINESS: ${BUSINESS.name} (${BUSINESS.timeZone})`,
    `HOURS: ${hoursSentence()}`,
    'ORDERS:',
    orderLines,
    'FAQ:',
    faqLines,
  ].join('\n');
}

export function findOrder(text) {
  const match = String(text || '').match(/\bord[\s-]?(\d{3,6})\b/i);
  if (match) {
    const id = `ORD-${match[1]}`;
    return { id, order: ORDERS[id] || null };
  }
  const bare = String(text || '').match(/^\s*(\d{3,6})\s*$/);
  if (bare) {
    const id = `ORD-${bare[1]}`;
    return { id, order: ORDERS[id] || null };
  }
  return null;
}
