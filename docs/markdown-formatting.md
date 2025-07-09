# Markdown Formatting Guide

This guide outlines the markdown formatting conventions to be used for consistency across documents.

## Headers

- Use ATX-style headers (`#`, `##`, `###`, etc.).
- Always put a space after the `#` characters.
- For numbered sections, put a space between the number and the title text.
- Do not make header titles bold.

**Correct:**
```markdown
## 1. Introduction
### 1.1. The Problem
```

**Incorrect:**
```markdown
##1.Introduction
## 1. **Introduction**
```

## Lists

### Unordered Lists

- Use a hyphen (`-`) for unordered list items.
- For lists describing features or components, start the item with the feature name in bold, followed by a colon.

**Example:**
```markdown
- **Simplify Asset-Heavy Package Creation:** Provide a zero-config-preferred CLI tool...
- **mode** (string, required): The mode of operation.
```

### Ordered Lists

- Use `1.` for ordered list items.
- Use ordered lists for sequential steps or workflows.

**Example:**
```markdown
1. Initialize a new NPM package.
2. Run `npm install`.
```

## Spacing

- Use a single blank line to separate paragraphs, headers, lists, and code blocks.
- Do not use multiple blank lines.

## Code

- Use backticks for inline code: `` `my-variable` ``.
- Use triple backticks for code blocks, and specify the language for syntax highlighting.

**Example:**
````markdown
```typescript
// some typescript code
export const myAssetPackage: Record<AssetKeys, AssetFile>;
```
````
