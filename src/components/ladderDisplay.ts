import { buildLadder, type Logic } from "../core/ladder";
import type { Program } from "../core/model";

export const MAX_LADDER_CONTACTS = 2000;
export const MAX_LADDER_DEPTH = 100;

// The instruction count alone cannot bound the DOM: consecutive outputs render
// the same condition again. Measure expanded cost, caching shared AST nodes.
export function buildDisplayLadder(
  program: Program,
): ReturnType<typeof buildLadder> {
  const blocked = (message: string) => ({
    rungs: [],
    errors: [
      message + " 命令一覧で確認してください。PLCの実行可否には影響しません。",
    ],
  });
  if (program.instructions.length > 1000)
    return blocked("ラダー表示は1000命令までです。");
  const ladder = buildLadder(program);
  if (ladder.errors.length) return ladder;
  const costs = new WeakMap<Logic, { contacts: number; depth: number }>();
  let total = 0;
  for (const rung of ladder.rungs) {
    const stack: Array<{ node: Logic; visited: boolean }> = [
      { node: rung.condition, visited: false },
    ];
    while (stack.length) {
      const { node, visited } = stack.pop()!;
      if (costs.has(node)) continue;
      if (node.kind === "contact") {
        costs.set(node, { contacts: 1, depth: 1 });
      } else if (!visited) {
        stack.push(
          { node, visited: true },
          { node: node.right, visited: false },
          { node: node.left, visited: false },
        );
      } else {
        const left = costs.get(node.left)!,
          right = costs.get(node.right)!;
        costs.set(node, {
          contacts: Math.min(
            MAX_LADDER_CONTACTS + 1,
            left.contacts + right.contacts,
          ),
          depth: Math.max(left.depth, right.depth) + 1,
        });
      }
    }
    const cost = costs.get(rung.condition)!;
    if (cost.depth > MAX_LADDER_DEPTH)
      return blocked(
        `ラダー表示の条件階層が上限${MAX_LADDER_DEPTH}段を超えています。`,
      );
    total += cost.contacts;
    if (total > MAX_LADDER_CONTACTS)
      return blocked(
        `ラダー表示の展開後接点数が上限${MAX_LADDER_CONTACTS}点を超えています。`,
      );
  }
  return ladder;
}
