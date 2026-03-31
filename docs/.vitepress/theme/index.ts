import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import HomeLayout from './HomeLayout.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {})
  },
  enhanceApp({ app }) {
    app.component('HomeLayout', HomeLayout)
  },
}
