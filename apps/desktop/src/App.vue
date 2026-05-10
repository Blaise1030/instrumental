<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import "vue-sonner/style.css";
import LinkHoverStatus from "@/components/LinkHoverStatus.vue";
import WorkspaceLauncherGlobal from "@/components/WorkspaceLauncherGlobal.vue";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/globals.css";
import AppContext from "@/app-context/AppContext.vue";
import { hydratePersistedToasts } from "@/hooks/useToast";
import { useRegisterGlobalKeybindings } from "@/hooks/useRegisterGlobalKeybindings";

useRegisterGlobalKeybindings();

onMounted(() => {
  hydratePersistedToasts();
});
</script>

<template>  
  <TooltipProvider>
    <AppContext mode="desktop">
      <WorkspaceLauncherGlobal />
      <LinkHoverStatus />
      <RouterView />
    </AppContext>
    <Toaster />
  </TooltipProvider>
</template>
