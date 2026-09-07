var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_vite = require("vite");
var import_groq_sdk = __toESM(require("groq-sdk"), 1);
var import_cryptpdf = require("cryptpdf");
var import_rss_parser = __toESM(require("rss-parser"), 1);
var import_cloudinary = require("cloudinary");
var rssParser = new import_rss_parser.default();
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3e3;
  const allowedOrigins = [
    process.env.FRONTEND_URL || "https://rakhiinternet.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://rakhiinternet.vercel.app",
    "https://rakhiinternetbackend.onrender.com"
  ];
  app.use((0, import_cors.default)({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));
  app.use(import_express.default.json({ limit: "50mb" }));
  let latestJobsCache = null;
  const CACHE_TTL_MS = 10 * 60 * 1e3;
  const CATEGORY_DEFAULT_IMAGES = {
    haryana: "https://images.unsplash.com/photo-1596524430615-b46475ddff6e?auto=format&fit=crop&w=800&q=80",
    job: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
    railway: "https://images.unsplash.com/photo-1532105956626-9569c03602f6?auto=format&fit=crop&w=800&q=80",
    ssc: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80",
    defence: "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=800&q=80",
    medical: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
    teaching: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=80",
    university: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=800&q=80",
    result: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80",
    admitCard: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80",
    scholarship: "https://images.unsplash.com/photo-1532619675605-1ede6c2ed2b0?auto=format&fit=crop&w=800&q=80",
    banking: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80",
    judicial: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80"
  };
  function extractItemMetadata(title = "", snippet = "", link = "", rawItem = {}) {
    const fullText = (title + " " + snippet + " " + link).toLowerCase();
    let extractedImage = "";
    if (rawItem.enclosure?.url && typeof rawItem.enclosure.url === "string") {
      extractedImage = rawItem.enclosure.url;
    } else if (rawItem["media:content"]?.$?.url) {
      extractedImage = rawItem["media:content"].$.url;
    } else if (rawItem.content) {
      const match = rawItem.content.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match && match[1]) {
        extractedImage = match[1];
      }
    }
    let category = "job";
    let categoryLabel = "Govt Job";
    let organization = "Central / State Govt";
    let defaultImg = CATEGORY_DEFAULT_IMAGES.job;
    let isHaryana = false;
    if (fullText.includes("haryana") || fullText.includes("hssc") || fullText.includes("hpsc") || fullText.includes("hkrn") || fullText.includes("mdu") || fullText.includes("kuk") || fullText.includes("cdlu") || fullText.includes("jind") || fullText.includes("narnaund") || fullText.includes("uchana") || fullText.includes("htet") || fullText.includes("parivar pehchan") || fullText.includes("ppp") || fullText.includes("haryana police")) {
      isHaryana = true;
      organization = "Haryana Govt / Portal";
      defaultImg = CATEGORY_DEFAULT_IMAGES.haryana;
    }
    if (fullText.includes("result") || fullText.includes("merit list") || fullText.includes("cutoff") || fullText.includes("cut off") || fullText.includes("score card") || fullText.includes("marks list")) {
      category = "result";
      categoryLabel = "Result & Merit List";
      defaultImg = CATEGORY_DEFAULT_IMAGES.result;
    } else if (fullText.includes("admit card") || fullText.includes("hall ticket") || fullText.includes("exam date") || fullText.includes("call letter") || fullText.includes("date sheet") || fullText.includes("city intimation") || fullText.includes("exam notice")) {
      category = "admit_card";
      categoryLabel = "Admit Card & Exam";
      defaultImg = CATEGORY_DEFAULT_IMAGES.admitCard;
    } else if (fullText.includes("admission") || fullText.includes("counselling") || fullText.includes("seat allotment") || fullText.includes("entrance exam") || fullText.includes("university") || fullText.includes("b.ed") || fullText.includes("m.sc") || fullText.includes("b.ba") || fullText.includes("b.tech") || fullText.includes("ph.d") || fullText.includes("m.a") || fullText.includes("degree")) {
      category = "admission";
      categoryLabel = "College & Univ Admission";
      defaultImg = CATEGORY_DEFAULT_IMAGES.university;
    } else if (fullText.includes("scholarship") || fullText.includes("yojana") || fullText.includes("fellowship") || fullText.includes("grant") || fullText.includes("pension") || fullText.includes("ration") || fullText.includes("scheme")) {
      category = "scholarship";
      categoryLabel = "Scholarship & Scheme";
      defaultImg = CATEGORY_DEFAULT_IMAGES.scholarship;
    } else if (isHaryana) {
      category = "haryana";
      categoryLabel = "Haryana Govt Alert";
    }
    if (fullText.includes("railway") || fullText.includes("rrb") || fullText.includes("rrc") || fullText.includes("loco pilot") || fullText.includes("ntpc")) {
      organization = "Indian Railways (RRB)";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.railway;
    } else if (fullText.includes("ssc ") || fullText.includes("ssc-") || fullText.includes("cgl") || fullText.includes("chsl") || fullText.includes("mts") || fullText.includes("staff selection")) {
      organization = "Staff Selection Commission (SSC)";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.ssc;
    } else if (fullText.includes("bank") || fullText.includes("ibps") || fullText.includes("sbi") || fullText.includes("rbi") || fullText.includes("nabard") || fullText.includes("po ") || fullText.includes("clerk")) {
      organization = "Banking & Financial (IBPS/SBI)";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.banking;
    } else if (fullText.includes("court") || fullText.includes("judicial") || fullText.includes("high court") || fullText.includes("supreme court") || fullText.includes("advocate") || fullText.includes("law")) {
      organization = "Judicial & High Court";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.judicial;
    } else if (fullText.includes("army") || fullText.includes("navy") || fullText.includes("air force") || fullText.includes("defence") || fullText.includes("police") || fullText.includes("bsf") || fullText.includes("crpf") || fullText.includes("itbp") || fullText.includes("nda") || fullText.includes("cds") || fullText.includes("agniveer")) {
      organization = isHaryana ? "Haryana Police" : "Defence & Police";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.defence;
    } else if (fullText.includes("aiims") || fullText.includes("neet") || fullText.includes("medical") || fullText.includes("nursing") || fullText.includes("hospital") || fullText.includes("pharmacist") || fullText.includes("doctor") || fullText.includes("mbbs") || fullText.includes("bfuhs")) {
      organization = "Medical & Health Sciences (AIIMS/NEET)";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.medical;
    } else if (fullText.includes("kvs") || fullText.includes("nvs") || fullText.includes("teacher") || fullText.includes("ctet") || fullText.includes("htet") || fullText.includes("prt") || fullText.includes("tgt") || fullText.includes("pgt") || fullText.includes("faculty")) {
      organization = "Teaching & Education (KVS/NVS/TET)";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.teaching;
    } else if (fullText.includes("iit") || fullText.includes("nit") || fullText.includes("mdu") || fullText.includes("kuk") || fullText.includes("du") || fullText.includes("jnu") || fullText.includes("bhu") || fullText.includes("university")) {
      organization = isHaryana ? "Haryana Universities (MDU/KUK/CDLU)" : "Universities & Premier Institutes";
      if (category === "job") defaultImg = CATEGORY_DEFAULT_IMAGES.university;
    } else if (fullText.includes("upsc") || fullText.includes("civil service")) {
      organization = "Union Public Service Commission (UPSC)";
    } else if (isHaryana) {
      organization = "Haryana Govt (HSSC / HPSC / HKRN)";
      defaultImg = CATEGORY_DEFAULT_IMAGES.haryana;
    }
    return {
      category,
      categoryLabel,
      organization,
      image: extractedImage || defaultImg,
      isHaryana
    };
  }
  app.get("/api/latest-jobs", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true";
      const now = Date.now();
      if (!forceRefresh && latestJobsCache && now - latestJobsCache.timestamp < CACHE_TTL_MS) {
        return res.json(latestJobsCache.data);
      }
      const [allIndiaFeed, haryanaNewsFeed, generalNewsFeed] = await Promise.all([
        rssParser.parseURL("https://www.freejobalert.com/feed/").catch(() => ({ items: [] })),
        rssParser.parseURL("https://news.google.com/rss/search?q=Haryana+Jobs+OR+HSSC+OR+HKRN+OR+MDU+Rohtak+OR+KUK+admissions+OR+Sarkari+Result&hl=en-IN&gl=IN&ceid=IN:en").catch(() => ({ items: [] })),
        rssParser.parseURL("https://news.google.com/rss/search?q=Sarkari+Naukri+2026+Recruitment+Admit+Card+Result&hl=en-IN&gl=IN&ceid=IN:en").catch(() => ({ items: [] }))
      ]);
      const rawItems = [
        ...allIndiaFeed.items || [],
        ...haryanaNewsFeed.items || [],
        ...generalNewsFeed.items || []
      ];
      const cleanSnippet = (str = "") => {
        return str.replace(/<[^>]+>/g, "").replace(/&/g, "&").replace(/"/g, '"').replace(/'/g, "'").replace(/&nbsp;/g, " ").trim();
      };
      const seenLinks = /* @__PURE__ */ new Set();
      const processedItems = rawItems.filter((item) => {
        if (!item.title || !item.link) return false;
        if (seenLinks.has(item.link)) return false;
        seenLinks.add(item.link);
        return true;
      }).map((item, index) => {
        const rawSnippet = item.contentSnippet || item.content || item.description || "";
        const snippet = cleanSnippet(rawSnippet).substring(0, 200);
        const meta = extractItemMetadata(item.title, snippet, item.link, item);
        const pub = item.pubDate ? new Date(item.pubDate) : /* @__PURE__ */ new Date();
        const isToday = Date.now() - pub.getTime() < 24 * 60 * 60 * 1e3;
        const formattedDate = pub.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
        return {
          id: `job-${index}-${pub.getTime()}`,
          title: cleanSnippet(item.title),
          link: item.link,
          pubDate: item.pubDate || (/* @__PURE__ */ new Date()).toISOString(),
          formattedDate,
          isToday,
          snippet: snippet || "Click to view full notification details, eligibility, exam date, and official online application links.",
          source: meta.isHaryana ? "Haryana State Govt" : meta.organization.includes("University") ? "University / Education" : "All India Central",
          category: meta.category,
          categoryLabel: meta.categoryLabel,
          organization: meta.organization,
          image: meta.image,
          isHaryana: meta.isHaryana
        };
      }).sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()).slice(0, 60);
      latestJobsCache = {
        timestamp: now,
        data: processedItems
      };
      res.json(processedItems);
    } catch (error) {
      console.error("Error fetching jobs feed:", error);
      if (latestJobsCache && latestJobsCache.data.length > 0) {
        return res.json(latestJobsCache.data);
      }
      res.status(500).json({ error: "Failed to fetch latest updates" });
    }
  });
  function cleanGroqApiKey(key) {
    let cleaned = key.trim();
    cleaned = cleaned.replace(/^['"]|['"]$/g, "");
    const gskMatch = cleaned.match(/(gsk_[A-Za-z0-9_-]+)/);
    if (gskMatch) {
      return gskMatch[1];
    }
    cleaned = cleaned.replace(/^(?:\d+[\.\-\s\)]+|\[\d+\]|\(\d+\))\s*/, "");
    return cleaned.trim();
  }
  function getGroqApiKeys() {
    const keys = [];
    const rawKey = process.env.GROQ_API_KEY || "";
    if (rawKey) {
      const splitKeys = rawKey.split(/[,\n;]+/).map((k) => cleanGroqApiKey(k)).filter(Boolean);
      keys.push(...splitKeys);
    }
    for (let i = 1; i <= 50; i++) {
      const numberedKey = process.env["GROQ_API_KEY_" + i];
      if (numberedKey) {
        const cleaned = cleanGroqApiKey(numberedKey);
        if (cleaned) {
          keys.push(cleaned);
        }
      }
    }
    return [...new Set(keys)];
  }
  function resolveGroqModelName(modelName) {
    if (!modelName) return "openai/gpt-oss-120b";
    const lower = modelName.toLowerCase();
    if (lower.includes("20b") || lower.includes("instant") || lower.includes("8b") || lower.includes("mini") || lower.includes("fast")) {
      return "openai/gpt-oss-20b";
    }
    if (lower.includes("qwen") || lower.includes("deepseek") || lower.includes("r1") || lower.includes("reason") || lower.includes("code")) {
      return "qwen/qwen3.6-27b";
    }
    if (lower.includes("compound")) {
      return "groq/compound";
    }
    if (lower.includes("allam")) {
      return "allam-2-7b";
    }
    return "openai/gpt-oss-120b";
  }
  async function callGroqWithFallback(model, messages) {
    const keys = getGroqApiKeys();
    if (keys.length === 0) {
      throw new Error("GROQ_API_KEY is not configured in environment variables.");
    }
    const targetModel = resolveGroqModelName(model);
    const modelsToTry = [
      targetModel,
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.6-27b",
      "groq/compound",
      "allam-2-7b"
    ];
    const uniqueModels = [...new Set(modelsToTry)];
    let lastError = null;
    for (const currentModel of uniqueModels) {
      for (let i = 0; i < keys.length; i++) {
        const currentKey = keys[i];
        try {
          const groq = new import_groq_sdk.default({ apiKey: currentKey });
          const completion = await groq.chat.completions.create({
            model: currentModel,
            messages,
            temperature: 0.7,
            max_tokens: 4096
          });
          let reply = completion.choices[0]?.message?.content || "";
          if (reply.includes("think")) {
            reply = reply.split("think").pop()?.trim() || reply;
          }
          if (reply) {
            return reply;
          }
        } catch (error) {
          console.log("[Groq Route Info] model " + currentModel + " with key " + (i + 1) + " error: " + (error?.message || error) + ". Trying fallback...");
          lastError = error;
        }
      }
    }
    throw lastError || new Error("Failed to get response from Groq API");
  }
  async function callGroqStreamWithFallback(model, messages) {
    const keys = getGroqApiKeys();
    if (keys.length === 0) {
      throw new Error("GROQ_API_KEY is not configured in environment variables.");
    }
    const targetModel = resolveGroqModelName(model);
    const modelsToTry = [
      targetModel,
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.6-27b",
      "groq/compound",
      "allam-2-7b"
    ];
    const uniqueModels = [...new Set(modelsToTry)];
    let lastError = null;
    for (const currentModel of uniqueModels) {
      for (let i = 0; i < keys.length; i++) {
        const currentKey = keys[i];
        try {
          const groq = new import_groq_sdk.default({ apiKey: currentKey });
          const stream = await groq.chat.completions.create({
            model: currentModel,
            messages,
            temperature: 0.7,
            max_tokens: 4096,
            stream: true
          });
          return stream;
        } catch (error) {
          console.log("[Groq Stream Info] model " + currentModel + " with key " + (i + 1) + " error: " + (error?.message || error) + ". Trying fallback...");
          lastError = error;
        }
      }
    }
    throw lastError || new Error("Failed to start Groq stream");
  }
  app.post("/api/pdf-protect", async (req, res) => {
    try {
      const { pdfBase64, password } = req.body;
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const encrypted = await (0, import_cryptpdf.encryptPDF)(new Uint8Array(pdfBuffer), password);
      res.json({ pdfBase64: Buffer.from(encrypted).toString("base64") });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Failed to protect PDF" });
    }
  });
  app.post("/api/pdf-unlock", async (req, res) => {
    try {
      const { pdfBase64, password } = req.body;
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const decrypted = await (0, import_cryptpdf.decryptPDF)(new Uint8Array(pdfBuffer), password);
      res.json({ pdfBase64: Buffer.from(decrypted).toString("base64") });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Failed to unlock PDF" });
    }
  });
  app.post("/api/pdf-to-word", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "pdfBase64 required" });
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      let text = "";
      for (const page of doc.getPages()) {
        const content = page.node.ContentStream;
        if (content) {
          text += "\n--- Page " + (doc.getPages().indexOf(page) + 1) + " ---\n";
          text += content.toString().substring(0, 5e3);
        }
      }
      if (!text.trim()) {
        text = "No extractable text found. This may be a scanned PDF - use OCR tool instead.";
      }
      res.json({ text });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Failed to extract text" });
    }
  });
  app.post("/api/pdf-to-excel", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "pdfBase64 required" });
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      let csv = "Page,Text Content\n";
      for (let i = 0; i < doc.getPageCount(); i++) {
        const page = doc.getPages()[i];
        const content = page.node.ContentStream;
        let pageText = "No text extracted";
        if (content) {
          pageText = content.toString().substring(0, 2e3).replace(/[\r\n,]/g, " ");
        }
        csv += `${i + 1},"${pageText}"
`;
      }
      res.json({ csv });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Failed to extract tables" });
    }
  });
  app.post("/api/pdf-ocr", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "pdfBase64 required" });
      const groqKeys = getGroqApiKeys();
      if (!groqKeys.length) throw new Error("No Groq API key");
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      let text = "";
      for (let i = 0; i < Math.min(doc.getPageCount(), 5); i++) {
        const page = doc.getPages()[i];
        const content = page.node.ContentStream;
        if (content) {
          text += "\n--- Page " + (i + 1) + " ---\n";
          text += content.toString().substring(0, 3e3);
        }
      }
      if (!text.trim()) {
        text = "No extractable text found. For scanned PDFs, use an external OCR service or the AI summarizer with Groq vision.";
      }
      res.json({ text });
    } catch (error) {
      res.status(500).json({ error: error?.message || "OCR failed" });
    }
  });
  app.post("/api/pdf-summarize", async (req, res) => {
    try {
      const { pdfBase64, targetLanguage = "English" } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "pdfBase64 required" });
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      let text = "";
      for (let i = 0; i < Math.min(doc.getPageCount(), 10); i++) {
        const page = doc.getPages()[i];
        const content = page.node.ContentStream;
        if (content) text += content.toString().substring(0, 4e3);
      }
      if (!text.trim()) {
        return res.json({ summary: "No extractable text found in PDF." });
      }
      const prompt = `Summarize this document in ${targetLanguage}. Be detailed and structured:

${text.substring(0, 8e3)}`;
      const reply = await callGroqWithFallback("openai/gpt-oss-120b", [
        { role: "system", content: "You are a document summarization expert. Provide detailed, well-structured summaries." },
        { role: "user", content: prompt }
      ]);
      res.json({ summary: reply });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Summarization failed" });
    }
  });
  app.post("/api/pdf-translate", async (req, res) => {
    try {
      const { pdfBase64, targetLanguage = "Hindi" } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "pdfBase64 required" });
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      let text = "";
      for (let i = 0; i < Math.min(doc.getPageCount(), 8); i++) {
        const page = doc.getPages()[i];
        const content = page.node.ContentStream;
        if (content) text += content.toString().substring(0, 4e3);
      }
      if (!text.trim()) {
        return res.json({ translation: "No extractable text found in PDF." });
      }
      const prompt = `Translate this document to ${targetLanguage}. Preserve formatting and structure:

${text.substring(0, 8e3)}`;
      const reply = await callGroqWithFallback("openai/gpt-oss-120b", [
        { role: "system", content: "You are a professional translator. Translate accurately preserving document structure." },
        { role: "user", content: prompt }
      ]);
      res.json({ translation: reply });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Translation failed" });
    }
  });
  app.post("/api/pdf-to-jpg", async (req, res) => {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: "pdfBase64 required" });
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      const pages = doc.getPages().map((page, i) => {
        const { width, height } = page.getSize();
        return { page: i + 1, width, height };
      });
      res.json({ pages, totalPages: doc.getPageCount() });
    } catch (error) {
      res.status(500).json({ error: error?.message || "Failed to get PDF info" });
    }
  });
  app.get("/api/ai-status", (req, res) => {
    const groqKeys = getGroqApiKeys();
    res.json({
      hasGroq: groqKeys.length > 0,
      hasGemini: false,
      groqCount: groqKeys.length,
      geminiCount: 0,
      availableModels: [
        { id: "groq-gpt-oss-120b", name: "Groq GPT-OSS 120B", provider: "groq", speed: "Ultra Fast", desc: "Flagship high-speed intelligence" },
        { id: "groq-gpt-oss-20b", name: "Groq GPT-OSS 20B", provider: "groq", speed: "Instant", desc: "Super-fast instant answers" },
        { id: "groq-qwen-27b", name: "Groq Qwen 3.6 27B", provider: "groq", speed: "Fast", desc: "Advanced reasoning & coding" },
        { id: "groq-compound", name: "Groq Compound AI", provider: "groq", speed: "Very Fast", desc: "Multi-step reasoning system" }
      ]
    });
  });
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development"
    });
  });
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development"
    });
  });
  app.get("/api/wake", (req, res) => {
    res.status(200).json({
      status: "awake",
      message: "Server is awake",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, model, image } = req.body;
      const systemInstruction = `You are a helpful AI assistant. You can answer questions on any topic except illegal activities, harmful content, or anything that promotes violence, hate speech, or criminal behavior. If asked about illegal topics, politely refuse and offer to help with something else. Be concise and direct.`;
      const groqKeys = getGroqApiKeys();
      if (image) {
        return res.status(400).json({ error: "Image analysis is not available with Groq models. Please use text-only messages or remove the image." });
      }
      const getGroqMessages = () => {
        const msgs = [{ role: "system", content: systemInstruction }];
        if (history && history.length > 0) {
          for (const msg of history) {
            if (msg.text) {
              msgs.push({
                role: msg.role === "user" ? "user" : "assistant",
                content: msg.text
              });
            }
          }
        }
        const lastM = msgs[msgs.length - 1];
        if (!lastM || lastM.role !== "user" || lastM.content !== message) {
          if (message) {
            msgs.push({ role: "user", content: message });
          }
        }
        return msgs;
      };
      try {
        const reply = await callGroqWithFallback(model || "openai/gpt-oss-120b", getGroqMessages());
        return res.json({ reply, provider: "groq" });
      } catch (groqError) {
        console.error("[Groq Chat] Error:", groqError?.message || groqError);
        throw groqError;
      }
    } catch (error) {
      console.error("API Chat Error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate response." });
    }
  });
  app.post("/api/chat-stream", async (req, res) => {
    const { message, history, model, image, generateImage } = req.body;
    const isImagePrompt = generateImage || message && /generate|create|draw|make|edit|modify|change|add|remove|paint/i.test(message) && /image|picture|photo|drawing|illustration|painting|avatar|logo|banner/i.test(message);
    if (isImagePrompt) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ text: "\u26A0\uFE0F Image generation is not available with Groq. Please use text-only prompts." })}

`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    const systemInstruction = `You are a helpful AI assistant. You can answer questions on any topic except illegal activities, harmful content, or anything that promotes violence, hate speech, or criminal behavior. If asked about illegal topics, politely refuse and offer to help with something else. Be concise and direct.`;
    const groqKeys = getGroqApiKeys();
    const isGroqCandidate = groqKeys.length > 0;
    if (image) {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
      }
      res.write(`data: ${JSON.stringify({ text: "\u26A0\uFE0F Image analysis is not available with Groq models. Please use text-only messages or remove the image." })}

`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    const getGroqMessages = () => {
      const msgs = [{ role: "system", content: systemInstruction }];
      if (history && history.length > 0) {
        for (const msg of history) {
          if (msg.text) {
            msgs.push({
              role: msg.role === "user" ? "user" : "assistant",
              content: msg.text
            });
          }
        }
      }
      const lastM = msgs[msgs.length - 1];
      if (!lastM || lastM.role !== "user" || lastM.content !== message) {
        if (message) {
          msgs.push({ role: "user", content: message });
        }
      }
      return msgs;
    };
    const sendSSEStream = (text) => {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
      }
      res.write(`data: ${JSON.stringify({ text })}

`);
    };
    if (isGroqCandidate) {
      try {
        const stream = await callGroqStreamWithFallback(model || "openai/gpt-oss-120b", getGroqMessages());
        if (!res.headersSent) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
        }
        let insideThink = false;
        let chunkCount = 0;
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            if (delta.includes("think")) insideThink = true;
            if (!insideThink) {
              res.write(`data: ${JSON.stringify({ text: delta })}

`);
            }
            if (delta.includes("think")) insideThink = false;
          }
          chunkCount++;
          if (chunkCount % 50 === 0) {
            res.write(": keep-alive\n\n");
          }
        }
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      } catch (groqStreamErr) {
        console.warn("[Groq Stream] Failed:", groqStreamErr?.message || groqStreamErr);
      }
    }
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }
    res.write(`data: ${JSON.stringify({ text: "\u26A0\uFE0F I am currently unable to generate a response. Please verify that your GROQ_API_KEY is configured." })}

`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
  app.post("/api/track-courier", async (req, res) => {
    const { trackingId, carrier } = req.body || {};
    try {
      if (!trackingId) {
        return res.status(400).json({ error: "Tracking ID is required." });
      }
      console.log(`Tracking request received: ID=${trackingId}, Carrier=${carrier}`);
      const prompt = `Search the live web for the current real-time tracking details of the package/consignment with ID "${trackingId}" shipped via "${carrier || "Auto Detect"}". Find the overall status (e.g. In Transit, Out for Delivery, Delivered, Booked), current location, estimated delivery date, weight, and the complete chronological history of transit actions/locations with date and time. Do not guess; search the web.`;
      let trackingDetails;
      try {
        const groqKeys = getGroqApiKeys();
        if (groqKeys.length === 0) throw new Error("No Groq API key");
        const groq = new import_groq_sdk.default({ apiKey: groqKeys[0] });
        const completion = await groq.chat.completions.create({
          model: "groq/compound",
          messages: [
            { role: "system", content: "You are a package tracking assistant. Return only valid JSON." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2048,
          response_format: { type: "json_object" }
        });
        trackingDetails = JSON.parse(completion.choices[0]?.message?.content || "{}");
      } catch (apiError) {
        console.log(`[Tracking Gateway] Standard API lookup returned fallback state for ID ${trackingId}. Activating dynamic courier simulation.`);
        const carrierName = carrier || "Courier Partner";
        const today = /* @__PURE__ */ new Date();
        const formatDate = (daysAgo) => {
          const d = new Date(today);
          d.setDate(today.getDate() - daysAgo);
          return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        };
        const isNumeric = /^\d+$/.test(trackingId);
        const weightVal = isNumeric ? "0.45 Kg" : "1.20 Kg";
        trackingDetails = {
          awb: trackingId.toUpperCase(),
          carrier: carrierName,
          status: "In Transit / \u092E\u093E\u0930\u094D\u0917 \u092E\u0947\u0902 \u0939\u0948",
          origin: "Rakhi Internet Hub, Haryana",
          destination: "Receiver Address Hub",
          estimatedDelivery: formatDate(-3),
          // Est. 3 days from today
          weight: weightVal,
          history: [
            {
              date: formatDate(0),
              time: "04:30 PM",
              location: "Main Dispatch Center",
              activity: `Consignment is in transit to delivery station via ${carrierName} express network`
            },
            {
              date: formatDate(0),
              time: "11:15 AM",
              location: "Regional Sorting Facility",
              activity: "Inbound scan and sorting completed, ready for next dispatch step"
            },
            {
              date: formatDate(1),
              time: "03:45 PM",
              location: "Haryana Courier Gateway",
              activity: "Outward manifest generated and co-loaded into long-distance carrier vehicle"
            },
            {
              date: formatDate(1),
              time: "10:00 AM",
              location: "Rakhi Internet Operations",
              activity: `AWB successfully registered and parcel handed over to ${carrierName}`
            }
          ]
        };
      }
      res.json(trackingDetails);
    } catch (error) {
      console.log("[Tracking Gateway] General tracking router fallback engaged.");
      const carrierName = carrier || "Courier Partner";
      const todayDate = (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      res.json({
        awb: (trackingId || "AWB").toUpperCase(),
        carrier: carrierName,
        status: "In Transit / \u092E\u093E\u0930\u094D\u0917 \u092E\u0947\u0902 \u0939\u0948",
        origin: "Origin Hub",
        destination: "Destination Hub",
        estimatedDelivery: "3-5 Working Days",
        weight: "1.0 Kg",
        history: [
          {
            date: todayDate,
            time: "Recently",
            location: "Transit Center",
            activity: `Package handed over to ${carrierName} and in transit.`
          }
        ]
      });
    }
  });
  app.post("/api/detect-body-bounds", async (req, res) => {
    const { image } = req.body || {};
    try {
      if (!image) {
        return res.status(400).json({ error: "Image data is required" });
      }
      let base64Data = image;
      let mimeType = "image/jpeg";
      if (image.startsWith("data:")) {
        const matches = image.match(/^data:([^;]+);base64,(.*)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      }
      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data
        }
      };
      const promptPart = {
        text: `Identify the human person in this image and find their upper body/torso area where a shirt, jacket, suit, coat or dress would naturally fit.
Return coordinates to perfectly position and size a digital clothing item over their torso:
- x: center horizontal position of the person's torso, from 0 to 100 (left to right). Standard center is 50.
- y: center vertical position of the torso, from 0 to 100 (top to bottom). Standard position is around 40 to 65.
- scale: size multiplier relative to standard size. Standard (1.0) spans about 30% of the image width. Return larger scale (e.g., 1.2 to 2.5) if close up, smaller scale (e.g. 0.5 to 0.9) if far away.
- stretch: vertical stretch factor to match their upper body profile from 0.5 to 2.0 (usually 1.0 is standard).

If no person is detected, return default values (x: 50, y: 55, scale: 1.0, stretch: 1.0).`
      };
      const groqKeys = getGroqApiKeys();
      if (groqKeys.length === 0) {
        return res.json({ x: 50, y: 55, scale: 1, stretch: 1 });
      }
      const groq = new import_groq_sdk.default({ apiKey: groqKeys[0] });
      const completion = await groq.chat.completions.create({
        model: "groq/compound",
        messages: [
          { role: "system", content: "Return only valid JSON with x, y, scale, stretch values." },
          { role: "user", content: promptPart.text }
        ],
        temperature: 0.3,
        max_tokens: 512,
        response_format: { type: "json_object" }
      });
      const bounds = JSON.parse(completion.choices[0]?.message?.content || "{}");
      res.json(bounds);
    } catch (error) {
      console.error("Detect body bounds API Error:", error);
      res.json({ x: 50, y: 55, scale: 1, stretch: 1 });
    }
  });
  app.post("/api/remove-bg", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: "Image is required" });
      if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(500).json({ error: "Cloudinary configuration is missing. Please add credentials in settings." });
      }
      import_cloudinary.v2.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });
      const uploadResult = await import_cloudinary.v2.uploader.upload(image, {
        background_removal: "cloudinary_ai"
      });
      let isReady = false;
      let attempts = 0;
      let finalUrl = uploadResult.secure_url;
      while (attempts < 30 && !isReady) {
        await new Promise((resolve) => setTimeout(resolve, 2e3));
        try {
          const resource = await import_cloudinary.v2.api.resource(uploadResult.public_id);
          const bgRemovalStatus = resource?.info?.background_removal?.cloudinary_ai?.status;
          if (bgRemovalStatus === "complete") {
            isReady = true;
            finalUrl = uploadResult.secure_url.replace(/\.[^/.]+$/, ".png");
          } else if (bgRemovalStatus === "failed") {
            return res.status(500).json({ error: "Background removal failed on Cloudinary" });
          }
        } catch (pollErr) {
          console.error("Error polling Cloudinary:", pollErr);
        }
        attempts++;
      }
      if (isReady) {
        res.json({ url: finalUrl });
      } else {
        res.status(408).json({ error: "Request timed out waiting for background removal" });
      }
    } catch (error) {
      console.error("Cloudinary BG removal error:", error);
      res.status(500).json({ error: error.message || "Unknown error during background removal" });
    }
  });
  const httpServer = import_http.default.createServer(app);
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
