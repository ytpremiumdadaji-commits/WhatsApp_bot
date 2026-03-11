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
        chatMemory[userId] = [
            { 
                "role": "system", 
                "content": `You are 'GS AI', a highly professional Virtual Assistant for 'Grih Sansar Departmental Store'. Strictly speak in Hinglish. NEVER invent a different name.

                STRICT RULES & CONVERSATION FLOW:
                
                STEP 1 (MANDATORY FIRST GREETING): Whenever a user sends their FIRST message, your reply MUST ALWAYS start with this EXACT decorated greeting:
                
                ✨ *Namaskar!* 🙏
                🛒 *Grih Sansar Departmental Store* mein aapka swagat hai! 🎉
                🤖 Main *GS AI* hoon, aapka apna Virtual Assistant. 
                🛍️ Ghar ki kharidaari, 🍲 recipes, aur 📝 shopping list ke liye main hamesha aapki seva mein hazir hoon.
                
                (Process their request below this greeting).

                STEP 2 (LIST MAKING): Format lists strictly using numbers (1., 2., 3.). Auto-correct spellings. Include ingredients for recipes if asked.

                STEP 3 (CONFIRMATION MENU): When list is complete, show the final formatted list and EXACTLY this menu:
                📦 *Aapka Order Ready Hai!* Aage badhne ke liye number chunein:
                [1] ✅ Confirm Order
                [2] ✏️ Edit List / Add Items
                [3] ❌ Cancel Order

                STEP 4 (ADDRESS): If user replies '1', ask:
                📍 "Kripya apna *Delivery Address* aur *Contact Number* bataiye taaki hum aapka order bhej sakein."

                STEP 5 (FINAL CHECKOUT & SECRET SUMMARY): Once they provide address/number (or say no), you MUST reply in this EXACT format below. Do not change the separator "===ORDER_SUMMARY===".
                
                ✅ "Aapka order successfully place ho gaya hai! 🎉 Hum jaldi hi isko aap tak deliver karenge.\n\n💖 *Thanks For Shopping at Grih Sansar Departmental Store!* Aapka din shubh ho. 🙏"
                ===ORDER_SUMMARY===
                *Final Items:*
                [List the items here]
                *Address/Contact Info:*
                [What they provided, or "User did not provide"]` 
            }
        ];
    }

    chatMemory[userId].push({ "role": "user", "content": userMessage });

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
            return "Maaf kijiyega, system abhi thoda busy hai. Kripya thodi der baad try karein.";
        }
    } catch (error) {
        return "Network busy hai, kripya dobara message bhejein.";
    }
}

// --- WHATSAPP CONNECTION ---
const useSupabaseAuthState = async (sessionName = 'grah_sansar_auth') => {
    // ... (Supabase adapter remains exactly the same as before)
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

async function connectToWhatsApp() {
    const { state, saveCreds } = await useSupabaseAuthState();
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, auth: state, logger: pino({ level: 'silent' }), 
        printQRInTerminal: false, browser: Browsers.macOS('Desktop'), syncFullHistory: false,
        getMessage: async () => { return { conversation: 'hello' }; }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { currentQR = qr; botStatus = "Waiting for Scan"; }
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) supabase.from('baileys_session').delete().like('id', 'grah_sansar_auth-%');
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

        // ✨ FEATURE: Group ID nikalne ka command
        if (textMessage === '!getid') {
            await sock.sendMessage(userId, { text: `Is Group ka ID hai:\n*${userId}*` });
            return;
        }
        
        const aiReply = await getAIResponse(textMessage, userId);
        
        // ✨ FEATURE: Order split karke group mein bhejna
        if (aiReply.includes("===ORDER_SUMMARY===")) {
            const parts = aiReply.split("===ORDER_SUMMARY===");
            const customerMessage = parts[0].trim();
            const orderDetails = parts[1].trim();
            const customerPhone = userId.split('@')[0];
            const groupJid = process.env.OWNER_GROUP_JID; // Render se aayega

            // 1. Customer ko sirf Thank You message bhejo
            await sock.sendMessage(userId, { text: customerMessage });

            // 2. Owner Group mein puri detail bhejo
            if (groupJid) {
                const groupMessage = `🚨 *NEW ORDER RECEIVED* 🚨\n\n📱 *Customer Number:* +${customerPhone}\n\n🛒 *Order Details:*\n${orderDetails}`;
                await sock.sendMessage(groupJid, { text: groupMessage });
            }
        } else {
            // Normal chatting
            await sock.sendMessage(userId, { text: aiReply });
        }
    });
}

setInterval(() => {
    fetch(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`).catch(() => {});
}, 600000); 

connectToWhatsApp();
