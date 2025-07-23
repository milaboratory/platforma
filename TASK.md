# Задача: Удаление зависимостей vite/rollup/vue-tsc из пакетов с @milaboratories/ts-builder

## Список package.json файлов с зависимостью @milaboratories/ts-builder:

### UI компоненты блоков (etc/blocks/*/ui/):
- [x] `etc/blocks/blob-url-custom-protocol/ui/package.json` ✅ Чистый
- [x] `etc/blocks/download-file/ui/package.json` ✅ Чистый
- [x] `etc/blocks/enter-numbers/ui/package.json` ✅ Чистый
- [x] `etc/blocks/model-test/ui/package.json` ✅ Чистый
- [x] `etc/blocks/monetization-test/ui/package.json` ✅ Чистый
- [x] `etc/blocks/pool-explorer/ui/package.json` ✅ Чистый
- [x] `etc/blocks/read-logs/ui/package.json` ✅ Чистый
- [x] `etc/blocks/sum-numbers/ui/package.json` ✅ Чистый
- [x] `etc/blocks/ui-examples/ui/package.json` ✅ Чистый
- [x] `etc/blocks/upload-file/ui/package.json` ✅ Чистый

### Библиотеки модели (lib/model/):
- [x] `lib/model/common/package.json` ✅ Чистый (только vitest для тестов)

### Node.js библиотеки (lib/node/):
- [x] `lib/node/computable/package.json` ✅ Чистый (только vitest для тестов)
- [x] `lib/node/node-streams/package.json` ✅ Чистый
- [x] `lib/node/pl-client/package.json` ✅ Чистый
- [x] `lib/node/pl-config/package.json` ✅ Чистый
- [x] `lib/node/pl-drivers/package.json` ✅ Очищен (удалены vite, rollup)
- [x] `lib/node/pl-errors/package.json` ✅ Чистый (только vitest для тестов)
- [x] `lib/node/pl-http/package.json` ✅ Чистый (только vitest для тестов)
- [x] `lib/node/pl-middle-layer/package.json` ✅ Чистый (только vitest для тестов)
- [x] `lib/node/pl-tree/package.json` ✅ Чистый
- [x] `lib/node/ts-helpers/package.json` ✅ Чистый

### Другие библиотеки:
- [x] `lib/other/biowasm-tools/package.json` ✅ Чистый
- [x] `lib/ui/uikit/package.json` ✅ Чистый (только vitest для тестов)
- [x] `lib/util/helpers/package.json` ✅ Чистый

### SDK:
- [x] `sdk/model/package.json` ✅ Очищен (удалены vite, rollup)
- [x] `sdk/ui-vue/package.json` ✅ Чистый

### Инструменты:
- [ ] `tools/ts-builder/package.json` ⚠️ Сам пакет ts-builder - НЕ трогать

**Итого: 27 файлов**

## Зависимости для удаления:
Необходимо удалить следующие зависимости (если присутствуют):
- `vite` (сборщик)
- `@vitejs/plugin-vue` (плагин для Vue)
- `rollup` (сборщик)
- `vue-tsc` (типы для Vue)
- Любые другие связанные с vite/rollup плагины для сборки

**ВАЖНО: НЕ удалять:**
- `vitest` (тестовый фреймворк)
- `@vitest/*` пакеты (связанные с тестированием)

## Прогресс:
- [ ] Анализ зависимостей в каждом файле
- [ ] Удаление ненужных зависимостей
- [ ] Проверка работоспособности после изменений