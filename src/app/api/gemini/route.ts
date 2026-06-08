import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Inisialisasi Google Gen AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Fungsi Helper Mekanisme Retry Otomatis (Exponential Backoff)
 * Berguna untuk menangani kendala server Google penuh (503) atau pembatasan kuota sementara (429)
 */
async function retryGenerate(
  fn: () => Promise<any>,
  retries = 3,
  delay = 2000,
) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = error.message || "";
      // Deteksi jika server sibuk (503) atau terkena limit kuota sementara (429)
      const isRateLimitedOrBusy =
        errorStr.includes("503") ||
        errorStr.includes("429") ||
        errorStr.includes("quota");

      if (isRateLimitedOrBusy && i < retries - 1) {
        console.warn(
          `API Gemini sedang sibuk/terbata-bata. Mencoba ulang dalam ${delay / 1000} detik... (Percobaan ${i + 1}/${retries})`,
        );
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2; // Menggandakan waktu tunggu (2s -> 4s -> 8s)
        continue;
      }
      throw error; // Jika error tipenya lain atau retries habis, lempar error ke catch utama
    }
  }
}

export async function POST(request: Request) {
  try {
    const { imageBase64, history, message } = await request.json();

    // =================================================================
    // 1. JIKA INI ADALAH ANALISIS AWAL (DENGAN GAMBAR)
    // =================================================================
    if (imageBase64) {
      const response = await retryGenerate(() =>
        ai.models.generateContent({
          model: "gemini-2.5-flash", // Dialihkan ke Pro agar kuota lebih stabil dan terpisah
          contents: [
            { inlineData: { mimeType: "image/png", data: imageBase64 } },
            {
              text: "Analisis gambar batik ini. Berikan jawaban dalam format JSON dengan key: 'nama_motif', 'asal_daerah', dan 'filosofi'. Berikan informasi yang akurat.",
            },
          ],
          config: { responseMimeType: "application/json" },
        }),
      );

      return NextResponse.json(JSON.parse(response.text || "{}"));
    }

    // =================================================================
    // 2. JIKA INI ADALAH CHAT LANJUTAN (TEXT-ONLY PERCAKAPAN)
    // =================================================================
    if (message && history) {
      // Format ulang struktur array history agar sesuai dengan kebutuhan SDK terkini
      const formattedHistory = history.map((msg: any) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      }));

      // Mulai sesi obrolan interaktif dengan mempertahankan riwayat chat sebelumnya
      const chat = ai.chats.create({
        model: "gemini-2.5-flash", // Disamakan menggunakan model Pro
        history: formattedHistory,
        config: {
          systemInstruction:
            "Anda adalah pakar batik Indonesia yang ramah dan edukatif. Jawab pertanyaan user secara ringkas, jelas, dan informatif berdasarkan konteks motif batik yang sedang didiskusikan saat ini.",
        },
      });

      // Kirim pesan teks lanjutan dengan proteksi mekanisme retry
      const response = await retryGenerate(() =>
        chat.sendMessage({ message: message }),
      );

      return NextResponse.json({ text: response.text });
    }

    return NextResponse.json({ error: "Request tidak valid" }, { status: 400 });
  } catch (error: any) {
    console.error("Error pada internal routing Gemini API:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal pada sistem AI: " + error.message },
      { status: 500 },
    );
  }
}
