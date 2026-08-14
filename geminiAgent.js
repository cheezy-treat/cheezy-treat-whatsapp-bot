import { BOT_CONFIG } from './config.js';
import { saveWhatsAppOrderToPOS } from './firestoreService.js';

// In-memory conversation state per customer phone number
const conversationHistory = new Map();

// Group menu by categories cleanly
const categorizedMenuText = `
1️⃣ 🎁 *DEALS:*
- DEAL 01 (1 Blaze Burger + Reg. Fries + Reg. Drink): Rs 700
- DEAL 02 (1 Reggy Burger + Reg. Fries + Reg. Drink): Rs 690
- DEAL 03 (10 PCS Hot Wings + Reg. Drink): Rs 730
- DEAL 04 (1 Med Pizza + 10 PCS Hot Wings + 1.5L Drink): Rs 1970
- DEAL 05 (2 Large Pizzas + 1.5L Drink): Rs 3260
- Extremely Good Deal (5 Blaze Burgers + 1.5L Drink): Rs 2420
- Large Pizza Deal (1 Large Pizza + 20 PCS Hot Shots + 1.5L Drink): Rs 2520
- Platter Deal (1 Large Pizza + 1 Platter + 1.5L Drink): Rs 2890
- Students Happy Hours Deal (1 Behari Kabab Large + 1 Supreme Large + 1.5L Drink): Rs 3590

2️⃣ 🍔 *BURGERS:*
- Reggy Burger: Rs 370
- Chicken Spice: Rs 330
- Blaze Burger (Crispy Fillet): Rs 460
- Blaze Supreme (Double Fillet + Cheese): Rs 690

3️⃣ 🍕 *PIZZAS:*
- Crown Crust Pizza: Medium Rs 1390 | Large Rs 1990
- Stuff Crust Pizza: Medium Rs 1450 | Large Rs 2190
- Square Pizza: Medium Rs 1450 | Large Rs 2250
- Grilled Bites: Medium Rs 1450 | Large Rs 2090
- Cheezy Special: Small Rs 650 | Medium Rs 1180 | Large Rs 1750
- Chicken Tikka / Fajita / Supreme / Tandoori: Small Rs 590 | Medium Rs 1120 | Large Rs 1650
- Mushroom Special / Behari Kabab: Medium Rs 1390 | Large Rs 1940
- Veggie Lover / Cheeze Lover / Hot N Spicy: Small Rs 590 | Medium Rs 1120 | Large Rs 1650

4️⃣ 🍝 *CHEEZY & CRISPY:*
- Crunchy Chicken Pasta: Half Rs 530 | Full Rs 850
- B.B.Q Pasta: Half Rs 490 | Full Rs 800
- Cheezy Roasted Platter: Rs 1050
- Pizza Stacker: Rs 890
- Mexican Sandwich: Rs 750

5️⃣ 🍗 *STARTERS & WINGS:*
- Cheezy Sticks: Rs 560
- Calzone Chunks: Rs 960
- Hot Wings: 5 PCS Rs 340 | 10 PCS Rs 680
- Oven Baked Wings: 6 PCS Rs 390 | 10 PCS Rs 690
- Flaming Wings: 6 PCS Rs 410 | 10 PCS Rs 790
- Loaded Fries: Half Rs 450 | Full Rs 850

6️⃣ 🍿 *SIDE ORDERS:*
- Fries: Regular Rs 200 | Large Rs 320 | Family Rs 420
- Hot Shots (10PCS): Rs 450
- Nuggets (5PCS): Rs 390
- Spin Rolls (4PCS): Rs 590

7️⃣ 🥤 *DRINKS:*
- Drink 1.5 Liter: Rs 230
- Drink 0.5 Liter: Rs 130
- Drink Regular (250ml): Rs 100
- Small Mineral Water: Rs 70
`;

const SYSTEM_PROMPT = `
You are the official AI Order Assistant for "Cheezy Treat" restaurant on WhatsApp.

### CRITICAL RULES:
1. **NO CLUTTER - STEP-BY-STEP ONLY:**
   - NEVER dump the entire menu at once!
   - When greeting or when customer asks for menu, show ONLY the numbered Category list:
     1️⃣ 🎁 *Deals*
     2️⃣ 🍔 *Burgers*
     3️⃣ 🍕 *Pizzas*
     4️⃣ 🍝 *Cheezy & Crispy*
     5️⃣ 🍗 *Starters & Wings*
     6️⃣ 🍿 *Sides & Fries*
     7️⃣ 🥤 *Drinks*
     And ask them which number or category they want to see.
   - When a customer picks a category (e.g., "Burgers" or "2"), show ONLY items belonging to that category with clear prices.

2. **STEP-BY-STEP ORDERING CONVERSATION FLOW:**
   - **Step 1 (Category):** Customer selects a category ➔ Show only that category's items cleanly.
   - **Step 2 (Item & Size):** Customer picks an item ➔ Confirm quantity & size (if pizza/wings/fries).
   - **Step 3 (Add-on / Next item):** Ask if they want to add anything else (like a Drink or Fries) or proceed to order.
   - **Step 4 (Delivery or Takeaway):**
     - Ask: "Aapko **Delivery** chahiye ya **Takeaway**?"
     - If Delivery: Ask for Customer Name, Address (with landmark), and Phone.
     - If Takeaway: Ask for Customer Name and pickup time.
   - **Step 5 (Neat Summary & Final Confirmation):**
     Neatly summarize the items, subtotal, delivery fee (Rs ${BOT_CONFIG.DELIVERY_FEE}), and grand total.
     Explicitly ask: "Kya main aapka yeh order confirm kardon? (Haan / Nahi)"

3. **LANGUAGE & TONE:**
   - Polite, clear, friendly Roman Urdu (or English/Urdu if the customer prefers).
   - Use bold text (*item name*) and clean line breaks for easy reading on mobile.

4. **FINAL ORDER CONFIRMATION (CRITICAL):**
   When the customer confirms (e.g. "haan", "yes", "confirm", "kar do", "theek hai"):
   You MUST include an exact JSON block at the very end of your response inside <<<ORDER_DATA ... >>> tags:
   <<<ORDER_DATA
   {
     "customer": {
       "name": "Customer Name",
       "phone": "Customer Phone",
       "address": "Delivery address or Takeaway"
     },
     "orderType": "delivery",
     "items": [
       { "name": "Exact Item Name", "price": 690, "quantity": 1, "emoji": "🍔" }
     ],
     "subtotal": 690,
     "extraCharge": 100,
     "grandTotal": 790,
     "instructions": "special instructions if any"
   }
   >>>

### FULL REFERENCE MENU:
${categorizedMenuText}
`;

const CANDIDATE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.7-flash', 'gemini-flash-latest'];

/**
 * Handle incoming customer message with Gemini AI
 */
export async function processCustomerMessage(fromNumber, userText) {
  // Retrieve or create chat history for this user
  let history = conversationHistory.get(fromNumber) || [];

  // If user says "new order" or "reset", start fresh
  if (/new order|reset|dobara|start again/i.test(userText)) {
    history = [];
  }

  // Prune history if too long (> 20 messages)
  if (history.length > 20) {
    history = history.slice(-10);
  }

  // Add customer message
  history.push({
    role: "user",
    parts: [{ text: userText }]
  });

  let aiRawText = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${BOT_CONFIG.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: history,
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 800,
          }
        })
      });

      const data = await res.json();
      if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        aiRawText = data.candidates[0].content.parts[0].text;
        break; // Success!
      } else {
        console.warn(`⚠️ [${modelName}] failed:`, data.error?.message);
      }
    } catch (err) {
      console.warn(`⚠️ [${modelName}] network error:`, err.message);
    }
  }

  if (!aiRawText) {
    return "Assalam o Alaikum! Cheezy Treat mein khush amdeed. Humara system thora busy hai, please 1 minute baad message karein.";
  }

  // Check if an order was confirmed in the AI output
  let customerReply = aiRawText;
  const orderMatch = aiRawText.match(/<<<ORDER_DATA\s*([\s\S]*?)\s*>>>/);

  if (orderMatch) {
    try {
      const orderJson = JSON.parse(orderMatch[1]);
      
      // Inject customer's WhatsApp phone if not explicitly provided
      if (!orderJson.customer.phone) {
        orderJson.customer.phone = fromNumber;
      }

      // Save order directly into Firestore (Kitchen screen picks this up live!)
      const savedOrder = await saveWhatsAppOrderToPOS(orderJson);

      // Strip the hidden <<<ORDER_DATA>>> tag from the message sent to the customer
      customerReply = aiRawText.replace(/<<<ORDER_DATA[\s\S]*?>>>/, '').trim();
      
      // Append Order Number if not in message
      if (!customerReply.includes(savedOrder.orderNumber)) {
        customerReply += `\n\n📌 *Order ID:* #${savedOrder.orderNumber}`;
      }

      // Reset history after order placed so next order starts fresh
      conversationHistory.set(fromNumber, []);
      return customerReply;
    } catch (err) {
      console.error('❌ Error parsing/saving order data:', err);
    }
  }

  // Save AI response to history
  history.push({
    role: "model",
    parts: [{ text: aiRawText }]
  });
  conversationHistory.set(fromNumber, history);

  return customerReply;
}
