<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { ChevronDown, GitBranch } from "lucide-vue-next";
import { computed, ref } from "vue";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxViewport
} from "@/components/ui/combobox";
import { CursorLoading } from "@/components/ui/cursor-loading";
import { useToast } from "@/hooks/useToast";
import { useAppContext } from "@/app-context/useAppContext";
import Button from "@/components/ui/button/Button.vue";

defineOptions({ name: "BranchSelector" });

const props = withDefaults(
  defineProps<{
    cwd: string;
    /**
     * `checkout` — switch HEAD on `cwd` when a branch is chosen (sidebar primary repo).
     * `pick` — update `modelValue` only (e.g. base branch for new worktree).
     */
    purpose?: "checkout" | "pick";
    /** Selected branch when `purpose` is `pick`. */
    modelValue?: string;
  }>(),
  { purpose: "checkout", modelValue: "" },
);

const emit = defineEmits<{
  branchChanged: [];
  "update:modelValue": [value: string];
}>();

const isCheckout = computed(() => props.purpose === "checkout");

const appContext = useAppContext();
const queryClient = useQueryClient();
const toast = useToast();

const open = ref(false);
const checkoutBusy = ref(false);
const comboboxKey = ref(0);
const cwdRef = computed(() => props.cwd);

const { data: currentBranch } = useQuery({
  queryKey: ["currentBranch", cwdRef],
  enabled: computed(() => Boolean(cwdRef.value) && isCheckout.value),
  queryFn: async () => {
    const cwd = cwdRef.value;
    if (!cwd) return "";
    return appContext.value.gitService.getCurrentBranch(cwd);
  },
  staleTime: 0,
  refetchInterval: 12_000,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false
});

const branchModel = computed(() => (isCheckout.value ? (currentBranch.value ?? "") : (props.modelValue ?? "")));

const { data: branches, isPending: branchesLoading } = useQuery({
  queryKey: ["branchSelectorBranches", cwdRef],
  enabled: computed(() => Boolean(cwdRef.value)),
  queryFn: async () => {
    const cwd = cwdRef.value;
    if (!cwd) return [];
    return appContext.value.gitService.listBranchesExcludingWorktrees(cwd);
  },
  staleTime: 0,
  refetchInterval: 12_000,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false
});

const triggerLabel = computed(() => {
  const v = branchModel.value.trim();
  if (v.length > 0) return v;
  return isCheckout.value ? "" : "Select branch…";
});

async function onModelUpdate(value: unknown): Promise<void> {
  if (checkoutBusy.value) return;
  if (typeof value !== "string" || !value) return;
  const branch = value;
  const cwd = cwdRef.value;
  if (!cwd) return;

  if (!isCheckout.value) {
    if (branch !== (props.modelValue ?? "")) {
      emit("update:modelValue", branch);
    }
    open.value = false;
    return;
  }

  if (branch === branchModel.value) return;
  checkoutBusy.value = true;
  try {
    await appContext.value.gitService.checkoutBranch(cwd, branch);
    open.value = false;
    toast.success("Switched branch", `Now on \`${branch}\`.`);
    await queryClient.invalidateQueries({ queryKey: ["currentBranch"] });
    await queryClient.invalidateQueries({ queryKey: ["branchSelectorBranches"] });
    emit("branchChanged");
  } catch (e) {
    toast.error("Checkout failed", e instanceof Error ? e.message : "Something went wrong.");
    comboboxKey.value += 1;
  } finally {
    checkoutBusy.value = false;
  }
}
</script>

<template>
  <Combobox
    :key="comboboxKey"
    :model-value="branchModel"
    :open="open"
    :disabled="checkoutBusy"
    open-on-click
    @update:open="open = $event"
    @update:model-value="onModelUpdate"
  >
    <ComboboxAnchor>
      <ComboboxTrigger
        type="button"
        as-child
        :disabled="checkoutBusy"
      >
        <Button variant="outline" size="sm" class="w-full">
          <CursorLoading
            v-if="checkoutBusy"
            class="inline-block size-3.5 min-h-0 shrink-0 overflow-hidden"
            aria-hidden="true"
          />
          <template v-else>
            <GitBranch class="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
            <span
              class="min-w-0 flex-1 truncate text-start"
              :class="!isCheckout && !branchModel.trim() ? 'text-muted-foreground' : ''"
            >{{ triggerLabel }}</span>
            <ChevronDown class="size-3 shrink-0 opacity-60" aria-hidden="true" />
          </template>
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList align="center" class="min-w-[240px]">
      <div class="p-1">
        <ComboboxInput placeholder="Search branch…" class="text-xs" />
      </div>
      <ComboboxViewport>
        <div
          v-if="branchesLoading"
          class="min-h-16 px-3 py-2"
        >
          <CursorLoading class="min-h-14 w-full" />
        </div>
        <template v-else>
          <ComboboxEmpty class="px-3 py-2 text-xs">No branch found.</ComboboxEmpty>
          <ComboboxItem
            v-for="b in branches"
            :key="b"
            checked="true"
            :value="b"
            :text="b"
            class="justify-start"
          >
            <span class="min-w-0 flex-1 truncate text-start text-xs">{{ b }}</span>
          </ComboboxItem>
        </template>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
