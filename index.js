const fetch = require('node-fetch'); // Agar node version purana hai toh

async function testMyAPI() {
    const MY_KEY = "YAHAN_APNI_OPENROUTER_API_KEY_DAALEIN"; // <-- Apni key paste karein

    console.log("--- AI Testing Start Ho Rahi Hai ---");

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${MY_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemma-2-9b-it:free",
                "messages": [
                    { "role": "user", "content": "Hello, kya tum kaam kar rahe ho?" }
                ]
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0]) {
            console.log("✅ SUCCESS! AI ka reply aaya:", data.choices[0].message.content);
        } else {
            console.log("❌ ERROR! AI ne reply nahi diya. Details niche dekho:");
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.log("❌ CONNECTION ERROR! Internet ya URL mein dikkat hai:", error.message);
    }
}

testMyAPI();
