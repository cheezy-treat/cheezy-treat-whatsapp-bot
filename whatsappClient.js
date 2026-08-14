import { BOT_CONFIG } from './config.js';

/**
 * Send a WhatsApp text message to a customer
 */
export async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v21.0/${BOT_CONFIG.PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BOT_CONFIG.ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { preview_url: false, body: text }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('❌ WhatsApp API Error:', JSON.stringify(data, null, 2));
      return false;
    }
    console.log(`✅ WhatsApp message sent to ${to}`);
    return true;
  } catch (err) {
    console.error('❌ Failed to send WhatsApp message:', err);
    return false;
  }
}

/**
 * Mark an incoming message as read
 */
export async function markMessageAsRead(messageId) {
  const url = `https://graph.facebook.com/v21.0/${BOT_CONFIG.PHONE_NUMBER_ID}/messages`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BOT_CONFIG.ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      })
    });
  } catch (e) {
    // Ignore read receipt error
  }
}
