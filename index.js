const { App, ExpressReceiver } = require('@slack/bolt');
require('dotenv').config();

// 🔐 鍵の状態（メモリ保持）
let roomStatus = {
  "206": { status: "🟢 利用可能", user: "なし", time: "未使用" },
  "207": { status: "🟢 利用可能", user: "なし", time: "未使用" }
};

let statusMessageTs = null;

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events'
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

// 🔄 状態投稿関数（再投稿 or 上書き更新）
async function postKeyStatus(channelId, update = false) {
  const message = {
    channel: channelId,
    text: "🔑 鍵の状態",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*部屋206*：${roomStatus["206"].status}（${roomStatus["206"].user}｜${roomStatus["206"].time}）`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: roomStatus["206"].status === "🟢 利用可能" ? "借りる" : "返却する" },
            value: "206",
            action_id: "toggle_206"
          }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*部屋207*：${roomStatus["207"].status}（${roomStatus["207"].user}｜${roomStatus["207"].time}）`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: roomStatus["207"].status === "🟢 利用可能" ? "借りる" : "返却する" },
            value: "207",
            action_id: "toggle_207"
          }
        ]
      }
    ]
  };

  if (update && statusMessageTs) {
    await app.client.chat.update({
      ...message,
      ts: statusMessageTs
    });
  } else {
    const res = await app.client.chat.postMessage(message);
    statusMessageTs = res.ts;
  }
}

// 🧍‍♂️ ボタン処理（206）
app.action("toggle_206", async ({ ack, body }) => {
  await ack();
  const user = `<@${body.user.id}>`;
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const current = roomStatus["206"];
  const newStatus = current.status === "🟢 利用可能" ? "🔴 借りられ中" : "🟢 利用可能";

  roomStatus["206"] = {
    status: newStatus,
    user: newStatus === "🔴 借りられ中" ? user : "なし",
    time: newStatus === "🔴 借りられ中" ? now : "未使用"
  };

  await postKeyStatus(body.channel.id, true);
});

// 🧍‍♀️ ボタン処理（207）
app.action("toggle_207", async ({ ack, body }) => {
  await ack();
  const user = `<@${body.user.id}>`;
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  const current = roomStatus["207"];
  const newStatus = current.status === "🟢 利用可能" ? "🔴 借りられ中" : "🟢 利用可能";

  roomStatus["207"] = {
    status: newStatus,
    user: newStatus === "🔴 借りられ中" ? user : "なし",
    time: newStatus === "🔴 借りられ中" ? now : "未使用"
  };

  await postKeyStatus(body.channel.id, true);
});

// 💬 Bot以外の発言でメッセージを一番下に再投稿
app.event("message", async ({ event }) => {
  if (event.subtype || event.bot_id) return;

  try {
    if (statusMessageTs) {
      await app.client.chat.delete({
        channel: event.channel,
        ts: statusMessageTs
      });
    }

    await postKeyStatus(event.channel); // 再投稿（update = false）
  } catch (err) {
    console.error("💥 メッセージ削除エラー:", err);
  }
});

// 🚀 起動時：「笑う」チャンネルに投稿
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ 鍵管理Bot 起動中！");

  try {
    const result = await app.client.conversations.list();
    const channel = result.channels.find(c => c.name === "笑う");

    if (channel) {
      await postKeyStatus(channel.id);
    } else {
      console.log("😢 チャンネル「笑う」が見つかりませんでした。");
    }
  } catch (error) {
    console.error("チャンネル取得エラー:", error);
  }
})();
