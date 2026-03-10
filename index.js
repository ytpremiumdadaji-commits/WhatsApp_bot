require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = "";
let botStatus = "Start ho raha hai...";

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ Bot is ONLINE!</h1>');
    } else if (currentQR) {
        res.send(`<div style="text-align:center; margin-top:50px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" /><p>Scan karke page refresh karein.</p></div>`);
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
                "messages": [
                    { "role": "system", "content": "You are a polite assistant for Grah Sansar store. Reply in Hinglish." },
                    { "role": "user", "content": userMessage }
                ]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) { return "Network busy."; }
}

async function connectToWhatsApp() {
    // --- DHAYAN SE: Maine folder ka naam phir badal diya hai 'FINAL_FIX_TEMP' ---
    const { state, saveCreds } = await useMultiFileAuthState('FINAL_FIX_TEMP');
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
            const reason = lastDisconnect.error?.output?.statusCode;
            // Agar Bad MAC ya Session error aaye toh folder delete karke restart karega
            console.log("Connection closed, reason:", reason);
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
