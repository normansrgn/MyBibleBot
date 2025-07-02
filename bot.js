require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN не найден в .env');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

let raw;
try {
  raw = fs.readFileSync(path.join(__dirname, 'bible.json'), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
} catch (err) {
  console.error('❌ Ошибка чтения bible.json:', err.message);
  process.exit(1);
}
const bibleData = JSON.parse(raw);

const newTestamentStartIndex = bibleData.findIndex(book => book.name.toLowerCase() === 'от матфея');
const oldTestamentBooks = newTestamentStartIndex === -1 ? bibleData : bibleData.slice(0, newTestamentStartIndex);
const newTestamentBooks = newTestamentStartIndex === -1 ? [] : bibleData.slice(newTestamentStartIndex);

const activeUsers = new Set();
const userState = new Map();

const mainReplyKeyboard = {
  reply_markup: {
    keyboard: [
      ['🙏 Случайный стих', '📖 Читать Библию'],
      ['🔍 Поиск', '🏠 Главное меню'],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
};

const backToBooksKeyboard = {
  reply_markup: {
    keyboard: [['⬅️ Назад к книгам'], ['🏠 Главное меню']],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const testamentInlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📜 Ветхий Завет', callback_data: 'testament_old' },
      { text: '✝️ Новый Завет', callback_data: 'testament_new' },
    ],
  ],
};

function getRandomVerse() {
  const book = bibleData[Math.floor(Math.random() * bibleData.length)];
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

function formatChapter(book, chapterNumber) {
  const chapterIndex = chapterNumber - 1;
  if (!book || !book.chapters[chapterIndex]) return 'Глава не найдена.';
  const verses = book.chapters[chapterIndex];
  let text = `📖 *${book.name}* — глава ${chapterNumber}\n\n`;
  verses.forEach((verseText, idx) => {
    text += `${idx + 1}. ${verseText}\n`;
  });
  return text;
}

function normalizeBookName(name) {
  return name.toLowerCase().replace(/\s+/g, '');
}

// Вычисляем расстояние Левенштейна
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
        dp[i - 1][j] + 1,      // удаление
        dp[i][j - 1] + 1,      // вставка
        dp[i - 1][j - 1] + cost // замена
      );
    }
  }
  return dp[m][n];
}

// Ищем наиболее похожее название книги
function findClosestBookName(inputName) {
  const normalizedInput = normalizeBookName(inputName);
  let closestBook = null;
  let minDistance = Infinity;

  for (const book of bibleData) {
    const normalizedBook = normalizeBookName(book.name);
    const distance = levenshtein(normalizedInput, normalizedBook);
    if (distance < minDistance) {
      minDistance = distance;
      closestBook = book;
    }
  }

  // Условие: если расхождение не слишком большое
  return minDistance <= 5 ? closestBook : null;
}

function searchVerse(query) {
  const regex = /^(\d?\s*[а-яА-ЯёЁ\s]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i;
  const match = query.match(regex);

  if (match) {
    let [, bookNameRaw, chapterStr, verseStr, verseEndStr] = match;
    const chapter = parseInt(chapterStr, 10);
    const verse = verseStr ? parseInt(verseStr, 10) : null;
    const verseEnd = verseEndStr ? parseInt(verseEndStr, 10) : null;

    let book = bibleData.find(
      b =>
        normalizeBookName(b.name) === normalizeBookName(bookNameRaw) ||
        normalizeBookName(b.name).startsWith(normalizeBookName(bookNameRaw))
    );

    // Если точного совпадения нет — ищем наиболее близкое
    if (!book) {
      book = findClosestBookName(bookNameRaw);
    }

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

    return {
      book,
      chapter,
    };
  }

  // Поиск по ключевым словам
  const results = [];
  for (const book of bibleData) {
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

function searchVerse(query) {
  // Разрешаем цифру в начале, пробелы, затем кириллицу
  const regex = /^(\d?\s*[а-яА-ЯёЁ\s]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i;
  const match = query.match(regex);

  if (match) {
    let [, bookNameRaw, chapterStr, verseStr, verseEndStr] = match;
    const bookName = normalizeBookName(bookNameRaw);
    const chapter = parseInt(chapterStr, 10);
    const verse = verseStr ? parseInt(verseStr, 10) : null;
    const verseEnd = verseEndStr ? parseInt(verseEndStr, 10) : null;

    // Ищем книгу с нормализацией для сравнения
    const book = bibleData.find(b => normalizeBookName(b.name) === bookName || normalizeBookName(b.name).startsWith(bookName));

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

    // Только глава
    return {
      book: book,
      chapter: chapter,
    };
  }

  // Поиск по ключевым словам (оставляем без изменений)
  const results = [];
  for (const book of bibleData) {
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

function getBooksInlineKeyboard(books) {
  const keyboard = [];
  for (let i = 0; i < books.length; i += 3) {
    const row = books.slice(i, i + 3).map(book => ({
      text: book.name,
      callback_data: `book_${book.name}`,
    }));
    keyboard.push(row);
  }
  keyboard.push([{ text: '⬅️ Назад к выбору Завета', callback_data: 'back_to_testament' }]);
  return { inline_keyboard: keyboard };
}

function getChaptersInlineKeyboard(bookName) {
  const book = bibleData.find(b => b.name === bookName);
  if (!book) return null;
  const chaptersCount = book.chapters.length;
  const keyboard = [];
  for (let i = 1; i <= chaptersCount; i += 5) {
    const row = [];
    for (let j = i; j < i + 5 && j <= chaptersCount; j++) {
      row.push({ text: j.toString(), callback_data: `chapter_${bookName}_${j}` });
    }
    keyboard.push(row);
  }
  keyboard.push([{ text: '⬅️ Назад к книгам', callback_data: 'back_to_books' }]);
  return { inline_keyboard: keyboard };
}

function getStartMessage() {
  return `🌿 Добро пожаловать, ищущий света! 🌿

📜 “Слово Твое — светильник ноге моей и свет стезе моей.” (Псалтирь 118:105)

Этот бот — ваш спутник в путешествии по Священному Писанию. Здесь вы можете:
🌟 Находить вдохновение в случайных стихах
📜 Погружаться в чтение Библии по главам
🔍 Искать конкретные стихи, чтобы прикоснуться к Божьему Слову

Пусть ваше сердце наполнится миром! Выберите действие ниже:`;
}

bot.onText(/\/start/, async msg => {
  const chatId = msg.chat.id;
  activeUsers.add(chatId);
  try {
    await bot.sendMessage(chatId, getStartMessage(), {
      parse_mode: 'Markdown',
      ...mainReplyKeyboard,
    });
  } catch (err) {
    console.error(`Ошибка при отправке /start (chat ${chatId}):`, err.message);
  }
});

bot.onText(/\/search/, async msg => {
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
        parse_mode: 'Markdown',
        ...mainReplyKeyboard,
      }
    );
  } catch (err) {
    console.error(`Ошибка при отправке /search (chat ${chatId}):`, err.message);
  }
});

bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const text = msg.text;
  activeUsers.add(chatId);

  try {
    if (text === '🙏 Случайный стих') {
      const verse = getRandomVerse();
      await bot.sendMessage(chatId, formatVerse(verse), {
        parse_mode: 'Markdown',
        ...mainReplyKeyboard,
      });
    } else if (text === '📖 Читать Библию') {
      await bot.sendMessage(chatId, '📖 *Выберите Завет:*', {
        parse_mode: 'Markdown',
        reply_markup: testamentInlineKeyboard,
      });
    } else if (text === '🔍 Поиск') {
      await bot.sendMessage(
        chatId,
        `🔍 *Поиск по Библии*\n
Введите ваш запрос одним из следующих способов:
• Укажите название книги и номер главы или стиха (например, _Иоанна 3:16_ или _Бытие 1_)
• Или напишите ключевые слова из нужного стиха (например, _возлюби ближнего_)

_Вы получите до 5 наиболее подходящих результатов._`,
        {
          parse_mode: 'Markdown',
          ...mainReplyKeyboard,
        }
      );
    } else if (text === '🏠 Главное меню') {
      userState.delete(chatId);
      await bot.sendMessage(chatId, getStartMessage(), {
        parse_mode: 'Markdown',
        ...mainReplyKeyboard,
      });
    } else if (text === '⬅️ Назад к книгам') {
      const testament = userState.get(chatId) || 'old';
      const books = testament === 'old' ? oldTestamentBooks : newTestamentBooks;
      await bot.sendMessage(
        chatId,
        testament === 'old' ? '📜 *Ветхий Завет — выберите книгу:*' : '✝️ *Новый Завет — выберите книгу:*',
        {
          parse_mode: 'Markdown',
          reply_markup: getBooksInlineKeyboard(books),
        }
      );
    } else {
      const result = searchVerse(text);
      if (result) {
        if (Array.isArray(result)) {
          for (const verse of result) {
            await bot.sendMessage(chatId, formatVerse(verse), {
              parse_mode: 'Markdown',
              ...mainReplyKeyboard,
            });
          }
        } else if (result.verses) {
          const versesText = result.verses.map(v => `${v.verse}. ${v.text}`).join('\n');
          const message = `📖 *${result.bookName}* ${result.chapter}:${result.verses[0].verse}-${result.verses[result.verses.length - 1].verse}\n\n_${versesText}_`;
          await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            ...mainReplyKeyboard,
          });
        } else if (result.verse) {
          await bot.sendMessage(chatId, formatVerse(result), {
            parse_mode: 'Markdown',
            ...mainReplyKeyboard,
          });
        } else {
          const chapterText = formatChapter(result.book, result.chapter);
          await bot.sendMessage(chatId, chapterText, {
            parse_mode: 'Markdown',
            ...mainReplyKeyboard,
          });
        }
      } else if (!['/start', '/search'].includes(text)) {
        await bot.sendMessage(
          chatId,
          '❌ Ничего не найдено. Введите, например, "Иоанна 3:16", "Бытие 1" или просто слово/фразу из стиха.',
          {
            parse_mode: 'Markdown',
            ...mainReplyKeyboard,
          }
        );
      }
    }
  } catch (err) {
    console.error(`Ошибка при обработке сообщения (chat ${chatId}, text: ${text}):`, err.message);
    await bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте снова.');
  }
});

bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  try {
    if (data.startsWith('book_')) {
      const bookName = data.slice(5);
      const keyboard = getChaptersInlineKeyboard(bookName);
      if (!keyboard) {
        await bot.answerCallbackQuery(query.id, { text: 'Книга не найдена.' });
        return;
      }
      await bot.editMessageText(`Выбрана книга: *${bookName}*\nВыберите главу:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } else if (data.startsWith('chapter_')) {
      const parts = data.split('_');
      const bookName = parts[1];
      let chapterNumber = parseInt(parts[2], 10);
      const bookIndex = bibleData.findIndex(b => b.name === bookName);
      if (bookIndex === -1) {
        await bot.answerCallbackQuery(query.id, { text: 'Книга не найдена.' });
        return;
      }
      const book = bibleData[bookIndex];

      if (chapterNumber > book.chapters.length) {
        // Переход за пределы книги (следующая книга или конец)
        if (bookIndex + 1 < bibleData.length) {
          const nextBook = bibleData[bookIndex + 1];
          const keyboard = getChaptersInlineKeyboard(nextBook.name);
          await bot.editMessageText(
            `Вы завершили книгу *${book.name}*.\nПереходим к следующей книге: *${nextBook.name}*.\nВыберите главу:`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard,
            }
          );
        } else {
          await bot.editMessageText(
            `Вы завершили чтение последней книги *${book.name}*.\nВы можете вернуться к выбору книги или завершить чтение.`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '⬅️ Назад к книгам', callback_data: 'back_to_books' }],
                ],
              },
            }
          );
        }
        await bot.answerCallbackQuery(query.id);
        return;
      }

      const chapterText = formatChapter(book, chapterNumber);
      // Кнопки перехода по главам
      const hasPrevChapter = chapterNumber > 1;
      const hasNextChapter = chapterNumber < book.chapters.length;
      let prevChapterButton = hasPrevChapter
        ? { text: '⬅️ Предыдущая глава', callback_data: `chapter_${bookName}_${chapterNumber - 1}` }
        : null;
      let nextChapterButton = hasNextChapter
        ? { text: '➡️ Следующая глава', callback_data: `chapter_${bookName}_${chapterNumber + 1}` }
        : null;
      // Клавиатура: первая строка - кнопки глав (если есть)
      const navRow = [];
      if (prevChapterButton) navRow.push(prevChapterButton);
      if (nextChapterButton) navRow.push(nextChapterButton);
      const keyboard = [];
      if (navRow.length > 0) keyboard.push(navRow);
      keyboard.push([{ text: '⬅️ Назад к главам', callback_data: `book_${bookName}` }]);
      keyboard.push([{ text: '⬅️ Назад к книгам', callback_data: 'back_to_books' }]);

      // Если это последняя глава книги, добавить кнопку перехода к следующей книге
      if (!hasNextChapter && bookIndex + 1 < bibleData.length) {
        const nextBook = bibleData[bookIndex + 1];
        keyboard.push([
          { text: `➡️ Перейти к следующей книге: ${nextBook.name}`, callback_data: `book_${nextBook.name}` },
        ]);
      }

      await bot.editMessageText(chapterText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } else if (data === 'back_to_books') {
      const testament = userState.get(chatId) || 'old';
      const books = testament === 'old' ? oldTestamentBooks : newTestamentBooks;
      await bot.editMessageText(
        testament === 'old' ? '📜 *Ветхий Завет — выберите книгу:*' : '✝️ *Новый Завет — выберите книгу:*',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: getBooksInlineKeyboard(books),
        }
      );
    } else if (data === 'back_to_testament') {
      await bot.editMessageText('📖 *Выберите Завет:*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: testamentInlineKeyboard,
      });
    } else if (data === 'testament_old') {
      userState.set(chatId, 'old');
      await bot.editMessageText('📜 *Ветхий Завет — выберите книгу:*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getBooksInlineKeyboard(oldTestamentBooks),
      });
    } else if (data === 'testament_new') {
      userState.set(chatId, 'new');
      await bot.editMessageText('✝️ *Новый Завет — выберите книгу:*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getBooksInlineKeyboard(newTestamentBooks),
      });
    }

    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.error(`Ошибка при обработке callback (chat ${chatId}, data: ${data}):`, err.message);
    await bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка. Попробуйте снова.' });
  }
});

// Daily verse
function sendDailyVerse() {
  const verse = getRandomVerse();
  const text = `✨ *Дневное вдохновение* ✨\n\n${formatVerse(verse)}\n\n_Пусть слово Божье освещает ваш день!_`;
  activeUsers.forEach(chatId => {
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
      .catch(err => {
        console.error(`Ошибка отправки стиха (chat ${chatId}):`, err.message);
        activeUsers.delete(chatId);
      });
  });
}

cron.schedule('0 9 * * *', sendDailyVerse, { timezone: 'Europe/Moscow' });
cron.schedule('0 15 * * *', sendDailyVerse, { timezone: 'Europe/Moscow' });
cron.schedule('0 21 * * *', sendDailyVerse, { timezone: 'Europe/Moscow' });

bot.on('polling_error', err => {
  console.error('Polling error:', err.message);
  setTimeout(() => {
    bot.stopPolling().then(() => bot.startPolling());
  }, 5000);
});

console.log('✨ Бот запущен и готов к работе! ✨');