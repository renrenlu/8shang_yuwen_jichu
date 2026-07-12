"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import questionBank from "./question-bank.json";

type Question = {
  id: string;
  canonicalId: string;
  number: number;
  label?: string;
  prompt: string;
  answer: string;
  mode: "choice" | "self";
  sourcePage?: number | null;
  answerPage?: number | null;
  needsSource?: boolean;
};

type Section = {
  id: string;
  title: string;
  sourceFolder?: string;
  accent: string;
  icon: string;
  questionCount: number;
  questions: Question[];
};

type Session = {
  title: string;
  subtitle: string;
  questions: Array<Question & { sectionId: string; sectionTitle: string }>;
  retry?: boolean;
};

type WrongEntry = { questionId: string; sectionId: string; addedAt: number; attempts: number };
type Stats = { answered: number; correct: number; sessions: number };
type ModalPage = { sectionId: string; page: number; label: string } | null;

const builtInSections = questionBank.sections as Section[];
const LETTERS = ["A", "B", "C", "D"];
const STORAGE = {
  wrong: "yuwen-wrong-v1",
  stats: "yuwen-stats-v1",
  extra: "yuwen-extra-sections-v1",
  cycle: "yuwen-cycle-v1",
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function groupKey(sectionId: string) {
  return sectionId.startsWith("ziyin-") ? "ziyin" : sectionId;
}

function imagePath(sectionId: string, page: number) {
  return `/source/${sectionId}/page-${String(page).padStart(2, "0")}.jpg`;
}

function questionCropPath(sectionId: string, questionId: string) {
  return `/question-crops/${sectionId}/${questionId}.webp`;
}

function sectionIllustrationPath(sectionId: string) {
  return `/illustrations/${sectionId}.jpg`;
}

export default function Home() {
  const [extraSections, setExtraSections] = useState<Section[]>([]);
  const [view, setView] = useState<"home" | "practice" | "wrong">("home");
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [marked, setMarked] = useState<boolean | null>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [wrongEntries, setWrongEntries] = useState<WrongEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ answered: 0, correct: 0, sessions: 0 });
  const [modalPage, setModalPage] = useState<ModalPage>(null);
  const [notice, setNotice] = useState("");
  const [cycleRevision, setCycleRevision] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWrongEntries(readJson<WrongEntry[]>(STORAGE.wrong, []));
    setStats(readJson<Stats>(STORAGE.stats, { answered: 0, correct: 0, sessions: 0 }));
    setExtraSections(readJson<Section[]>(STORAGE.extra, []));
  }, []);

  const sections = useMemo(() => [...builtInSections, ...extraSections], [extraSections]);
  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const questionById = useMemo(() => {
    const entries: Array<[string, Question & { sectionId: string; sectionTitle: string }]> = [];
    sections.forEach((section) =>
      section.questions.forEach((question) =>
        entries.push([question.id, { ...question, sectionId: section.id, sectionTitle: section.title }]),
      ),
    );
    return new Map(entries);
  }, [sections]);

  function saveWrong(next: WrongEntry[]) {
    setWrongEntries(next);
    window.localStorage.setItem(STORAGE.wrong, JSON.stringify(next));
  }

  function saveStats(next: Stats) {
    setStats(next);
    window.localStorage.setItem(STORAGE.stats, JSON.stringify(next));
  }

  function drawPlans(plans: Array<{ section: Section; count: number }>) {
    const cycleState = readJson<Record<string, string[]>>(STORAGE.cycle, {});
    const blocked = new Set<string>();
    const picked: Array<Question & { sectionId: string; sectionTitle: string }> = [];

    for (const plan of plans) {
      const key = groupKey(plan.section.id);
      const groupSections = sections.filter((item) => groupKey(item.id) === key);
      const groupUniverse = new Set(groupSections.flatMap((item) => item.questions.map((question) => question.canonicalId)));
      let seen = new Set(cycleState[key] ?? []);
      let candidates = shuffle(
        plan.section.questions.filter((question) => !seen.has(question.canonicalId) && !blocked.has(question.canonicalId)),
      );
      const selection: Question[] = candidates.slice(0, plan.count);

      if (selection.length < plan.count) {
        const remainingInCycle = [...groupUniverse].filter((id) => !seen.has(id) && !blocked.has(id));
        const matchingRemaining = shuffle(
          plan.section.questions.filter((question) => remainingInCycle.includes(question.canonicalId)),
        );
        for (const question of matchingRemaining) {
          if (selection.length >= plan.count) break;
          if (!selection.some((item) => item.canonicalId === question.canonicalId)) selection.push(question);
        }
      }

      if (selection.length < plan.count) {
        seen = new Set();
        candidates = shuffle(
          plan.section.questions.filter(
            (question) => !blocked.has(question.canonicalId) && !selection.some((item) => item.canonicalId === question.canonicalId),
          ),
        );
        selection.push(...candidates.slice(0, plan.count - selection.length));
      }

      selection.forEach((question) => {
        blocked.add(question.canonicalId);
        seen.add(question.canonicalId);
        picked.push({ ...question, sectionId: plan.section.id, sectionTitle: plan.section.title });
      });
      cycleState[key] = [...seen];
    }

    window.localStorage.setItem(STORAGE.cycle, JSON.stringify(cycleState));
    setCycleRevision((value) => value + 1);
    return shuffle(picked);
  }

  function beginSession(next: Session) {
    setSession(next);
    setIndex(0);
    setSelected(null);
    setRevealed(false);
    setMarked(null);
    setSessionCorrect(0);
    setSessionWrong(0);
    setView("practice");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startSection(section: Section) {
    const count = Math.min(20, section.questions.length);
    beginSession({
      title: section.title,
      subtitle: `本次 ${count} 题 · 本轮全部出现前不重复`,
      questions: drawPlans([{ section, count }]),
    });
  }

  function startComprehensive() {
    if (!sections.length) return;
    const order = shuffle(sections);
    const base = Math.floor(30 / sections.length);
    const remainder = 30 % sections.length;
    const plans = order.map((section, position) => ({
      section,
      count: Math.min(section.questions.length, base + (position < remainder ? 1 : 0)),
    }));
    const questions = drawPlans(plans);
    beginSession({
      title: "综合练习",
      subtitle: `${questions.length} 题 · 各板块等比例抽取`,
      questions,
    });
  }

  function startWrongRetry() {
    const questions = wrongEntries
      .map((entry) => questionById.get(entry.questionId))
      .filter((question): question is Question & { sectionId: string; sectionTitle: string } => Boolean(question));
    if (!questions.length) {
      setNotice("错题本已经清空啦！");
      return;
    }
    beginSession({
      title: "错题再练",
      subtitle: `${questions.length} 题 · 答对后自动移出错题本`,
      questions: shuffle(questions),
      retry: true,
    });
  }

  function addWrong(question: Question & { sectionId: string }) {
    const existing = wrongEntries.find((entry) => entry.questionId === question.id);
    const next = existing
      ? wrongEntries.map((entry) =>
          entry.questionId === question.id ? { ...entry, attempts: entry.attempts + 1, addedAt: Date.now() } : entry,
        )
      : [...wrongEntries, { questionId: question.id, sectionId: question.sectionId, addedAt: Date.now(), attempts: 1 }];
    saveWrong(next);
  }

  function removeWrong(questionId: string) {
    saveWrong(wrongEntries.filter((entry) => entry.questionId !== questionId));
  }

  function recordResult(correct: boolean) {
    if (!session || marked !== null) return;
    const question = session.questions[index];
    setMarked(correct);
    setSessionCorrect((value) => value + (correct ? 1 : 0));
    setSessionWrong((value) => value + (correct ? 0 : 1));
    saveStats({ ...stats, answered: stats.answered + 1, correct: stats.correct + (correct ? 1 : 0) });
    if (correct && session.retry) removeWrong(question.id);
    if (!correct) addWrong(question);
  }

  function chooseAnswer(letter: string) {
    if (!session || marked !== null) return;
    const question = session.questions[index];
    setSelected(letter);
    setRevealed(true);
    recordResult(letter === question.answer);
  }

  function nextQuestion() {
    if (!session) return;
    if (index >= session.questions.length - 1) {
      saveStats({ ...stats, sessions: stats.sessions + 1 });
      setIndex(session.questions.length);
      return;
    }
    setIndex((value) => value + 1);
    setSelected(null);
    setRevealed(false);
    setMarked(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goHome() {
    setView("home");
    setSession(null);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cycleProgress(section: Section) {
    void cycleRevision;
    const state = readJson<Record<string, string[]>>(STORAGE.cycle, {});
    const key = groupKey(section.id);
    const unique = new Set(
      sections.filter((item) => groupKey(item.id) === key).flatMap((item) => item.questions.map((question) => question.canonicalId)),
    ).size;
    return { seen: Math.min(state[key]?.length ?? 0, unique), total: unique };
  }

  async function importBank(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { sections?: Section[] } | Section[];
      const incoming = Array.isArray(parsed) ? parsed : parsed.sections;
      if (!incoming?.length) throw new Error("empty");
      const normalized = incoming.map((section, sectionIndex) => {
        if (!section.title || !Array.isArray(section.questions)) throw new Error("shape");
        const id = section.id || `custom-${Date.now()}-${sectionIndex}`;
        const questions = section.questions.map((question, questionIndex) => ({
          ...question,
          id: question.id || `${id}-${questionIndex + 1}`,
          canonicalId: question.canonicalId || `${id}-${questionIndex + 1}`,
          number: question.number || questionIndex + 1,
          answer: question.answer || "请自评",
          mode: question.mode === "choice" ? "choice" : "self",
        }));
        return {
          ...section,
          id,
          accent: section.accent || "#297a68",
          icon: section.icon || "新",
          questionCount: questions.length,
          questions,
        };
      });
      const existingIds = new Set([...builtInSections, ...extraSections].map((section) => section.id));
      const uniqueIncoming = normalized.filter((section) => !existingIds.has(section.id));
      if (!uniqueIncoming.length) throw new Error("duplicate");
      const next = [...extraSections, ...uniqueIncoming];
      setExtraSections(next);
      window.localStorage.setItem(STORAGE.extra, JSON.stringify(next));
      setNotice(`已加入 ${uniqueIncoming.length} 个新板块。`);
    } catch {
      setNotice("导入失败：请使用题库 JSON 模板，并确保板块编号不重复。");
    }
  }

  function exportWrong() {
    const payload = wrongEntries
      .map((entry) => ({ ...entry, question: questionById.get(entry.questionId) }))
      .filter((entry) => entry.question);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `语文错题本-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function resetProgress() {
    if (!window.confirm("确定清空练习进度、统计和错题本吗？题库不会被删除。")) return;
    [STORAGE.wrong, STORAGE.stats, STORAGE.cycle].forEach((key) => window.localStorage.removeItem(key));
    setWrongEntries([]);
    setStats({ answered: 0, correct: 0, sessions: 0 });
    setCycleRevision((value) => value + 1);
    setNotice("练习记录已清空。");
  }

  if (view === "practice" && session) {
    if (index >= session.questions.length) {
      const rate = session.questions.length ? Math.round((sessionCorrect / session.questions.length) * 100) : 0;
      return (
        <main className="practice-shell result-shell">
          <button className="text-button back-button" onClick={goHome}>← 返回首页</button>
          <section className="result-card">
            <div className="result-seal">{rate}</div>
            <p className="eyebrow">本次练习完成</p>
            <h1>{rate >= 90 ? "笔底生花，真不错！" : rate >= 70 ? "稳步积累，继续保持" : "错题已收好，再练一次吧"}</h1>
            <p className="result-copy">共完成 {session.questions.length} 题，答对 {sessionCorrect} 题，{sessionWrong} 题已加入错题本。</p>
            <div className="result-stats">
              <span><strong>{sessionCorrect}</strong>答对</span>
              <span><strong>{sessionWrong}</strong>待练</span>
              <span><strong>{rate}%</strong>正确率</span>
            </div>
            <div className="result-actions">
              <button className="primary-button" onClick={goHome}>回到板块</button>
              {wrongEntries.length > 0 && <button className="secondary-button" onClick={startWrongRetry}>立即再练错题</button>}
            </div>
          </section>
        </main>
      );
    }

    const question = session.questions[index];
    const section = sectionById.get(question.sectionId);
    const hasOriginalCrop = builtInSections.some((item) => item.id === question.sectionId);
    const progress = ((index + 1) / session.questions.length) * 100;
    return (
      <main className="practice-shell">
        <header className="practice-header">
          <button className="text-button back-button" onClick={goHome}>← 退出练习</button>
          <div className="practice-heading">
            <p className="eyebrow">{session.subtitle}</p>
            <h1>{session.title}</h1>
          </div>
          <div className="practice-count"><strong>{index + 1}</strong> / {session.questions.length}</div>
        </header>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>

        <section className="question-card" style={{ "--section-accent": section?.accent ?? "#b85c3f" } as React.CSSProperties}>
          <div className="question-meta">
            <span className="section-chip">{question.sectionTitle}</span>
            {question.label && <span>{question.label}</span>}
            <span>原资料第 {question.number} 题</span>
          </div>
          {hasOriginalCrop ? (
            <div className="original-question">
              <div className="original-question-label">
                <span>原题扫描</span>
                <span>加点、横线与编号已保留</span>
              </div>
              <div className="question-crop-scroll">
                <img
                  className="question-crop"
                  src={questionCropPath(question.sectionId, question.id)}
                  alt={`${question.sectionTitle}第 ${question.number} 题原题`}
                />
              </div>
              <details className="ocr-details">
                <summary>查看文字识别版</summary>
                <pre className="question-text">{question.prompt}</pre>
              </details>
            </div>
          ) : (
            <pre className="question-text">{question.prompt}</pre>
          )}

          <div className="source-actions">
            {question.sourcePage && builtInSections.some((item) => item.id === question.sectionId) && (
              <button className="source-button" onClick={() => setModalPage({ sectionId: question.sectionId, page: question.sourcePage!, label: "原题页" })}>
                查看原题页 {question.needsSource ? "（建议对照）" : ""}
              </button>
            )}
          </div>

          {question.mode === "choice" ? (
            <div className="choice-grid" aria-label="选择答案">
              {LETTERS.map((letter) => {
                const isCorrect = revealed && letter === question.answer;
                const isWrong = revealed && selected === letter && letter !== question.answer;
                return (
                  <button
                    key={letter}
                    className={`choice-button ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                    onClick={() => chooseAnswer(letter)}
                    disabled={revealed}
                  >
                    <span>{letter}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="self-check-panel">
              {!revealed ? (
                <button className="primary-button" onClick={() => setRevealed(true)}>完成作答，查看答案</button>
              ) : (
                <div className="self-actions">
                  <button className="mark-correct" onClick={() => recordResult(true)} disabled={marked !== null}>我答对了</button>
                  <button className="mark-wrong" onClick={() => recordResult(false)} disabled={marked !== null}>需要再练</button>
                </div>
              )}
            </div>
          )}

          {revealed && (
            <div className={`answer-panel ${marked === true ? "answer-correct" : marked === false ? "answer-wrong" : ""}`}>
              <div>
                <p className="answer-label">参考答案</p>
                <strong>{question.answer}</strong>
              </div>
              {question.answerPage && builtInSections.some((item) => item.id === question.sectionId) && (
                <button className="source-button" onClick={() => setModalPage({ sectionId: question.sectionId, page: question.answerPage!, label: "参考答案页" })}>
                  查看参考答案原页
                </button>
              )}
            </div>
          )}

          {marked !== null && (
            <div className="question-footer">
              <p>{marked ? "回答正确，继续保持。" : "这题已放入错题本。"}</p>
              <button className="primary-button" onClick={nextQuestion}>{index === session.questions.length - 1 ? "查看结果" : "下一题 →"}</button>
            </div>
          )}
        </section>

        {modalPage && <PageModal page={modalPage} onClose={() => setModalPage(null)} />}
      </main>
    );
  }

  if (view === "wrong") {
    const wrongQuestions = wrongEntries
      .map((entry) => ({ entry, question: questionById.get(entry.questionId) }))
      .filter((item) => item.question);
    return (
      <main className="page-shell">
        <header className="simple-header">
          <button className="text-button back-button" onClick={goHome}>← 返回首页</button>
          <div><p className="eyebrow">温故而知新</p><h1>错题本</h1></div>
          <button className="secondary-button compact" onClick={exportWrong} disabled={!wrongQuestions.length}>导出</button>
        </header>
        <section className="wrong-summary">
          <div><strong>{wrongQuestions.length}</strong><span>道待练习</span></div>
          <p>答对后会自动移出；反复出错的题会保留练习次数。</p>
          <button className="primary-button" onClick={startWrongRetry} disabled={!wrongQuestions.length}>开始错题再练</button>
        </section>
        <div className="wrong-list">
          {wrongQuestions.length ? wrongQuestions.map(({ entry, question }) => question && (
            <article className="wrong-item" key={entry.questionId}>
              <div className="wrong-index">{question.sectionTitle.slice(0, 1)}</div>
              <div>
                <p className="wrong-meta">{question.sectionTitle} · 第 {question.number} 题 · 已练 {entry.attempts} 次</p>
                <p className="wrong-prompt">{question.prompt.slice(0, 150)}{question.prompt.length > 150 ? "…" : ""}</p>
              </div>
              <button className="remove-button" onClick={() => removeWrong(question.id)}>移出</button>
            </article>
          )) : <div className="empty-state"><span>✓</span><h2>错题本是空的</h2><p>练习中答错的题会自动来到这里。</p></div>}
        </div>
      </main>
    );
  }

  const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
  return (
    <main className="page-shell">
      <header className="home-header">
        <a className="brand" href="#top" aria-label="语文必背练习册首页"><span>语</span><div><strong>语文必背</strong><small>互动练习册</small></div></a>
        <nav>
          <button className="nav-button" onClick={() => setView("wrong")}>错题本 <span>{wrongEntries.length}</span></button>
          <button className="nav-button" onClick={() => importRef.current?.click()}>导入题库</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importBank} />
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">每次一小步，必背不再难</p>
          <h1>把零散知识，<br /><em>练成你的底气。</em></h1>
          <p className="hero-description">8 个资料板块，852 道题。每轮随机抽题，全部覆盖前不重复；答错自动收进错题本，随时回来巩固。</p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={startComprehensive}>开始 30 题综合练习 <span>→</span></button>
            <button className="secondary-button large" onClick={() => setView("wrong")}>复习错题（{wrongEntries.length}）</button>
          </div>
        </div>
        <div className="hero-visual" aria-label="语文学习插画与练习统计">
          <img src="/illustrations/hero-modern.jpg" alt="现代风格的语文学习插画" />
          <div className="hero-stat-card">
            <span><strong>{accuracy}%</strong>累计正确率</span>
            <span><strong>{stats.answered}</strong>已答题</span>
            <span><strong>{wrongEntries.length}</strong>待巩固</span>
          </div>
        </div>
      </section>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      <section className="section-block">
        <div className="section-heading">
          <div><p className="eyebrow">分板块练习</p><h2>选择今天要攻克的内容</h2></div>
          <p>每个板块每次随机 20 题；本轮题库全部出现后，才会开启下一轮。</p>
        </div>
        <div className="section-grid">
          {sections.map((section) => {
            const progress = cycleProgress(section);
            const percent = progress.total ? Math.round((progress.seen / progress.total) * 100) : 0;
            return (
              <article className="section-card" key={section.id} style={{ "--card-accent": section.accent } as React.CSSProperties}>
                {builtInSections.some((item) => item.id === section.id) && (
                  <div className="card-image">
                    <img src={sectionIllustrationPath(section.id)} alt="" />
                    <span className="question-total">{section.questionCount} 题</span>
                  </div>
                )}
                <div className="card-body">
                  <div className="card-top"><span className="card-icon">{section.icon}</span><span>专项练习</span></div>
                  <h3>{section.title}</h3>
                  <p>本轮已覆盖 {progress.seen} / {progress.total}</p>
                  <div className="mini-progress"><span style={{ width: `${percent}%` }} /></div>
                  <button onClick={() => startSection(section)}>随机练 20 题 <span>→</span></button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="system-strip">
        <div><span className="strip-number">01</span><h3>不重复抽题</h3><p>当前轮次全覆盖后再重新洗牌。</p></div>
        <div><span className="strip-number">02</span><h3>错题自动归档</h3><p>答错即收录，答对即可移出。</p></div>
        <div><span className="strip-number">03</span><h3>新资料可追加</h3><p>按模板导入 JSON，即刻增加板块。</p></div>
      </section>

      <footer>
        <div><strong>语文必背 · 互动练习册</strong><p>进度保存在当前设备的浏览器中。</p></div>
        <div className="footer-actions"><a href="/question-bank-template.json" download>下载题库模板</a><button onClick={resetProgress}>清空练习记录</button></div>
      </footer>
    </main>
  );
}

function PageModal({ page, onClose }: { page: Exclude<ModalPage, null>; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={page.label} onMouseDown={onClose}>
      <div className="page-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><div><strong>{page.label}</strong><span>第 {page.page} 页</span></div><button onClick={onClose} aria-label="关闭">×</button></div>
        <div className="page-image-wrap"><img src={imagePath(page.sectionId, page.page)} alt={`${page.label}，第 ${page.page} 页`} /></div>
      </div>
    </div>
  );
}
