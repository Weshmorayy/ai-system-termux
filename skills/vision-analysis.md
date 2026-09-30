# Skill: vision-analysis

## When to use
Any task involving image, screenshot, diagram, PDF, or visual content.

## Routing decision
1. **Direct vision available?** → Use multimodal model directly
   - Best: Gemini 2.5 Flash (1M ctx, PDF/image/video/audio)
   - Fast: Groq Qwen 3.8 27B (vision + tool use, 3 images max)
   - NVIDIA: GLM-5.3-Flash (free multimodal)

2. **Task is text/document extraction?** → Use OCR specialist
   - Mistral OCR 4 (bounding boxes, confidence, structured output)
   - Gemini (PDF understanding)

3. **No vision model available?** → TEXT-ONLY FALLBACK
   ⚠️ Always notify: "Visual fidelity reduced — no vision model available"
   ```
   image → OCR → structured description → text model
   ```
   Description must include: exact text, coordinates, dimensions,
   colors (if important), component hierarchy, visible errors.
   NEVER produce a vague description like "The screenshot shows a website."

## For UI/screenshot debugging
Prefer this pipeline:
```
screenshot
 ├── direct vision model (overall layout, visual bugs)
 ├── OCR (exact text)
 └── DOM/accessibility data (actual structure — better than screenshot for web)
```
Playwright MCP provides accessibility snapshots without needing vision.

## For PDFs
- Structured text extraction → Mistral OCR 4
- Understanding content / reasoning → Gemini with PDF input

## Output format for text-only fallback
```json
{
  "summary": "...",
  "ui_elements": [],
  "text_content": [],
  "layout": {},
  "errors_visible": [],
  "important_details": [],
  "uncertainties": []
}
```
