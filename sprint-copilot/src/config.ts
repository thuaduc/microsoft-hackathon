export const CAPACITY_POINTS = 18; // 3 devs (mocked) x 6 pts/dev
export const FEATURE_RATIO = 0.7;
export const BUG_RATIO = 0.3;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name} (see .env.local.example)`);
  }
  return value;
}

export function getGitHubPat(): string {
  return requireEnv("GITHUB_PAT");
}

export function getTargetRepo(): { owner: string; repo: string } {
  return { owner: requireEnv("GITHUB_OWNER"), repo: requireEnv("GITHUB_REPO") };
}

export function getOpenAIKey(): string {
  return requireEnv("OPENAI_API_KEY");
}
