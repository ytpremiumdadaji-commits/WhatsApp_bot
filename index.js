// Kisi package ki zaroorat nahi hai
async function testAPI() {
    const MY_KEY = "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"; // <-- Apni OpenRouter key yahan paste karein

    console.log("--- AI Testing Start ---");

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${MY_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemma-3-27b:free",
                "messages": [
                    { "role": "user", "content": "Hello, testing API connection." }
                ]
            })
        });

        const data = await response.json();

        if (data.choices) {
            console.log("✅ SUCCESS! AI Reply: ", data.choices[0].message.content);
        } else {
            console.log("❌ AI ERROR: ", JSON.stringify(data));
        }
    } catch (err) {
        console.log("❌ CONNECTION ERROR: ", err.message);
    }
}

testAPI();
