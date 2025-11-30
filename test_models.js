import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

async function listModels() {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Dummy init to get access? No, need model manager if available in SDK.
        // The SDK might not expose listModels directly on genAI instance in all versions.
        // Let's try a direct fetch if SDK doesn't support it easily, or check SDK docs memory.
        // Actually, usually it's not on the client.
        // Let's try to just use a known "safe" model first or try to fetch via REST if needed.
        // But wait, the error message SUGGESTED calling ListModels.
        // Let's try to find the correct model name by guessing or using a standard one.

        // Actually, let's just try to run a script that tries a few model names.
        const modelsToTry = ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-pro"];

        for (const modelName of modelsToTry) {
            console.log(`Testing ${modelName}...`);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("Hello");
                console.log(`SUCCESS: ${modelName} works!`);
                return;
            } catch (e) {
                console.log(`FAILED: ${modelName} - ${e.message.split('\n')[0]}`);
            }
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

listModels();
