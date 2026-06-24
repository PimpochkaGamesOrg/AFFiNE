# Автоматизация окрашивания персонажей в Notion

Документация по системе из проекта **NotionBot**. Описывает полный цикл: от нажатия кнопки в Notion до PATCH блоков с цветным rich text. Подходит для переноса на другой сайт или в другой NestJS/FastAPI сервис.

---

## 1. Назначение

Сервис получает webhook от Notion, читает страницу сценария, находит реплики персонажей, назначает каждому персонажу цвет и записывает его обратно в Notion через `annotations.color` и `bold` в rich text.

**Триггер:** кнопка/automation в Notion, отправляющая `POST` на `/webhook`.

**Результат:** блоки с диалогами окрашены цветом персонажа. Имя персонажа внутри блока дополнительно выделяется жирным.

---

## 2. Архитектура

```
Notion (кнопка на странице сценария)
    |
    v
POST /webhook  -->  NotionController.handleWebhook()
    |
    +-- findPageIdInData(body)           # извлечь page_id
    +-- getPage(pageId)                  # GET /v1/pages/{id}
    |
    v
NotionService.processPage(pageData)      # основная логика
    |
    +-- ensureCharacterColorsLoaded()    # lazy load справочника
    |       +-- scanCharacterColors()    # POST /v1/databases/{id}/query
    |
    +-- getPageContent(pageId)           # GET /v1/blocks/{id}/children
    +-- detectDialogueBlocks()           # парсинг текста
    +-- assignColors()                   # приоритеты + разрешение конфликтов
    +-- processRichText()                # сборка rich_text с цветом
    +-- updateBlock() x N                # PATCH /v1/blocks/{id} (батчами)
```

### Файлы в NotionBot

| Файл                               | Роль                                          |
| ---------------------------------- | --------------------------------------------- |
| `dist/notion/notion.controller.js` | Webhook `POST /webhook`, извлечение `page_id` |
| `dist/notion/notion.service.js`    | Вся логика окрашивания                        |
| `dist/main.js`                     | Запуск сервера, порт, CORS                    |

---

## 3. API endpoints

| Метод  | Путь       | Назначение                                  |
| ------ | ---------- | ------------------------------------------- |
| `GET`  | `/webhook` | Health-check для настройки webhook в Notion |
| `POST` | `/webhook` | **Окрашивание персонажей**                  |
| `GET`  | `/health`  | `{ status: 'ok' }`                          |

**Production URL (из `main.js`):** `https://apinotion.teeny.games/webhook`  
**Локально:** `http://localhost:{PORT}/webhook` (порт по умолчанию `25570`)

### Формат ответа webhook

Успех:

```json
{
  "status": "success",
  "message": "Страница abc12345... обработана",
  "database_id": "optional-uuid"
}
```

Частичный успех (страница получена, окрашивание упало):

```json
{
  "status": "partial_success",
  "message": "Страница получена, но возникла ошибка при обработке: ...",
  "page_id": "abc12345..."
}
```

Ошибка:

```json
{
  "status": "error",
  "message": "page_id не найден в запросе..."
}
```

---

## 4. Конфигурация

### Переменные окружения

| Переменная     | Обязательна | Описание                            |
| -------------- | ----------- | ----------------------------------- |
| `NOTION_TOKEN` | Да          | Integration token Notion            |
| `PORT`         | Нет         | Порт HTTP-сервера (default `25570`) |

### Hardcoded в `NotionService`

**ID базы персонажей** (справочник цветов):

```
c577c7de92044874a8921b00d360ac1b
```

**Главные персонажи** (защищены при разрешении конфликтов цветов):
`СИМБА`, `ТИГРА`, `МУРСДЕЙ`, `БУЛЛИ`, `БЕНЧИК`

**Закреплённые цвета webhook** (высший приоритет, не перекрашиваются):
| Персонаж | Цвет Notion |
|----------|-------------|
| СИМБА | `orange` |
| АРТИ | `green` |
| МУРСДЕЙ | `purple` |
| БЕНЧИК | `blue` |
| ТИГРА | `red` |
| БУЛЛИ | `brown` |
| БАНТИК | `pink` |

**Палитра для случайного назначения:**
`green`, `orange`, `purple`, `brown`, `blue`, `yellow`, `red`, `pink`, `gray`

**Notion API:**

- Base URL: `https://api.notion.com/v1`
- Version header: `Notion-Version: 2022-06-28`
- Timeout: 90000 ms

---

## 5. Справочник персонажей (Notion Database)

### Схема

База данных с ID `c577c7de92044874a8921b00d360ac1b`:

| Свойство            | Тип                                                          | Назначение     |
| ------------------- | ------------------------------------------------------------ | -------------- |
| Title (любое имя)   | `title`                                                      | Имя персонажа  |
| `Цвет для сценария` | `select` / `rich_text` / `text` / `formula` / `multi_select` | Цвет персонажа |

### Загрузка (`scanCharacterColors`)

1. `POST /databases/{databaseId}/query` с пагинацией (`start_cursor`)
2. Для каждой строки: имя из `title`, цвет из `Цвет для сценария`
3. Имя нормализуется в `UPPERCASE`
4. Цвет переводится через `translateColorToEnglish()` (русский/английский -> токен Notion)
5. Результат: `characterColors: Record<string, string>`, например `{ "СИМБА": "orange" }`

**Кэш:** загружается один раз за жизнь процесса (`ensureCharacterColorsLoaded`). После изменений в базе нужен рестарт сервера.

**Retry:** до 3 попыток с exponential backoff (5s, 10s, 15s max).

---

## 6. Формат сценария в Notion

Система ожидает русскоязычный сценарий анимации. Поддерживаемые типы блоков:
`paragraph`, `heading_1/2/3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `quote`, `callout`, `toggle`

### Примеры валидных диалогов

**Вариант A - три строки в одном блоке:**

```
СИМБА
(радостно)
Привет, друзья!
```

**Вариант B - две строки в одном блоке:**

```
ТИГРА
Что случилось?
```

**Вариант C - имя, эмоция и реплика в разных блоках:**

```
Блок 1: СИМБА
Блок 2: (грустно)
Блок 3: Я устал.
```

**Вариант D - имя+эмоция в одном блоке, реплика в следующем:**

```
Блок 1: СИМБА
(радостно)
Блок 2: Ура!
```

### Что НЕ окрашивается (action blocks)

Паттерны `isAction()`:

- `Кадр с...`
- `Отрывок из...`
- `Смена ракурса`
- `По графу`
- `Тут же`
- `![` (markdown-картинки)

### Эмоции

Строка в скобках: `(радостно)`, `(грустно)` - распознаётся `isEmotion()`.

### Реплики (`isReplicaBlock`)

Считается репликой, если:

- обёрнута в `**bold**`
- заканчивается на `?`, `!`, `…`
- обёрнута в кавычки `«...»`, `"..."`, `'...'`

### Второстепенные персонажи

Если имя не в справочнике, `extractPotentialCharacterName()` пытается распознать:

- одно слово с заглавной буквы, до 20 символов
- комбинации типа `ПЕРВЫЙ КОТ`, `ВТОРОЙ МЫШЬ` (ординалы + существительные)

---

## 7. Алгоритм `processPage` (пошагово)

### Шаг 1. Загрузка цветов

```javascript
await ensureCharacterColorsLoaded();
```

### Шаг 2. Чтение блоков страницы

```javascript
const blocks = await getPageContent(pageId);
// -> массив textBlocks: { block, blockType, blockId, richText, fullText }
```

### Шаг 3. Детекция диалогов

Для каждого текстового блока `i`:

1. Пропустить action-блоки
2. Проверить `isDialogueBlock(fullText)` - диалог в одном блоке
3. Иначе разобрать построчно:
   - имя на первой строке
   - эмоция на второй (опционально)
   - реплика на второй/третьей строке или в следующих блоках
4. Продолжение реплики: следующие блоки того же персонажа, пока не встретится action, эмоция или другой персонаж

Результат: `blocksToColor: Array<{ index, characterName }>`

### Шаг 4. Назначение цветов

Для каждого уникального `characterName` (приоритет сверху вниз):

1. `getFixedWebhookColor(name)` - hardcoded map
2. `characterColors[name]` - из Notion DB
3. `getRandomColor(usedColors)` - случайный из незанятых

### Шаг 5. Разрешение конфликтов

Если два персонажа получили один цвет:

- до 10 итераций
- не трогать персонажей с fixed webhook color
- предпочитать перекрашивать не-главных (`mainCharacters`)
- выбрать новый случайный цвет из незанятых

### Шаг 6. Применение к Notion

Для каждого блока с `color !== 'default'`:

```javascript
const processedText = processRichText(richText, color, characterName);
await updateBlock(blockId, processedText, blockType);
```

**Rate limiting:**

- `BATCH_SIZE = 5` блоков параллельно
- `BATCH_DELAY_MS = 350` между батчами

---

## 8. Формат rich text для Notion API

`processRichText` возвращает массив сегментов:

```json
[
  {
    "type": "text",
    "text": { "content": "СИМБА" },
    "annotations": {
      "bold": true,
      "italic": false,
      "strikethrough": false,
      "underline": false,
      "code": false,
      "color": "orange"
    }
  },
  {
    "type": "text",
    "text": { "content": "\n(радостно)\nПривет!" },
    "annotations": {
      "bold": true,
      "color": "orange"
    }
  }
]
```

**PATCH запрос:**

```http
PATCH /v1/blocks/{block_id}
Content-Type: application/json
Notion-Version: 2022-06-28
Authorization: Bearer {NOTION_TOKEN}

{
  "paragraph": {
    "rich_text": [ ... ]
  }
}
```

Тип блока (`paragraph`, `heading_1`, и т.д.) подставляется динамически.

### Допустимые значения `annotations.color`

`default`, `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`

---

## 9. Извлечение page_id из webhook

`findPageIdInData(obj)` рекурсивно ищет ID в теле запроса:

1. `obj.entity.id` (type/object = page)
2. `obj.data.id` (object = page)
3. `obj.page_id`
4. `obj.id` (если есть признаки страницы: type, object, parent, properties)
5. `obj.url` с `notion.so` -> `extractIdFromUrl()`
6. Рекурсия по всем ключам объекта

Валидный ID: 32 hex-символа или UUID (36 символов).

---

## 11. Перенос на другой сайт

### Минимальный набор для интеграции

1. **HTTP endpoint** `POST /webhook` с парсингом `page_id`
2. **Notion client** с токеном и version header `2022-06-28`
3. **Модуль загрузки справочника** - query database, map name -> color
4. **Парсер сценария** - функции `isAction`, `isEmotion`, `isReplicaBlock`, `isDialogueBlock`, `getCharacterName`
5. **Color assigner** - fixed colors + DB + random + conflict resolution
6. **Rich text builder** - `processRichText`
7. **Block updater** - PATCH с батчингом

### Что нужно адаптировать

| Параметр                | Где менять                          |
| ----------------------- | ----------------------------------- |
| ID базы персонажей      | `databaseId` в конструкторе сервиса |
| Закреплённые цвета      | `fixedWebhookCharacterColors`       |
| Главные персонажи       | `mainCharacters` Set                |
| Палитра                 | `availableColors`                   |
| Маппинг цветов RU->EN   | `colorMap`                          |
| Имя свойства цвета в DB | сейчас `Цвет для сценария`          |
| Паттерны action-блоков  | `isAction()` regex list             |
| Webhook URL             | Notion automation + DNS             |

### Псевдокод для любого backend

```python
async def handle_webhook(body):
    page_id = find_page_id(body)
    page = await notion.get_page(page_id)
    await coloring.process_page(page)

class ColoringService:
    async def process_page(self, page):
        await self.ensure_colors_loaded()
        blocks = await self.get_text_blocks(page.id)
        to_color = self.detect_dialogues(blocks)
        color_map = self.assign_colors(to_color)
        updates = self.build_rich_text_updates(blocks, to_color, color_map)
        await self.patch_blocks_batched(updates, batch_size=5, delay_ms=350)
```

### Зависимости (Node.js / NestJS)

```json
{
  "@nestjs/common": "^10.4.20",
  "@nestjs/config": "^3.2.3",
  "axios": "^1.7.9"
}
```

---

## 12. Ограничения и edge cases

- Блоки с `color === 'default'` не обновляются (остаются как есть)
- Цвета кэшируются в памяти до рестарта
- Неизвестные персонажи получают случайный цвет из палитры
- При исчерпании палитры возвращается `default`
- Поддерживается только верхний уровень блоков страницы (без вложенных children)
- Integration должна иметь write-доступ к блокам страницы

---
