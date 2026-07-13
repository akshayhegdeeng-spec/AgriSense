// C:\Users\aksha\Desktop\LLLLLLLLLLLLLLLLL\backend\server.js

const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 5000;
const PLANT_ID_API_KEY = process.env.PLANT_ID_API_KEY;

// Quick sanity log
console.log("PLANT_ID_API_KEY present?", !!PLANT_ID_API_KEY);

// Simple health route
app.get("/", (req, res) => {
  res.send("AgriSense backend running with Plant.id ✅");
});

// REAL pest / disease detection using Plant.id Health Assessment
app.post("/api/detect-pest", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(200).json({
        found: false,
        message: "No image sent from frontend.",
      });
    }

    if (!PLANT_ID_API_KEY) {
      return res.status(200).json({
        found: false,
        message: "Backend missing PLANT_ID_API_KEY in .env.",
      });
    }

    console.log(
      "POST /api/detect-pest – image length:",
      imageBase64.length
    );

    // ✅ Correct endpoint from docs:
    // {{HOST}}/api/v3/health_assessment?details=...
    // HOST = https://plant.id
    const apiUrl =
      "https://plant.id/api/v3/health_assessment" +
      "?details=local_name,description,url,treatment,classification,common_names,cause";

    const plantRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": PLANT_ID_API_KEY,
      },
      body: JSON.stringify({
        images: [imageBase64], // base64 (no data: prefix)
        // you can add extra params later (language, etc.)
      }),
    });

    // If Plant.id returns error, don't crash — send readable message
    if (!plantRes.ok) {
      const errorText = await plantRes.text();
      console.error("Plant.id API error:", plantRes.status, errorText);

      return res.status(200).json({
        found: false,
        message:
          "Plant.id API error: " +
          plantRes.status +
          ". Check API key / credits / request format.",
      });
    }

    const ident = await plantRes.json();
    console.log("Plant.id response OK");

    const result = ident.result || {};
    const disease = result.disease || {};
    const suggestions = Array.isArray(disease.suggestions)
      ? disease.suggestions
      : [];

    // If no issues found
    if (!suggestions.length) {
      const isHealthy = result.is_healthy?.binary;
      return res.status(200).json({
        found: false,
        message: isHealthy
          ? "Plant appears healthy. No major pest/disease detected."
          : "No clear pest/disease detected.",
      });
    }

    // Take top suggestion
    const top = suggestions[0];

    const name = top.name || "Unknown issue";
    const probability =
      typeof top.probability === "number"
        ? +(top.probability * 100).toFixed(1)
        : null;

    const details = top.details || {};
    const description =
      details.description || "No description provided by the API.";

    const treatment = details.treatment;
    const management = [];

    if (treatment && typeof treatment === "object") {
      // treatment may be a dict with keys like 'biological', 'chemical', 'prevention'
      if (Array.isArray(treatment.biological) && treatment.biological.length) {
        management.push("Biological: " + treatment.biological.join("; "));
      }
      if (Array.isArray(treatment.chemical) && treatment.chemical.length) {
        management.push("Chemical: " + treatment.chemical.join("; "));
      }
      if (Array.isArray(treatment.prevention) && treatment.prevention.length) {
        management.push("Prevention: " + treatment.prevention.join("; "));
      }
    } else if (typeof treatment === "string" && treatment.trim()) {
      management.push(treatment.trim());
    }

    if (!management.length) {
      management.push(
        "Follow locally recommended integrated pest and disease management practices."
      );
    }

    const severity = top.severity || disease.severity || "Not specified";

    const cropName =
      result.plant?.name ||
      result.plant?.name_common ||
      "Not specified";

    // Send back to frontend in the format your HTML expects
    return res.status(200).json({
      found: true,
      pestName: name,
      crop: cropName,
      severity,
      confidence: probability, // e.g. 87.3
      description,
      management,
    });
  } catch (err) {
    console.error("Error in /api/detect-pest:", err);
    return res.status(200).json({
      found: false,
      message: "Internal server error while calling Plant.id.",
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
