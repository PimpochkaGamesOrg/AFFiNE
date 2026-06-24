const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const CREDENTIALS_PATH = path.join(process.cwd(), 'youtube-credentials.json');
const TOKENS_DIR = path.join(process.cwd(), 'tokens');
const TOKEN_PATH = path.join(TOKENS_DIR, 'drive-token.json');

async function getAuthUrl(oAuth2Client) {
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function getTokenFromCode(oAuth2Client, code) {
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

async function runAuth() {
  const credPath =
    process.env.DRIVE_CREDENTIALS_PATH ||
    process.env.YOUTUBE_CREDENTIALS_PATH ||
    CREDENTIALS_PATH;
  if (!fs.existsSync(credPath)) {
    console.error('');
    console.error('ОШИБКА: Файл credentials не найден!');
    console.error(
      'Создайте youtube-credentials.json в корне проекта (или укажите DRIVE_CREDENTIALS_PATH).'
    );
    process.exit(1);
  }

  if (fs.existsSync(TOKEN_PATH)) {
    console.log(`Токен Drive уже существует: ${TOKEN_PATH}`);
    console.log('Удалите файл для повторной авторизации.');
    process.exit(0);
  }

  const credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const keys = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    keys.client_id,
    keys.client_secret,
    keys.redirect_uris
      ? keys.redirect_uris[0]
      : 'http://localhost:3000/oauth2callback'
  );

  const authUrl = await getAuthUrl(oAuth2Client);
  console.log('');
  console.log(
    'Авторизация Google Drive (отдельный аккаунт для загрузки видео)'
  );
  console.log('Откройте в браузере:');
  console.log(authUrl);
  console.log('');
  console.log(
    'Важно: войдите в аккаунт Google, у которого есть доступ к файлам на Drive.'
  );
  console.log(
    'После авторизации скопируйте код из URL (?code=...) и вставьте сюда:'
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Код: ', async code => {
    rl.close();
    try {
      const trimmed = code.trim();
      const tokens = await getTokenFromCode(oAuth2Client, trimmed);
      if (!fs.existsSync(TOKENS_DIR)) {
        fs.mkdirSync(TOKENS_DIR, { recursive: true });
      }
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log('');
      console.log('Готово! Токен Drive сохранён в tokens/drive-token.json');
    } catch (err) {
      console.error('Ошибка:', err.message);
      process.exit(1);
    }
  });
}

runAuth().catch(console.error);
