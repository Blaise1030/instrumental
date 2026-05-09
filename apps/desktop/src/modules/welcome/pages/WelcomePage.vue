<script setup lang="ts">
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useNavigateToProject } from "@/hooks/useNavigateToProject";
import { Button } from "@/components/ui/button";
import { CursorLoading } from "@/components/ui/cursor-loading";
import WorkbenchLogoMark from "@/modules/agent/components/WorkbenchLogoMark.vue";
import { useAddProjectFromDirectoryPick } from "@/hooks/useAddProjectFromDirectoryPick";
import { useAppContext } from "@/app-context/useAppContext";

const appContext = useAppContext();
const { navigateToProject } = useNavigateToProject();

const { data: welcomeProjects, isPending: welcomeProjectsPending } = useQuery({
  queryKey: ["welcomeProjects"],
  enabled: computed(() => Boolean(appContext.value?.workspaceService)),
  queryFn: async () => {
    const res = await appContext.value!.workspaceService.getSnapshot();
    return [...(res.projects ?? [])].sort((a, b) => a.tabOrder - b.tabOrder);
  },
});

const { pickAndAddProject } = useAddProjectFromDirectoryPick({
  navigateToProject: navigateToProject,
});
</script>

<template>
  <div
    class="h-screen flex flex-col items-center justify-start bg-background text-foreground"
  >
    <div class="w-full max-w-sm h-full justify-center flex flex-col gap-8">      
      <div class="flex gap-1 items-center">
        <WorkbenchLogoMark /> 
        <p class="font-app-brand-title text-2xl">workbench</p>    
      </div>
      <div class="flex flex-col gap-1">        
        <p class="text-xs text-muted-foreground px-2">Recent Projects</p>        
        <div
          v-if="welcomeProjectsPending"
          class="flex h-full flex-col rounded-lg border border-dashed px-4 py-8"
        >
          <CursorLoading class="min-h-24 w-full" />
        </div>        
        <div v-else-if="(welcomeProjects ?? []).length > 0" class="flex flex-col gap-1">
          <Button
            v-for="p in welcomeProjects ?? []"
            :key="p.id"
            type="button"
            variant="ghost"
            class="w-full justify-between gap-4 text-start font-normal"
            @click="navigateToProject(p.id)"
          >
            <span class="min-w-0 flex w-full justify-between items-center gap-0.5">
              <span class="truncate font-medium text-foreground">{{ p.name }}</span>
              <span class="truncate text-xs text-muted-foreground" :title="p.repoPath">{{
                p.repoPath
              }}</span>
            </span>            
          </Button>        
        </div>
        <p
          v-else
          class="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No projects in this workspace yet. Add a folder from the app menu once you are inside a
          project, or reopen a repo you have added before.
        </p>
        <Button @click="void pickAndAddProject()" size="sm" class="mt-4 w-fit" variant="outline">
          📁 New project
        </Button>
      </div>
    </div>
  </div>
</template>
