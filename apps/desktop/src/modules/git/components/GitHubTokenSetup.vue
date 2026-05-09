<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useGitHubPrStore } from "@/modules/git/stores/githubPrStore";
import { detectGitHubRemote } from "@/modules/git/hooks/useGitHubRemote";

const route = useRoute();
const router = useRouter();

const props = defineProps<{
  cwd: string;
}>();

const emit = defineEmits<{ saved: [] }>();

const store = useGitHubPrStore();

const tokenInput = ref(store.githubToken);
const ownerInput = ref(store.repoOwner);
const repoInput = ref(store.repoName);
const detecting = ref(false);

onMounted(async () => {
  if (ownerInput.value && repoInput.value) return;
  detecting.value = true;
  try {
    const remote = await detectGitHubRemote(props.cwd);
    if (remote) {
      if (!ownerInput.value) ownerInput.value = remote.owner;
      if (!repoInput.value) repoInput.value = remote.repo;
    }
  } finally {
    detecting.value = false;
  }
});

async function save(): Promise<void> {
  await store.saveConfig(tokenInput.value, ownerInput.value, repoInput.value);
  emit("saved");
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
        <h2 class="text-sm font-semibold text-foreground">Connect to GitHub</h2>
        <p class="text-[11px] text-muted-foreground">
          Enter a Personal Access Token with <code class="rounded bg-muted px-1">repo</code> scope to browse pull requests.
        </p>
      </div>

      <div class="space-y-3">
        <div class="space-y-1">
          <label class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Personal Access Token
          </label>
          <input
            v-model="tokenInput"
            type="password"
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
        :disabled="!tokenInput.trim() || !ownerInput.trim() || !repoInput.trim()"
        @click="save"
      >
        Save &amp; Connect
      </Button>
    </div>
  </div>
</template>
