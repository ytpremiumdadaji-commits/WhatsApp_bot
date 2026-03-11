require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 

const app = express();
const PORT = process.env.PORT || 10000; // Render standard port

let currentQR = "";
let botStatus = "Starting...";

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px; font-family: sans-serif;">✅ Grah Sansar Bot is ONLINE!</h1>');
    } else if (currentQR) {
        res.send(`<div style="text-align:center; margin-top:50px; font-family: sans-serif;"><h2>Naya QR Scan Karein:</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" style="border: 5px solid #25d366; border-radius: 10px;" /><p>Note: Scan ke baad webpage refresh karein.</p></div>`);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px; font-family: sans-serif;">Status: ${botStatus}</h1>`);
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function getAIResponse(userMessage) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://render.com",
                "X-OpenRouter-Title": "Grah Sansar"
            },
            body: JSON.stringify({
                "model": "nvidia/nemotron-nano-9b-v2:free",
                "messages": [
                    { "role": "system", "content": "You are a polite assistant for Grah Sansar store. Reply in Hinglish." },
                    { "role": "user", "content": userMessage }
                ]
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("AI Error:", error);
        return "Maaf kijiyega, system busy hai.";
    }
}

async function connectToWhatsApp() {
    // --- SESSION FOLDER BADAL DIYA HAI (FIX FOR BAD MAC) ---
    const { state, saveCreds } = await useMultiFileAuthState('session_march_11_fresh');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, auth: state, logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, browser: Browsers.macOS('Desktop'), syncFullHistory: false 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { currentQR = qr; botStatus = "Waiting for Scan"; }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => connectToWhatsApp(), 5000);
        } else if (connection === 'open') { currentQR = ""; botStatus = "Ready"; }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!textMessage) return;
        const aiReply = await getAIResponse(textMessage);
        await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
    });
}

// Bot ko sleep se bachane ke liye self-ping
setInterval(() => {
    fetch(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`)
    .then(() => console.log("Pinged self to stay awake!"))
    .catch(() => {});
}, 600000); // Har 10 min

connectToWhatsApp();
