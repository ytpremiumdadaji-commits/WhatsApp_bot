require('dotenv').config();
const express = require('express');
const { default: makeWASocket, initAuthCreds, BufferJSON, proto, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino'); 
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 10000;

let currentQR = "";
let botStatus = "Starting...";

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
    if (!chatMemory[userId]) {
        // ✨ FIX: Strict Professional Persona and Exact Flow Added
        chatMemory[userId] = [
            { 
                "role": "system", 
                "content": `You are 'GS AI', a highly professional, extremely polite Virtual Assistant for 'Grih Sansar Departmental Store'. Strictly speak in Hinglish. NEVER invent a different name.

                STRICT RULES & CONVERSATION FLOW:
                
                STEP 1 (GREETING): When a user first says Hi/Hello, reply EXACTLY with this and nothing else:
                "Namaskar 🙏,\nGrih Sansar Departmental Store mein aapka swagat hai!\nMain GS AI hoon, aapki ghar-ki kharidaari, recipes, aur shopping list ke liye hamesha aapki seva mein hazir hoon. Batiye, aaj main aapki kya madad kar sakta hoon?"

                STEP 2 (LIST MAKING): Help users make their grocery list. Auto-correct wrong spellings silently. Format lists strictly using numbers (1., 2., 3.). If they ask for a recipe, list ingredients and ask if you should add them to the list.

                STEP 3 (CONFIRMATION MENU): When the user says their list is complete, show the final list and then show EXACTLY this menu:
                "Order Confirm Karne Ke Liye 1 Likhe
                Order Ko Edit Karne ke Liye 2 Likhe
                Order Cancel Karne Ke Liye 3 Likhe"

                STEP 4 (ADDRESS): If the user replies with '1', ask them:
                "Kripya apna Delivery Address aur Contact Number bataiye taaki hum aapka order bhej sakein."

                STEP 5 (FINAL CHECKOUT): Once they provide the address/number (or simply reply yes/no), finalize the order EXACTLY with this:
                "Aapka order successfully place ho gaya hai! 🎉 Hum jaldi hi isko aap tak deliver karenge.\n\nThanks For Shopping at Grih Sansar Departmental Store! Aapka din shubh ho. 🙏"

                IMPORTANT: Always treat repeat users with the same high level of respect. Never add extra unnecessary talk. Be professional and act like a premium store manager.` 
            }
        ];
    }

    chatMemory[userId].push({ "role": "user", "content": userMessage });

    // Memory limit: Keep the system rules intact, remember last 14 interactions
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
                "model": "nvidia/nemotron-3-nano-30b-a3b:free",
                "messages": chatMemory[userId]
            })
        });

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            const aiReply = data.choices[0].message.content;
            chatMemory[userId].push({ "role": "assistant", "content": aiReply });
            return aiReply;
        } else {
            console.log("❌ OpenRouter Error Detail:", JSON.stringify(data));
            return "Maaf kijiyega, system abhi thoda busy hai. Kripya thodi der baad try karein.";
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
