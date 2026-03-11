require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

let currentQR = "";
let botStatus = "Starting...";

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px; font-family: sans-serif;">✅ Grah Sansar Bot is ONLINE!</h1>');
    } else if (currentQR) {
        res.send(`<div style="text-align:center; margin-top:50px; font-family: sans-serif;"><h2>Naya QR Scan Karein:</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" style="border: 5px solid #25d366; border-radius: 10px;" /></div>`);
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
        
        // FIX 1: Error check karega, crash nahi hoga
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        } else {
            console.log("❌ OpenRouter API Error:", JSON.stringify(data));
            return "Maaf kijiyega, system abhi update ho raha hai. Thodi der baad try karein.";
        }
    } catch (error) {
        console.error("AI Error:", error);
        return "Network busy hai.";
    }
}

async function connectToWhatsApp() {
    const sessionFolder = 'session_final_grah_sansar_11';
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: Browsers.macOS('Desktop'), 
        syncFullHistory: false,
        // FIX 2: Purane messages ko ignore karega taaki Bad MAC error na aaye
        getMessage: async (key) => {
            return { conversation: 'hello' };
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { currentQR = qr; botStatus = "Waiting for Scan"; }
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            // Agar logout kiya, toh purana kachra saaf kar dega
            if (reason === DisconnectReason.loggedOut) {
                if (fs.existsSync(sessionFolder)) fs.rmSync(sessionFolder, { recursive: true, force: true });
            }
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
