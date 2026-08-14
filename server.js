import express from 'express';
import { BOT_CONFIG } from './config.js';
import { sendWhatsAppMessage, markMessageAsRead } from './whatsappClient.js';
import { processCustomerMessage } from './geminiAgent.js';

const app = express();
app.use(express.json());

// 1. Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'Cheezy Treat WhatsApp AI Bot',
    model: BOT_CONFIG.GEMINI_MODEL,
    time: new Date().toISOString()
  });
});

// 2. Meta Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === BOT_CONFIG.VERIFY_TOKEN) {
    console.log('🎉 [WEBHOOK] Meta Webhook verified successfully!');
    return res.status(200).send(challenge);
  } else {
    console.warn('⚠️ [WEBHOOK] Verification failed. Token mismatch.');
    return res.sendStatus(403);
  }
});

// 3. Meta Incoming Message Webhook (POST)
app.post('/webhook', async (req, res) => {
  // Acknowledge receipt to Meta immediately (200 OK)
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    console.log('🔔 [WEBHOOK POST RECEIVED]:', JSON.stringify(body, null, 2));

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    // Check if there is an actual incoming text message from a user
    if (!message || message.type !== 'text') {
      console.log('ℹ️ Non-text or status update event received, skipping.');
      return;
    }

    const fromNumber = message.from; // Customer's WhatsApp number
    const userText = message.text?.body?.trim();
    const messageId = message.id;

    console.log(`\n📩 [INCOMING MESSAGE] From: +${fromNumber} | Message: "${userText}"`);

    // Mark as read
    markMessageAsRead(messageId).catch(() => {});

    // Process with Gemini AI Agent
    const replyText = await processCustomerMessage(fromNumber, userText);

    console.log(`🤖 [AI REPLY] To: +${fromNumber} | Reply:\n${replyText}\n`);

    // Send reply back via WhatsApp Cloud API
    await sendWhatsAppMessage(fromNumber, replyText);

  } catch (err) {
    console.error('❌ [WEBHOOK ERROR]:', err);
  }
});

// 4. Local Simulator Endpoint (for easy testing from console / browser)
app.post('/simulate', async (req, res) => {
  const { from = '923000000000', text = 'Hello' } = req.body;
  const reply = await processCustomerMessage(from, text);
  res.json({ from, input: text, reply });
});

const PORT = BOT_CONFIG.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🍔 CHEEZY TREAT WHATSAPP AI BOT SERVER RUNNING!`);
  console.log(`🚀 Port: http://localhost:${PORT}`);
  console.log(`🔑 Verify Token: ${BOT_CONFIG.VERIFY_TOKEN}`);
  console.log(`🤖 AI Engine: Google Gemini (${BOT_CONFIG.GEMINI_MODEL})`);
  console.log(`======================================================\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`⚠️ Port ${PORT} is already in use by another running bot process.`);
  } else {
    console.error('Server error:', err);
  }
});

