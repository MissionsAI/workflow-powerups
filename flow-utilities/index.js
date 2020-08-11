import get from "lodash.get";
import parse from "parse-duration";
import moment from 'moment';
import { STEP_CALLBACK_ID, VIEW_CALLBACK_ID, ACTION_SUBTYPE, ELEMENT_DURATION, BLOCK_DURATION } from "./constants.js";
import { renderStepConfig } from "./view.js";

export const registerFlowUtilitiesStep = function (app) {
  // Register step config action
  console.log(`⚙️  Registering ${STEP_CALLBACK_ID}`)
  app.action(
    {
      type: "workflow_step_edit",
      callback_id: STEP_CALLBACK_ID,
    },
    async ({ body, ack, context }) => {
      ack();

      const { workflow_step: { inputs = {} } = {} } = body;

      // Setup block kit ui state from current config
      const state = {
        subtype: get(inputs, "subtype.value", "")
      };

      app.logger.info("Opening config view", state);
      await app.client.views.open({
        token: context.botToken,
        trigger_id: body.trigger_id,
        view: renderStepConfig(state),
      });
    }
  );

  app.action(ACTION_SUBTYPE, async ({ context, body, action, ack }) => {
    ack();
    const { view } = body;
    const subtype = action.value

    const state = {
      subtype,
    };

    await app.client.views.update({
      token: context.botToken,
      view_id: view.id,
      view: renderStepConfig(state),
    });    

  })

  // Handle saving of step config
  app.view(VIEW_CALLBACK_ID, async ({ ack, view, body, context }) => {
    let metadata = {}
    try {
      metadata = JSON.parse(view.private_metadata)
    } catch(e) {
      console.log("Error parsing private metadata", e)
    }

    const subtype = metadata.subtype || ''
    console.log(subtype)
    const workflowStepEditId = get(body, `workflow_step.workflow_step_edit_id`);
    const durationStr = get(view, `state.values.${BLOCK_DURATION}.${ELEMENT_DURATION}.value`);

    // TODO make dyanmic for different subtypes
    let stepName = 'Delay the workflow';

    // check if duration contains any dynamic references
    if (durationStr.indexOf("{") < 0) {
      const durationMs = parse(durationStr) || 0
      stepName = `Delay the workflow for about ${moment.duration(durationMs).humanize()}`
    }

    const inputs = {
      delay_duration: {
        value: durationStr,
      },
      subtype: {
        value: subtype,
      }
    };

    const errors = {};

    // if (strings.length === 0) {
    //   errors.text_1 = "Please provide at least one string";
    // }

    // ack the view submission, we're all good there
    ack();

    // Now we need to update the step
    // Construct payload for updating the step
    const params = {
      token: context.botToken,
      workflow_step_edit_id: workflowStepEditId,
      inputs,
      outputs: [],
      step_name: stepName,
    };

    app.logger.info("updateStep params: ", params);

    // Call the api to save our step config - we do this prior to the ack of the view_submission
    try {
      await app.client.apiCall("workflows.updateStep", params);
    } catch (e) {
      app.logger.error("error updating step: ", e.message);
    }
  });

  // Handle running the step
  app.event("workflow_step_execute", async ({ event, body, context }) => {
    const { callback_id, workflow_step = {} } = event;
    if (callback_id !== STEP_CALLBACK_ID) {
      return;
    }

    const { inputs = {}, workflow_step_execute_id } = workflow_step;
    const { strings = {} } = inputs;
    const values = strings.value || [];

    // Grab a random string
    var randomString = values[Math.floor(Math.random() * values.length)];

    // Report back that the step completed
    try {
      await app.client.apiCall("workflows.stepCompleted", {
        token: context.botToken,
        workflow_step_execute_id,
        outputs: {
          random_string: randomString || "",
        },
      });

      app.logger.info("step completed", randomString || "");
    } catch (e) {
      app.logger.error("Error completing step", e.message, randomString || "");
    }
  });
};