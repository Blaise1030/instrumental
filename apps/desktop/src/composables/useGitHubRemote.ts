export interface GitRemote {
  provider: "github" | "gitlab";
  owner: string;
  repo: string;
  /** For self-hosted GitLab instances — undefined means https://gitlab.com */
  gitlabBaseUrl?: string;
}

/** @deprecated Use GitRemote instead */
export type GitHubRemote = Pick<GitRemote, "owner" | "repo">;

export function parseGitHubRemoteUrl(url: string): GitHubRemote | null {
  const remote = parseGitRemoteUrl(url);
  if (!remote || remote.provider !== "github") return null;
  return { owner: remote.owner, repo: remote.repo };
}

export function parseGitRemoteUrl(url: string): GitRemote | null {
  // GitHub HTTPS: https://github.com/owner/repo[.git]
  const ghHttps = url.match(/https?:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?(?:\s|$)/);
  if (ghHttps) return { provider: "github", owner: ghHttps[1]!, repo: ghHttps[2]! };

  // GitHub SSH: git@github.com:owner/repo[.git]
  const ghSsh = url.match(/git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?(?:\s|$)/);
  if (ghSsh) return { provider: "github", owner: ghSsh[1]!, repo: ghSsh[2]! };

  // GitLab HTTPS (gitlab.com or self-hosted): https://gitlab.example.com/owner/repo[.git]
  const glHttps = url.match(/https?:\/\/(gitlab\.[^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?(?:\s|$)/);
  if (glHttps) {
    const host = glHttps[1]!;
    const baseUrl = host === "gitlab.com" ? undefined : `https://${host}`;
    return { provider: "gitlab", owner: glHttps[2]!, repo: glHttps[3]!, gitlabBaseUrl: baseUrl };
  }

  // GitLab SSH: git@gitlab.com:owner/repo[.git] or git@gitlab.example.com:owner/repo[.git]
  const glSsh = url.match(/git@(gitlab\.[^:]+):([^/]+)\/([^/.]+?)(?:\.git)?(?:\s|$)/);
  if (glSsh) {
    const host = glSsh[1]!;
    const baseUrl = host === "gitlab.com" ? undefined : `https://${host}`;
    return { provider: "gitlab", owner: glSsh[2]!, repo: glSsh[3]!, gitlabBaseUrl: baseUrl };
  }

  return null;
}

export async function detectGitRemote(cwd: string): Promise<GitRemote | null> {
  const api = (window as any).workspaceApi ?? null;
  if (!api?.getGitRemotes) return null;
  try {
    const remotes: Record<string, string> = await api.getGitRemotes(cwd);
    for (const url of Object.values(remotes)) {
      const parsed = parseGitRemoteUrl(url);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated Use detectGitRemote instead */
export async function detectGitHubRemote(cwd: string): Promise<GitHubRemote | null> {
  const remote = await detectGitRemote(cwd);
  if (!remote || remote.provider !== "github") return null;
  return { owner: remote.owner, repo: remote.repo };
}
