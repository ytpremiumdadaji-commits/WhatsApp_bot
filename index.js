require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = "";
let botStatus = "Starting...";

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ Grah Sansar Bot is LIVE!</h1>');
    } else if (currentQR) {
        res.send(`
            <div style="text-align:center; margin-top:50px;">
                <h2>QR Scan Karein:</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" style="border: 5px solid #25d366; border-radius: 10px;" />
                <p>Scan ke baad 1 min wait karein aur page refresh karein.</p>
            </div>
        `);
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
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemma-3-27b:free", 
                "messages": [{ "role": "system", "content": "You are a respectful assistant for Grah Sansar store. Reply in Hinglish." }, { "role": "user", "content": userMessage }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) { return "System busy."; }
}

async function connectToWhatsApp() {
    // Har baar naya session folder taaki Bad MAC error kabhi na aaye
    const { state, saveCreds } = await useMultiFileAuthState('session_final_v100');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: Browsers.macOS('Desktop'), // Standard desktop browser
        syncFullHistory: false, // RAM bachane ke liye sabse zaroori
        maxMsgRetryCount: 1
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
connectToWhatsApp();
