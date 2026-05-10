<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import "vue-sonner/style.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles/globals.css";
import AppContext from "@/app-context/AppContext.vue";
import { hydratePersistedToasts } from "@/hooks/useToast";

onMounted(() => {
  hydratePersistedToasts();
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
