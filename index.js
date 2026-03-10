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
        res.send('<h1 style="color:green; text-align:center; margin-top:50px; font-family: sans-serif;">✅ Grah Sansar WhatsApp Bot is Running Successfully!</h1><p style="text-align:center;">Ab aap apne dukan wale number par message bhej kar test kar sakte hain.</p>');
    } else if (currentQR) {
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family: sans-serif;">
                <h2 style="color: #075e54;">WhatsApp se connect karne ke liye QR Code Scan karein:</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" alt="QR Code" style="margin: 20px; padding: 15px; border: 5px solid #25d366; border-radius: 10px;" />
                <p style="color: #555;">WhatsApp > Settings > Linked Devices > Link a Device</p>
                <p style="color: red; font-weight: bold;">Note: Agar scan na ho ya expire ho jaye, toh page ko Refresh karein.</p>
            </div>
        `);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px; font-family: sans-serif;">Status: ${botStatus}</h1><p style="text-align:center;">Kripya 1 minute wait karein aur fir page refresh karein...</p>`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- AI REPLY FUNCTION (LLAMA 3.3 70B + ADVANCED HEADERS) ---
async function getAIResponse(userMessage) {
    try {
        if (!OPENROUTER_API_KEY) {
            console.error("❌ ERROR: OPENROUTER_API_KEY is missing in Render Environment!");
            return "Maaf kijiyega, abhi system setup ho raha hai. Kripya dukan par sampark karein.";
        }

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://render.com", // Optional but good for stability
                "X-OpenRouter-Title": "Grah Sansar Department Store"
            },
            body: JSON.stringify({
                "model": "meta-llama/llama-3.3-70b-instruct:free", // Sabse best aur fast free model
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a smart, highly respectful assistant for 'Grah Sansar Department Store'. Your task is to receive grocery lists, confirm items, and ask for the customer's delivery address and mobile number. LANGUAGE MATCHING: If the customer writes in English, reply in pure English. If they write in Hindi or Hinglish, reply in clear Hindi/Hinglish. TONE & RESPECT: Always be extremely polite. Use 'Ji' and 'Aap' in Hindi. Keep replies short and professional."
                    },
                    {
                        "role": "user",
                        "content": userMessage
                    }
                ]
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content;
        } else {
            console.error("❌ OpenRouter Error Response:", data);
            return "Maaf kijiyega, abhi thoda network issue hai. Kripya thodi der baad message karein.";
        }
    } catch (error) {
        console.error("❌ AI Fetch System Error:", error);
        return "Network busy hai, kripya thodi der mein try karein.";
    }
}

// --- BAILEYS WHATSAPP CONNECTION SETUP ---
async function connectToWhatsApp() {
    // Auth session save karne ke liye (Taki baar baar scan na karna pade)
    const { state, saveCreds } = await useMultiFileAuthState('auth_session_grah_sansar');
    const { version } = await fetchLatestBaileysVersion();
    
    console.log(`Starting WhatsApp Bot v${version.join('.')}`);

    const sock = makeWASocket({
        version, 
        auth: state,
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: Browsers.macOS('Desktop'), 
        syncFullHistory: false // Background sync band taaki RAM bache
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
                setTimeout(() => connectToWhatsApp(), 5000); // 5 sec wait karke wapas connect karega
            }
        } else if (connection === 'open') {
            currentQR = "";
            botStatus = "Ready";
            console.log('✅ Grah Sansar Bot successfully connect ho gaya hai!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message Receive hone par
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; // Khud ke message skip karein

        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!textMessage) return;

        console.log(`Naya Message: ${textMessage}`);

        // AI se reply generate karwana
        const aiReply = await getAIResponse(textMessage);
        
        // Customer ko reply bhejna
        await sock.sendMessage(msg.key.remoteJid, { text: aiReply });
    });
}

// Bot ko start karna
connectToWhatsApp();
