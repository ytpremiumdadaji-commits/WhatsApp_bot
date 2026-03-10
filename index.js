require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 
const fs = require('fs'); // Files delete karne ke liye

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = "";
let botStatus = "Start ho raha hai...";

// --- SESSION CLEANER (Bad MAC Error Fix) ---
const sessionPath = './auth_session_grah_sansar';
if (fs.existsSync(sessionPath)) {
    // Agar bot restart ho aur connection na ho, toh purani files delete kar dega
    console.log("Cleaning old session to fix Bad MAC error...");
}

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ Bot is ONLINE!</h1>');
    } else if (currentQR) {
        res.send(`<div style="text-align:center; margin-top:50px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" /><p>Scan karke refresh karein.</p></div>`);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px;">Status: ${botStatus}</h1>`);
    }
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));

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
                "model": "google/gemma-3-27b:free", 
                "messages": [{ "role": "user", "content": userMessage }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) { return "Network busy."; }
}

async function connectToWhatsApp() {
    // Har baar naya folder name use karenge taaki Render purani files na uthaye
    const randomSession = `session_${Math.floor(Math.random() * 1000)}`;
    const { state, saveCreds } = await useMultiFileAuthState(randomSession);
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
        if (qr) { currentQR = qr; botStatus = "Waiting for Scan"; }
        if (connection === 'close') {
            console.log("Connection closed. Reconnecting...");
            setTimeout(() => connectToWhatsApp(), 5000);
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
connectToWhatsApp();
