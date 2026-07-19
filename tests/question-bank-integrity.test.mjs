import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const publicRoot = new URL("public/", projectRoot);

const grammarAnswers = (
  "C C B D C D D C C D D D C C B D D C D D D D B C B D D D D D D B D B D D C C C C " +
  "B C D B C D B D C A D D A B D D A D C D C D D D B C D C D D D C C B A C C C D"
).split(" ");

const literatureAnswers1To47 = (
  "A B B C B B D A C D B C D D B D A D C C C A A B BD B D A B A D B B A A C D C C D AC B C C C C D"
).split(" ");

const volumeCounts = {
  七年级上册: 19,
  七年级下册: 19,
  八年级上册: 27,
  八年级下册: 21,
  九年级上册: 14,
  九年级下册: 24,
};

async function loadQuestionBank() {
  return JSON.parse(await readFile(new URL("app/question-bank.json", projectRoot), "utf8"));
}

function pageName(page) {
  return `page-${String(page).padStart(2, "0")}.jpg`;
}

async function assertNonemptyFile(relativePath) {
  const file = new URL(relativePath, publicRoot);
  await access(file);
  assert.ok((await stat(file)).size > 0, `${relativePath} should not be empty`);
}

async function assertFlatDirectoryMatches(relativeDirectory, expectedNames) {
  const directory = new URL(`${relativeDirectory}/`, publicRoot);
  const entries = await readdir(directory, { withFileTypes: true });
  assert.ok(entries.every((entry) => entry.isFile()), `${relativeDirectory} should contain files only`);
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    [...expectedNames].sort(),
    `${relativeDirectory} contains missing or orphaned files`,
  );
}

test("question bank has 10 complete sections and 1055 unique questions", async () => {
  const bank = await loadQuestionBank();
  const questions = bank.sections.flatMap((section) => section.questions);

  assert.equal(bank.sections.length, 10);
  assert.equal(bank.totalQuestions, 1055);
  assert.equal(questions.length, 1055);
  assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);

  for (const section of bank.sections) {
    assert.equal(section.questionCount, section.questions.length, `${section.id} questionCount mismatch`);
    assert.equal(
      new Set(section.questions.map((question) => question.canonicalId)).size,
      section.questions.length,
      `${section.id} has duplicate canonical IDs`,
    );

    for (const question of section.questions) {
      await assertNonemptyFile(`question-crops/${section.id}/${question.id}.webp`);
      await assertNonemptyFile(`source/${section.id}/${pageName(question.sourcePage)}`);
    }
  }
});

test("grammar section preserves all 79 verified choice answers", async () => {
  const bank = await loadQuestionBank();
  const section = bank.sections.find((item) => item.id === "grammar-comprehensive");

  assert.ok(section);
  assert.equal(section.questions.length, 79);
  assert.equal(grammarAnswers.length, 79);
  assert.deepEqual(section.questions.map((question) => question.number), Array.from({ length: 79 }, (_, index) => index + 1));
  assert.deepEqual(section.questions.map((question) => question.answer), grammarAnswers);
  assert.ok(section.questions.every((question) => question.mode === "choice"));
});

test("literature section matches the 91 Topic 4 questions and its answer booklet", async () => {
  const bank = await loadQuestionBank();
  const section = bank.sections.find((item) => item.id === "literature");

  assert.ok(section);
  assert.equal(section.questions.length, 91);
  assert.deepEqual(section.questions.map((question) => question.number), Array.from({ length: 91 }, (_, index) => index + 1));
  assert.deepEqual(section.questions.slice(0, 47).map((question) => question.answer), literatureAnswers1To47);
  assert.equal(section.questions.find((question) => question.number === 79)?.answer, "B");
  assert.equal(section.questions.filter((question) => question.mode === "choice").length, 46);
  assert.equal(section.questions.filter((question) => question.mode === "self").length, 45);
  assert.equal(section.questions.find((question) => question.number === 25)?.mode, "self");
  assert.equal(section.questions.find((question) => question.number === 41)?.mode, "self");
  assert.ok(section.questions.every((question) => question.label === "专题四"));
  assert.ok(section.questions.every((question) => !question.prompt.includes("识别文字不完整")));
  assert.ok(section.questions.every((question) => !question.answer.includes("请对照参考答案原页自评")));
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(Object.groupBy(section.questions, (question) => question.answerPage)).map(([page, questions]) => [
        page,
        questions.length,
      ]),
    ),
    { 1: 65, 2: 15, 3: 11 },
  );
  assert.match(section.questions.find((question) => question.number === 65)?.answer ?? "", /奥斯特洛夫斯基/);
  assert.match(section.questions.find((question) => question.number === 80)?.answer ?? "", /花和尚/);
  assert.match(section.questions.find((question) => question.number === 91)?.answer ?? "", /曹先生/);

  await Promise.all(Array.from({ length: 3 }, (_, index) => assertNonemptyFile(`answers/literature/${pageName(index + 1)}`)));
});

test("moxie section keeps 124 units aligned with its answer scans", async () => {
  const bank = await loadQuestionBank();
  const section = bank.sections.find((item) => item.id === "moxie-100");

  assert.ok(section);
  assert.equal(section.questions.length, 124);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(Object.groupBy(section.questions, (question) => question.label)).map(([label, questions]) => [
        label,
        questions.length,
      ]),
    ),
    volumeCounts,
  );
  assert.deepEqual(section.questions.map((question) => question.number), Array.from({ length: 124 }, (_, index) => index + 1));

  for (const question of section.questions) {
    assert.equal(question.mode, "self");
    assert.equal(question.hasAnswerCrop, true);
    assert.ok(question.sourcePage >= 1 && question.sourcePage <= 103);
    assert.ok(question.answerPage >= 5 && question.answerPage <= 23);
    await assertNonemptyFile(`answers/moxie-100/${pageName(question.answerPage)}`);
    await assertNonemptyFile(`answer-crops/moxie-100/${question.id}.webp`);
  }
});

test("new scan directories contain every expected file and no orphans", async () => {
  await Promise.all([
    assertFlatDirectoryMatches(
      "question-crops/grammar-comprehensive",
      Array.from({ length: 79 }, (_, index) => `grammar-comprehensive-${index + 1}.webp`),
    ),
    assertFlatDirectoryMatches(
      "question-crops/moxie-100",
      Array.from({ length: 124 }, (_, index) => `moxie-100-${index + 1}.webp`),
    ),
    assertFlatDirectoryMatches(
      "answer-crops/moxie-100",
      Array.from({ length: 124 }, (_, index) => `moxie-100-${index + 1}.webp`),
    ),
    assertFlatDirectoryMatches(
      "source/grammar-comprehensive",
      Array.from({ length: 19 }, (_, index) => pageName(index + 1)),
    ),
    assertFlatDirectoryMatches(
      "source/moxie-100",
      Array.from({ length: 103 }, (_, index) => pageName(index + 1)),
    ),
    assertFlatDirectoryMatches(
      "answers/literature",
      Array.from({ length: 3 }, (_, index) => pageName(index + 1)),
    ),
    assertFlatDirectoryMatches(
      "answers/moxie-100",
      Array.from({ length: 23 }, (_, index) => pageName(index + 1)),
    ),
  ]);
});
