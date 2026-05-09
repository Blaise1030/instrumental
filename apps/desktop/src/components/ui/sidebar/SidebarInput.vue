<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref } from "vue";
import { cn } from "@/utils/cn";
import { Input } from "@/components/ui/input";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const innerRef = ref<InstanceType<typeof Input> | null>(null);

defineExpose({
  focus: (options?: FocusOptions) => {
    const el = innerRef.value?.$el;
    if (el instanceof HTMLInputElement) el.focus(options);
  },
});
</script>

<template>
  <Input
    ref="innerRef"
    v-bind="$attrs"
    data-slot="sidebar-input"
    data-sidebar="input"
    :class="
      cn(
        'bg-muted/20 dark:bg-muted/30 border-input h-8 w-full min-w-0 rounded-md text-xs font-normal',
        props.class,
      )
    "
  />
</template>
