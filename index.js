require('dotenv').config();
const express = require('express');
const { default: makeWASocket, initAuthCreds, BufferJSON, proto, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 10000;

let currentQR = "";
let botStatus = "Starting...";

// Chat memory jisse bot list yaad rakhega
const chatMemory = {}; 

app.get('/', (req, res) => {
    if (botStatus === "Ready") {
        res.send('<h1 style="color:green; text-align:center; margin-top:50px; font-family: sans-serif;">✅ Grah Sansar Advanced Bot is ONLINE!</h1>');
    } else if (currentQR) {
        res.send(`<div style="text-align:center; margin-top:50px; font-family: sans-serif;"><h2>Naya QR Scan Karein:</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" style="border: 5px solid #25d366; border-radius: 10px;" /></div>`);
    } else {
        res.send(`<h1 style="text-align:center; margin-top:50px; font-family: sans-serif;">Status: ${botStatus}</h1>`);
    }
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- ADVANCED AI RESPONSE FUNCTION ---
async function getAIResponse(userMessage, userId) {
    // Agar user naya hai, toh usko System Prompt (Rules) do
    if (!chatMemory[userId]) {
        chatMemory[userId] = [
            { 
                "role": "system", 
                "content": `You are a highly professional, polite, and smart Virtual Assistant for 'Grah Sansar Department Store'. You strictly speak in Hinglish.
                
                Your Core Capabilities:
                1. Auto-Correction: If a user types wrong product spellings (Hindi/English), silently understand it and use the correct professional name in your replies and lists.
                2. Recipe Master: If a user asks 'how to make' a dish or 'what is needed' for a recipe, list the exact ingredients with standard quantities. Then politely ask: "Kya main in saaman ko aapki order list mein add kar doon?"
                3. Professional Formatting: ALWAYS format the user's grocery list cleanly using numbers (1., 2., 3.).
                4. Order Management (Buttons): When the user says their list is complete, present the final bill/cart and give them interactive options like this:
                   
                   Aapka order ready hai. Aage badhne ke liye number type karein:
                   [1] ✅ Confirm Order
                   [2] ✏️ Edit List / Add Items
                   [3] ❌ Cancel Order
                   
                Always be helpful, warm, and professional. Act like a premium store manager.` 
            }
        ];
    }

    // User ka message memory mein daalo
    chatMemory[userId].push({ "role": "user", "content": userMessage });

    // Memory ko limit karo taaki OpenRouter error na de (Last 15 messages)
    if (chatMemory[userId].length > 15) {
        chatMemory[userId] = [chatMemory[userId][0], ...chatMemory[userId].slice(-14)];
    }

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://whatsapp-bot-1tm4.onrender.com",
                "X-OpenRouter-Title": "Grah Sansar"
            },
            body: JSON.stringify({
                "model": "google/gemma-3n-e4b-it:free", // Aapka chuna hua advanced model
                "messages": chatMemory[userId]
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            const aiReply = data.choices[0].message.content;
            // AI ka reply bhi memory mein daalo taaki conversation flow bani rahe
            chatMemory[userId].push({ "role": "assistant", "content": aiReply });
            return aiReply;
        } else {
            console.log("❌ OpenRouter Error Detail:", JSON.stringify(data));
            return "Maaf kijiyega, hamara system abhi update ho raha hai. Kripya thodi der baad try karein.";
        }
    } catch (error) {
        console.log("❌ Fetch Error:", error.message);
        return "Network busy hai, kripya dobara message bhejein.";
    }
}

// --- SUPABASE PERMANENT SESSION ADAPTER ---
const useSupabaseAuthState = async (sessionName = 'grah_sansar_auth') => {
    const writeData = async (data, id) => {
        const str = JSON.stringify(data, BufferJSON.replacer);
        await supabase.from('baileys_session').upsert({ id: `${sessionName}-${id}`, data: str });
    };
    const readData = async (id) => {
        const { data, error } = await supabase.from('baileys_session').select('data').eq('id', `${sessionName}-${id}`).single();
        if (error || !data) return null;
        return JSON.parse(data.data, BufferJSON.reviver);
    };
    const removeData = async (id) => {
        await supabase.from('baileys_session').delete().eq('id', `${sessionName}-${id}`);
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async id => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) tasks.push(writeData(value, key));
                            else tasks.push(removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};

// --- WHATSAPP CONNECTION ---
async function connectToWhatsApp() {
    const { state, saveCreds } = await useSupabaseAuthState();
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, 
        auth: state, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, 
        browser: Browsers.macOS('Desktop'), 
        syncFullHistory: false,
        getMessage: async () => { return { conversation: 'hello' }; }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { currentQR = qr; botStatus = "Waiting for Scan"; }
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                supabase.from('baileys_session').delete().like('id', 'grah_sansar_auth-%').then(() => console.log('Session wiped.'));
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
        
        // Pass the user's phone number to maintain individual memory
        const userId = msg.key.remoteJid;
        const aiReply = await getAIResponse(textMessage, userId);
        
        await sock.sendMessage(userId, { text: aiReply });
    });
}

// Bot ko sleep mode se bachane ke liye
setInterval(() => {
    fetch(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`)
    .then(() => console.log("Pinged self!"))
    .catch(() => {});
}, 600000); 

connectToWhatsApp();
