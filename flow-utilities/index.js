import get from "lodash.get";
import { promisify } from "util";
import parse from "parse-duration";
import moment from 'moment';
import { STEP_CALLBACK_ID, VIEW_CALLBACK_ID, ACTION_SUBTYPE, ELEMENT_DURATION, 
  BLOCK_DURATION, DELAY_SUBTYPE, REDIS_KEY_SCHEDULE } from "./constants.js";
import { renderStepConfig } from "./view.js";

export const registerFlowUtilitiesStep = function (app, storage) {
  // Register step config action
  const logger = app.logger
  logger.info(`⚙️  Registering ${STEP_CALLBACK_ID}`)

  // The step is editted
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
        subtype: get(inputs, "subtype.value", ""),
        delay_duration: get(inputs, "delay_duration.value", ""),
      };

      app.logger.info("flow-utilities: Opening config view", state);
      await app.client.views.open({
        token: context.botToken,
        trigger_id: body.trigger_id,
        view: renderStepConfig(state),
      });
    }
  );

  // The subtype has been selected
  app.action(ACTION_SUBTYPE, async ({ body, action, ack, client }) => {
    ack();
    const { view } = body;
    const subtype = action.value
    const state = {
      subtype,
    };

    await client.views.update({
      view_id: view.id,
      view: renderStepConfig(state),
    });    

  })

  // Handle saving of step config
  app.view(VIEW_CALLBACK_ID, async ({ ack, view, body, client, logger }) => {
    let metadata = {}
    try {
      metadata = JSON.parse(view.private_metadata)
    } catch(e) {
      logger.error("flow-utilities: Error parsing private metadata", e)
    }

    const subtype = metadata.subtype || ''
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

    ack();

    const params = {
      workflow_step_edit_id: workflowStepEditId,
      inputs,
      outputs: [],
      step_name: stepName,
    };

    logger.info("updateStep params: ", params);
    try {
      await client.workflows.updateStep(params);
    } catch (e) {
      logger.error("error updating step: ", e.message);
    }
  });

  // Handle execution of the step
  app.event("workflow_step_execute", async ({ event, logger, body }) => {
    const { callback_id, workflow_step = {} } = event;
    if (callback_id !== STEP_CALLBACK_ID) {
      return;
    }

    const { inputs = {}, workflow_step_execute_id } = workflow_step;
    const subtype = ( inputs.subtype || {} ).value || ''

    switch (subtype) {
      case DELAY_SUBTYPE:
        const durationStr = ( inputs.delay_duration || {} ).value || ''
        const durationMs = parse(durationStr) || 0
        const futureUnixTime = moment().add(durationMs, 'ms').unix();

        // TODO: refactor this out when we have a second usecase for the scheduled message queue
        // The simple `type` and `message` property of the envelop should apply regardless.
        const scheduled = {
          type: subtype,
          message: {
            team_id: body.team_id,
            step_completed_payload: {
              workflow_step_execute_id
            }
          }  
        };
    
        storage.addScheduled(REDIS_KEY_SCHEDULE, futureUnixTime, JSON.stringify(scheduled))            
        break;
      default:
        logger.info(`flow-utilities:workflow_step_execute: unknown subtype=${subtype}`);
        break;
    }
  });

  // The delay subtype needs a way to complete a step sometime in the future. This is a rather 
  // primitive interval processor for scheduled items. This implementation is like a delayed message
  // queue using a Redis sorted set. The score is the unix timestamp and the value is the message. 
  //
  // Surely there are more resillient ways to do this but for now the Redis sorted set and interval timer will do.
  // In the future, if we need to guarantee that messages are only processed once, we should implement a distributed
  // lock through Redis.
  let mutex = false;
  const processInterval =  () => {
    promisify(async () => {
      // Prevent the process intervals from stepping on each other and ensure only one is running at a time.
      // It's OK to skip one, because the iterval will go on firing forever. 
      if (mutex) {
        app.logger.info("flow-utilities: processInterval skipped because a prior is still running");
        return
      }
      mutex = true;

      const items = await storage.listScheduledBefore(REDIS_KEY_SCHEDULE, moment().unix())
      if (items && items.length > 0) {
        items.forEach(async (item) => {
          app.logger.info("flow-utilities: processing schedule for ", item)
          try {
            const { type, message = {} } = JSON.parse(item);
            if (type === DELAY_SUBTYPE) {
              // lookup installation to get token based on team_id
              const installation = await storage.getInstalledTeam(message.team_id)
              const botToken = get(installation, "bot.token", "");
              const payload = message.step_completed_payload || {};
              payload.token = botToken;
              await app.client.workflows.stepCompleted(payload);
            }
          } catch(e) {
            console.error("flow-utilities: error processing scheduled item", e, item)
          }

          // Naively complete scheduled item event it it failed, otherwise it could go on forever
          // TODO: retry a limited number of times? 
          // If we retry, we should complete the schedule and reschedule and use a newly calculated
          // unix time in the future to implement a backoff strategy. We could add a new property
          // to the envelop like `num_retries` that could be incremented with each successive retry.
          storage.completeScheduled(REDIS_KEY_SCHEDULE, item)
        });
      }

      // Hint - make sure this code path is ALWAYS reachable (ie don't every premptively `return` above)
      mutex = false;
    })()
  }

  // Every 1.5s seems reasonable, break out into a configurable value in the future if desirable.
  setInterval(processInterval, 1500)
};