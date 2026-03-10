require('dotenv').config(); 
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// --- NAYA JUGAAAD (WEBPAGE PAR BADA QR CODE DIKHANE KE LIYE) ---
let currentQR = "";
let botStatus = "Start ho raha hai... Please wait 1-2 minutes.";

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ WhatsApp Bot is Running Successfully!</h1>');
    } else if (currentQR) {
        // Yahan webpage par original QR code ki photo bankar aayegi
        res.send(`
            <div style="text-align:center; margin-top:50px; font-family: sans-serif;">
                <h2>WhatsApp se connect karne ke liye QR Code Scan karein:</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" alt="QR Code" style="margin: 20px; padding: 10px; border: 2px solid black;" />
                <p style="color: red;">Note: Agar code scan nahi ho raha (expire ho gaya), toh is page ko <strong>Refresh</strong> karein.</p>
            </div>
        `);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px; font-family: sans-serif;">Status: ${botStatus}</h1><p style="text-align:center;">Kripya thodi der wait karein aur fir is page ko refresh karein...</p>`);
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

// WhatsApp Client Setup (MEMORY & TIMEOUT FIX APPLIED)
const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 60000, 
    puppeteer: {
        headless: true, 
        timeout: 0, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-background-networking', 
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-safebrowsing',
            '--js-flags=--max-old-space-size=256'
        ] 
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// Jab naya QR Code aaye
client.on('qr', (qr) => {
    currentQR = qr; // QR code save kar liya webpage ke liye
    botStatus = "Waiting for QR Scan";
    console.log('✅ Naya QR Code aa gaya hai! Apne Render URL (webpage) par jaakar scan karein.');
    qrcode.generate(qr, { small: true });
});

// Jab bot successfully connect ho jaye
client.on('ready', () => {
    currentQR = ""; 
    botStatus = "Ready";
    console.log('✅ WhatsApp Bot successfully connect ho gaya hai aur ready hai!');
});

// Jab koi naya message aaye
client.on('message', async (msg) => {
    if (msg.from === 'status@broadcast' || msg.isGroupMsg) return;

    console.log(`Customer Message: ${msg.body}`);
    const aiReply = await getAIResponse(msg.body);
    msg.reply(aiReply);
});

client.initialize();
