import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Setup JSON body parsing with a generous limit for optional uploads/images
app.use(express.json({ limit: "20mb" }));

// Initialize the Google GenAI SDK lazily to get error details if API key is missing
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY topilmadi. Iltimos, AI Studio Settings > Secrets panelida uni sozlang."
      );
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------

// Server status & environment validation
app.get("/api/status", (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({
    status: "ok",
    hasApiKey: hasKey,
    message: hasKey
      ? "Tizim muvaffaqiyatli ishga tushdi va API kaliti sozlangan."
      : "Diqqat: GEMINI_API_KEY topilmadi. Sozlamalardan kalitni kiriting.",
  });
});

// Chat endpoint with optional search grounding & multimodal support
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, systemInstruction, enableSearch } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Suhbat tarixi (messages) noto'g'ri shaklda yuborildi." });
      return;
    }

    const ai = getGenAI();

    // Map frontend messages format to Google GenAI contents schema safely
    const contents = messages.map((msg: any) => {
      // Map role: 'user' or 'model'
      const role = msg.role === "user" ? "user" : "model";
      
      const parts = [];
      if (msg.text) {
        parts.push({ text: msg.text });
      }
      
      if (msg.image) {
        // Handle image data if uploaded
        // Expected image format: { mimeType: "image/jpeg", data: "base64String" }
        parts.push({
          inlineData: {
            mimeType: msg.image.mimeType || "image/jpeg",
            data: msg.image.data
          }
        });
      }

      return { role, parts };
    });

    const config: any = {
      systemInstruction: systemInstruction || "Siz foydali, aqlli va madaniyatli sun'iy intellekt yordamchisiz. Javoblaringizni o'zbek tilida taqdim eting.",
    };

    if (enableSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    // Call the model using gemini-3.5-flash as the primary choice,
    // with seamless robust fallbacks in case of temporary 503 (high demand) issues.
    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents,
        config,
      });
    } catch (primaryError: any) {
      console.warn("gemini-3.5-flash high-demand/error fallback ishga tushdi:", primaryError.message || primaryError);
      try {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config,
        });
      } catch (fallbackError: any) {
        console.warn("gemini-2.5-flash error fallback ishga tushdi:", fallbackError.message || fallbackError);
        // Standard high-availability fallback
        response = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents,
          config,
        });
      }
    }

    // Extract text and grounding sources
    const text = response.text || "Hech qanday javob olinmadi.";
    
    // Extract grounding sources if search was enabled
    const searchChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const searchSources = searchChunks
      .filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web.title || "Manba",
        url: chunk.web.uri,
      }));

    res.json({
      text,
      sources: searchSources,
    });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      error: error.message || "Kutilmagan ichki server xatosi yuz berdi.",
    });
  }
});

// ----------------------------------------------------
// VITE & PRODUCTION OUTLET MIDDLEWARE
// ----------------------------------------------------
async function initializeServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for UI client router fallback (standard for Express v4)
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Uzbek AI Chat Server running on http://localhost:${PORT}`);
  });
}

initializeServer().catch((err) => {
  console.error("Serverni ishga tushirishda xatolik:", err);
});
