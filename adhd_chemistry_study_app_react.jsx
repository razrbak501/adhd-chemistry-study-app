import React, { useEffect, useMemo, useState } from "react";

/**
 * ADHD-Friendly Chemistry Study App (Grade 10)
 * -------------------------------------------------------------
 * - Upload a JSON file of multiple-choice questions.
 * - Upload a JSON file of classic rock trivia facts.
 * - Trivia is shown after 2 consecutive correct answers, facts are non-repeating.
 */

// -------------- helpers --------------
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function speak(text: string) {
  if (typeof window === "undefined") return;
  const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.03;
  u.pitch = 1;
  u.lang = "en-US";
  synth.cancel();
  synth.speak(u);
}

// -------------- types --------------
export type RawItem = {
  question?: string; q?: string;
  choices?: string[]; options?: string[]; distractors?: string[];
  answer?: string; answerIndex?: number; a?: string;
};

export type Item = {
  id: string;
  question: string;
  choices: string[];
  answer: string;
};

function normalize(raw: RawItem, idx: number): Item | null {
  const question = (raw.question ?? raw.q ?? "").toString().trim();
  let choices = (raw.choices ?? raw.options ?? []) as string[];
  if ((!choices || choices.length === 0) && raw.a) {
    const distractors = (raw.distractors ?? []) as string[];
    choices = [raw.a, ...distractors];
  }
  const answer = ((): string | null => {
    if (typeof raw.answer === "string") return raw.answer.trim();
    if (typeof raw.answerIndex === "number" && choices && choices[raw.answerIndex]) return choices[raw.answerIndex];
    if (typeof raw.a === "string") return raw.a.trim();
    return null;
  })();

  const cleanChoices = Array.isArray(choices) ? choices.map((c) => c?.toString().trim()).filter(Boolean) : [];
  if (!question || cleanChoices.length < 2 || !answer) return null;
  const uniqueChoices = Array.from(new Set(cleanChoices));
  return { id: `q-${idx}`, question, choices: uniqueChoices, answer };
}

// -------------- main component --------------
export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState<null | "correct" | "wrong">(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [tts, setTts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [trivia, setTrivia] = useState<string | null>(null);
  const [availableTrivia, setAvailableTrivia] = useState<string[]>([]);

  const current: Item | null = useMemo(() => {
    if (!items.length || !order.length) return null;
    const idx = order[i] ?? 0;
    return items[idx] ?? null;
  }, [items, order, i]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        next();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skip();
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const choice = visibleChoices()[idx];
        if (choice) select(choice);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, i, items, order]);

  function visibleChoices(): string[] {
    if (!current) return [];
    const others = current.choices.filter((c) => c !== current.answer);
    const base = shuffle([current.answer, ...others]).slice(0, Math.max(4, Math.min(4, current.choices.length)));
    return base.length >= 2 ? base : shuffle(current.choices);
  }

  function onUploadQuestions(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read file.");
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || "[]")) as RawItem[];
        if (!Array.isArray(json)) throw new Error("JSON must be an array of items");
        const normalized = json.map(normalize).filter(Boolean) as Item[];
        if (!normalized.length) throw new Error("No valid questions found.");
        setItems(normalized);
        setOrder(shuffle([...normalized.keys()]));
        setI(0);
        setPicked(null);
        setShowFeedback(null);
        setScore({ correct: 0, total: 0 });
        if (tts) speak(`Loaded ${normalized.length} questions.`);
      } catch (err: any) {
        setError(err?.message || "Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  function onUploadTrivia(file: File | undefined | null) {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read trivia file.");
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || "[]"));
        if (!Array.isArray(json)) throw new Error("Trivia JSON must be an array of strings.");
        setAvailableTrivia(shuffle(json));
      } catch (err: any) {
        setError(err?.message || "Invalid trivia JSON file.");
      }
    };
    reader.readAsText(file);
  }

  function select(choice: string) {
    if (!current) return;
    if (picked) return;
    setPicked(choice);
    const isCorrect = choice === current.answer;
    setShowFeedback(isCorrect ? "correct" : "wrong");
    setScore((s) => ({ correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1 }));

    if (isCorrect) {
      const newStreak = streak + 1;
      if (newStreak >= 2 && availableTrivia.length > 0) {
        const [fact, ...rest] = availableTrivia;
        setTrivia(fact);
        setAvailableTrivia(rest);
        setStreak(0);
      } else {
        setStreak(newStreak);
      }
    } else {
      setStreak(0);
    }

    if (tts) speak(isCorrect ? "Correct! Nice work." : `Not quite. The correct answer is ${current.answer}.`);
  }

  function next() {
    if (!items.length) return;
    setPicked(null);
    setShowFeedback(null);
    setI((k) => (k + 1 < order.length ? k + 1 : 0));
  }

  function skip() {
    setOrder((ord) => {
      if (!ord.length) return ord;
      const cur = ord[i];
      const rest = ord.filter((_, idx) => idx !== i);
      return [...rest, cur];
    });
    setPicked(null);
    setShowFeedback(null);
  }

  const pct = items.length ? Math.round(((i + (picked ? 1 : 0)) / order.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {trivia && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-20">
          <div className="bg-white p-6 rounded shadow-xl max-w-sm text-center">
            <h2 className="text-lg font-bold mb-2">Classic Rock Trivia</h2>
            <p className="mb-4">{trivia}</p>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={() => setTrivia(null)}>Close</button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">ADHD-Friendly Chemistry Coach</h1>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 select-none">
              <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} />
              Read aloud
            </label>
            <div>
              <span className="mr-2">Upload Trivia:</span>
              <input type="file" accept=".json,application/json" onChange={(e) => onUploadTrivia(e.target.files?.[0] || null)} />
            </div>
            <a
              href={URL.createObjectURL(new Blob([
                JSON.stringify([
                  { question: "Which subatomic particle has a negative charge?", choices: ["Proton", "Neutron", "Electron", "Alpha particle"], answer: "Electron" },
                  { question: "What is the chemical symbol for sodium?", choices: ["Na", "S", "Sn", "N"], answer: "Na" }
                ], null, 2)
              ], { type: "application/json" }))}
              download="chemistry_questions_sample.json"
              className="underline text-indigo-700 hover:text-indigo-900 ml-4"
            >
              Download sample JSON
            </a>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex-1">
            <div className="font-medium">Upload your questions (.json)</div>
            {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => onUploadQuestions(e.target.files?.[0] || null)}
              className="block text-sm"
            />
          </label>
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-4 pb-10">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          {!current ? (
            <div className="text-gray-600 text-sm">Upload a JSON file to begin.</div>
          ) : (
            <>
              <div className="mb-4">
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-xs text-gray-500">Question {i + 1} of {order.length} • Score: {score.correct}/{score.total}</div>
              </div>

              <h2 className="text-base font-semibold leading-snug">{current.question}</h2>

              <div className="mt-4 grid gap-2">
                {visibleChoices().map((choice, idx) => {
                  const chosen = picked === choice;
                  const isCorrect = choice === current.answer;
                  const show = !!showFeedback;
                  const base = "w-full text-left px-4 py-3 rounded-lg border transition outline-none";
                  const normal = "bg-white border-gray-300 hover:bg-gray-50";
                  const pickedCls = chosen && !show ? "ring-2 ring-indigo-400" : "";
                  const feedbackCls = show
                    ? isCorrect
                      ? "bg-green-50 border-green-300"
                      : chosen
                        ? "bg-red-50 border-red-300"
                        : "opacity-80"
                    : "";
                  return (
                    <button
                      key={choice}
                      className={[base, normal, pickedCls, feedbackCls].filter(Boolean).join(" ")}
                      onClick={() => select(choice)}
                      disabled={!!picked}
                      aria-pressed={chosen}
                    >
                      <span className="mr-2 text-xs text-gray-500">{idx + 1}.</span>
                      {choice}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {showFeedback === "correct" && (
                  <div className="text-green-700 text-sm">Nice! That’s correct.</div>
                )}
                {showFeedback === "wrong" && (
                  <div className="text-red-700 text-sm">Not quite — correct answer: <strong>{current.answer}</strong></div>
                )}
                <div className="ml-auto flex gap-2">
                  <button className="px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50" onClick={skip}>
                    Skip (S)
                  </button>
                  <button className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700" onClick={next}>
                    Next (N)
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
