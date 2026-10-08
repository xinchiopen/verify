import antfu from "@antfu/eslint-config"

// 风格：双引号、无分号、2 空格缩进
export default antfu(
  {
    formatters: true,
    stylistic: {
      indent: 2,
      quotes: "double",
      semi: false
    },
    // docs/evidence_package_format.md 是后端仓库文档的副本（仅多一行来源说明），保持原样便于同步比对
    ignores: ["dist", "dist-lib", "tests/fixtures/**", "docs/evidence_package_format.md"]
  },
  {
    rules: {
      "vue/block-order": ["error", { order: ["script", "template", "style"] }],
      "vue/attributes-order": "off",
      "ts/no-use-before-define": "off",
      "node/prefer-global/process": "off",
      "style/comma-dangle": ["error", "never"],
      "style/brace-style": ["error", "1tbs"],
      "regexp/no-unused-capturing-group": "off",
      "no-console": "off",
      "symbol-description": "off",
      "antfu/if-newline": "off",
      "unicorn/no-instanceof-builtins": "off"
    }
  }
)
