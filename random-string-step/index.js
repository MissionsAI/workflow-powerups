import get from "lodash.get";
import { STEP_CALLBACK_ID, VIEW_CALLBACK_ID } from "./constants.js";
import { renderStepConfig } from "./view.js";

export const registerRandomStringStep = function (app) {
  // Register step config action
  app.logger.info(`⚙️  Registering ${STEP_CALLBACK_ID}`)
  app.action(
    {
      type: "workflow_step_edit",
      callback_id: STEP_CALLBACK_ID,
    },
    async ({ body, ack, logger, client }) => {
      await ack();

      const { workflow_step: { inputs = {} } = {} } = body;

      // Setup block kit ui state from current config
      const state = {
        strings: get(inputs, "strings.value", []),
      };

      logger.info("Opening config view", state);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: renderStepConfig(state),
      });
    }
  );

  // Handle saving of step config
  app.view(VIEW_CALLBACK_ID, async ({ ack, view, body, logger, client }) => {
    const workflowStepEditId = get(body, `workflow_step.workflow_step_edit_id`);

    const text1 = get(view, `state.values.text_1.text_1.value`);
    const text2 = get(view, `state.values.text_2.text_2.value`);
    const text3 = get(view, `state.values.text_3.text_3.value`);
    const text4 = get(view, `state.values.text_4.text_4.value`);
    const text5 = get(view, `state.values.text_5.text_5.value`);

    // Grab an array of strings with values
    const strings = [
      (text1 || "").trim(),
      (text2 || "").trim(),
      (text3 || "").trim(),
      (text4 || "").trim(),
      (text5 || "").trim(),
    ].filter(Boolean);

    const inputs = {
      strings: {
        value: strings,
      },
    };

    const errors = {};

    // Ensure we have at least 1 value, if not, attach an error to the first input block
    if (strings.length === 0) {
      errors.text_1 = "Please provide at least one string";
    }

    if (Object.values(errors).length > 0) {
      return ack({
        response_action: "errors",
        errors,
      });
    }

    // Soooper secret way to test what happens when the step doesn't call workflows.updateSte
    if (strings[0] === "burpadurp") {
      return;
    }

    // ack the view submission, we're all good there
    await ack();

    // Now we need to update the step
    // Construct payload for updating the step
    const params = {
      workflow_step_edit_id: workflowStepEditId,
      inputs,
      outputs: [
        {
          name: "random_string",
          type: "text",
          label: "Random String",
        },
      ],
      step_name: `Pick 1 of ${strings.length} strings`,
    };

    // Hack to test different urls
    if (!!text5) {
      params.step_image_url = text5;
    }

    logger.info("updateStep params: ", params);

    // Call the api to save our step config - we do this prior to the ack of the view_submission
    try {
      await client.workflows.updateStep(params);
    } catch (e) {
      logger.error("error updating step: ", e.message);
    }
  });

  // Handle running the step
  app.event("workflow_step_execute", async ({ event, client, logger }) => {
    const { callback_id, workflow_step = {} } = event;
    if (callback_id !== STEP_CALLBACK_ID) {
      return;
    }

    const { inputs = {}, workflow_step_execute_id } = workflow_step;
    const { strings = {} } = inputs;
    const values = strings.value || [];

    // Grab a random string
    const randomString = values[Math.floor(Math.random() * values.length)];

    // Report back that the step completed
    try {
      await client.workflows.stepCompleted({
        workflow_step_execute_id,
        outputs: {
          random_string: randomString || "",
        },
      });

      logger.info("step completed", STEP_CALLBACK_ID, randomString || "");
    } catch (e) {
      logger.error("Error completing step", e.message, randomString || "");
    }
  });
};