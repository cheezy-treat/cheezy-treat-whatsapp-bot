import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { BOT_CONFIG } from './config.js';

const firebaseConfig = {
  apiKey:            "AIzaSyDHf84MbK_BmYr4nHR-jRGhUSYU1YG_62s",
  authDomain:        "cheezy-treat-pos.firebaseapp.com",
  projectId:         "cheezy-treat-pos",
  storageBucket:     "cheezy-treat-pos.firebasestorage.app",
  messagingSenderId: "443431718582",
  appId:             "1:443431718582:web:d07abb8968949bae12a017",
};

const app = initializeApp(firebaseConfig, 'whatsappBotApp');
const db = getFirestore(app);

/**
 * Save confirmed WhatsApp order directly to POS / Kitchen Firestore
 */
export async function saveWhatsAppOrderToPOS(order) {
  const shopId = BOT_CONFIG.SHOP_ID;
  const orderId = String(order.id || Date.now());
  const ref = doc(db, `shops/${shopId}/orders`, orderId);

  const orderDoc = {
    id: orderId,
    orderNumber: String(order.orderNumber || Math.floor(100000 + Math.random() * 900000)),
    orderSource: "whatsapp",
    createdBy: "whatsapp_ai",
    createdByName: order.customer?.name || "WhatsApp Customer",
    orderType: order.orderType || "delivery",
    customer: {
      name: order.customer?.name || "WhatsApp Customer",
      phone: order.customer?.phone || "",
      address: order.customer?.address || "",
      instructions: order.customer?.instructions || order.instructions || "",
    },
    items: (order.items || []).map(i => ({
      id: String(i.id || Math.random()),
      name: i.name,
      price: Number(i.price) || 0,
      qty: Number(i.quantity || i.qty) || 1,
      quantity: Number(i.quantity || i.qty) || 1,
      description: i.description || "",
      emoji: i.emoji || "🍔"
    })),
    instructions: order.instructions || "",
    orderStatus: "pending",
    syncStatus: "synced",
    paymentStatus: "unpaid",
    paymentMethod: "cash",
    amountPaid: 0,
    subtotal: Number(order.subtotal) || 0,
    discountType: "pct",
    discountValue: 0,
    discountAmount: 0,
    gstEnabled: false,
    gstRate: 0,
    tax: 0,
    extraCharge: Number(order.extraCharge) || (order.orderType === 'delivery' ? BOT_CONFIG.DELIVERY_FEE : 0),
    grandTotal: Number(order.grandTotal) || 0,
    change: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    statusHistory: [{ status: "pending", timestamp: Date.now() }],
    paymentHistory: [{ status: "unpaid", amount: 0, timestamp: Date.now() }]
  };

  await setDoc(ref, orderDoc, { merge: true });
  console.log(`🎉 [FIRESTORE] WhatsApp Order #${orderDoc.orderNumber} successfully saved to POS!`);
  return orderDoc;
}
