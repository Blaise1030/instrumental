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
      name: "symphonyTask",
      component: SymphonyPage,
    },
  ],
};
