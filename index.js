require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = "";
let botStatus = "Start ho raha hai... Please wait.";

// --- WEBPAGE PAR QR CODE DIKHANE KA SETUP ---
app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px; font-family: sans-serif;">✅ Grah Sansar Bot is Online!</h1><p style="text-align:center;">Ab aap message bhej kar test kar sakte hain.</p>');
    } else if (currentQR) {
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family: sans-serif;">
                <h2 style="color: #075e54;">WhatsApp Scan Karein:</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" alt="QR Code" style="margin: 20px; padding: 15px; border: 5px solid #25d366; border-radius: 10px;" />
                <p style="color: red; font-weight: bold;">Note: Agar scan na ho, toh page ko Refresh karein.</p>
            </div>
        `);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px; font-family: sans-serif;">Status: ${botStatus}</h1><p style="text-align:center;">Kripya 1 minute wait karke refresh karein...</p>`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- AI REPLY FUNCTION (GEMMA MODEL - NO RATE LIMIT) ---
async function getAIResponse(userMessage) {
    try {
        if (!OPENROUTER_API_KEY) return "System Key Missing.";

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://render.com",
                "X-OpenRouter-Title": "Grah Sansar Bot"
            },
            body: JSON.stringify({
                "model": "google/gemma-2-9b-it:free", // Yeh model stable hai aur 429 error nahi dega
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a smart assistant for 'Grah Sansar Department Store'. Reply politely in Hindi/Hinglish. Ask for grocery list and delivery address. Be very respectful."
                    },
                    { "role": "user", "content": userMessage }
                ]
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content;
        } else {
            console.log("❌ OpenRouter Error Response:", JSON.stringify(data));
            return "Maaf kijiyega, abhi dukan par bheed hai. Kripya thodi der baad message karein.";
        }
    } catch (error) {
        console.error("❌ AI Fetch Error:", error);
        return "Network busy hai, kripya baad mein try karein.";
    }
}

// --- BAILEYS CONNECTION SETUP ---
async function connectToWhatsApp() {
    // Session folder ka naam badal diya taaki 'Bad MAC' error saaf ho jaye
    const { state, saveCreds } = await useMultiFileAuthState('auth_session_fresh_v2');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, 
        auth: state,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: Browsers.macOS('Desktop'), 
        syncFullHistory: false 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            botStatus = "Waiting for QR Scan";
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 5000); 
            }
        } else if (connection === 'open') {
            currentQR = "";
            botStatus = "Ready";
            console.log('✅ Grah Sansar Bot is Ready!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!textMessage) return;

        console.log(`Naya Message: ${textMessage}`);
        const aiReply = await getAIResponse(textMessage);
        
        await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
    });
}

connectToWhatsApp();
