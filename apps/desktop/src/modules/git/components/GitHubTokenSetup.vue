<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useGitHubPrStore } from "@/modules/git/stores/githubPrStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { detectGitHubRemote } from "@/modules/git/hooks/useGitHubRemote";

const route = useRoute();
const router = useRouter();
const workspace = useWorkspaceStore();

const props = defineProps<{
  cwd: string;
  projectId: string;
}>();

const emit = defineEmits<{ saved: [] }>();

const store = useGitHubPrStore();

const projectRow = computed(() => workspace.projects.find((p) => p.id === props.projectId));

const tokenInput = ref("");
const ownerInput = ref("");
const repoInput = ref("");
const detecting = ref(false);
const saving = ref(false);

/** Bumps when owner/repo/cwd watch re-runs so stale `detectGitHubRemote` results are ignored. */
let remoteDetectGen = 0;

watch(
  () =>
    [
      props.projectId,
      props.cwd,
      workspace.projects.find((p) => p.id === props.projectId)?.githubPrOwner ?? "",
      workspace.projects.find((p) => p.id === props.projectId)?.githubPrRepo ?? "",
    ] as const,
  async ([projectId, cwd, persistedOwner, persistedRepo]) => {
    tokenInput.value = "";
    ownerInput.value = persistedOwner.trim();
    repoInput.value = persistedRepo.trim();

    if (ownerInput.value && repoInput.value) return;

    const gen = ++remoteDetectGen;
    detecting.value = true;
    try {
      const remote = await detectGitHubRemote(cwd);
      if (gen !== remoteDetectGen) return;
      if (props.projectId !== projectId || props.cwd !== cwd) return;
      if (remote) {
        if (!ownerInput.value.trim()) ownerInput.value = remote.owner;
        if (!repoInput.value.trim()) repoInput.value = remote.repo;
      }
    } finally {
      if (gen === remoteDetectGen) detecting.value = false;
    }
  },
  { immediate: true },
);

async function save(): Promise<void> {
  saving.value = true;
  try {
    await store.saveProjectGitHubPr(props.projectId, tokenInput.value, ownerInput.value, repoInput.value, {
      retainTokenIfEmpty: Boolean(projectRow.value?.githubPrTokenConfigured) && !tokenInput.value.trim(),
    });
    emit("saved");
  } finally {
    saving.value = false;
  }
}

function goBack(): void {
  const projectId = route.params.projectId as string;
  const branch = route.params.branch as string;
  const threadId = route.params.threadId as string;
  void router.push({ name: "gitPanel", params: { projectId, branch, threadId } });
}
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-4 p-6">
    <div class="w-full max-w-sm space-y-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="-ms-2 gap-1 px-2 text-muted-foreground hover:text-foreground"
        aria-label="Back to local Git"
        @click="goBack"
      >
        <ChevronLeft class="h-4 w-4 shrink-0" />
        Back
      </Button>
      <div class="space-y-1">
        <h2 class="text-sm font-semibold text-foreground">GitHub pull requests</h2>
        <p class="text-[11px] text-muted-foreground">
          For this workspace project, enter a personal access token with
          <code class="rounded bg-muted px-1">repo</code>
          scope and the GitHub
          <strong class="font-medium text-foreground">owner</strong> and
          <strong class="font-medium text-foreground">repository</strong>. Other projects can use different credentials.
        </p>
      </div>

      <div class="space-y-3">
        <div class="space-y-1">
          <label class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Personal access token
          </label>
          <input
            v-model="tokenInput"
            type="password"
            autocomplete="off"
            placeholder="ghp_xxxxxxxxxxxx"
            class="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>

        <div class="flex gap-2">
          <div class="flex-1 space-y-1">
            <label class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Owner
            </label>
            <input
              v-model="ownerInput"
              type="text"
              :placeholder="detecting ? 'Detecting…' : 'owner'"
              class="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
          <div class="flex-1 space-y-1">
            <label class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Repository
            </label>
            <input
              v-model="repoInput"
              type="text"
              :placeholder="detecting ? 'Detecting…' : 'repo'"
              class="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        class="w-full"
        :disabled="
          saving ||
          !ownerInput.trim() ||
          !repoInput.trim() ||
          (!tokenInput.trim() && !projectRow?.githubPrTokenConfigured)
        "
        @click="save"
      >
        {{ saving ? "Saving…" : "Save & connect" }}
      </Button>
    </div>
  </div>
</template>
