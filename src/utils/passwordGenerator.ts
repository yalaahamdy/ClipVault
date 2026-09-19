import type { PasswordGeneratorOptions } from "../types";

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const NUMBERS = "0123456789";
const SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
const AMBIGUOUS = "0O1lI|";

const MEMORABLE_WORDS = [
  "falcon", "silver", "mountain", "nebula", "cipher", "river", "shadow", "crystal",
  "thunder", "aurora", "breeze", "beacon", "delta", "ember", "frost", "galaxy",
  "horizon", "island", "jungle", "knight", "lunar", "meteor", "nexus", "orbit",
  "planet", "quantum", "radiant", "stellar", "titan", "universe", "vortex", "zenith",
  "phoenix", "glacier", "zen", "voyage", "summit", "shield", "pulse", "echo"
];

export function generatePassword(options: PasswordGeneratorOptions): string {
  let charPool = "";
  if (options.uppercase) charPool += UPPERCASE;
  if (options.lowercase) charPool += LOWERCASE;
  if (options.numbers) charPool += NUMBERS;
  if (options.symbols) charPool += SYMBOLS;

  if (options.avoidAmbiguous) {
    charPool = charPool.split("").filter(c => !AMBIGUOUS.includes(c)).join("");
  }

  if (!charPool) {
    charPool = LOWERCASE + NUMBERS;
  }

  const length = Math.max(4, Math.min(128, options.length || 16));
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);

  let result = "";
  for (let i = 0; i < length; i++) {
    result += charPool[array[i] % charPool.length];
  }

  return result;
}

export function generatePassphrase(wordCount = 4, separator = "-"): string {
  const count = Math.max(3, Math.min(8, wordCount));
  const array = new Uint32Array(count);
  window.crypto.getRandomValues(array);

  const selectedWords: string[] = [];
  for (let i = 0; i < count; i++) {
    selectedWords.push(MEMORABLE_WORDS[array[i] % MEMORABLE_WORDS.length]);
  }
  return selectedWords.join(separator);
}

/** Strength label keys (resolved via i18n at render time — see vault dict). */
export function getStrengthFeedback(score: number): { labelKey: string; color: string; percent: number } {
  switch (score) {
    case 0:
      return { labelKey: "vault.strength.veryWeak", color: "var(--danger)", percent: 20 };
    case 1:
      return { labelKey: "vault.strength.weak", color: "var(--warn)", percent: 40 };
    case 2:
      return { labelKey: "vault.strength.medium", color: "var(--pin)", percent: 60 };
    case 3:
      return { labelKey: "vault.strength.strong", color: "var(--ok)", percent: 80 };
    case 4:
    default:
      return { labelKey: "vault.strength.super", color: "var(--accent)", percent: 100 };
  }
}
