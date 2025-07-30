# Задача:
- Удаление зависимостей vite/rollup/vue-tsc из всех пакетов кроме с @milaboratories/ts-builder
- Замена vite/rollup на ts-builder build/watch
- Замена vue-tsc/tsc на ts-builder types
- Убарать из dependencies vite/rollup/vue-tsc

# Шаги:
- Найти все пакеты с зависемоятсями vite/rollup/vue-tsc или конфигами для rollup/vite
- Добавить список в этот файл
- Начать поэтапно обновлять все найденные пакеты

## Найденные пакеты для миграции:

### ✅ ЗАВЕРШЕНО: Все пакеты с rollup зависимостями:
1. ✅ `/lib/node/ts-helpers-oclif/package.json` - удалены vite и rollup из devDependencies
2. ✅ `/lib/node/ts-helpers-winston/package.json` - удалены vite и rollup из devDependencies
3. ✅ `/tools/tengo-builder/package.json` - заменен rollup на ts-builder
4. ✅ `/lib/model/middle-layer/package.json` - заменен rollup на ts-builder
5. ✅ `/lib/node/resolve-helper/package.json` - удален rollup из devDependencies
6. ✅ `/lib/model/backend/package.json` - заменен rollup на ts-builder
7. ✅ `/lib/model/pl-error-like/package.json` - заменен rollup на ts-builder
8. ✅ `/sdk/test/package.json` - заменен rollup на ts-builder
9. ✅ `/lib/util/sequences/package.json` - заменен rollup на ts-builder
10. ✅ `/lib/node/pl-deployments/package.json` - заменен rollup на ts-builder
11. ✅ `/tools/pl-bootstrap/package.json` - заменен rollup на ts-builder
12. ✅ `/tools/package-builder/package.json` - заменен rollup на ts-builder
13. ✅ `/tools/oclif-index/package.json` - заменен rollup на ts-builder
14. ✅ Все блоки в `/etc/blocks/**/model/` - заменены rollup на ts-builder с --target block-model
15. ✅ `/tests/drivers-ml-blocks-integration/package.json` - заменен rollup на ts-builder
16. ✅ `/tests/config-local-ml-integration/package.json` - заменен rollup на ts-builder

### ✅ ЗАВЕРШЕНО: Все пакеты с vue-tsc зависимостями:
1. ✅ `/sdk/ui-vue/package.json` - удален vue-tsc (уже есть в ts-builder)
2. ✅ `/etc/uikit-playground/package.json` - удален vue-tsc (не используется)

## ✅ ЗАДАЧА ЗАВЕРШЕНА! 

Все пакеты успешно мигрированы с vite/rollup/vue-tsc на ts-builder:
- Удалены все зависимости vite/rollup/vue-tsc из devDependencies
- Заменены все build скрипты с rollup на ts-builder
- Заменены все type-check скрипты с tsc на ts-builder types
- Удалены все rollup.config.mjs файлы  
- Добавлены watch скрипты для удобства разработки
- Для блоков в etc/blocks/**/model используется --target block-model
- Для остальных пакетов используется --target node или --target browser-lib

### Исключения (НЕ трогать):
- `/tools/ts-builder/package.json` - сам ts-builder, содержит vue-tsc как зависимость
- Пакеты только с vitest зависимостями (по требованию в ограничениях)
- `/etc/uikit-playground/` - оставлен vite для dev режима (playground)

# Ограничения
- нетройгай ничего кроме того что я описал. Никаких vitest/jest/etc
- все пакеты находящиеся в etc/blocks/**/model должны иметь --target block-model