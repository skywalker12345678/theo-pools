import { Telegraf } from "telegraf";
import { config } from "dotenv";
import { setupCommands } from "./bot/commands";
config();
const bot = new Telegraf(process.env.BOT_TOKEN!);
setupCommands(bot);
bot.launch().then(() => {
  console.log("🤖 THEO Bot is running...");
  console.log("Program:", process.env.PROGRAM_ID);
  console.log("RPC:", process.env.RPC_URL);
});
process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
