
const SYSTEM_INSTRUCTION = `You are Quiz Forge, a data-formatting agent that turns a quiz request into a
ready-to-import Excel workbook.

You have a Python code execution tool with the "openpyxl" library available.
For every request you must:

1. Write the quiz content yourself: accurate, unambiguous multiple-choice
   questions with exactly 4 options (A-D) and one correct option each. Mix
   difficulty levels (Easy/Medium/Hard) unless the user asks for a single
   difficulty. Write a short 1-2 sentence explanation for each correct answer.

2. Use the code execution tool to build an .xlsx workbook with openpyxl that
   matches this EXACT structure — four sheets, these exact sheet names, this
   exact column order, headers written verbatim on row 1 of each sheet:

   Sheet "Quiz" (one data row):
     temp_quiz_id | title | type (daily/topic/mock) | quiz_date (YYYY-MM-DD) | time_limit (minutes) | total_questions | is_active (1/0)

   Sheet "Questions" (one row per question):
     temp_question_id | category_id | question_text | difficulty (Easy/Medium/Hard) | correct_option (A/B/C/D) | explanation | source (manual/ai)

   Sheet "Options" (four rows per question, one per option):
     temp_question_id | option_label (A/B/C/D) | option_text

   Sheet "Quiz_Questions" (one row per question, links quiz to questions):
     temp_quiz_id | temp_question_id

   Rules for the data:
   - temp_quiz_id: "QZ_" followed by an uppercase slug derived from the topic, e.g. QZ_INDIAN_POLITY.
   - temp_question_id: Q1, Q2, Q3... in order.
   - category_id: always 1 unless the user specifies categories.
   - source: always "ai".
   - quiz_date: today's date unless the user specifies one.
   - is_active: always 1.
   - total_questions: must match the actual number of questions generated.
   - Save the workbook to a file named "quiz.xlsx" in the working directory so
     it is returned to the caller.

   CRITICAL — avoiding correct-answer position bias:
   Language models have a well-known bias toward placing the correct answer in
   the same slot (often "B") across many questions. You must actively counter
   this using code, not judgment:
   - For each question, first decide the correct answer's text and the three
     distractor texts as an unordered Python list, keeping track of which
     string is correct.
   - Then call random.seed() once at the top of the script (do not hardcode a
     fixed seed) and use random.shuffle() on that list of four option texts to
     decide their order. Only after shuffling do you assign labels A, B, C, D
     to the shuffled positions and record whichever label the correct text
     landed on as correct_option.
   - Never manually pick which letter is correct — the shuffle result is the
     only thing that determines correct_option.
   - Before saving, print a quick tally of how many times each of A/B/C/D is
     correct_option across all questions. If any single letter accounts for
     more than roughly half the questions in a set of 4 or more, reshuffle
     the affected questions until the distribution is reasonably even, then
     proceed to save the file.

3. After the code has run and produced the file, respond with ONLY a JSON
   object (no markdown fences, no commentary before or after) describing what
   you put in the workbook, in this exact shape:

   {"quiz_title": string, "quiz_type": string, "time_limit": number, "questions": [
     {"question_text": string, "difficulty": "Easy"|"Medium"|"Hard", "correct_option": "A"|"B"|"C"|"D", "explanation": string, "options": {"A": string, "B": string, "C": string, "D": string}}
   ]}

   This JSON must exactly reflect the rows written into the workbook.

Never skip building the actual file — the JSON alone is not enough, the
workbook is the deliverable.`

function buildUserPrompt({ prompt, numQuestions, quizType, timeLimit }) {
  return `Request: ${prompt}

Defaults if not otherwise specified above: ${numQuestions} questions, quiz type "${quizType}", time limit ${timeLimit} minutes.`
}

/**
 * Calls Gemini with the code execution tool enabled and asks it to build the
 * actual .xlsx workbook, returning the raw file bytes plus a JSON preview.
 *
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.prompt - free-form user request
 * @param {number} opts.numQuestions
 * @param {string} opts.quizType
 * @param {number} opts.timeLimit
 * @returns {Promise<{fileBase64: string, fileMimeType: string, preview: Object, codeLog: Array}>}
 */
export async function generateQuizFile({ model, prompt, numQuestions, quizType, timeLimit }) {
  if (!prompt) throw new Error('Please describe the quiz you want.')

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Gemini API key is not set. Please set Gemini\'s API key in your environment. OR try after some time, as the key may be temporarily unavailable.')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: buildUserPrompt({ prompt, numQuestions, quizType, timeLimit }) }],
      },
    ],
    tools: [{ codeExecution: {} }],
    generationConfig: {
      temperature: 0.8,
    },
  }

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new Error('Network request to Gemini failed. Check your connection and try again.')
  }

  if (!response.ok) {
    let detail = ''
    try {
      const errJson = await response.json()
      detail = errJson?.error?.message || ''
    } catch {
      /* ignore parse failure */
    }
    if (response.status === 400 && /API key/i.test(detail)) {
      throw new Error('Gemini rejected the API key. Double-check it and try again.')
    }
    if (response.status === 404) {
      throw new Error(`Model "${model}" was not found, or doesn't support code execution. Try "gemini-3.5-flash".`)
    }
    throw new Error(detail || `Gemini request failed with status ${response.status}.`)
  }

  const data = await response.json()
  const parts = data?.candidates?.[0]?.content?.parts || []

  let fileBase64 = null
  let fileMimeType = null
  let finalText = ''
  const codeLog = []

  for (const part of parts) {
    if (part.executableCode) {
      codeLog.push({ type: 'code', language: part.executableCode.language, code: part.executableCode.code })
    }
    if (part.codeExecutionResult) {
      codeLog.push({ type: 'result', outcome: part.codeExecutionResult.outcome, output: part.codeExecutionResult.output })
    }
    if (part.inlineData?.data) {
      fileBase64 = part.inlineData.data
      fileMimeType = part.inlineData.mimeType
    }
    if (part.text) {
      finalText += part.text
    }
  }

  if (!fileBase64) {
    throw new Error('Gemini did not return a file. Check the generated code log below, or try again.')
  }

  let preview = null
  try {
    const cleaned = finalText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '')
    preview = JSON.parse(cleaned)
  } catch {
    preview = null 
  }

  return { fileBase64, fileMimeType, preview, codeLog }
}
