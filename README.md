# Quiz Agent

A React app with a Gemini-powered agent inside it. You describe the quiz you want in
plain language, and Gemini itself writes the questions **and** builds the actual
`.xlsx` file matching the format (Quiz / Questions /
Options / Quiz_Questions sheets) — using its own Python code execution sandbox
(`openpyxl`). This app never builds or edits the spreadsheet itself; it only asks
Gemini for it, shows you what came back, and lets you download it.

## Setup

You'll need [Node.js](https://nodejs.org) 18+ installed.

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

## Getting a Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey).
2. Create an API key.
3. Paste it into the app's "Gemini API key" field.

The key only ever lives in the browser tab's memory (React state). It's never
written to disk, logged, or sent anywhere except straight to Google's Gemini API.
Refreshing the tab clears it.

## Using the app

1. Paste your Gemini API key.
2. In the prompt box, describe the quiz you want topic, count, difficulty,
   quiz type, whatever matters to you. For example:
   *"8 medium-to-hard questions on the Indian Constitution's Fundamental Rights,
   for a mock exam, 15 minutes."*
3. The fields below the prompt (question count, quiz type, time limit) are just
   fallback defaults if your prompt already says how many questions or what
   type, Gemini follows the prompt.
4. Click **Generate quiz**. Gemini writes the questions, then uses its code
   execution sandbox to build the actual workbook and hands the real file bytes
   back to the app.
5. The app shows the returned workbook as tabs one per sheet (Quiz, Questions,
   Options, Quiz_Questions) exactly as Gemini built it, plus a collapsible
   "how it built this" section showing the Python code it ran.
6. Click **Download .xlsx** to save the exact bytes Gemini generated.

## How it works under the hood

`src/lib/gemini.js` sends a request to Gemini's `generateContent` endpoint with:

- A `systemInstruction` that pins down the exact schema (sheet names, column
  headers, ID linking rules) and tells Gemini to use its Python sandbox
  (`openpyxl` is available there) to build the file and save it as `quiz.xlsx`.
- The `codeExecution` tool enabled, so Gemini can actually run that Python.
- Your free-form prompt plus the fallback defaults.

Gemini's sandbox returns the finished file as a base64 `inlineData` part, which
we decode and hand straight to the browser untouched. Gemini also returns a
short JSON summary (for the quiz title and the tab preview), but the workbook
itself is never rebuilt or re-derived from that JSON.

## Changing the Gemini model

The model field defaults to `gemini-3.5-flash`, which supports code execution.
If you see a "model not found" error, check
[ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)
to confirm the model you typed supports the code execution tool.

## Project structure

```
src/
  App.jsx                  — UI: prompt form, loading/error states, sheet-tab preview
  App.css                  — visual styling
  lib/gemini.js             — calls Gemini with the code execution tool + system prompt
  lib/workbookPreview.js    — reads the bytes Gemini returns for preview/download only
```