import get from "lodash.get";
import { configureOauth, buildOAuthURL } from "./oauth.js";
import {
  STEP_CALLBACK_ID,
  VIEW_CALLBACK_ID,
  BLOCK_STATUS_TEXT,
  ELEMENT_STATUS_TEXT,
  BLOCK_STATUS_EMOJI,
  ELEMENT_STATUS_EMOJI,
} from "./constants.js";
import {
  renderWorkflowStep,
  renderConnectAccount,
  renderUpdateStatusForm,
  parseStateFromView,
  getConfigureStepViewId,
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

      // We'll use this view id for the step configuration so we can look it up during the
      // connect account flow if needed so we can update it
      const externalViewId = getConfigureStepViewId({
        workflowId,
        stepId,
        userId: currentUserId,
      });

      // Setup OAuth URL for views
      const oauthURL = buildOAuthURL({
        state: {
          // todo: we could derive this in the receiver if we want
          externalViewId,
          workflowId,
          stepId,
          userId: currentUserId,
          teamId: currentTeamId,
        },
        team: currentTeamId,
      });

      // Lookup current step's credential id, it should contain the user & team
      let stepCredential = await storage.getStepCredential(workflowId, stepId);

      if (!stepCredential) {
        // If we have no step credential, try to lookup the current user's credential and create a step credential
        const userCredential = await storage.getUserCredential(
          currentTeamId,
          currentUserId
        );

        // This means the user has already authenticated with this app previously
        // So we'll default and store to them for the step credential
        if (userCredential) {
          stepCredential = await storage.setStepCredential(
            workflowId,
            stepId,
            currentTeamId,
            currentUserId
          );
        } else {
          // In this scenario, the user hasn't authenticated w/ the app yet
          // and the step has no credential configured, so we'll force a connect account view

          // No view state for connect account view
          const viewState = {};

          view = renderWorkflowStep(
            null,
            renderConnectAccount({
              oauthURL,
            })
          );
          view.external_id = externalViewId;

          await app.client.views.open({
            token: context.botToken,
            trigger_id: body.trigger_id,
            view,
          });
          return;
        }
      }

      // If we've made it this far, we have a step credential configured
      const statusText = get(inputs, "status_text.value");
      const statusEmoji = get(inputs, "status_emoji.value");

      const userInfo = await app.client.users.info({
        token: context.botToken,
        user: stepCredential.userId,
      });

      const viewState = {
        userName: userInfo.user.real_name,
        userImage: userInfo.user.profile.image_192,
        statusText,
        statusEmoji,
        showChangeAccount: stepCredential.userId !== currentUserId,
        oauthURL,
      };

      const view = renderWorkflowStep(
        viewState,
        renderUpdateStatusForm(viewState)
      );
      view.external_id = externalViewId;

      await app.client.views.open({
        token: context.botToken,
        trigger_id: body.trigger_id,
        view,
      });
    }
  );

  // Nothing to do here, it's a link button, but need to ack it
  app.action("connect_account_button", async ({ ack }) => ack());

  // Handle saving of step config
  app.view(VIEW_CALLBACK_ID, async ({ ack, view, body, context }) => {
    // Pull out any values from our view's state that we need that aren't part of the view submission
    const { userName, userImage } = parseStateFromView(view);
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
      status_text: {
        value: statusText || "",
      },
      status_emoji: {
        value: statusEmoji || "",
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
    };

    try {
      // Call the api to save our step config - we do this prior to the ack of the view_submission
      await app.client.workflows.updateStep(params);
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

    const {
      inputs = {},
      workflow_id,
      step_id,
      workflow_step_execute_id,
    } = workflow_step;

    const stepCredential = await storage.getStepCredential(
      workflow_id,
      step_id
    );

    // if we have a step credential, verify we also have a token
    // for the user configured for this workflow/step combo
    const userToken =
      stepCredential &&
      (await storage.getUserCredential(
        stepCredential.teamId,
        stepCredential.userId
      ));

    // Verify we have a step credential for this workflow/step combo
    if (!stepCredential || !userToken) {
      if (!stepCredential) {
        app.logger.error("No step credential found", { workflow_id, step_id });
      } else if (!userToken) {
        app.logger.error("No user credential found", {
          team_id: stepCredential.teamId,
          user_id: stepCredential.userId,
        });
      }

      await app.client.workflows.stepFailed({
        token: context.botToken,
        workflow_step_execute_id,
        error: {
          message:
            "Step must be re-configured with a User to update the status for.",
        },
      });
      return;
    }

    try {
      const { status_text, status_emoji } = inputs;
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
      await app.client.workflows.stepCompleted({
        token: context.botToken,
        workflow_step_execute_id,
        outputs: {
          status_user: stepCredential.userId,
          status_text: statusText,
          status_emoji: statusEmoji,
        },
      });

      app.logger.info("step completed", status_text.value, status_emoji.value);
    } catch (e) {
      app.logger.error("Error completing step", e.message);
      await app.client.workflows.stepFailed({
        token: context.botToken,
        error: {
          message: "We were unable to update the user profile status",
        },
      });
    }
  });
};
