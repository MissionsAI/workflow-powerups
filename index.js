import { default as Bolt } from "@slack/bolt";
import { registerRandomStringStep } from "./random-string-step/index.js";
import { promisify } from "util";
import redis from"redis";

const redisClient = redis.createClient(process.env.REDIS_URL);
redisClient.on("error", error => console.error(error));
redisClient.on("connect", () => console.error("🙆‍♂️Redis connected"));

// Initializes your app with your bot token and signing secret
const app = new Bolt.App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.STATE_SECRET,
  scopes: ['workflow.steps:execute'],
  installationStore: {
    storeInstallation: async (installation) => {
      console.log(`New installation from ${installation.team.name}`, )
      // change the line below so it saves to your database
      const key = `team-install-${installation.team.id}`
      const value = JSON.stringify(installation)
      const redisSet = promisify(redisClient.set).bind(redisClient);
      return await redisSet(key, value)
    },
    fetchInstallation: async (installQuery) => {
      const key = `team-install-${installQuery.teamId}`
      const redisGet = promisify(redisClient.get).bind(redisClient);
      const val = await redisGet(key)
      try {
        return JSON.parse(val)
      } catch(e) {
        app.logger.error(`Error parsing ${key} from Redis:`, e.message);
        return null
      }
    },
  },  
});

registerRandomStringStep(app);

app.error((error) => {
  // Check the details of the error to handle cases where you should retry sending a message or stop the app
  console.error(error, JSON.stringify(error && error.data));
});

app.receiver.app.get("/", (req, res) => res.send({ ok: true, message: 'you look nice today :)' }));

(async () => {
  // Fire it up!
  const port = process.env.PORT || 3000;
  await app.start(port);

  console.log(`⚡️ Bolt app is running on port ${port}!`);
})();