"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";
import * as tf from "@tensorflow/tfjs";
import { supabase } from "@/lib/supabaseClient";

// --- Komponen & Tipe Data ---
const UploadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-20 h-20 md:w-24 md:h-24 text-gray-400"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
    />
  </svg>
);

interface Batik {
  name: string;
  origin: string;
  philosophy: string;
}

interface GeminiBatikDetails {
  nama_motif: string;
  asal_daerah: string;
  filosofi: string;
}

// --- Komponen Utama ---
const UploadSection = () => {
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<Batik | null>(null);
  const [geminiResult, setGeminiResult] = useState<GeminiBatikDetails | null>(
    null,
  );
  const [confidence, setConfidence] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("-");

  // State untuk mendukung Fitur Chat Interaktif Gemini
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "model"; text: string }[]
  >([]);
  const [userInput, setUserInput] = useState<string>("");
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memuat model lokal Teachable Machine & Metadata
  useEffect(() => {
    const loadModel = async () => {
      try {
        const loadedModel = await tf.loadLayersModel("/model/model.json");
        const metadataResponse = await fetch("/model/metadata.json");
        const metadata = await metadataResponse.json();
        setModel(loadedModel);
        setLabels(metadata.labels);
        console.log("Model Teachable Machine dan metadata berhasil dimuat.");
      } catch (error) {
        console.error("Gagal memuat model:", error);
      }
    };
    loadModel();
  }, []);

  // Mengonversi file gambar ke string Base64 untuk kebutuhan Gemini API
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Fungsi integrasi dengan API Route Gemini (Validasi Awal)
  const analyzeBatikWithGemini = async (file: File) => {
    setIsGeminiLoading(true);
    try {
      const base64Image = await fileToBase64(file);
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageBase64: base64Image }),
      });

      const data = await response.json();
      if (response.ok) {
        setGeminiResult(data);
        console.log("Hasil Analisis Gemini:", data);
      } else {
        console.error("API Gemini mengembalikan error:", data.error);
      }
    } catch (error) {
      console.error("Gagal meminta bantuan Gemini:", error);
    } finally {
      setIsGeminiLoading(false);
    }
  };

  // Mengirim percakapan lanjutan (Teks) ke Gemini API
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isChatLoading) return;

    const userMessage = userInput.trim();
    setUserInput("");

    const updatedMessages = [
      ...chatMessages,
      { role: "user" as const, text: userMessage },
    ];
    setChatMessages(updatedMessages);
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: chatMessages,
          message: userMessage,
        }),
      });

      const data = await response.json();

      if (response.ok && data.text) {
        setChatMessages([
          ...updatedMessages,
          { role: "model" as const, text: data.text },
        ]);
      } else {
        console.error("Gagal mendapat respon chat:", data.error);
      }
    } catch (error) {
      console.error("Error saat mengirim pesan:", error);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Mengambil rincian data motif dari Supabase
  const fetchBatikDetails = async (
    motifName: string,
  ): Promise<Batik | null> => {
    try {
      const { data, error } = await supabase
        .from("motifs")
        .select("name, origin, philosophy")
        .eq("name", motifName)
        .single();
      if (error) {
        console.error("Error mengambil data dari Supabase:", error);
        return null;
      }
      return data;
    } catch (error) {
      console.error("Error tak terduga saat fetch:", error);
      return null;
    }
  };

  // Handler klik deteksi sekuensial
  const handleDetectClick = async () => {
    if (!model || !imageRef.current || !previewUrl || !currentFile) {
      alert("Model belum siap atau tidak ada gambar untuk dideteksi.");
      return;
    }
    setIsLoading(true);
    setAnalysisResult(null);
    setGeminiResult(null);
    setConfidence(null);
    setChatMessages([]);

    try {
      const imageElement = imageRef.current;
      const tensor = tf.browser
        .fromPixels(imageElement)
        .resizeBilinear([224, 224])
        .toFloat()
        .expandDims(0)
        .div(tf.scalar(255));
      const predictions = model.predict(tensor) as tf.Tensor;
      const scores = await predictions.data();
      tf.dispose([tensor, predictions]);

      let highestScore = 0;
      let bestIndex = 0;
      scores.forEach((score, i) => {
        if (score > highestScore) {
          highestScore = score;
          bestIndex = i;
        }
      });

      const predictedBatikName = labels[bestIndex];
      const confidencePercentage = Math.round(highestScore * 100);
      setConfidence(confidencePercentage);

      setStatusMessage(`Hasil Deteksi (Akurasi: ${confidencePercentage}%)`);

      const details = await fetchBatikDetails(predictedBatikName);
      if (details) {
        setAnalysisResult(details);
      } else {
        setAnalysisResult({
          name: predictedBatikName,
          origin: "Data tidak ditemukan",
          philosophy:
            "Informasi detail untuk motif ini belum tersedia di database kami.",
        });
      }

      await analyzeBatikWithGemini(currentFile);
    } catch (error) {
      console.error("Error saat deteksi:", error);
      setAnalysisResult({
        name: "Gagal Deteksi",
        origin: "-",
        philosophy:
          "Terjadi kesalahan saat proses identifikasi. Mohon coba gambar lain.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (file: File | null) => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setCurrentFile(file);
      setAnalysisResult(null);
      setGeminiResult(null);
      setConfidence(null);
      setChatMessages([]);
      setStatusMessage("-");
      if (imageRef.current) {
        imageRef.current.src = url;
      }
    }
  };

  const handleClearClick = () => {
    setPreviewUrl(null);
    setCurrentFile(null);
    setAnalysisResult(null);
    setGeminiResult(null);
    setConfidence(null);
    setChatMessages([]);
    setUserInput("");
    setStatusMessage("-");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFileChange(e.dataTransfer.files[0]);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };
  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e.target.files?.[0] || null);
  };

  return (
    <section className="relative w-full py-20 lg:py-32 bg-gray-900">
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileInputChange}
        accept="image/*"
        className="hidden"
      />
      {previewUrl && (
        <img
          ref={imageRef}
          src={previewUrl}
          alt="hidden preview"
          className="hidden"
        />
      )}

      <div className="relative z-10 container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl lg:text-5xl font-sans font-bold text-white">
            Kenali <span className="text-[#D7AA83]">Motif Batik</span>
          </h1>
          <p className="mt-4 text-gray-300 leading-relaxed">
            Unggah gambar kain batik Anda, dan biarkan teknologi AI kami
            mengidentifikasi nama, asal, dan filosofi di baliknya dalam hitungan
            detik.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Kolom Kiri: Tempat Upload / Preview Gambar */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-full min-h-[400px] rounded-2xl cursor-pointer flex items-center justify-center relative overflow-hidden bg-gray-100 dark:bg-gray-700/50 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#D7AA83] transition-colors duration-300"
          >
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="Preview Batik"
                layout="fill"
                objectFit="cover"
              />
            ) : (
              <div className="flex flex-col items-center text-gray-500 dark:text-gray-400">
                <UploadIcon />
                <p className="mt-2 font-semibold">Tarik & Lepas Gambar</p>
                <p className="text-sm">atau klik untuk memilih file</p>
              </div>
            )}
          </div>

          {/* Kolom Kanan: Informasi & Tombol Aksi */}
          <div className="flex flex-col p-4 h-full justify-between min-h-[400px]">
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-3xl font-sans font-bold text-black dark:text-white">
                  {analysisResult
                    ? `Batik ${analysisResult.name}`
                    : "Hasil Analisis"}
                </h2>

                {confidence !== null && (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-500/30">
                    🎯 Confidence: {confidence}%
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2 text-gray-600 dark:text-gray-300 text-base">
                <p>
                  <span className="font-semibold text-black dark:text-white">
                    Asal:
                  </span>{" "}
                  {analysisResult ? analysisResult.origin : statusMessage}
                </p>
                <div className="max-h-[150px] overflow-y-auto pr-2 space-y-1">
                  <span className="font-semibold text-black dark:text-white">
                    Filosofi:
                  </span>
                  <p>{analysisResult ? analysisResult.philosophy : "-"}</p>
                </div>
              </div>

              {/* Blok Tampilan Output Gemini API & Chat Box */}
              {(isGeminiLoading || geminiResult) && (
                <div className="mt-6 p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-[#D7AA83]/30">
                  <h3 className="text-md font-bold text-[#D7AA83] mb-2 flex items-center gap-2">
                    ✨ Validasi Wawasan AI (Gemini)
                  </h3>
                  {isGeminiLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 italic">
                      <div className="w-4 h-4 border-2 border-[#D7AA83] border-t-transparent rounded-full animate-spin"></div>
                      Menganalisis karakteristik motif mendalam...
                    </div>
                  ) : (
                    geminiResult && (
                      <div className="text-sm space-y-1 text-gray-600 dark:text-gray-300">
                        <p>
                          <span className="font-semibold text-black dark:text-white">
                            Identifikasi Alternatif:
                          </span>{" "}
                          {geminiResult.nama_motif}
                        </p>
                        <p>
                          <span className="font-semibold text-black dark:text-white">
                            Korelasi Budaya:
                          </span>{" "}
                          {geminiResult.asal_daerah}
                        </p>
                        <p className="mt-1 italic text-gray-500 dark:text-gray-400">
                          "{geminiResult.filosofi}"
                        </p>

                        {/* --- FITUR INTERACTIVE CHAT BOX --- */}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                            Tanya Gemini Lebih Lanjut:
                          </p>

                          <div className="space-y-2 max-h-[180px] overflow-y-auto mb-3 pr-1 text-xs">
                            {chatMessages.map((msg, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded-lg max-w-[85%] ${msg.role === "user" ? "bg-[#D7AA83]/20 text-[#D7AA83] ml-auto text-right" : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"}`}
                              >
                                <p className="font-bold mb-0.5 text-[10px] opacity-60">
                                  {msg.role === "user"
                                    ? "Anda"
                                    : "Gemini Pakar"}
                                </p>
                                <p className="leading-relaxed whitespace-pre-line">
                                  {msg.text}
                                </p>
                              </div>
                            ))}
                            {isChatLoading && (
                              <div className="text-[11px] text-gray-400 italic animate-pulse">
                                Gemini sedang mengetik...
                              </div>
                            )}
                          </div>

                          <form
                            onSubmit={handleSendMessage}
                            className="flex gap-2"
                          >
                            <input
                              type="text"
                              value={userInput}
                              onChange={(e) => setUserInput(e.target.value)}
                              placeholder="Tanyakan makna simbol, cara perawatan, dll..."
                              className="flex-grow px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-black dark:text-white focus:outline-none focus:border-[#D7AA83]"
                            />
                            <button
                              type="submit"
                              disabled={isChatLoading || !userInput.trim()}
                              className="px-3 py-1.5 bg-[#D7AA83] hover:bg-[#c99c75] text-stone-800 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                              Kirim
                            </button>
                          </form>
                        </div>
                        {/* --- AKHIR FITUR CHAT BOX --- */}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Area Tombol Utama (Aksi Deteksi dan Hapus) */}
            <div className="pt-8 flex items-center gap-4 mt-6">
              <button
                onClick={handleDetectClick}
                disabled={!previewUrl || !model || isLoading || isGeminiLoading}
                className="px-8 py-3 bg-[#D7AA83] text-stone-800 font-bold rounded-full shadow-md hover:bg-[#c99c75] hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading || isGeminiLoading
                  ? "Mendeteksi..."
                  : !model
                    ? "Memuat Model..."
                    : "Deteksi Batik"}
              </button>
              {previewUrl && (
                <button
                  onClick={handleClearClick}
                  className="px-8 py-3 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-300"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default UploadSection;
