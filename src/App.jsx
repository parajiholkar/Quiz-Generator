import { useState } from 'react'
import { generateQuizFile } from './lib/gemini'
import { parseWorkbookForPreview, downloadWorkbook } from './lib/workbookPreview'

const SHEET_ORDER = ['Quiz', 'Questions', 'Options', 'Quiz_Questions']

function SheetTable({ rows }) {
  if (!rows || rows.length === 0) return <p className="empty">No rows.</p>
  const [header, ...body] = rows
  return (
    <div className="sheet-scroll">
      <table className="sheet-table">
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {header.map((_, c) => (
                <td key={c}>{String(row[c] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CodeLog({ entries }) {
  const [open, setOpen] = useState(false)
  if (!entries?.length) return null
  return (
    <div className="codelog">
      <button type="button" className="codelog__toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} How it built this ({entries.length} step{entries.length > 1 ? 's' : ''})
      </button>
      {open && (
        <div className="codelog__body">
          {entries.map((entry, i) =>
            entry.type === 'code' ? (
              <pre key={i} className="codelog__code">
                <code>{entry.code}</code>
              </pre>
            ) : (
              <pre key={i} className="codelog__result">
                {entry.output}
              </pre>
            )
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gemini-3.5-flash')
  const [prompt, setPrompt] = useState('')
  const [numQuestions, setNumQuestions] = useState(5)
  const [quizType, setQuizType] = useState('topic')
  const [timeLimit, setTimeLimit] = useState(10)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { fileBase64, fileMimeType, preview, codeLog, sheets }
  const [activeSheet, setActiveSheet] = useState('Quiz')
  const [downloadedName, setDownloadedName] = useState('')

  async function handleGenerate(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    setDownloadedName('')
    setLoading(true)
    try {
      const res = await generateQuizFile({ apiKey, model, prompt, numQuestions, quizType, timeLimit })
      const sheets = parseWorkbookForPreview(res.fileBase64)
      setResult({ ...res, sheets })
      const firstSheet = SHEET_ORDER.find((s) => sheets[s]) || Object.keys(sheets)[0]
      setActiveSheet(firstSheet)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const title = result.preview?.quiz_title || 'quiz'
    const filename = `${title.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.xlsx`
    downloadWorkbook(result.fileBase64, result.fileMimeType, filename)
    setDownloadedName(filename)
  }

  const sheetNames = result ? SHEET_ORDER.filter((s) => result.sheets[s]) : []

  return (
    <div className="page">
      <header className="header">
        <p className="header__eyebrow">Quiz Agent · Gemini writes the .xlsx itself</p>
        <h1 className="header__title">Describe the quiz. Get the workbook.</h1>
        <p className="header__sub">
          Gemini generates the questions and builds the actual Excel file in its own sandbox,
          this app just shows you what came back and lets you download it.
        </p>
      </header>

      <form className="panel" onSubmit={handleGenerate}>
        <div className="field">
          <label htmlFor="apiKey">Gemini API key</label>
          <input
            id="apiKey"
            type="password"
            placeholder="Paste your key — stays in this browser tab only"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="prompt">What quiz do you want?</label>
          <textarea
            id="prompt"
            rows={4}
            placeholder="e.g. 8 medium-to-hard questions on the Indian Constitution's Fundamental Rights, for a mock exam."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
          />
        </div>

        <div className="field-row">
          <div className="field field--narrow">
            <label htmlFor="numQuestions">Questions (default)</label>
            <input
              id="numQuestions"
              type="number"
              min={1}
              max={25}
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
            />
          </div>
          <div className="field field--narrow">
            <label htmlFor="quizType">Quiz type (default)</label>
            <select id="quizType" value={quizType} onChange={(e) => setQuizType(e.target.value)}>
              <option value="daily">daily</option>
              <option value="topic">topic</option>
              <option value="mock">mock</option>
            </select>
          </div>
          <div className="field field--narrow">
            <label htmlFor="timeLimit">Time limit (min)</label>
            <input
              id="timeLimit"
              type="number"
              min={1}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="model">Gemini model</label>
            <input id="model" type="text" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <p className="hint">
          Mention count, difficulty, or type directly in your request above and Gemini will follow
          that instead the fields above are just fallback defaults.
        </p>

        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Generating workbook…' : 'Generate quiz'}
        </button>

        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <section className="results">
          <div className="results__header">
            <h2>{result.preview?.quiz_title || 'Quiz workbook'}</h2>
            <button className="btn btn--secondary" type="button" onClick={handleDownload}>
              Download .xlsx
            </button>
          </div>
          {downloadedName && <p className="downloaded">Saved as {downloadedName}</p>}

          <div className="tabs">
            {sheetNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`tab ${activeSheet === name ? 'tab--active' : ''}`}
                onClick={() => setActiveSheet(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <SheetTable rows={result.sheets[activeSheet]} />

          <CodeLog entries={result.codeLog} />
        </section>
      )}
    </div>
  )
}
