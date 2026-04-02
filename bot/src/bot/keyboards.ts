import { Markup } from "telegraf";
export const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback("🏊 View Pools", "view_pools")],
  [Markup.button.callback("💰 Join Pool", "join_pool")],
  [Markup.button.callback("🆕 Create Pool", "create_pool")],
  [Markup.button.callback("📊 My Position", "my_position")],
  [Markup.button.callback("🚪 Exit Early", "exit_early")],
  [Markup.button.callback("🏆 Claim Reward", "claim_reward")],
  [Markup.button.callback("🏁 Finalize Pool", "finalize_pool")],
  [Markup.button.callback("↩️ Withdraw", "withdraw")],
  [Markup.button.callback("🔓 Close Stalled Pool", "close_stalled")],
]);
export const backButton = Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back", "main_menu")]]);
export function poolSelectKeyboard(poolIds: number[], action: string) {
  return Markup.inlineKeyboard([...poolIds.map(id => [Markup.button.callback("Pool #" + id, action + "_" + id)]), [Markup.button.callback("⬅️ Back", "main_menu")]]);
}
