<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import "vue-sonner/style.css";
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
      <RouterView />
    </AppContext>
    <Toaster />
  </TooltipProvider>
</template>
