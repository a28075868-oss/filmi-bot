require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Проверка наличия необходимых переменных окружения
if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.OMDB_API_KEY) {
  console.error('Ошибка: Не заданы TELEGRAM_BOT_TOKEN или OMDB_API_KEY в файле .env');
  process.exit(1);
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_API_URL = 'http://www.omdbapi.com/';

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
Привет! 👋

Я бот для поиска информации о фильмах.

Просто отправь мне название фильма, и я найду:
🎬 Постер
📝 Описание
⭐ Рейтинг IMDb
📅 Год выпуска

Также я добавлю кнопки для просмотра онлайн и поиска трейлера!

Попробуй написать, например: "Inception" или "Матрица"
  `;
  
  bot.sendMessage(chatId, welcomeMessage);
});

// Обработчик команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📖 Как пользоваться ботом:

1. Отправь название фильма (на английском или русском)
2. Получи информацию о фильме
3. Используй кнопки для просмотра онлайн или поиска трейлера

Команды:
/start - Начать работу с ботом
/help - Показать эту справку

Примеры запросов:
• Inception
• The Matrix
• Интерстеллар
• Зеленая миля
  `;
  
  bot.sendMessage(chatId, helpMessage);
});

// Функция поиска фильма через OMDb API
async function searchMovie(movieTitle) {
  try {
    const response = await axios.get(OMDB_API_URL, {
      params: {
        apikey: OMDB_API_KEY,
        t: movieTitle,
        plot: 'full'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Ошибка при запросе к OMDb API:', error.message);
    throw new Error('Не удалось выполнить запрос к API');
  }
}

// Функция создания inline-кнопок
function createInlineKeyboard(movieTitle) {
  const encodedTitle = encodeURIComponent(movieTitle);
  
  return {
    inline_keyboard: [
      [
        {
          text: '🎬 Смотреть онлайн',
          url: `https://www.google.com/search?q=${encodedTitle}+смотреть+онлайн`
        }
      ],
      [
        {
          text: '🎥 Трейлер на YouTube',
          url: `https://www.youtube.com/results?search_query=${encodedTitle}+trailer`
        }
      ]
    ]
  };
}

// Функция форматирования информации о фильме
function formatMovieInfo(movie) {
  const title = movie.Title || 'Неизвестно';
  const year = movie.Year || 'Неизвестно';
  const rating = movie.imdbRating !== 'N/A' ? movie.imdbRating : 'Нет данных';
  const genre = movie.Genre !== 'N/A' ? movie.Genre : 'Неизвестно';
  const director = movie.Director !== 'N/A' ? movie.Director : 'Неизвестно';
  const actors = movie.Actors !== 'N/A' ? movie.Actors : 'Неизвестно';
  const plot = movie.Plot !== 'N/A' ? movie.Plot : 'Описание отсутствует';
  const runtime = movie.Runtime !== 'N/A' ? movie.Runtime : 'Неизвестно';

  return `
🎬 <b>${title}</b> (${year})

⭐ Рейтинг IMDb: <b>${rating}/10</b>
🎭 Жанр: ${genre}
⏱ Длительность: ${runtime}
🎥 Режиссёр: ${director}
👥 Актёры: ${actors}

📝 Описание:
${plot}
  `.trim();
}

// Обработчик текстовых сообщений (поиск фильмов)
bot.on('message', async (msg) => {
  // Игнорируем команды
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }

  const chatId = msg.chat.id;
  const movieTitle = msg.text;

  if (!movieTitle || movieTitle.trim().length === 0) {
    return;
  }

  // Отправляем сообщение о начале поиска
  const searchingMsg = await bot.sendMessage(chatId, '🔍 Ищу фильм...');

  try {
    // Поиск фильма
    const movie = await searchMovie(movieTitle);

    // Проверка, найден ли фильм
    if (movie.Response === 'False') {
      await bot.deleteMessage(chatId, searchingMsg.message_id);
      await bot.sendMessage(
        chatId,
        `❌ Фильм "${movieTitle}" не найден.\n\nПопробуйте:\n• Проверить правильность написания\n• Использовать английское название\n• Указать год выпуска (например, "Matrix 1999")`
      );
      return;
    }

    // Удаляем сообщение о поиске
    await bot.deleteMessage(chatId, searchingMsg.message_id);

    // Формируем информацию о фильме
    const movieInfo = formatMovieInfo(movie);
    const keyboard = createInlineKeyboard(movie.Title);

    // Отправляем постер, если он доступен
    if (movie.Poster && movie.Poster !== 'N/A') {
      try {
        await bot.sendPhoto(chatId, movie.Poster, {
          caption: movieInfo,
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      } catch (photoError) {
        // Если не удалось отправить фото, отправляем только текст
        console.error('Ошибка при отправке постера:', photoError.message);
        await bot.sendMessage(chatId, movieInfo, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }
    } else {
      // Если постера нет, отправляем только текст
      await bot.sendMessage(chatId, movieInfo, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }

  } catch (error) {
    console.error('Ошибка при обработке запроса:', error.message);
    await bot.deleteMessage(chatId, searchingMsg.message_id);
    await bot.sendMessage(
      chatId,
      '❌ Произошла ошибка при поиске фильма. Попробуйте позже или проверьте название.'
    );
  }
});

// Обработка ошибок polling
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error.message);
});

console.log('🤖 Бот успешно запущен!');
