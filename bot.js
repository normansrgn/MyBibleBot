require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
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

// Конвертируем структуру JSON в ожидаемый формат
const convertedBibleData = bibleData.Books.map(book => ({
  id: book.BookId,
  name: book.BookName,
  chapters: book.Chapters.map(chapter => 
    chapter.Verses.map(verse => verse.Text)
  )
}));

// Находим начало Нового Завета
// Новый вариант - разделение по ID книг
// Ветхий Завет: ID 1-39, Новый Завет: ID 40-66
const newTestamentStartIndex = convertedBibleData.findIndex(
  (book) => book.id >= 40
);
const oldTestamentBooks = newTestamentStartIndex === -1
  ? convertedBibleData
  : convertedBibleData.slice(0, newTestamentStartIndex);
const newTestamentBooks = newTestamentStartIndex === -1
  ? []
  : convertedBibleData.slice(newTestamentStartIndex);

const activeUsers = new Set();
const userState = new Map();

// Клавиатуры
const mainReplyKeyboard = {
  reply_markup: {
    keyboard: [
      ["🙏 Случайный стих", "📖 Читать Библию"],
      ["🔍 Поиск", "🏠 Главное меню"],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
};

const backToBooksKeyboard = {
  reply_markup: {
    keyboard: [["⬅️ Назад к книгам"], ["🏠 Главное меню"]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const testamentInlineKeyboard = {
  inline_keyboard: [
    [
      { text: "📜 Ветхий Завет", callback_data: "testament_old" },
      { text: "✝️ Новый Завет", callback_data: "testament_new" },
    ],
  ],
};

// Вспомогательные функции
function getRandomVerse() {
  const book = convertedBibleData[Math.floor(Math.random() * convertedBibleData.length)];
  const chapterIndex = Math.floor(Math.random() * book.chapters.length);
  const chapter = book.chapters[chapterIndex];
  const verseIndex = Math.floor(Math.random() * chapter.length);
  return {
    bookName: book.name,
    chapter: chapterIndex + 1,
    verse: verseIndex + 1,
    text: chapter[verseIndex],
  };
}

function formatVerse({ bookName, chapter, verse, text }) {
  return `_"${text}"_\n\n${bookName} ${chapter}:${verse}`;
}

function splitChapterIntoParts(book, chapterNumber) {
  const chapterIndex = chapterNumber - 1;
  if (!book || !book.chapters[chapterIndex]) return [];

  const verses = book.chapters[chapterIndex];
  const parts = [];
  let currentPart = `📖 *${book.name}* — глава ${chapterNumber}\n\n`;

  for (let i = 0; i < verses.length; i++) {
    const line = `${i + 1}. ${verses[i]}\n`;
    if ((currentPart + line).length > 4000) {
      parts.push(currentPart.trim());
      currentPart = "";
    }
    currentPart += line;
  }

  if (currentPart) parts.push(currentPart.trim());
  return parts;
}

function normalizeBookName(name) {
  return name.toLowerCase().replace(/\s+/g, "");
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function findClosestBookName(inputName) {
  const normalizedInput = normalizeBookName(inputName);
  let closestBook = null;
  let minDistance = Infinity;

  for (const book of convertedBibleData) {
    const normalizedBook = normalizeBookName(book.name);
    const distance = levenshtein(normalizedInput, normalizedBook);
    if (distance < minDistance) {
      minDistance = distance;
      closestBook = book;
    }
  }

  return minDistance <= 5 ? closestBook : null;
}

function searchVerse(query) {
  const regex = /^(\d?\s*[а-яА-ЯёЁ\s]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i;
  const match = query.match(regex);

  if (match) {
    let [, bookNameRaw, chapterStr, verseStr, verseEndStr] = match;
    const bookName = normalizeBookName(bookNameRaw);
    const chapter = parseInt(chapterStr, 10);
    const verse = verseStr ? parseInt(verseStr, 10) : null;
    const verseEnd = verseEndStr ? parseInt(verseEndStr, 10) : null;

    let book = convertedBibleData.find(
      (b) => normalizeBookName(b.name) === bookName ||
        normalizeBookName(b.name).includes(bookName)
    );

    if (!book) book = findClosestBookName(bookName);
    if (!book) return null;

    const chapterIndex = chapter - 1;
    const chapterData = book.chapters[chapterIndex];
    if (!chapterData) return null;

    if (verse && verseEnd) {
      const verses = chapterData.slice(verse - 1, verseEnd);
      if (!verses.length) return null;
      return {
        bookName: book.name,
        chapter,
        verses: verses.map((text, i) => ({
          verse: verse + i,
          text,
        })),
      };
    }

    if (verse) {
      const verseIndex = verse - 1;
      const text = chapterData[verseIndex];
      if (!text) return null;
      return {
        bookName: book.name,
        chapter,
        verse,
        text,
      };
    }

    return { book, chapter };
  }

  const results = [];
  for (const book of convertedBibleData) {
    for (let i = 0; i < book.chapters.length; i++) {
      const chapter = book.chapters[i];
      for (let j = 0; j < chapter.length; j++) {
        const verseText = chapter[j];
        if (verseText.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            bookName: book.name,
            chapter: i + 1,
            verse: j + 1,
            text: verseText,
          });
          if (results.length >= 5) return results;
        }
      }
    }
  }

  return results.length ? results : null;
}

function formatChapter(book, chapterNumber) {
  const parts = splitChapterIntoParts(book, chapterNumber);
  return parts[0] || "Глава не найдена.";
}

function getBooksInlineKeyboard(books, testament, chatId) {
  // Сохраняем выбор завета в состоянии пользователя
  if (testament && chatId) {
    userState.set(chatId, testament);
  }

  const keyboard = [];
  const booksToShow = testament === "old" ? oldTestamentBooks : newTestamentBooks;
  
  for (let i = 0; i < booksToShow.length; i += 3) {
    const row = booksToShow.slice(i, i + 3).map((book) => ({
      text: book.name,
      callback_data: `book_${book.name}`,
    }));
    keyboard.push(row);
  }
  
  keyboard.push([
    { text: "⬅️ Назад к выбору Завета", callback_data: "back_to_testament" },
  ]);
  
  return { inline_keyboard: keyboard };
}

function getChaptersInlineKeyboard(bookName) {
  const book = convertedBibleData.find((b) => b.name === bookName);
  if (!book) return null;
  const chaptersCount = book.chapters.length;
  const keyboard = [];
  for (let i = 1; i <= chaptersCount; i += 5) {
    const row = [];
    for (let j = i; j < i + 5 && j <= chaptersCount; j++) {
      row.push({
        text: j.toString(),
        callback_data: `chapter_${bookName}_${j}`,
      });
    }
    keyboard.push(row);
  }
  keyboard.push([
    { text: "⬅️ Назад к книгам", callback_data: "back_to_books" },
  ]);
  return { inline_keyboard: keyboard };
}

function getChapterPartKeyboard(bookName, chapterNumber, partIndex, partsCount, book) {
  const buttons = [];
  
  if (partsCount > 1) {
    const navRow = [];
    if (partIndex > 0) navRow.push({
      text: "⬅️ Назад",
      callback_data: `chapter_part_${bookName}_${chapterNumber}_${partIndex - 1}`,
    });
    navRow.push({ text: `${partIndex + 1}/${partsCount}`, callback_data: "noop" });
    if (partIndex < partsCount - 1) navRow.push({
      text: "Вперёд ➡️",
      callback_data: `chapter_part_${bookName}_${chapterNumber}_${partIndex + 1}`,
    });
    buttons.push(navRow);
  }

  const chapterNavRow = [];
  if (chapterNumber > 1) chapterNavRow.push({
    text: "⬅️ Пред. глава",
    callback_data: `chapter_${bookName}_${chapterNumber - 1}`,
  });
  if (chapterNumber < book.chapters.length) chapterNavRow.push({
    text: "След. глава ➡️",
    callback_data: `chapter_${bookName}_${chapterNumber + 1}`,
  });
  if (chapterNavRow.length) buttons.push(chapterNavRow);

  buttons.push([{ text: "⬅️ Назад к главам", callback_data: `book_${bookName}` }]);
  buttons.push([{ text: "⬅️ Назад к книгам", callback_data: "back_to_books" }]);

  if (chapterNumber === book.chapters.length) {
    const bookIdx = convertedBibleData.findIndex((b) => b.name === bookName);
    if (bookIdx + 1 < convertedBibleData.length) {
      const nextBook = convertedBibleData[bookIdx + 1];
      buttons.push([{
        text: `➡️ Перейти к следующей книге: ${nextBook.name}`,
        callback_data: `book_${nextBook.name}`,
      }]);
    }
  }
  
  return { inline_keyboard: buttons };
}

function getStartMessage() {
  return `🌿 Добро пожаловать, ищущий света! 🌿

📜 "Слово Твое — светильник ноге моей и свет стезе моей." (Псалтирь 118:105)

Этот бот — ваш спутник в путешествии по Священному Писанию. Здесь вы можете:
🌟 Находить вдохновение в случайных стихах
📜 Погружаться в чтение Библии по главам
🔍 Искать конкретные стихи, чтобы прикоснуться к Божьему Слову

Пусть ваше сердце наполнится миром! Выберите действие ниже:`;
}

// Обработчики команд
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  activeUsers.add(chatId);
  try {
    await bot.sendMessage(chatId, getStartMessage(), {
      parse_mode: "Markdown",
      ...mainReplyKeyboard,
    });
  } catch (err) {
    console.error(`Ошибка при отправке /start (chat ${chatId}):`, err.message);
  }
});

bot.onText(/\/search/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(
      chatId,
      `🔍 *Поиск по Библии*\n
Введите ваш запрос одним из следующих способов:
• Укажите название книги и номер главы или стиха (например, _Иоанна 3:16_ или _Бытие 1_)
• Или напишите ключевые слова из нужного стиха (например, _возлюби ближнего_)

_Вы получите до 5 наиболее подходящих результатов._`,
      {
        parse_mode: "Markdown",
        ...mainReplyKeyboard,
      }
    );
  } catch (err) {
    console.error(`Ошибка при отправке /search (chat ${chatId}):`, err.message);
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (msg.chat.type !== 'private') return;
  activeUsers.add(chatId);

  try {
    if (text === "🙏 Случайный стих") {
      const verse = getRandomVerse();
      await bot.sendMessage(chatId, formatVerse(verse), {
        parse_mode: "Markdown",
        ...mainReplyKeyboard,
      });
    } else if (text === "📖 Читать Библию") {
      await bot.sendMessage(chatId, "📖 *Выберите Завет:*", {
        parse_mode: "Markdown",
        reply_markup: testamentInlineKeyboard,
      });
    } else if (text === "🔍 Поиск") {
      await bot.sendMessage(
        chatId,
        `🔍 *Поиск по Библии*\n
Введите ваш запрос одним из следующих способов:
• Укажите название книги и номер главы или стиха (например, _Иоанна 3:16_ или _Бытие 1_)
• Или напишите ключевые слова из нужного стиха (например, _возлюби ближнего_)

_Вы получите до 5 наиболее подходящих результатов._`,
        {
          parse_mode: "Markdown",
          ...mainReplyKeyboard,
        }
      );
    } else if (text === "🏠 Главное меню") {
      userState.delete(chatId);
      await bot.sendMessage(chatId, getStartMessage(), {
        parse_mode: "Markdown",
        ...mainReplyKeyboard,
      });
    } else if (text === "⬅️ Назад к книгам") {
      const testament = userState.get(chatId) || "old";
      const books = testament === "old" ? oldTestamentBooks : newTestamentBooks;
      await bot.sendMessage(
        chatId,
        testament === "old"
          ? "📜 *Ветхий Завет — выберите книгу:*"
          : "✝️ *Новый Завет — выберите книгу:*",
        {
          parse_mode: "Markdown",
          reply_markup: getBooksInlineKeyboard(books),
        }
      );
    } else {
      const me = await bot.getMe();
      if (text.includes(`@${me.username}`)) return;

      const result = searchVerse(text);
      if (result) {
        if (Array.isArray(result)) {
          for (const verse of result) {
            await bot.sendMessage(chatId, formatVerse(verse), {
              parse_mode: "Markdown",
              ...mainReplyKeyboard,
            });
          }
        } else if (result.verses) {
          const versesText = result.verses
            .map((v) => `${v.verse}. ${v.text}`)
            .join("\n");
          const message = `📖 *${result.bookName}* ${result.chapter}:${
            result.verses[0].verse
          }-${
            result.verses[result.verses.length - 1].verse
          }\n\n_${versesText}_`;
          await bot.sendMessage(chatId, message, {
            parse_mode: "Markdown",
            ...mainReplyKeyboard,
          });
        } else if (result.verse) {
          await bot.sendMessage(chatId, formatVerse(result), {
            parse_mode: "Markdown",
            ...mainReplyKeyboard,
          });
        } else {
          const chapterText = formatChapter(result.book, result.chapter);
          await bot.sendMessage(chatId, chapterText, {
            parse_mode: "Markdown",
            ...mainReplyKeyboard,
          });
        }
      } else if (!["/start", "/search"].includes(text)) {
        await bot.sendMessage(
          chatId,
          '❌ Ничего не найдено. Введите, например, "Иоанна 3:16", "Бытие 1" или просто слово/фразу из стиха.',
          {
            parse_mode: "Markdown",
            ...mainReplyKeyboard,
          }
        );
      }
    }
  } catch (err) {
    console.error(
      `Ошибка при обработке сообщения (chat ${chatId}, text: ${text}):`,
      err.message
    );
    await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте снова.");
  }
});

bot.onText(/\/hide/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Кнопки скрыты ✅', {
    reply_markup: { remove_keyboard: true },
  });
});

bot.on('new_chat_members', async (msg) => {
  const chatId = msg.chat.id;
  const newMembers = msg.new_chat_members;

  for (const member of newMembers) {
    if (member.username === (await bot.getMe()).username) {
      await bot.sendMessage(chatId, `🌿 *Приветствую всех!* 🌿

Спасибо, что добавили меня в этот чат! 🙌

Чтобы использовать меня, просто напишите:
• @${member.username} Иоанна 3:16 — и я покажу нужный стих.
• Или отправьте фразу из Библии — я постараюсь найти подходящие места.

Благословений вам! 🙏`, {
        parse_mode: 'Markdown',
      });
      break;
    }
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
    if (data.startsWith("book_")) {
      const bookName = data.slice(5);
      const keyboard = getChaptersInlineKeyboard(bookName);
      if (!keyboard) {
        await bot.answerCallbackQuery(query.id, { text: "Книга не найдена." });
        return;
      }
      await bot.editMessageText(
        `Выбрана книга: *${bookName}*\nВыберите главу:`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: keyboard,
        }
      );
    } else if (data.startsWith("chapter_part_")) {
      const partsData = data.split("_");
      const bookName = partsData[2];
      const chapterNumber = parseInt(partsData[3], 10);
      const partIndex = parseInt(partsData[4], 10);
      const book = convertedBibleData.find((b) => b.name === bookName);
      if (!book) {
        await bot.answerCallbackQuery(query.id, { text: "Книга не найдена." });
        return;
      }
      const parts = splitChapterIntoParts(book, chapterNumber);
      if (!parts[partIndex]) {
        await bot.answerCallbackQuery(query.id, { text: "Часть не найдена." });
        return;
      }
      const keyboard = getChapterPartKeyboard(
        bookName,
        chapterNumber,
        partIndex,
        parts.length,
        book
      );
      await bot.editMessageText(parts[partIndex], {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } else if (data.startsWith("chapter_")) {
      const partsData = data.split("_");
      const bookName = partsData[1];
      let chapterNumber = parseInt(partsData[2], 10);
      const bookIndex = convertedBibleData.findIndex((b) => b.name === bookName);
      if (bookIndex === -1) {
        await bot.answerCallbackQuery(query.id, { text: "Книга не найдена." });
        return;
      }
      const book = convertedBibleData[bookIndex];

      if (chapterNumber > book.chapters.length) {
        if (bookIndex + 1 < convertedBibleData.length) {
          const nextBook = convertedBibleData[bookIndex + 1];
          const keyboard = getChaptersInlineKeyboard(nextBook.name);
          await bot.editMessageText(
            `Вы завершили книгу *${book.name}*.\nПереходим к следующей книге: *${nextBook.name}*.\nВыберите главу:`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "Markdown",
              reply_markup: keyboard,
            }
          );
        } else {
          await bot.editMessageText(
            `Вы завершили чтение последней книги *${book.name}*.\nВы можете вернуться к выбору книги или завершить чтение.`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "⬅️ Назад к книгам",
                      callback_data: "back_to_books",
                    },
                  ],
                ],
              },
            }
          );
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      const parts = splitChapterIntoParts(book, chapterNumber);
      const keyboard = getChapterPartKeyboard(
        bookName,
        chapterNumber,
        0,
        parts.length,
        book
      );
      await bot.editMessageText(parts[0], {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } else if (data === "back_to_books") {
      const testament = userState.get(chatId) || "old";
      const books = testament === "old" ? oldTestamentBooks : newTestamentBooks;
      await bot.editMessageText(
        testament === "old"
          ? "📜 *Ветхий Завет — выберите книгу:*"
          : "✝️ *Новый Завет — выберите книгу:*",
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          reply_markup: getBooksInlineKeyboard(books),
        }
      );
    } else if (data === "back_to_testament") {
      await bot.editMessageText("📖 *Выберите Завет:*", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: testamentInlineKeyboard,
      });
 } else if (data === "testament_old") {
  userState.set(chatId, "old");
  await bot.editMessageText("📜 *Ветхий Завет — выберите книгу:*", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: getBooksInlineKeyboard(oldTestamentBooks, "old", chatId),
  });
} else if (data === "testament_new") {
  userState.set(chatId, "new");
  await bot.editMessageText("✝️ *Новый Завет — выберите книгу:*", {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "Markdown",
    reply_markup: getBooksInlineKeyboard(newTestamentBooks, "new", chatId),
  });
}

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error(
      `Ошибка при обработке callback (chat ${chatId}, data: ${data}):`,
      err.message
    );
    await bot.answerCallbackQuery(query.id, {
      text: "Произошла ошибка. Попробуйте снова.",
    });
  }
});

// Рассылка стихов
function sendDailyVerse() {
  const verse = getRandomVerse();
  const text = `✨ *Дневное вдохновение* ✨\n\n${formatVerse(
    verse
  )}\n\n_Пусть слово Божье освещает ваш день!_`;
  activeUsers.forEach((chatId) => {
    bot.sendMessage(chatId, text, { parse_mode: "Markdown" }).catch((err) => {
      console.error(`Ошибка отправки стиха (chat ${chatId}):`, err.message);
      activeUsers.delete(chatId);
    });
  });
}

// Расписание рассылки
cron.schedule("0 9 * * *", sendDailyVerse, { timezone: "Europe/Moscow" });
cron.schedule("0 15 * * *", sendDailyVerse, { timezone: "Europe/Moscow" });
cron.schedule("0 21 * * *", sendDailyVerse, { timezone: "Europe/Moscow" });

// Обработка ошибок polling
bot.on("polling_error", (err) => {
  console.error("Polling error:", err.message);
  setTimeout(() => {
    bot.stopPolling().then(() => bot.startPolling());
  }, 5000);
});

// Inline режим
bot.on('inline_query', async (query) => {
  const q = query.query.trim();
  if (!q) return;

  const results = [];
  const found = searchVerse(q);

  if (Array.isArray(found)) {
    found.forEach((verse, index) => {
      results.push({
        type: 'article',
        id: String(index),
        title: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
        input_message_content: {
          message_text: formatVerse(verse),
          parse_mode: 'Markdown',
        },
        description: verse.text.slice(0, 100),
      });
    });
  } else if (found && found.verse) {
    results.push({
      type: 'article',
      id: '1',
      title: `${found.bookName} ${found.chapter}:${found.verse}`,
      input_message_content: {
        message_text: formatVerse(found),
        parse_mode: 'Markdown',
      },
      description: found.text.slice(0, 100),
    });
  } else if (found && found.verses) {
    const versesText = found.verses
      .map((v) => `${v.verse}. ${v.text}`)
      .join("\n");
    results.push({
      type: 'article',
      id: 'range1',
      title: `${found.bookName} ${found.chapter}:${found.verses[0].verse}-${found.verses[found.verses.length - 1].verse}`,
      input_message_content: {
        message_text: `📖 *${found.bookName}* ${found.chapter}:${found.verses[0].verse}-${found.verses[found.verses.length - 1].verse}\n\n_${versesText}_`,
        parse_mode: 'Markdown',
      },
      description: versesText.slice(0, 100),
    });
  }

  if (results.length > 0) {
    bot.answerInlineQuery(query.id, results.slice(0, 10), {
      cache_time: 0,
      is_personal: true,
    });
  }
});

console.log("✨ Бот запущен и готов к работе! ✨");