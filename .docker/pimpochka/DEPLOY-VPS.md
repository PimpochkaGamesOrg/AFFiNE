# AFFiNE self-host на VPS (Pimpochka)

Краткая инструкция: первая установка, обновление, перезапуск.

## Требования

- Ubuntu VPS, Docker + Docker Compose
- RAM 4 GB+, **swap 8 GB** (`fallocate -l 8G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`)
- Диск **30+ GB** свободно (первая сборка ~15-25 GB)
- nginx с `proxy_pass http://127.0.0.1:3010;` (если нужен HTTPS)

## Структура на сервере

```
/opt/affine-build/     # клон репозитория (сборка)
/opt/affine/           # установка (compose, данные)
  docker-compose.yml
  .env
  scripts/self-host-predeploy.js  # копия из packages/backend/server/scripts/
  data/postgres/       # БД
  data/storage/        # файлы
  data/config/         # config.json, private.key
```

## Первая установка

```bash
git clone https://github.com/PimpochkaGamesOrg/AFFiNE.git /opt/affine-build
cd /opt/affine-build
git checkout canary
chmod +x scripts/selfhost-*.sh scripts/fix-selfhost-migration.sh

# swap 8G если ещё нет
./scripts/selfhost-fresh-install.sh --yes
```

Первая сборка образа: **1-3 часа**.

После установки:

- URL: `http://IP:3010` (или через nginx)
- Пароль Postgres: `grep DB_PASSWORD /opt/affine/.env`
- Лимит участников: `AFFINE_SELFHOST_MEMBER_LIMIT=100` в `.env`
- Инвайты без 24ч: `data/config/config.json` → `"auth": { "newAccountShareActionDelay": 0 }`

## Обновление версии (после git push в форк)

```bash
cd /opt/affine-build
git pull

# пересборка образа (20-60 мин с кэшем)
./scripts/selfhost-build.sh

# миграции БД (после обновления схемы)
./scripts/fix-selfhost-migration.sh /opt/affine

# или вручную:
# cp .docker/pimpochka/compose.yml /opt/affine/docker-compose.yml
# cp packages/backend/server/scripts/self-host-predeploy.js /opt/affine/scripts/
# cd /opt/affine && docker compose run --rm affine_migration
# docker compose up -d
```

## Обычный перезапуск (без обновления кода)

```bash
cd /opt/affine
docker compose restart affine
# или
docker compose up -d
```

Сервер **не ждёт** migration при старте. Migration нужна только при обновлении образа.

## Смена лимита участников (без пересборки)

```bash
# /opt/affine/.env
AFFINE_SELFHOST_MEMBER_LIMIT=100

cd /opt/affine && docker compose restart affine
```

## Бэкап

```bash
tar -czf /root/affine-backup-$(date +%F).tar.gz \
  /opt/affine/data /opt/affine/.env /opt/affine/scripts
```

## Частые проблемы

### 502 Bad Gateway (nginx)

Сервер не слушает 3010:

```bash
cd /opt/affine
docker compose ps -a
docker compose up -d affine --no-deps
docker compose logs affine --tail 30
curl -I http://127.0.0.1:3010
```

### Migration падает с `yarn` / lockfile

В образе старый скрипт. На хосте должен быть исправленный файл:

```bash
./scripts/fix-selfhost-migration.sh /opt/affine
```

Проверка: `head -1 /opt/affine/scripts/self-host-predeploy.js` → `import { execFileSync }`.

### Нет места на диске при сборке

```bash
docker system prune -a -f
docker builder prune -a -f
df -h
```

### Полная переустановка (удаляет данные!)

```bash
cd /opt/affine-build
./scripts/selfhost-fresh-install.sh --yes
```

## Полезные команды

```bash
docker compose -f /opt/affine/docker-compose.yml ps
docker compose -f /opt/affine/docker-compose.yml logs -f affine
docker images pimpochka/affine:latest
```
