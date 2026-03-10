require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = "";
let botStatus = "Start ho raha hai... Please wait.";

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ WhatsApp Bot is Running Super Fast (Baileys)!</h1>');
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

async function connectToWhatsApp() {
    // 1. Purani corrupt file ko chhod kar naya fresh folder banayega
    const { state, saveCreds } = await useMultiFileAuthState('auth_session_new_fresh');
    
    // 2. WhatsApp ka ekdum latest version fetch karega taaki disconnect na ho
    const { version } = await fetchLatestBaileysVersion();
    console.log(`Using WhatsApp v${version.join('.')}`);

    const sock = makeWASocket({
        version, // Latest version attach kar diya
        auth: state,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: Browsers.macOS('Desktop'), // Official tareeqa browser set karne ka
        syncFullHistory: false 
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            botStatus = "Waiting for QR Scan";
            console.log('✅ Naya QR Code aa gaya hai! Webpage par jakar scan karein.');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection band ho gaya. Reconnecting...', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000); 
            }
        } else if (connection === 'open') {
            currentQR = "";
            botStatus = "Ready";
            console.log('✅ Baileys Bot successfully connect ho gaya hai aur ready hai!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!textMessage) return;

        console.log(`Naya Customer Message: ${textMessage}`);
        const aiReply = await getAIResponse(textMessage);
        await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
    });
}

connectToWhatsApp();
