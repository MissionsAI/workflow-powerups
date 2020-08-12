import { default as Bolt } from "@slack/bolt";
import { registerRandomStringStep } from "./random-string-step/index.js";
import { registerUpdateSlackStatusStep } from "./update-slack-status-step/index.js";
import { registerFlowUtilitiesStep } from "./flow-utilities/index.js";
import { initializeStorage } from "./storage.js";

const storage = initializeStorage(process.env.REDIS_URL)

// Initializes your app with your bot token and signing secret
const app = new Bolt.App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.STATE_SECRET,
  scopes: ['workflow.steps:execute', 'users:read'],
  installationStore: {
    storeInstallation: async (installation) => {
      console.log(`New installation from ${installation.team.name}`, installation)
      return await storage.saveInstalledTeam(installation)
    },
    fetchInstallation: async (installQuery) => {
      return storage.getInstalledTeam(installQuery.teamId)
    },
  },  
});

registerRandomStringStep(app);
registerUpdateSlackStatusStep(app, storage);
registerFlowUtilitiesStep(app, storage);

app.error((error) => {
  // Check the details of the error to handle cases where you should retry sending a message or stop the app
  app.logger.error(error, JSON.stringify(error && error.data));
});

app.receiver.app.get("/", (req, res) => res.send({ ok: true, message: 'you look nice today :)' }));

(async () => {
  // Fire it up!
  const port = process.env.PORT || 3000;
  await app.start(port);
  app.logger.info(`⚡️ Bolt app is running on port ${port}!`);
})();