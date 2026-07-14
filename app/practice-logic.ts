export type CycleQuestion = { canonicalId: string };

export type PracticePlan<Section> = {
  section: Section;
  count: number;
};

export type CycleSelection<Question> = {
  selection: Question[];
  seenIds: string[];
  blockedIds: string[];
};

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function allocateProportionalPlans<Section extends { questions: unknown[] }>(
  sections: Section[],
  requestedCount: number,
  random: () => number = Math.random,
): Array<PracticePlan<Section>> {
  const eligible = sections.filter((section) => section.questions.length > 0);
  const available = eligible.reduce((sum, section) => sum + section.questions.length, 0);
  const target = Math.min(Math.max(0, Math.floor(requestedCount)), available);
  if (!target || !available) return [];

  const rows = shuffle(eligible, random).map((section) => {
    const exact = (section.questions.length / available) * target;
    return {
      section,
      count: Math.min(section.questions.length, Math.floor(exact)),
      remainder: exact - Math.floor(exact),
    };
  });

  let remaining = target - rows.reduce((sum, row) => sum + row.count, 0);
  const ranked = [...rows].sort((left, right) => right.remainder - left.remainder);

  while (remaining > 0) {
    let added = false;
    for (const row of ranked) {
      if (remaining <= 0) break;
      if (row.count >= row.section.questions.length) continue;
      row.count += 1;
      remaining -= 1;
      added = true;
    }
    if (!added) break;
  }

  return rows.filter((row) => row.count > 0).map(({ section, count }) => ({ section, count }));
}

export function selectCycleQuestions<Question extends CycleQuestion>({
  questions,
  universeIds,
  seenIds,
  blockedIds,
  count,
  random = Math.random,
}: {
  questions: Question[];
  universeIds: string[];
  seenIds: string[];
  blockedIds: string[];
  count: number;
  random?: () => number;
}): CycleSelection<Question> {
  const universe = new Set(universeIds);
  let seen = new Set(seenIds.filter((id) => universe.has(id)));
  const blocked = new Set(blockedIds);
  const selection: Question[] = [];

  const addUnseen = () => {
    const candidates = shuffle(
      questions.filter((question) => !seen.has(question.canonicalId) && !blocked.has(question.canonicalId)),
      random,
    );
    for (const question of candidates) {
      if (selection.length >= count) break;
      if (seen.has(question.canonicalId) || blocked.has(question.canonicalId)) continue;
      seen.add(question.canonicalId);
      blocked.add(question.canonicalId);
      selection.push(question);
    }
  };

  addUnseen();

  if (selection.length < count && seen.size >= universe.size) {
    seen = new Set();
    addUnseen();
  }

  return {
    selection,
    seenIds: [...seen],
    blockedIds: [...blocked],
  };
}

export function mergeGroupSequences<T>(groups: Map<string, T[]>, random: () => number = Math.random): T[] {
  const queues = [...groups.values()]
    .filter((items) => items.length > 0)
    .map((items) => ({ items, index: 0 }));
  const merged: T[] = [];

  while (queues.length > 0) {
    const totalRemaining = queues.reduce((sum, queue) => sum + queue.items.length - queue.index, 0);
    let target = Math.min(0.999999999999, Math.max(0, random())) * totalRemaining;
    let chosen = 0;

    for (let index = 0; index < queues.length; index += 1) {
      const remaining = queues[index].items.length - queues[index].index;
      if (target < remaining) {
        chosen = index;
        break;
      }
      target -= remaining;
    }

    const queue = queues[chosen];
    merged.push(queue.items[queue.index]);
    queue.index += 1;
    if (queue.index >= queue.items.length) queues.splice(chosen, 1);
  }

  return merged;
}
