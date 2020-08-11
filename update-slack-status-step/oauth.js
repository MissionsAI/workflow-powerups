import { renderWorkflowStep, renderUpdateStatusForm } from "./view.js";

const CLIENT_ID = process.env.SLACK_CLIENT_ID;
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const HOST = process.env.HOST;
const OAUTH_PATH = "/update-status-step/auth/callback";

export const configureOauth = (app, storage) => {
  const expressApp = app.receiver.app;

  expressApp.get(OAUTH_PATH, async (req, res) => {
    let code = req.query.code;

    let state = {};
    try {
      state = JSON.parse(req.query.state);
    } catch (e) {
      app.logger.error(e);
      return res
        .status(500)
        .send("There was a problem connecting your account");
    }

    app.logger.info("state: ", state);

    try {
      const result = await app.client.oauth.v2.access({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        redirect_uri: buildOAuthRedirectURL(),
      });

      const { id: authedTeamId } = result.team;
      const { id: authedUserId, access_token: userToken } = result.authed_user;
      const { workflowId, stepId, userId, teamId, externalViewId } = state;

      // Verify the same team and user was authenticated
      if (userId !== authedUserId || teamId !== authedTeamId) {
        res
          .status(500)
          .send(
            "Looks like the wrong team was authenticated, please try again."
          );
        return;
      }

      const credentialTeamId = teamId;
      const credentialUserId = userId;
      // This stores the user token with the user/team combo
      await storage.setUserCredential(
        credentialTeamId,
        credentialUserId,
        userToken
      );

      // This associates the above user credential with the workflow/step combo
      await storage.setStepCredential(workflowId, stepId, teamId, userId);

      // Get bot token for install
      const installation = await storage.getInstalledTeam(credentialTeamId);
      // TODO check if installation not null
      const botToken = installation.bot.token;

      // Get user info
      const userInfo = await app.client.users.info({
        token: botToken,
        user: userId,
      });

      // Render the new form view w/ the necessary state
      const viewState = {
        userName: userInfo.user.real_name,
        userImage: userInfo.user.profile.image_192,
        statusText: "",
        statusEmoji: "",
      };

      const view = renderWorkflowStep(
        viewState,
        renderUpdateStatusForm(viewState)
      );

      // Update the current view via the api w/ new one
      await app.client.views.update({
        token: botToken,
        external_id: externalViewId,
        view,
      });

      res
        .status(200)
        .send(
          "Account connected, you can now close this window and return to <a href='slack://'>Slack</a>."
        );
    } catch (err) {
      app.logger.error(err);

      res.status(500).send("There was a problem connecting your account");
    }
  });
};

export const buildOAuthRedirectURL = () => {
  return `${HOST}${OAUTH_PATH}`;
};

export const buildOAuthURL = ({ state, team }) => {
  const redirectURI = buildOAuthRedirectURL();
  const oauthState = encodeURIComponent(JSON.stringify(state));

  return `https://slack.com/oauth/v2/authorize?user_scope=users.profile:write&client_id=${CLIENT_ID}&redirect_uri=${redirectURI}&state=${oauthState}&team=${team}`;
};
