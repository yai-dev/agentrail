import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import HomeLayout from "./HomeLayout.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout),
  enhanceApp({ app }) {
    app.component("HomeLayout", HomeLayout);
  },
};
