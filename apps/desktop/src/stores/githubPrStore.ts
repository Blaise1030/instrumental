import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@/composables/useToast";
import type { RemoteGitProvider } from "@/lib/remoteGitProvider";
import { createProvider } from "@/lib/providers/createProvider";

export type { RemotePullRequest as GitHubPr, RemotePrComment as GitHubPrComment } from "@/lib/remoteGitProvider";

export interface ParsedFileDiff {
  oldFileName: string;
  newFileName: string;
  displayName: string;
  hunks: string[];
  isNewFile: boolean;
  isDeletedFile: boolean;
  additions: number;
  deletions: number;
}

function parsePrDiff(diff: string): ParsedFileDiff[] {
  const result: ParsedFileDiff[] = [];
  const sections = diff.split(/(?=^diff --git )/m).filter((s) => s.trim());

  for (const section of sections) {
    const lines = section.split("\n");
    let oldFileName = "";
    let newFileName = "";
    let isNewFile = false;
    let isDeletedFile = false;
    let additions = 0;
    let deletions = 0;
    const hunks: string[] = [];
    let currentHunkLines: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith("--- ")) {
        const raw = line.slice(4).trim();
        oldFileName = raw === "/dev/null" ? "/dev/null" : raw.replace(/^a\//, "");
      } else if (line.startsWith("+++ ")) {
        const raw = line.slice(4).trim();
        newFileName = raw === "/dev/null" ? "/dev/null" : raw.replace(/^b\//, "");
      } else if (line === "new file mode 100644" || /^new file mode/.test(line)) {
        isNewFile = true;
      } else if (/^deleted file mode/.test(line)) {
        isDeletedFile = true;
      } else if (line.startsWith("@@ ")) {
        if (currentHunkLines.length > 0) {
          hunks.push(currentHunkLines.join("\n"));
        }
        currentHunkLines = [line];
        inHunk = true;
      } else if (inHunk) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
        currentHunkLines.push(line);
      }
    }

    if (currentHunkLines.length > 0) {
      hunks.push(currentHunkLines.join("\n"));
    }

    const effectiveName = newFileName !== "/dev/null" ? newFileName : oldFileName;
    if (effectiveName && hunks.length > 0) {
      result.push({
        oldFileName: oldFileName || "/dev/null",
        newFileName: newFileName || "/dev/null",
        displayName: effectiveName,
        hunks,
        isNewFile,
        isDeletedFile,
        additions,
        deletions,
      });
    }
  }

  return result;
}

const STORAGE_TOKEN_KEY = "instrument.githubToken";
const STORAGE_OWNER_KEY = "instrument.githubOwner";
const STORAGE_REPO_KEY = "instrument.githubRepo";
const STORAGE_PROVIDER_KEY = "instrument.gitProvider";
const STORAGE_GITLAB_URL_KEY = "instrument.gitlabBaseUrl";

function readStorage(key: string): string {
  try {
    return typeof localStorage !== "undefined" ? (localStorage.getItem(key) ?? "") : "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

import type { RemotePullRequest, RemotePrComment } from "@/lib/remoteGitProvider";

export const useGitHubPrStore = defineStore("githubPr", () => {
  const toast = useToast();

  const githubToken = ref(readStorage(STORAGE_TOKEN_KEY));
  const repoOwner = ref(readStorage(STORAGE_OWNER_KEY));
  const repoName = ref(readStorage(STORAGE_REPO_KEY));
  const providerName = ref<"github" | "gitlab">(
    (readStorage(STORAGE_PROVIDER_KEY) as "github" | "gitlab") || "github"
  );
  const gitlabBaseUrl = ref(readStorage(STORAGE_GITLAB_URL_KEY) || undefined as string | undefined);

  const prs = ref<RemotePullRequest[]>([]);
  const selectedPrNumber = ref<number | null>(null);
  const parsedFiles = ref<ParsedFileDiff[]>([]);
  const selectedFileName = ref<string | null>(null);
  const prComments = ref<RemotePrComment[]>([]);
  const loading = ref(false);
  const diffLoading = ref(false);
  const error = ref<string | null>(null);

  const isConfigured = computed(
    () => Boolean(githubToken.value) && Boolean(repoOwner.value) && Boolean(repoName.value)
  );

  const selectedPr = computed(() =>
    prs.value.find((p) => p.number === selectedPrNumber.value) ?? null
  );

  const selectedFileDiff = computed(
    () => parsedFiles.value.find((f) => f.displayName === selectedFileName.value) ?? null
  );

  const commentsForSelectedFile = computed(() => {
    const name = selectedFileName.value;
    if (!name) return [];
    return prComments.value.filter((c) => c.path === name);
  });

  function getProvider(): RemoteGitProvider {
    return createProvider(providerName.value, githubToken.value, gitlabBaseUrl.value);
  }

  function saveConfig(
    token: string,
    owner: string,
    repo: string,
    provider: "github" | "gitlab" = "github",
    glBaseUrl?: string
  ): void {
    githubToken.value = token.trim();
    repoOwner.value = owner.trim();
    repoName.value = repo.trim();
    providerName.value = provider;
    gitlabBaseUrl.value = glBaseUrl;
    writeStorage(STORAGE_TOKEN_KEY, githubToken.value);
    writeStorage(STORAGE_OWNER_KEY, repoOwner.value);
    writeStorage(STORAGE_REPO_KEY, repoName.value);
    writeStorage(STORAGE_PROVIDER_KEY, provider);
    writeStorage(STORAGE_GITLAB_URL_KEY, glBaseUrl ?? "");
  }

  async function fetchPrs(): Promise<void> {
    if (!isConfigured.value) return;
    loading.value = true;
    error.value = null;
    try {
      prs.value = await getProvider().listPullRequests(repoOwner.value, repoName.value);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to fetch PRs.";
      toast.error("Failed to load PRs", error.value);
    } finally {
      loading.value = false;
    }
  }

  async function selectPr(prNumber: number): Promise<void> {
    if (selectedPrNumber.value === prNumber) return;
    selectedPrNumber.value = prNumber;
    parsedFiles.value = [];
    selectedFileName.value = null;
    prComments.value = [];
    diffLoading.value = true;
    error.value = null;
    try {
      const provider = getProvider();
      const [diffText, comments] = await Promise.all([
        provider.getPullRequestDiff(repoOwner.value, repoName.value, prNumber),
        provider.getPullRequestComments(repoOwner.value, repoName.value, prNumber),
      ]);
      parsedFiles.value = parsePrDiff(diffText);
      prComments.value = comments;
      if (parsedFiles.value.length > 0) {
        selectedFileName.value = parsedFiles.value[0]!.displayName;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load PR diff.";
      toast.error("Failed to load PR diff", error.value);
    } finally {
      diffLoading.value = false;
    }
  }

  function clearPr(): void {
    selectedPrNumber.value = null;
    parsedFiles.value = [];
    selectedFileName.value = null;
    prComments.value = [];
    error.value = null;
  }

  return {
    githubToken,
    repoOwner,
    repoName,
    providerName,
    gitlabBaseUrl,
    prs,
    selectedPrNumber,
    parsedFiles,
    selectedFileName,
    prComments,
    loading,
    diffLoading,
    error,
    isConfigured,
    selectedPr,
    selectedFileDiff,
    commentsForSelectedFile,
    saveConfig,
    fetchPrs,
    selectPr,
    clearPr,
  };
});
