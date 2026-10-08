<script setup lang="ts">
import { useFeishuConnection } from "@/composables/useFeishuConnection"
import { VERIFIER_VERSION } from "@/lib/version"

const { proxyBaseDisplay } = useFeishuConnection()
</script>

<template>
  <footer class="app-footer no-print">
    <div class="container app-footer__inner">
      <p class="small muted">
        本站所有计算在您的浏览器内完成，上传的证据包不会发送到任何服务器；只有您主动填写飞书凭证拉取群消息（经飞书转发代理 {{ proxyBaseDisplay }} 转发到飞书）或开启在线地图时才会发出外部请求。核验库版本 {{ VERIFIER_VERSION }}。
      </p>
      <p class="small faint">
        存证链是基于哈希链的签收留痕机制，提供篡改可检测性；不属于公有链，不含可信时间戳与证书签名，核验结论不构成法律意见。
      </p>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  border-top: 1px solid var(--rule);
  padding: 28px 0 40px;
}

.app-footer__inner p {
  max-width: none;
  margin-bottom: 6px;
}
</style>
