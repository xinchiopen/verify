<script setup lang="ts">
defineProps<{ compact?: boolean }>()
</script>

<template>
  <figure class="chain-diagram">
    <svg viewBox="0 0 760 300" role="img" aria-label="三个相邻节点各自由 uuid、上链时间、前驱哈希、节点原文四段拼接后做 SHA-512，得到的哈希又成为下一个节点的前驱哈希">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#5d5955" />
        </marker>
      </defs>
      <g v-for="(node, index) in [{ x: 20, label: '节点 N−1' }, { x: 275, label: '节点 N' }, { x: 530, label: '节点 N+1' }]" :key="node.label">
        <rect :x="node.x" y="40" width="210" height="190" rx="3" fill="#fbfaf7" stroke="#b9b2a3" />
        <text :x="node.x + 12" y="64" font-size="15" font-weight="600" fill="#1f1d1a">{{ node.label }}</text>
        <g font-size="12.5" fill="#1f1d1a">
          <rect :x="node.x + 12" y="78" width="186" height="22" fill="#e4ebf3" />
          <text :x="node.x + 18" y="93">① uuid 节点编号</text>
          <rect :x="node.x + 12" y="104" width="186" height="22" fill="#f5ecdc" />
          <text :x="node.x + 18" y="119">② created_at 上链时间（微秒）</text>
          <rect :x="node.x + 12" y="130" width="186" height="22" :fill="index === 0 ? '#ebe9e4' : '#f6e3e1'" />
          <text :x="node.x + 18" y="145">③ prev_signature 前驱哈希</text>
          <rect :x="node.x + 12" y="156" width="186" height="22" fill="#e3efe8" />
          <text :x="node.x + 18" y="171">④ data 节点原文（JSON）</text>
        </g>
        <text :x="node.x + 105" y="198" font-size="12" text-anchor="middle" fill="#5d5955">① + ② + ③ + ④ → SHA-512</text>
        <rect :x="node.x + 12" y="206" width="186" height="18" fill="#f6e3e1" stroke="#b6322a" />
        <text :x="node.x + 105" y="219" font-size="11.5" text-anchor="middle" fill="#b6322a" font-family="ui-monospace, Menlo, monospace">signature（本节点哈希）</text>
      </g>
      <path d="M198 215 C 240 215, 240 141, 287 141" fill="none" stroke="#5d5955" stroke-width="1.6" marker-end="url(#arrow)" />
      <path d="M453 215 C 495 215, 495 141, 542 141" fill="none" stroke="#5d5955" stroke-width="1.6" marker-end="url(#arrow)" />
      <text x="20" y="268" font-size="13" fill="#5d5955">前一个节点的哈希作为下一个节点的输入之一：改动任何一个节点，其后所有节点的哈希都会对不上。</text>
      <text x="20" y="288" font-size="12.5" fill="#8b877f">全链首节点的③为空字符串。链是全系统一条，相邻节点通常属于不同运单。</text>
    </svg>
  </figure>
</template>

<style scoped>
.chain-diagram {
  margin: 0 0 1.4em;
}

.chain-diagram svg {
  width: 100%;
  height: auto;
  display: block;
}
</style>
