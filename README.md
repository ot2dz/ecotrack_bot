# EcoTrack Bot

## Description

EcoTrack Bot is a Telegram bot for managing deliveries. It is designed to be used by an Arabic-speaking audience. The bot allows users to create new orders, track existing orders, and receive updates on the status of their deliveries.

## Features

- Create new delivery orders
- Track the status of existing orders
- Receive real-time updates on delivery progress
- Add notes to orders
- Filter orders by status
- Web interface for order management

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/ecotrack-bot.git
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file and fill in the required environment variables.
4. Start the bot:
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable               | Description                               |
| ---------------------- | ----------------------------------------- |
| `TELEGRAM_BOT_TOKEN`   | Your Telegram bot token                   |
| `ECOTRACK_BASE_URL`    | The base URL of the EcoTrack API          |
| `ECOTRACK_API_KEY`     | Your EcoTrack API key                     |
| `NODE_ENV`             | The node environment (development or production) |
| `PORT`                 | The port for the web server               |

## Available Commands

- `/start` - Start the bot
- `/track <tracking>` - Get the latest update for an order
- `/update <tracking> <text>` - Add a note to an order
- `/status <tracking>` - Get the detailed status of an order
- `/filter <status1,status2,...> [trackings]` - Filter orders by status

## Technologies Used

- [Node.js](https://nodejs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Telegraf](https://telegraf.js.org/)
- [Express](https://expressjs.com/)
- [Zod](https://zod.dev/)
- [Pino](https://getpino.io/)
