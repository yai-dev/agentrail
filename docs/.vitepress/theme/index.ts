import { h } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeLayout from './HomeLayout.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout() {
    const { frontmatter } = useData()
    if (frontmatter.value['at-home']) {
      return h(HomeLayout)
    }
    return h(DefaultTheme.Layout)
  },
  enhanceApp({ app }) {
    app.component('HomeLayout', HomeLayout)
  },
}
