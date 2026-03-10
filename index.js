require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 

const app = express();
const PORT = process.env.PORT || 3000;
const PHONE_NUMBER = "919584584988"; // <-- Yahan apna number daaliye (91 ke saath)

let pairingCode = "";
let botStatus = "Start ho raha hai...";

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ Bot Online Hai!</h1>');
    } else if (pairingCode) {
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family: sans-serif;">
                <h2 style="color: #075e54;">Aapka Pairing Code:</h2>
                <h1 style="background: #e1f5fe; padding: 20px; display: inline-block; border: 2px dashed #03a9f4; letter-spacing: 5px;">${pairingCode}</h1>
                <p><b>Kaise use karein:</b> Phone mein WhatsApp > Linked Devices > Link with phone number par jayein aur ye code daalein.</p>
                <p>Note: Code har 1 minute mein badalta hai, refresh karte rahein.</p>
            </div>
        `);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px;">Status: ${botStatus}</h1><p style="text-align:center;">Refresh karein agar code na dikhe...</p>`);
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
                "messages": [{ "role": "user", "content": userMessage }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) { return "System busy."; }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('session_pairing_mode');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: ["Ubuntu", "Chrome", "20.0.04"], // Browser name must be fixed
        syncFullHistory: false
    });

    // --- PAIRING CODE GENERATOR ---
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(PHONE_NUMBER);
                pairingCode = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`✅ Pairing Code Generated: ${pairingCode}`);
                botStatus = "Code Ready";
            } catch (err) {
                console.log("Pairing Code Error:", err);
            }
        }, 5000); // 5 sec wait karke code generate karega
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            setTimeout(() => connectToWhatsApp(), 5000);
        } else if (connection === 'open') { 
            pairingCode = ""; 
            botStatus = "Ready"; 
            console.log('✅ Connected!'); 
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const aiReply = await getAIResponse(msg.message.conversation || msg.message.extendedTextMessage?.text);
        await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
    });
}
connectToWhatsApp();
