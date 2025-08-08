const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("❌ BOT_TOKEN не найден в .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

let raw;
try {
  raw = fs.readFileSync(path.join(__dirname, "bible.json"), "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
} catch (err) {
  console.error("❌ Ошибка чтения bible.json:", err.message);
  process.exit(1);
}
const bibleData = JSON.parse(raw);

const newTestamentStartIndex = bibleData.findIndex(
  (book) => book.name.toLowerCase() === "от матфея"
);
const oldTestamentBooks =
  newTestamentStartIndex === -1
    ? bibleData
    : bibleData.slice(0, newTestamentStartIndex);
const newTestamentBooks =
  newTestamentStartIndex === -1 ? [] : bibleData.slice(newTestamentStartIndex);

const activeUsers = new Set();
const userState = new Map();

module.exports = {
  token,
  bot,
  bibleData,
  oldTestamentBooks,
  newTestamentBooks,
  activeUsers,
  userState
};