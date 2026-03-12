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
const pendingTimers = {}; // ✨ NAYA: 3 Minute ka Timer System

app.get('/', (req, res) => {
    if (botStatus === "Ready") res.send('<h1 style="color:green; text-align:center; margin-top:50px;">✅ Grah Sansar Bot ONLINE!</h1>');
    else if (currentQR) res.send(`<div style="text-align:center; margin-top:50px;"><h2>Naya QR Scan Karein:</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" style="border: 5px solid #25d366; border-radius: 10px;" /></div>`);
    else res.send(`<h1 style="text-align:center; margin-top:50px;">Status: ${botStatus}</h1>`);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- ADVANCED AI RESPONSE FUNCTION ---
async function getAIResponse(userMessage, userId) {
    if (!chatMemory[userId]) {
        chatMemory[userId] = [
            { 
                "role": "system", 
                "content": `You are 'GS AI', a highly professional Virtual Assistant for 'Grih Sansar Departmental Store'. Strictly speak in Hinglish.

                STRICT RULES & CONVERSATION FLOW:
                
                STEP 1 (MANDATORY FIRST GREETING): Whenever a user sends their FIRST message, your reply MUST ALWAYS start with this EXACT decorated greeting (Do NOT use their name):
                
                ✨ *Namaskar!* 🙏
                🛒 *Grih Sansar Departmental Store* mein aapka swagat hai! 🎉
                🤖 Main *GS AI* hoon. 🛍️ Ghar ki kharidaari, 🍲 recipes, aur 📝 shopping list ke liye main aapki seva mein hazir hoon.
                
                (Process their request below this greeting).

                STEP 2 (LIST MAKING): Format lists strictly using numbers (1., 2., 3.). Auto-correct spellings.

                STEP 3 (CONFIRMATION MENU): When list is complete, show the final formatted list and EXACTLY this menu:
                📦 *Aapka Order Ready Hai!* Aage badhne ke liye number chunein:
                [1] ✅ Confirm Order
                [2] ✏️ Edit List / Add Items
                [3] ❌ Cancel Order

                STEP 4 (ADDRESS ONLY): If user replies '1', ask VERY POLITELY:
                📍 "Kya order aapke regular address par bhejna hai, ya aap dukan se pick-up karenge? (Agar naya address hai toh kripya type karein)."

                STEP 5 (FINAL CHECKOUT & SECRET SUMMARY): Once they reply about address, finalize the order EXACTLY with this message below. Do not change the separator "===ORDER_SUMMARY===".
                
                ✅ "Aapka order successfully place ho gaya hai! 🎉 Hum jaldi hi isko aap tak deliver karenge.\n\n💖 *Thanks For Shopping at Grih Sansar Departmental Store!* Aapka din shubh ho. 🙏"
                ===ORDER_SUMMARY===
                *Final Items:*
                [List the items here]
                *Delivery/Pick-up Info:*
                [What they provided]` 
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
            return `⚠️ Maaf kijiyega, system abhi thoda busy hai. Kripya thodi der baad try karein.`;
        }
    } catch (error) {
        return `⚠️ Network busy hai, kripya dobara message bhejein.`;
    }
}

// --- WHATSAPP CONNECTION ---
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
        
        const userId = msg.key.remoteJid;
        const pushName = msg.pushName || "Customer"; 
        
        // ✨ PURANA SUPER MAGIC: Asli 10-Digit number nikalna (Safe hai)
        const hiddenRealId = msg.key.remoteJidAlt || msg.key.senderPn || msg.senderPn || userId;
        const realNumber = String(hiddenRealId).split('@')[0].replace(/\D/g, ''); 

        // Agar customer ne reply de diya, toh purana timer rok do (taaki double message na jaye)
        if (pendingTimers[userId]) {
            clearTimeout(pendingTimers[userId]);
            delete pendingTimers[userId];
        }

        // ✨ PURANA PHOTO/AUDIO DETECTOR (Safe hai)
        const isMedia = msg.message.imageMessage || msg.message.audioMessage || msg.message.videoMessage || msg.message.documentMessage;
        if (isMedia) {
            const customerReply = "✨ *Namaskar!* 🙏\n\nKya ye aapke saman ki list hai? Maine is photo/recording ko direct dukan par admin ko bhej diya hai taaki aapka order jaldi se ready ho sake! 📦✅\n\nAgar isme kuch aur add karna ho toh aap likh kar bata sakte hain.";
            await sock.sendMessage(userId, { text: customerReply });

            const groupJid = process.env.OWNER_GROUP_JID;
            if (groupJid) {
                const groupMessage = `🚨 *NEW MEDIA ORDER RECEIVED* 🚨\n\n👤 *Profile Name:* ${pushName}\n📱 *Customer Number:* +${realNumber}\n🔗 *Direct Chat:* wa.me/${realNumber}\n\n👇 *Customer ne ye Photo / Voice Note bheja hai:*`;
                await sock.sendMessage(groupJid, { text: groupMessage });
                await sock.sendMessage(groupJid, { forward: msg });
            }
            return; 
        }

        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!textMessage) return;

        if (textMessage === '!getid') {
            await sock.sendMessage(userId, { text: `Is Group ka ID hai:\n*${userId}*` });
            return;
        }
        
        const aiReply = await getAIResponse(textMessage, userId);
        
        if (aiReply.includes("===ORDER_SUMMARY===")) {
            const parts = aiReply.split("===ORDER_SUMMARY===");
            const customerMessage = parts[0].trim();
            const orderDetails = parts[1].trim();
            
            const groupJid = process.env.OWNER_GROUP_JID;
            await sock.sendMessage(userId, { text: customerMessage });

            if (groupJid) {
                const groupMessage = `🚨 *NEW ORDER RECEIVED* 🚨\n\n👤 *Profile Name:* ${pushName}\n📱 *Customer Number:* +${realNumber}\n🔗 *Direct Chat:* wa.me/${realNumber}\n\n🛒 *Order Details:*\n${orderDetails}`;
                await sock.sendMessage(groupJid, { text: groupMessage });
            }
            
            // Order complete hone par memory saaf kardo taaki agli baar fresh start ho
            delete chatMemory[userId]; 

        } else {
            // Normal message user ko bhejna
            await sock.sendMessage(userId, { text: aiReply });

            // ✨ NAYA: AUTO-CONFIRM TIMER LOGIC
            // Agar bot ne customer se 'Confirm' karne ko poocha hai:
            if (aiReply.includes("📦 *Aapka Order Ready Hai!*") || aiReply.includes("regular address par bhejna hai")) {
                
                // 3 Minute (180,000 milliseconds) ka timer chalu karo
                pendingTimers[userId] = setTimeout(async () => {
                    try {
                        let orderListText = "";
                        
                        // Chat memory se customer ki aakhiri list nikalna
                        const aiMessages = chatMemory[userId].filter(m => m.role === 'assistant' && m.content.includes("📦 *Aapka Order Ready Hai!*"));
                        if (aiMessages.length > 0) {
                            const lastListMsg = aiMessages[aiMessages.length - 1].content;
                            orderListText = lastListMsg.split("📦")[0].trim(); // Sirf list nikalega
                        } else {
                            orderListText = "Chat se list auto-fetch ki gayi hai.";
                        }

                        // 1. Customer ko Final Success Message
                        const autoSuccessMsg = "⏳ *Auto-Confirm:* Aapne thodi der tak koi reply nahi diya, isliye maine aapki is list ko final order samajh kar dukan par bhej diya hai! 🎉\n\nJaldi hi delivery hogi. Agar kuch aur chahiye toh aap naya message bhej sakte hain. 🙏";
                        await sock.sendMessage(userId, { text: autoSuccessMsg });

                        // 2. Owner Group me Chup-Chap bhej dena
                        const groupJid = process.env.OWNER_GROUP_JID;
                        if (groupJid) {
                            const groupMessage = `🚨 *AUTO-CONFIRMED ORDER (NO REPLY)* 🚨\n\n👤 *Profile Name:* ${pushName}\n📱 *Customer Number:* +${realNumber}\n🔗 *Direct Chat:* wa.me/${realNumber}\n\n🛒 *Order Details:*\n${orderListText}\n\n📍 *(Customer ne confirm menu ka reply nahi diya tha, isliye 3 minute baad auto-forward hua hai)*`;
                            await sock.sendMessage(groupJid, { text: groupMessage });
                        }

                        // Order complete ho gaya, memory saaf kardo
                        delete chatMemory[userId];
                        delete pendingTimers[userId];

                    } catch (err) {
                        console.log("Auto Confirm Timeout Error:", err);
                    }
                }, 3 * 60 * 1000); // 3 * 60 * 1000 = 3 Minutes
            }
        }
    });
}

setInterval(() => {
    fetch(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`).catch(() => {});
}, 600000); 

connectToWhatsApp();
