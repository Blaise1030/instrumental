<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/globals.css";
import AppContext from "@/app-context/AppContext.vue";
import { useGitHubPrStore } from "@/modules/git/stores/githubPrStore";

const githubPrStore = useGitHubPrStore();
onMounted(() => {
  void githubPrStore.syncPersistenceFromMain();
});
</script>

<template>  
  <TooltipProvider>
    <AppContext mode="desktop">
      <RouterView />
    </AppContext>
    <Toaster />
  </TooltipProvider>
</template>
