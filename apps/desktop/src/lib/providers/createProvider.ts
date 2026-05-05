import type { RemoteGitProvider } from "../remoteGitProvider.js";
import { GitHubProvider } from "./githubProvider.js";
import { GitLabProvider } from "./gitlabProvider.js";

export function createProvider(
  providerName: "github" | "gitlab",
  token: string,
  gitlabBaseUrl?: string
): RemoteGitProvider {
  if (providerName === "gitlab") return new GitLabProvider(token, gitlabBaseUrl);
  return new GitHubProvider(token);
}
