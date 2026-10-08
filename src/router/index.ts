import { createRouter, createWebHistory } from "vue-router"

export const STEP_TITLES = ["节点哈希与链接", "证据原件", "业务一致性", "链外锚点"] as const

export const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_PUBLIC_PATH || "/"),
  routes: [
    { path: "/", name: "home", component: () => import("@/pages/home/index.vue"), meta: { title: "原理" } },
    { path: "/steps/1", name: "step-1", component: () => import("@/pages/steps/Step1Hash.vue"), meta: { title: `第一步 · ${STEP_TITLES[0]}` } },
    { path: "/steps/2", name: "step-2", component: () => import("@/pages/steps/Step2Files.vue"), meta: { title: `第二步 · ${STEP_TITLES[1]}` } },
    { path: "/steps/3", name: "step-3", component: () => import("@/pages/steps/Step3Consistency.vue"), meta: { title: `第三步 · ${STEP_TITLES[2]}` } },
    { path: "/steps/4", name: "step-4", component: () => import("@/pages/steps/Step4Anchor.vue"), meta: { title: `第四步 · ${STEP_TITLES[3]}` } },
    { path: "/verify", name: "verify", component: () => import("@/pages/verify/index.vue"), meta: { title: "证据包核验" } },
    { path: "/:pathMatch(.*)*", redirect: "/" }
  ],
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 80 }
    return { top: 0 }
  }
})

router.afterEach((to) => {
  const title = import.meta.env.VITE_APP_TITLE || "存证链核验"
  document.title = to.meta.title ? `${to.meta.title} | ${title}` : title
})
