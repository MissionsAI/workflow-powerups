import get from "lodash.get";
import { configureOauth, buildOAuthURL } from "./oauth.js";
import {
  STEP_CALLBACK_ID,
  VIEW_CALLBACK_ID,
  BLOCK_STATUS_TEXT,
  ELEMENT_STATUS_TEXT,
  BLOCK_STATUS_EMOJI,
  ELEMENT_STATUS_EMOJI,
  ACTION_DISCONNECT,
} from "./constants.js";
import {
  renderWorkflowStep,
  renderConnectAccount,
  renderUpdateStatusForm,
  parseStateFromView,
  getConnectAccountViewId,
} from "./view.js";

export const registerUpdateSlackStatusStep = function (app, storage) {
  console.log(`⚙️  Registering ${STEP_CALLBACK_ID}`);
  configureOauth(app, storage);

  // Register step config action
  app.action(
    {
      type: "workflow_step_edit",
      callback_id: STEP_CALLBACK_ID,
    },
    async ({ body, ack, context }) => {
      ack();

      const {
        workflow_step: {
          inputs = {},
          workflow_id: workflowId,
          step_id: stepId,
        } = {},
        user,
        team,
      } = body;

      const currentUserId = user.id;
      const currentTeamId = team.id;

      let userId = get(inputs, "user_id.value");
      let credentialTeamId = get(
        inputs,
        "credential_team_id.value",
        currentTeamId
      );
      let credentialUserId = get(
        inputs,
        "credential_user_id.value",
        currentUserId
      );

      const statusText = get(inputs, "status_text.value");
      const statusEmoji = get(inputs, "status_emoji.value");

      // configured user if we have it set w/ a credential, otherwise current user
      const onBehalfOfUserId =
        userId && credentialUserId ? userId : currentUserId;

      const userInfo = await app.client.users.info({
        token: context.botToken,
        user: onBehalfOfUserId,
      });

      const viewState = {
        // Set to the current user
        userId: onBehalfOfUserId,
        credentialTeamId,
        credentialUserId,
        userName: userInfo.user.real_name,
        userImage: userInfo.user.profile.image_192,
        statusText,
        statusEmoji,
      };

      let view = null;

      app.logger.info("Retreiving credential", currentTeamId, currentUserId);
      // Check to see if we have a stored credential for the current user already
      const userToken = await storage.getUserCredential(
        currentTeamId,
        currentUserId
      );
      app.logger.info("Credential exists", !!userToken);

      // We found a token for the current user, but step isn't configured for anyone yet, let's default to them
      if (userToken && !userId) {
        userId = currentUserId;
      }

      // Need a custom view id so we can update it in our oauth callback
      const externalViewId = getConnectAccountViewId({
        workflowId,
        stepId,
        userId: currentUserId,
      });

      // Render connect account view
      if (!userId || !userToken) {
        const oauthState = {
          externalViewId,
          userId: currentUserId,
          teamId: currentTeamId,
        };

        view = renderWorkflowStep(
          viewState,
          renderConnectAccount({
            oauthURL: buildOAuthURL({
              state: oauthState,
              team: currentTeamId,
            }),
          })
        );
      } else if (userId && credentialUserId) {
        view = renderWorkflowStep(viewState, renderUpdateStatusForm(viewState));
      }

      // Set an external_id we can use in oauth flow to update it with
      view.external_id = externalViewId;

      app.logger.info("Opening workflow step view", viewState);
      await app.client.views.open({
        token: context.botToken,
        trigger_id: body.trigger_id,
        view,
      });
    }
  );

  // Nothing to do here, it's a link button, but need to ack it
  app.action("connect_account_button", async ({ ack }) => ack());

  app.action(ACTION_DISCONNECT, async ({ ack, body, context }) => {
    ack();

    const { view, user, team } = body;
    const currentUserId = user.id;
    const currentTeamId = team.id;
    const externalViewId = view.external_id;

    const oauthState = {
      externalViewId,
      userId: currentUserId,
      teamId: currentTeamId,
    };

    const updatedView = {
      external_id: externalViewId,
      ...renderWorkflowStep(
        {},
        renderConnectAccount({
          oauthURL: buildOAuthURL({ state: oauthState, team: currentTeamId }),
        })
      ),
    };

    await app.client.views.update({
      token: context.botToken,
      view_id: view.id,
      view: updatedView,
    });
  });

  // Handle saving of step config
  app.view(VIEW_CALLBACK_ID, async ({ ack, view, body, context }) => {
    // Pull out any values from our view's state that we need that aren't part of the view submission
    const {
      userId,
      credentialTeamId,
      credentialUserId,
      userName,
      userImage,
    } = parseStateFromView(view);
    const workflowStepEditId = get(body, `workflow_step.workflow_step_edit_id`);

    const statusText = get(
      view,
      `state.values.${BLOCK_STATUS_TEXT}.${ELEMENT_STATUS_TEXT}.value`
    );
    const statusEmoji = get(
      view,
      `state.values.${BLOCK_STATUS_EMOJI}.${ELEMENT_STATUS_EMOJI}.value`
    );

    const inputs = {
      user_id: {
        value: userId,
      },
      credential_team_id: {
        value: credentialTeamId,
      },
      credential_user_id: {
        value: credentialUserId,
      },
      status_text: {
        value: statusText,
      },
      status_emoji: {
        value: statusEmoji,
      },
    };

    const errors = {};

    //TODO: validate the statusEmoji is a proper and single emoji string

    if (Object.values(errors).length > 0) {
      return ack({
        response_action: "errors",
        errors,
      });
    }

    ack();

    // construct payload for updating the step
    const params = {
      token: context.botToken,
      workflow_step_edit_id: workflowStepEditId,
      inputs,
      outputs: [
        {
          type: "user",
          name: "status_user",
          label: `User who's status was updated`,
        },
        {
          type: "text",
          name: "status_text",
          label: `Updated status text`,
        },
        {
          type: "text",
          name: "status_emoji",
          label: `Updated status emoji`,
        },
      ],
      step_name: `Update Slack Status for ${userName}`,
      step_image_url: userImage,
    };

    app.logger.info("Updating step", params);

    try {
      // Call the api to save our step config - we do this prior to the ack of the view_submission
      await app.client.apiCall("workflows.updateStep", params);
    } catch (e) {
      app.logger.error("error updating step: ", e.message);
    }
  });

  // Handle running the step
  app.event("workflow_step_execute", async ({ event, context }) => {
    const { callback_id, workflow_step = {} } = event;
    if (callback_id !== STEP_CALLBACK_ID) {
      return;
    }

    const { inputs = {}, workflow_step_execute_id } = workflow_step;
    const {
      status_text,
      status_emoji,
      user_id,
      credential_team_id,
      credential_user_id,
    } = inputs;

    try {
      // Get the credential for the api call
      const userToken = await storage.getUserCredential(
        credential_team_id.value,
        credential_user_id.value
      );
      const statusText = status_text.value || "";
      const statusEmoji = status_emoji.value || "";

      await app.client.users.profile.set({
        token: userToken,
        profile: {
          status_text: statusText,
          status_emoji: statusEmoji,
        },
      });

      // Report back that the step completed
      await app.client.apiCall("workflows.stepCompleted", {
        token: context.botToken,
        workflow_step_execute_id,
        outputs: {
          status_user: user_id.value,
          status_text: statusText,
          status_emoji: statusEmoji,
        },
      });

      app.logger.info("step completed", status_text.value, status_emoji.value);
    } catch (e) {
      app.logger.error("Error completing step", e.message);
      await app.client.apiCall("workflows.stepFailed", {
        token: context.botToken,
      });
    }
  });
};
