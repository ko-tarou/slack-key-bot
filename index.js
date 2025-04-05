const { App, ExpressReceiver } = require('@slack/bolt');
const axios = require('axios');
require('dotenv').config();

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

function createKeyStatusBlocks() {
  return [
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
  ];
}

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

  await postKeyStatus(body.channel.id);
});

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

  await postKeyStatus(body.channel.id);
});

async function postKeyStatus(channelId) {
  const res = await app.client.chat.postMessage({
    channel: channelId,
    text: "🔑 鍵の状態",
    blocks: createKeyStatusBlocks()
  });
  statusMessageTs = res.ts;
}

app.event("message", async ({ event }) => {
  if (event.subtype || event.bot_id) return;

  try {
    const auth = await app.client.auth.test();
    const botUserId = auth.user_id;

    // 直前の投稿を削除（Botの投稿だけ）
    if (statusMessageTs) {
      const messageInfo = await app.client.conversations.history({
        channel: event.channel,
        latest: statusMessageTs,
        limit: 1,
        inclusive: true
      });

      if (messageInfo.messages?.[0]?.user === botUserId) {
        await app.client.chat.delete({
          channel: event.channel,
          ts: statusMessageTs
        });
      }
    }

    await postKeyStatus(event.channel);

  } catch (err) {
    console.error("💥 メッセージ削除エラー:", err);
  }
});

// OAuth redirect
receiver.router.get('/slack/oauth_redirect', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("コードがありません");

  try {
    const result = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        code,
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        redirect_uri: 'https://slack-key-bot.onrender.com/slack/oauth_redirect'
      }
    });

    if (result.data.ok) {
      console.log("🌟 新しいBotトークン:", result.data.access_token);
      res.send("✅ Slackアプリのインストールが完了しました！");
    } else {
      console.error("OAuth失敗:", result.data);
      res.status(500).send("OAuth処理に失敗しました");
    }
  } catch (err) {
    console.error("OAuthエラー:", err);
    res.status(500).send("OAuth中にエラーが発生しました");
  }
});

// 起動時の処理
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log("⚡️ 鍵管理Bot 起動中！");
  try {
    const channelId = "C08LYUQSLM9"; // ← DevelopHubの「笑う」のチャンネルID

    const auth = await app.client.auth.test();
    const botUserId = auth.user_id;

    await app.client.conversations.join({
        channel: channelId
      });

    const history = await app.client.conversations.history({
      channel: channelId,
      limit: 100
    });

    for (const message of history.messages) {
      if (message.user === botUserId && message.text.includes("🔑 鍵の状態")) {
        await app.client.chat.delete({
          channel: channelId,
          ts: message.ts
        });
      }
    }

    const res = await app.client.chat.postMessage({
      channel: channelId,
      text: "🔑 鍵の状態",
      blocks: createKeyStatusBlocks()
    });

    statusMessageTs = res.ts;

  } catch (error) {
    console.error("起動時エラー:", error);
  }
})();
