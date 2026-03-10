require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino'); // Baileys ko chalane ke liye zaroori

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = "";
let botStatus = "Start ho raha hai... Please wait.";

// --- WEBPAGE PAR QR CODE DIKHANE KA SETUP ---
app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ Grah Sansar WhatsApp Bot is Running Super Fast (Baileys)!</h1>');
    } else if (currentQR) {
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family: sans-serif;">
                <h2>WhatsApp se connect karne ke liye QR Code Scan karein:</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" alt="QR Code" style="margin: 20px; padding: 10px; border: 2px solid black;" />
                <p style="color: red;">Note: Agar scan na ho, toh page ko refresh karein.</p>
            </div>
        `);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px; font-family: sans-serif;">Status: ${botStatus}</h1>`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- AI REPLY FUNCTION ---
async function getAIResponse(userMessage) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "gpt-oss-120b", 
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a smart, highly respectful assistant for 'Grah Sansar Department Store'. Your task is to receive grocery lists, confirm items, and ask for the customer's delivery address and mobile number.\n\nCRITICAL RULES:\n1. LANGUAGE MATCHING: If the customer writes in English, reply in pure English. If they write in Hindi or Hinglish, reply in clear Hindi/Hinglish.\n2. TONE & RESPECT: Always be extremely polite. Use words like 'Sir/Ma'am', 'Please', and 'Thank you' in English. Use 'Ji', 'Aap', 'Kripya', and 'Dhanyawad' in Hindi/Hinglish. Never be rude.\n3. Keep your replies short, clear, and professional.\n4. If asked about non-grocery topics, politely decline."
                    },
                    {
                        "role": "user",
                        "content": userMessage
                    }
                ]
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("AI API Error:", error);
        return "Maaf kijiyega, abhi thoda network issue hai. Kripya thodi der baad message karein.";
    }
}

// --- BAILEYS (SUPER FAST) WHATSAPP SETUP ---
async function connectToWhatsApp() {
    // Session save karne ke liye folder
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }), // Faltu ke logs band kar diye
        printQRInTerminal: true, 
        browser: ["Grah Sansar Bot", "Chrome", "1.0.0"],
        syncFullHistory: false, // <-- PURANE MESSAGES SYNC NAHI HONGE (No Crash!)
        generateHighQualityLinkPreview: false
    });

    // Connection Updates (QR Code, Connect, Disconnect)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            botStatus = "Waiting for QR Scan";
            console.log('✅ Naya QR Code aa gaya hai! Render URL par jaakar scan karein.');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection band ho gaya. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp(); // Connection tootne par apne aap wapas judega
            }
        } else if (connection === 'open') {
            currentQR = "";
            botStatus = "Ready";
            console.log('✅ Baileys Bot successfully connect ho gaya hai aur ready hai!');
        }
    });

    // Login credentials save karna taaki baar baar scan na karna pade
    sock.ev.on('creds.update', saveCreds);

    // Naya message aane par
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        const msg = messages[0];
        
        // Khud ke bheje message ya bina text wale message ko ignore karein
        if (!msg.message || msg.key.fromMe) return;

        // Message ka text nikalna (Baileys mein text nikalne ka tareeqa alag hota hai)
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        
        if (!textMessage) return;

        console.log(`Naya Customer Message: ${textMessage}`);

        // AI se reply generate karwana
        const aiReply = await getAIResponse(textMessage);
        
        // Customer ko reply bhejna
        await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
    });
}

// Bot shuru karein
connectToWhatsApp();
