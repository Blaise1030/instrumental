import SymphonyPage from "./pages/SymphonyPage.vue";

export const symphonyRoute = {
  path: "symphony",
  children: [
    {
      path: "",
      name: "symphony",
      component: SymphonyPage,
    },
    {
      path: ":taskId",
      redirect: (to: { params: Record<string, unknown> }) => ({
        name: "symphonyTaskTab",
        params: { ...to.params, tab: "agent" },
      }),
      children: [
        {
          path: ":tab",
          name: "symphonyTaskTab",
          component: SymphonyPage,
        },
      ],
    },
  ],
};
