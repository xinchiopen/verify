<template>
  <figure class="pkg-diagram">
    <pre class="pkg-diagram__tree" aria-label="证据包目录结构">证据包_申请单号.zip
├── manifest.json            清单：运单摘要、节点与签收单列表、运输段、文件摘要（库内记录）
├── nodes/
│   ├── {节点uuid}.json      节点原文 data、上链时间、前驱哈希、本节点哈希、后继线索
│   └── …                    一张司机签收单对应一个节点；作废单的节点也在
└── files/
    ├── images/{图片uuid}.jpg   带水印的签单照片（存证即此文件）
    ├── signatures/{uuid}.png   收发货人手写签名
    └── receipts/{uuid}.pdf     送货签收时生成的电子回执</pre>
    <figcaption class="small muted">
      前驱节点只给出哈希，后继节点只给出编号、时间与哈希；其他运单的任何原文都不在包内。
    </figcaption>
  </figure>
</template>

<style scoped>
.pkg-diagram {
  margin: 0 0 1.4em;
}

.pkg-diagram__tree {
  font-size: 13px;
  line-height: 1.6;
}

figcaption {
  margin-top: 6px;
}
</style>
