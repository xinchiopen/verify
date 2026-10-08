<script setup lang="ts">
import type { ManifestOrder, PackageNode } from "@/lib/types"

defineProps<{ nodes: PackageNode[], orders: ManifestOrder[] }>()
const SIGNED_TYPE: Record<number, string> = { 1: "提货单", 2: "送货签收单", 3: "接力单" }
</script>

<template>
  <section class="voided">
    <table class="small">
      <thead>
        <tr>
          <th>签收单</th>
          <th>签单时间</th>
          <th>作废时间</th>
          <th>作废原因</th>
          <th>链节点</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="node in nodes" :key="node.uuid">
          <td>{{ SIGNED_TYPE[node.order.signed_type ?? 0] ?? "签收单" }} #{{ node.order.id }}</td>
          <td>{{ node.order.time_signed }}</td>
          <td>{{ node.order.voided_at ?? "" }}</td>
          <td>{{ node.order.void_reason || "未填" }}</td>
          <td><code class="mono">{{ node.uuid }}</code></td>
        </tr>
        <tr v-for="order in orders.filter(item => item.voided && !nodes.some(node => node.order.id === item.id))" :key="order.id">
          <td>{{ SIGNED_TYPE[order.signed_type ?? 0] ?? "签收单" }} #{{ order.id }}（{{ order.note === "backfill" ? "后台补录" : "未关联节点" }}）</td>
          <td>{{ order.time_signed }}</td>
          <td>{{ order.voided_at ?? "" }}</td>
          <td>{{ order.void_reason || "未填" }}</td>
          <td class="muted">
            无
          </td>
        </tr>
      </tbody>
    </table>
    <p class="small muted">
      作废是链外的业务标记：链上节点不会因此改变或消失。上面的节点仍参与了哈希与文件核验，但不参与事件序列与运输段推导。
    </p>
  </section>
</template>

<style scoped>
.voided code {
  overflow-wrap: anywhere;
}
</style>
