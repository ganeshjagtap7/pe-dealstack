"""
LangExtract Deep Extraction Microservice
Flask API for PE-specific deep document extraction using LangExtract.
Handles long CIMs (50-200+ pages) with chunking, multi-pass extraction,
and character-level source grounding.
"""

import os
import json
import logging
from flask import Flask, request, jsonify

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import langextract — graceful fallback if not installed
try:
    from langextract import extract as langextract_extract
    LANGEXTRACT_AVAILABLE = True
except ImportError:
    LANGEXTRACT_AVAILABLE = False
    logger.warning("langextract not installed. Install with: pip install langextract")

# PE-specific extraction prompt
PE_EXTRACTION_PROMPT = """You are a senior private equity analyst. Extract ALL of the following data points
from this document with high accuracy. For financial figures, convert to millions USD.

Required extractions:
1. Company Name / Target Name
2. Industry / Sector
3. Revenue (annual, in $M)
4. EBITDA (in $M)
5. EBITDA Margin (%)
6. Revenue Growth Rate (%)
7. Number of Employees
8. Headquarters Location
9. Key Investment Risks (list)
10. Investment Highlights / Strengths (list)
11. Any other financial metrics (debt, capex, working capital, etc.)

For each data point, note the exact text from the document that supports your extraction.
Return structured JSON with all findings."""


def transform_to_deal_schema(raw_extractions):
    """Transform LangExtract raw entities into our deal schema."""
    deal_data = {
        "companyName": None,
        "industry": None,
        "revenue": None,
        "ebitda": None,
        "ebitdaMargin": None,
        "revenueGrowth": None,
        "employees": None,
        "headquarters": None,
        "keyRisks": [],
        "investmentHighlights": [],
        "financialMetrics": [],
        "sourceGroundings": [],
    }

    if not raw_extractions:
        return deal_data

    for extraction in raw_extractions:
        entity = extraction.get("entity", "").lower()
        value = extraction.get("value", "")
        source = extraction.get("source", "")

        grounding = {"entity": entity, "value": value, "source": source}
        deal_data["sourceGroundings"].append(grounding)

        # Map extracted entities to deal fields
        if any(k in entity for k in ["company name", "target", "company", "entity name"]):
            if not deal_data["companyName"]:
                deal_data["companyName"] = value

        elif any(k in entity for k in ["industry", "sector", "vertical", "market"]):
            if not deal_data["industry"]:
                deal_data["industry"] = value

        elif any(k in entity for k in ["revenue", "sales", "top line"]):
            try:
                num = float(str(value).replace("$", "").replace(",", "").replace("M", "").replace("m", "").strip())
                if not deal_data["revenue"]:
                    deal_data["revenue"] = num
            except (ValueError, TypeError):
                pass

        elif any(k in entity for k in ["ebitda margin"]):
            try:
                num = float(str(value).replace("%", "").strip())
                if not deal_data["ebitdaMargin"]:
                    deal_data["ebitdaMargin"] = num
            except (ValueError, TypeError):
                pass

        elif any(k in entity for k in ["ebitda", "earnings"]):
            try:
                num = float(str(value).replace("$", "").replace(",", "").replace("M", "").replace("m", "").strip())
                if not deal_data["ebitda"]:
                    deal_data["ebitda"] = num
            except (ValueError, TypeError):
                pass

        elif any(k in entity for k in ["revenue growth", "growth rate", "cagr"]):
            try:
                num = float(str(value).replace("%", "").strip())
                if not deal_data["revenueGrowth"]:
                    deal_data["revenueGrowth"] = num
            except (ValueError, TypeError):
                pass

        elif any(k in entity for k in ["employees", "headcount", "staff"]):
            try:
                num = int(float(str(value).replace(",", "").strip()))
                if not deal_data["employees"]:
                    deal_data["employees"] = num
            except (ValueError, TypeError):
                pass

        elif any(k in entity for k in ["headquarters", "hq", "location", "based in"]):
            if not deal_data["headquarters"]:
                deal_data["headquarters"] = value

        elif any(k in entity for k in ["risk", "concern", "weakness", "threat"]):
            deal_data["keyRisks"].append(value)

        elif any(k in entity for k in ["highlight", "strength", "opportunity", "advantage"]):
            deal_data["investmentHighlights"].append(value)

        else:
            # Other financial metrics
            deal_data["financialMetrics"].append({"name": entity, "value": value, "source": source})

    return deal_data


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "service": "langextract",
        "langextract_available": LANGEXTRACT_AVAILABLE,
    })


@app.route("/extract", methods=["POST"])
def extract():
    """
    Extract structured deal data from text.

    Request body:
    {
        "text": "document text...",
        "model": "gemini-2.5-flash" (optional),
        "extraction_passes": 3 (optional),
        "max_workers": 10 (optional)
    }
    """
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing 'text' field in request body"}), 400

    text = data["text"]
    if not text or len(text.strip()) < 50:
        return jsonify({"error": "Text is too short for extraction (min 50 chars)"}), 400

    model = data.get("model", "gemini-2.5-flash")
    extraction_passes = data.get("extraction_passes", 3)
    max_workers = data.get("max_workers", 10)

    logger.info(f"Extraction request: {len(text)} chars, model={model}, passes={extraction_passes}")

    if not LANGEXTRACT_AVAILABLE:
        return jsonify({
            "error": "langextract library not installed",
            "hint": "Run: pip install langextract",
        }), 503

    try:
        # Run LangExtract
        raw_result = langextract_extract(
            text=text,
            prompt=PE_EXTRACTION_PROMPT,
            model=model,
            num_extractions=extraction_passes,
            max_workers=max_workers,
        )

        # Transform raw extractions into deal schema
        raw_extractions = raw_result if isinstance(raw_result, list) else []
        deal_data = transform_to_deal_schema(raw_extractions)

        return jsonify({
            "success": True,
            "dealData": deal_data,
            "rawExtractions": raw_extractions,
            "extractionCount": len(raw_extractions),
        })

    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
        }), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    debug = os.environ.get("FLASK_ENV", "production") == "development"
    logger.info(f"Starting LangExtract service on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
