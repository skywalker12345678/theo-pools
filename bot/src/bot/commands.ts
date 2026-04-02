import { Telegraf, Markup } from "telegraf";
import { PublicKey } from "@solana/web3.js";
import { fetchAllPools, formatPool, formatTime } from "../chain/pools";
import { buildDepositTx, buildEarlyExitTx, buildClaimTx, buildWithdrawTx, buildCreatePoolTx, buildCloseStalledPoolTx, buildFinalizeTx, serializeTx } from "../chain/transactions";
import { mainMenu, backButton, poolSelectKeyboard } from "./keyboards";
import { PDAs, getReadonlyProvider } from "../chain/client";

const walletStore: Map<number, string> = new Map();

export function setupCommands(bot: Telegraf) {
  bot.command("x1start", async (ctx) => {
    await ctx.reply("🎯 *THEO Commitment Pool*\n\nA 90-day conviction game on X1.\nStake THEO. Survive. Win the pool.\n\n_Testnet Mode_ 🧪", { parse_mode: "Markdown", ...mainMenu });
  });

  bot.command("theohelp", async (ctx) => {
    await ctx.reply("🎯 *THEO Pool Commands*\n\n/x1start — Main menu\n/x1wallet <address> — Register wallet\n/theohelp — Show this help\n/x1pools — View pools\n/x1position — My position\n/x1join — Join a pool\n/x1exit — Exit early\n/x1claim — Claim reward\n/x1create — Create pool\n/x1close — Close stalled pool\n/x1finalize — Finalize pool\n/x1withdraw — Withdraw from stalled pool", { parse_mode: "Markdown" });
  });

  bot.command("x1wallet", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    if (parts.length < 2) return ctx.reply("Usage: /x1wallet <your_solana_address>");
    try {
      new PublicKey(parts[1].trim());
      walletStore.set(ctx.from.id, parts[1].trim());
      await ctx.reply("✅ Wallet registered: `" + parts[1].trim() + "`", { parse_mode: "Markdown" });
    } catch { await ctx.reply("❌ Invalid Solana address."); }
  });

  bot.command("x1pools", async (ctx) => { try { const pools = await fetchAllPools(); if (pools.length === 0) return ctx.reply("No pools found yet."); const active = pools.filter(p => ["filling","active","claiming"].includes(p.status));
      if (active.length === 0) return ctx.reply("No active pools right now.", backButton);
      for (const p of active) await ctx.reply(formatPool(p), { parse_mode: "Markdown" }); } catch (e: any) { await ctx.reply("❌ " + e.message); } });

  bot.action("view_pools", async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const pools = await fetchAllPools();
      if (pools.length === 0) return ctx.reply("No pools found yet.", backButton);
      const active = pools.filter(p => ["filling","active","claiming"].includes(p.status));
      if (active.length === 0) return ctx.reply("No active pools right now.", backButton);
      for (const p of active) await ctx.reply(formatPool(p), { parse_mode: "Markdown" });
      await ctx.reply("Select an action:", mainMenu);
    } catch (e: any) { await ctx.reply("❌ Error: " + e.message, backButton); }
  });

  bot.action("join_pool", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register your wallet first with /x1wallet <address>", backButton);
    try {
      const filling = (await fetchAllPools()).filter(p => p.status === "filling");
      if (filling.length === 0) return ctx.reply("No pools currently filling!", backButton);
      await ctx.reply("Select a pool to join:", poolSelectKeyboard(filling.map(p => p.id), "deposit"));
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action(/^deposit_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const poolId = parseInt((ctx.match as any)[1]);
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.");
    try {
      const tx = await buildDepositTx(new PublicKey(wallet), poolId);
      const link = "https://skywalker12345678.github.io/theo-sign/?tx=" + encodeURIComponent(serializeTx(tx));
      await ctx.reply("💰 *Join Pool #" + poolId + "*\n\nStake: 0.20 THEO", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.url("🎒 Backpack", link)],[Markup.button.url("⚡ X1 Wallet", link)],[Markup.button.callback("⬅️ Back","main_menu")]]) });
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action("my_position", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.", backButton);
    try {
      const pools = await fetchAllPools();
      const program = getReadonlyProvider();
      let found = false;
      for (const p of pools) {
        try {
          const pos = await (program.account as any).userPosition.fetch(PDAs.position(p.id, new PublicKey(wallet)));
          const status = pos.exitedEarly ? "EXITED" : pos.claimed ? "CLAIMED" : pos.withdrewFilling ? "WITHDRAWN" : "ACTIVE";
          const amount = (Number(pos.amount)/100).toFixed(2);
          const now = Math.floor(Date.now()/1000);
          let timer = "";
          if (p.status === "filling" && p.fillDeadline > 0) timer = "\nFill expires in: " + formatTime(Math.max(0, p.fillDeadline - now));
          else if (p.status === "active" && p.gameEndTime > 0) timer = "\nGame ends in: " + formatTime(Math.max(0, p.gameEndTime - now));
          else if (p.status === "claiming" && p.claimDeadline > 0) timer = "\nClaim window: " + formatTime(Math.max(0, p.claimDeadline - now));
          await ctx.reply("📊 *Pool #" + p.id + "*\nPool status: " + p.status.toUpperCase() + "\nYour position: " + status + "\nStaked: " + amount + " THEO" + timer, { parse_mode: "Markdown" });
          found = true;
        } catch {}
      }
      if (!found) await ctx.reply("No active positions found.", backButton);
      else await ctx.reply("Select an action:", mainMenu);
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action("exit_early", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.", backButton);
    try {
      const active = (await fetchAllPools()).filter(p => p.status === "active");
      if (active.length === 0) return ctx.reply("No active pools.", backButton);
      await ctx.reply("Which pool to exit?", poolSelectKeyboard(active.map(p => p.id), "exit"));
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action(/^exit_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const poolId = parseInt((ctx.match as any)[1]);
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.");
    try {
      const tx = await buildEarlyExitTx(new PublicKey(wallet), poolId);
      const link = "https://skywalker12345678.github.io/theo-sign/?tx=" + encodeURIComponent(serializeTx(tx));
      await ctx.reply("🚪 *Exit Pool #" + poolId + "*\n\nReceive: 0.10 THEO back\nForfeit: 0.10 THEO", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.url("🎒 Backpack", link)],[Markup.button.url("⚡ X1 Wallet", link)],[Markup.button.callback("⬅️ Back","main_menu")]]) });
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action("claim_reward", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.", backButton);
    try {
      const now = Math.floor(Date.now()/1000);
      const claiming = (await fetchAllPools()).filter(p => p.status === "claiming" || (p.status === "active" && p.gameEndTime > 0 && now > p.gameEndTime));
      if (claiming.length === 0) return ctx.reply("No pools in claiming state.", backButton);
      await ctx.reply("Which pool to claim from?", poolSelectKeyboard(claiming.map(p => p.id), "claim"));
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action(/^claim_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const poolId = parseInt((ctx.match as any)[1]);
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.");
    try {
      const tx = await buildClaimTx(new PublicKey(wallet), poolId);
      const link = "https://skywalker12345678.github.io/theo-sign/?tx=" + encodeURIComponent(serializeTx(tx));
      await ctx.reply("🏆 *Claim from Pool #" + poolId + "*", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.url("🎒 Backpack", link)],[Markup.button.url("⚡ X1 Wallet", link)],[Markup.button.callback("⬅️ Back","main_menu")]]) });
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action("withdraw", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first with /x1wallet <address>", backButton);
    try {
      const pools = await fetchAllPools();
      const stalled = pools.filter(p => p.status === "closed");
      if (stalled.length === 0) return ctx.reply("No stalled pools to withdraw from.", backButton);
      await ctx.reply("Which pool to withdraw from?", poolSelectKeyboard(stalled.map(p => p.id), "dowithdraw"));
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action(/^dowithdraw_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const poolId = parseInt((ctx.match as any)[1]);
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.");
    try {
      const tx = await buildWithdrawTx(new PublicKey(wallet), poolId);
      const link = "https://skywalker12345678.github.io/theo-sign/?tx=" + encodeURIComponent(serializeTx(tx));
      await ctx.reply("↩️ *Withdraw from Pool #" + poolId + "*\n\nYou will receive: 0.20 THEO back", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.url("🎒 Backpack", link)],[Markup.button.url("⚡ X1 Wallet", link)],[Markup.button.callback("⬅️ Back","main_menu")]]) });
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action("create_pool", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first with /x1wallet <address>", backButton);
    try {
      const tx = await buildCreatePoolTx(new PublicKey(wallet));
      const link = "https://skywalker12345678.github.io/theo-sign/?tx=" + encodeURIComponent(serializeTx(tx));
      await ctx.reply("🆕 *Create New Pool*\n\nYou pay a tiny gas fee to open the next pool.\nAnyone can do this!", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.url("🎒 Backpack", link)],[Markup.button.url("⚡ X1 Wallet", link)],[Markup.button.callback("⬅️ Back","main_menu")]]) });
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action("close_stalled", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first with /x1wallet <address>", backButton);
    try {
      const pools = await fetchAllPools();
      const stalled = pools.filter(p => p.status === "filling");
      if (stalled.length === 0) return ctx.reply("No stalled pools found.", backButton);
      await ctx.reply("Which pool to close?", poolSelectKeyboard(stalled.map(p => p.id), "doclose"));
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action(/^doclose_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const poolId = parseInt((ctx.match as any)[1]);
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.");
    try {
      const tx = await buildCloseStalledPoolTx(new PublicKey(wallet), poolId);
      const link = "https://skywalker12345678.github.io/theo-sign/?tx=" + encodeURIComponent(serializeTx(tx));
      await ctx.reply("🔓 *Close Stalled Pool #" + poolId + "*\n\nThis unlocks withdrawals for all players.", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.url("🎒 Backpack", link)],[Markup.button.url("⚡ X1 Wallet", link)],[Markup.button.callback("⬅️ Back","main_menu")]]) });
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

bot.action("finalize_pool", async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first with /x1wallet <address>", backButton);
    try {
      const pools = await fetchAllPools();
      const now = Math.floor(Date.now() / 1000);
      const finalizable = pools.filter(p => p.status === "claiming" && p.claimDeadline > 0 && now > p.claimDeadline);
      if (finalizable.length === 0) return ctx.reply("No pools ready to finalize yet.", backButton);
      await ctx.reply("Which pool to finalize?", poolSelectKeyboard(finalizable.map(p => p.id), "dofinalize"));
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action(/^dofinalize_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const poolId = parseInt((ctx.match as any)[1]);
    const wallet = walletStore.get(ctx.from!.id);
    if (!wallet) return ctx.reply("⚠️ Register wallet first.");
    try {
      const tx = await buildFinalizeTx(new PublicKey(wallet), poolId);
      const link = "https://skywalker12345678.github.io/theo-sign/?tx=" + encodeURIComponent(serializeTx(tx));
      await ctx.reply("🏁 *Finalize Pool #" + poolId + "*\n\nThis closes the claim window and sends dust to the next pool.", { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.url("🎒 Backpack", link)],[Markup.button.url("⚡ X1 Wallet", link)],[Markup.button.callback("⬅️ Back","main_menu")]]) });
    } catch (e: any) { await ctx.reply("❌ " + e.message, backButton); }
  });

  bot.action("main_menu", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Main menu:", mainMenu);
  });
}
