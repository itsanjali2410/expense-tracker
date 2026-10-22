import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  // Accept common names so a differently-named Vercel env var still works.
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.API_KEY || "";
  // Shows up in the Vercel build log; never prints the key itself.
  console.log(`[build] Gemini API key ${apiKey ? "found" : "MISSING - set GEMINI_API_KEY"} (mode: ${mode})`);

  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [
      react(),
      tailwindcss(), // 🔥 THIS LINE ENABLES TAILWIND v4
    ],
    define: {
      "process.env.API_KEY": JSON.stringify(apiKey),
      "process.env.GEMINI_API_KEY": JSON.stringify(apiKey),
      "process.env.BUILD_TIME": JSON.stringify(new Date().toISOString()),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
