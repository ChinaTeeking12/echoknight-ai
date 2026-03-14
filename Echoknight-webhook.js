require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function verifySecret(req, res, next) {
  if (!WEBHOOK_SECRET) return next();
  const token = req.headers["x-webhook-secret"];
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
}

const SYSTEM_PROMPT = `
You are EchoknightAI. Analyse the X post given and return ONLY a JSON object like this:
{"tone_detected": "<🎩 Formal | 😄 Witty/Funny | 💙 Emotional | 🌹 Philosophical>", "draft_reply": "<your reply>"}
Rules:
- Match the post's tone exactly
- Be concise, under 280 characters preferred
- Sound like a thoughtful human, never robotic
- No harassment, hate speech, or violations
- Output raw JSON only, no markdown
`;

app.post("/webhook/echoknight", verifySecret, async (req, res) => {
  const { post_text, post_author, post_url, context } = req.body;

  if (!post_text || post_text.trim() === "") {
    return res.status(400).json({ error: "post_text is required." });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set." });
  }

  let userMessage = `POST: "${post_text.trim()}"`;
  if (post_author) userMessage += `\nAUTHOR: ${post_author}`;
  if (post_url)    userMessage += `\nURL: ${post_url}`;
  if (context)     userMessage += `\nCONTEXT: ${context}`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await anthropicRes.json();
    const rawText = data.content.filter(b => b.type === "text").map(b => b.text).join("");

    let parsed;
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      return res.status(200).json({ status: "success", draft_reply: rawText, label: "[DRAFT FOR YOUR REVIEW]" });
    }

    return res.status(200).json({
      status: "success",
      tone_detected: parsed.tone_detected || "Unknown",
      draft_reply: parsed.draft_reply || "",
      label: "[DRAFT FOR YOUR REVIEW]",
      reminder: "Review and manually post this reply on X.",
    });

  } catch (err) {
    return res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/", (req, res) => {
  res.json({ service: "EchoknightAI", status: "running", endpoint: "POST /webhook/echoknight" });
});

app.listen(PORT, () => console.log(`EchoknightAI running on port ${PORT}`));
