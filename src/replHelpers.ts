export function evaluateCommand(command: string, data: unknown): unknown {
  try {
    return eval(command);
  } catch (error) {
    throw new Error(`Error evaluating command: ${error}`);
  }
}

export function autocomplete(input: string): string[] {
  // Extract the last expression from the input
  const match = /([\[\]\d\w$.]+)$/.exec(input);
  if (!match) return []; // Return an empty array if no valid expression is found

  const lastExpression = match[1]; // Extract the last part of the input
  const parts = lastExpression.split(".");
  const prefix = parts.pop()!; // Get the prefix to match
  const base = parts.join(".");

  let target: unknown;
  try {
    target = base ? eval(base) : globalThis; // Evaluate the base expression
  } catch {
    target = globalThis; // Default to globalThis if evaluation fails
  }

  // Get the suggestions for the prefix
  const completions = getCompletionKeys(target ?? {}, prefix);
  return completions.keys;
}

export function getCompletionKeys(
  obj: unknown,
  prefix: string,
): { keys: string[]; numPrimary: number } {
  const keys: Set<string> = new Set();
  let numPrimary = 0;
  if (obj === globalThis) {
    [
      "data",
      "aqFindByLocator",
      "aqFindByName",
      "aqFindByFullName",
      "aqFindByValue",
      "aqComments",
      "aqAnchors",
    ].filter((x) => x.startsWith(prefix)).forEach((k) => keys.add(k));
  }

  while (obj) {
    Object.getOwnPropertyNames(obj).filter((k) => k.startsWith(prefix) && !/^\d/.test(k))
      .forEach((k) => keys.add(k));
    numPrimary = numPrimary !== 0 ? numPrimary : keys.size;
    obj = Object.getPrototypeOf(obj);
  }

  return { keys: [...keys], numPrimary: numPrimary };
}