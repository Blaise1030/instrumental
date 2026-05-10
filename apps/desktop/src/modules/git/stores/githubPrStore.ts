import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { useToast } from "@/hooks/useToast";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export interface GitHubPr {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  user: { login: string; avatar_url: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  created_at: string;
  updated_at: string;
  comments: number;
  review_comments: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface GitHubPrComment {
  id: number;
  path: string;
  line: number | null;
  original_line: number | null;
  body: string;
  user: { login: string; avatar_url: string };
  created_at: string;
  diff_hunk: string;
  side: "LEFT" | "RIGHT";
}

export interface ParsedFileDiff {
  oldFileName: string;
  newFileName: string;
  displayName: string;
  rawSection: string;
  hunks: string[];
  isNewFile: boolean;
  isDeletedFile: boolean;
  additions: number;
  deletions: number;
}

function parsePrDiff(diff: string): ParsedFileDiff[] {
  const result: ParsedFileDiff[] = [];
  const normalized = diff.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const sections = normalized.split(/(?=^diff --git )/m).filter((s) => s.trim());

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
        rawSection: section,
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

export const useGitHubPrStore = defineStore("githubPr", () => {
  const toast = useToast();
  const workspace = useWorkspaceStore();

  /** Project whose GitHub PR credentials are used for API calls. */
  const activeProjectId = ref("");

  const activeProject = computed(() =>
    workspace.projects.find((x) => x.id === activeProjectId.value)
  );

  const repoOwner = computed(() => (activeProject.value?.githubPrOwner ?? "").trim());

  const repoName = computed(() => (activeProject.value?.githubPrRepo ?? "").trim());

  const prs = ref<GitHubPr[]>([]);
  const selectedPrNumber = ref<number | null>(null);
  const parsedFiles = ref<ParsedFileDiff[]>([]);
  const selectedFileName = ref<string | null>(null);
  const prComments = ref<GitHubPrComment[]>([]);
  const loading = ref(false);
  const diffLoading = ref(false);
  const error = ref<string | null>(null);

  const isConfigured = computed(
    () =>
      Boolean(activeProject.value?.githubPrTokenConfigured) &&
      Boolean(repoOwner.value) &&
      Boolean(repoName.value)
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

  function setActiveProjectContext(projectId: string): void {
    activeProjectId.value = projectId;
  }

  async function saveProjectGitHubPr(
    projectId: string,
    token: string,
    owner: string,
    repo: string,
    opts?: { retainTokenIfEmpty?: boolean }
  ): Promise<void> {
    const api = window.workspaceApi;
    if (!api?.setProjectGitHubPr) {
      toast.error("Could not save GitHub settings", "This build does not support saving GitHub credentials.");
      return;
    }
    try {
      await api.setProjectGitHubPr({
        projectId,
        token: token.trim(),
        owner: owner.trim(),
        repo: repo.trim(),
        retainTokenIfEmpty: opts?.retainTokenIfEmpty,
      });
    } catch {
      toast.error("Could not save GitHub settings", "Check your connection and try again.");
    }
  }

  async function fetchPrs(): Promise<void> {
    if (!isConfigured.value || !activeProjectId.value) return;
    if (loading.value) return;
    const api = window.workspaceApi;
    if (!api?.githubListOpenPullRequests) {
      toast.error("Could not load PRs", "This build does not support GitHub PR listing from the main process.");
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const data = await api.githubListOpenPullRequests({ projectId: activeProjectId.value });
      prs.value = data as GitHubPr[];
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
      const [diffText, comments] = await Promise.all([
        fetchPrDiff(prNumber),
        fetchPrComments(prNumber),
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

  async function fetchPrDiff(prNumber: number): Promise<string> {
    const api = window.workspaceApi;
    if (!api?.githubFetchPrDiff || !activeProjectId.value) {
      throw new Error("PR diff is unavailable (missing project or IPC).");
    }
    return api.githubFetchPrDiff({ projectId: activeProjectId.value, prNumber });
  }

  async function fetchPrComments(prNumber: number): Promise<GitHubPrComment[]> {
    const api = window.workspaceApi;
    if (!api?.githubFetchPrComments || !activeProjectId.value) {
      throw new Error("PR comments are unavailable (missing project or IPC).");
    }
    const data = await api.githubFetchPrComments({ projectId: activeProjectId.value, prNumber });
    return data as GitHubPrComment[];
  }

  function clearPr(): void {
    selectedPrNumber.value = null;
    parsedFiles.value = [];
    selectedFileName.value = null;
    prComments.value = [];
    error.value = null;
  }

  /** Clears list + selection when switching workspace projects so another tab's PRs never linger. */
  function resetRemotePrStateForProjectChange(): void {
    prs.value = [];
    clearPr();
    loading.value = false;
    diffLoading.value = false;
  }

  return {
    activeProjectId,
    repoOwner,
    repoName,
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
    setActiveProjectContext,
    saveProjectGitHubPr,
    fetchPrs,
    selectPr,
    clearPr,
    resetRemotePrStateForProjectChange,
  };
});
