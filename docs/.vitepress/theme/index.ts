import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import HomeLayout from "./HomeLayout.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout),
  enhanceApp({ app }) {
    app.component("HomeLayout", HomeLayout);
  },
};
