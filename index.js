require('dotenv').config(); // Local testing ke liye .env file read karega
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Render ke liye ek chota Express server (Render ko ek port par active rehna zaroori hai)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('WhatsApp Bot is running successfully in Memory-Saver Mode!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Environment variable se API key fetch karna
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
                        "content": "Tum ek grocery store ke smart aur polite assistant ho. Tumhara kaam customers ki grocery list receive karna, items confirm karna, aur unka address aur mobile number poochna hai. Hamesha chote, clear aur Hinglish/Hindi mein reply karo. Agar koi aisi cheez pooche jo dukan se related nahi hai, toh politely mana kar do."
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

// WhatsApp Client Setup with Render Cloud Server Settings (MEMORY FIX APPLIED)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Background me chalane ke liye fix
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            // --- Naye Memory Saving Features ---
            '--disable-background-networking', 
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-safebrowsing',
            '--js-flags=--max-old-space-size=256' // Node.js ki memory limit half kardi
        ] 
    }
});

// QR Code generate karna (Terminal me scan karne ke liye)
client.on('qr', (qr) => {
    console.log('Neeche diye gaye QR Code ko apne dukan wale WhatsApp se scan karein:');
    qrcode.generate(qr, { small: true });
});

// Jab bot successfully connect ho jaye
client.on('ready', () => {
    console.log('✅ WhatsApp Bot successfully connect ho gaya hai aur ready hai!');
});

// Jab koi naya message aaye
client.on('message', async (msg) => {
    // Status replies aur Group messages par reply na karein
    if (msg.from === 'status@broadcast' || msg.isGroupMsg) return;

    console.log(`Customer Message: ${msg.body}`);

    // AI se reply generate karwana
    const aiReply = await getAIResponse(msg.body);
    
    // Customer ko reply bhejna
    msg.reply(aiReply);
});

// Bot ko start karna
client.initialize();
