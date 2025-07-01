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

const newTestamentStartIndex = bibleData.findIndex(book => book.name.toLowerCase() === 'matthew');
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
  return `📖 *${bookName}* ${chapter}:${verse}\n\n_${text}_`;
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

function searchVerse(query) {
  const regex = /^(\w+(?:\s+\w+)?)\s+(\d+)(?::(\d+))?$/i;
  const match = query.match(regex);
  if (!match) return null;

  const [, bookName, chapterStr, verseStr] = match;
  const chapter = parseInt(chapterStr, 10);
  const verse = verseStr ? parseInt(verseStr, 10) : null;

  const book = bibleData.find(b => b.name.toLowerCase() === bookName.toLowerCase() || 
    b.name.toLowerCase().startsWith(bookName.toLowerCase()));
  if (!book) return null;

  const chapterIndex = chapter - 1;
  if (!book.chapters[chapterIndex]) return null;

  if (verse) {
    const verseIndex = verse - 1;
    if (!book.chapters[chapterIndex][verseIndex]) return null;
    return {
      bookName: book.name,
      chapter,
      verse,
      text: book.chapters[chapterIndex][verseIndex],
    };
  } else {
    return { book, chapter };
  }
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
  return (
    '✨ *Добро пожаловать в Библейский бот!* ✨\n\n' +
    '📜 *В начале было Слово...* (Иоанна 1:1)\n\n' +
    'Этот бот поможет вам:\n' +
    '🙏 Получать вдохновляющие стихи из Библии\n' +
    '📖 Читать Священное Писание по книгам и главам\n' +
    '🔍 Искать стихи по книге, главе и стиху\n\n' +
    '*Выберите действие ниже, чтобы начать:*'
  );
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
      '🔍 Введите запрос для поиска (например, "Иоанна 3:16" или "Бытие 1")',
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
        '🔍 Введите запрос для поиска (например, "Иоанна 3:16" или "Бытие 1")',
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
        if (result.verse) {
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
          '❌ Неверный формат или данные не найдены. Используйте, например, "Иоанна 3:16" или "Бытие 1".',
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
      const hasNextChapter = chapterNumber < book.chapters.length;
      const keyboard = [
        [{ text: '⬅️ Назад к главам', callback_data: `book_${bookName}` }],
        [{ text: '⬅️ Назад к книгам', callback_data: 'back_to_books' }],
      ];

      if (hasNextChapter) {
        keyboard.unshift([{ text: '➡️ Следующая глава', callback_data: `chapter_${bookName}_${chapterNumber + 1}` }]);
      } else if (bookIndex + 1 < bibleData.length) {
        const nextBook = bibleData[bookIndex + 1];
        keyboard.unshift([{ text: `➡️ Перейти к следующей книге: ${nextBook.name}`, callback_data: `book_${nextBook.name}` }]);
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