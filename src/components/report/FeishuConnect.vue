<script setup lang="ts">
import { computed } from "vue"
import { DEFAULT_FEISHU_API_BASE, useFeishuConnection } from "@/composables/useFeishuConnection"

const props = defineProps<{ targetCount: number, busy?: boolean }>()
const emit = defineEmits<{ fetchAll: [] }>()
const { state, isConnected, proxyBaseDisplay, proxyBaseValid, connect, disconnect, resetProxyBase } = useFeishuConnection()

const expiresText = computed(() => state.expiresAt ? new Date(state.expiresAt).toLocaleTimeString("zh-CN", { hour12: false }) : "")
const canConnect = computed(() => state.appId.trim().length > 0 && state.appSecret.trim().length > 0 && proxyBaseValid.value && !state.connecting)
</script>

<template>
  <section class="feishu">
    <h3 class="feishu__title">
      用飞书凭证直接拉取消息（可选）
    </h3>
    <p class="small muted feishu__intro">
      填入一个<strong>已加入存证群</strong>且开通了「获取单聊、群组消息」（<code>im:message:readonly</code>，群消息还需 <code>im:message.group_msg</code>）权限的飞书自建应用凭证，核验工具会按节点文件里的飞书消息 id 逐条拉取正文并比对，同时核对飞书记录的发送时间。
    </p>
    <p class="small feishu__warning">
      飞书接口不允许浏览器跨域直连，请求会经飞书转发代理 <code>{{ proxyBaseDisplay }}</code> 原样转发到 <code>open.feishu.cn</code>：代理无状态、不持有凭证、不写日志。令牌只保存在当前页面内存里；凭证默认也只在内存。可在下方「高级」改为您自己部署的代理（nginx 同源反代，或本仓库 <code>worker/</code> 的 Cloudflare Worker）；若不希望经由任何代理，请改用 Python 参考脚本（直连飞书）。
    </p>
    <div class="feishu__form">
      <label class="feishu__field">
        <span class="small muted">App ID</span>
        <input v-model="state.appId" name="app_id" type="text" autocomplete="off" spellcheck="false" placeholder="cli_xxxxxxxxxxxxxxxx">
      </label>
      <label class="feishu__field">
        <span class="small muted">App Secret</span>
        <input v-model="state.appSecret" name="app_secret" type="password" autocomplete="off" placeholder="应用密钥">
      </label>
      <label class="feishu__remember small">
        <input v-model="state.remember" type="checkbox"> 本次会话记住凭证（关闭标签页即清除）
      </label>
      <details class="feishu__advanced">
        <summary class="small">
          高级：转发代理地址
        </summary>
        <label class="feishu__field">
          <span class="small muted">代理地址（根相对路径或 https:// 开头，不含末尾斜杠；修改后需重新连接）</span>
          <input v-model="state.proxyBase" name="proxy_base" type="text" autocomplete="off" spellcheck="false" :placeholder="DEFAULT_FEISHU_API_BASE">
        </label>
        <p class="small muted feishu__advanced-note">
          当前生效：<code>{{ proxyBaseDisplay }}</code>，随「本次会话记住」一起保存。
          <button type="button" class="btn--quiet small" @click="resetProxyBase">
            恢复默认
          </button>
        </p>
        <p v-if="!proxyBaseValid" class="small status-fail">
          地址须以 / 或 https:// 开头
        </p>
      </details>
    </div>
    <div class="feishu__actions no-print">
      <button type="button" class="btn" :disabled="!canConnect" @click="connect">
        {{ state.connecting ? "正在连接…" : isConnected ? "重新连接" : "连接飞书" }}
      </button>
      <button type="button" class="btn btn--primary" :disabled="!isConnected || props.busy || props.targetCount === 0" @click="emit('fetchAll')">
        {{ props.busy ? "正在拉取…" : `全部拉取（${props.targetCount} 条）` }}
      </button>
      <button v-if="isConnected || state.appSecret" type="button" class="btn--quiet small" @click="disconnect(true)">
        断开并清除凭证
      </button>
      <span v-if="isConnected" class="small status-pass">已连接，令牌有效至 {{ expiresText }}</span>
      <span v-else-if="state.error" class="small status-fail">{{ state.error }}</span>
    </div>
  </section>
</template>

<style scoped>
.feishu {
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 18px;
}

.feishu__title {
  margin: 0 0 6px;
  font-size: 17px;
}

.feishu__intro {
  max-width: none;
}

.feishu__warning {
  max-width: none;
  border-left: 3px solid var(--warn);
  background: var(--warn-soft);
  padding: 8px 12px;
  border-radius: 0 var(--radius) var(--radius) 0;
}

.feishu__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px 16px;
  align-items: start;
  margin-bottom: 10px;
}

.feishu__field {
  display: grid;
  gap: 4px;
}

.feishu__remember {
  grid-column: 1 / -1;
}

.feishu__advanced {
  grid-column: 1 / -1;
  display: grid;
  gap: 6px;
}

.feishu__advanced summary {
  cursor: pointer;
  color: var(--muted);
}

.feishu__advanced-note {
  margin: 0;
}

.feishu__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

@media (max-width: 640px) {
  .feishu__form {
    grid-template-columns: 1fr;
  }
}
</style>
