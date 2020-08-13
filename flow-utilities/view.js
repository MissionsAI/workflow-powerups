import { VIEW_CALLBACK_ID, ACTION_SUBTYPE, DELAY_SUBTYPE, ELEMENT_DURATION, BLOCK_DURATION } from "./constants.js";

export const renderStepConfig = function (state = {}) {
  return {
    type: "workflow_step",
    // View identifier
    callback_id: VIEW_CALLBACK_ID,
    blocks: renderBlocks(state),
    private_metadata: JSON.stringify(state),
  };
};

// return blocks for the main form
const renderBlocks = function (state) {
  const { subtype } = state
  switch (subtype) {
    case DELAY_SUBTYPE:
      return renderDelaySubtype(state)
      break;
  }
  return renderSubtypeSelection(state)
};

const renderDelaySubtype = function ({ subtype, delay_duration }) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Delay progress of the workflow",
        emoji: true
      }
    },
    {
      type: "input",
      block_id: BLOCK_DURATION,
      element: {
        action_id: ELEMENT_DURATION,
        type: "plain_text_input",
        initial_value: delay_duration || "1 minute"
      },
      label: {
        type: "plain_text",
        text: "Duration",
        emoji: true
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Provide a duration like `1 hour`, `30s`, `1h 20m`, etc. and we'll do our best to understand it. If the duration cannot be understood, the workflow will continue immediately"
        }
      ]
    }
  ]
  return blocks
}

const renderSubtypeSelection = function ({ }) {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Delay* \n_Pause the workflow for a configurable amount of time._"
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: "Select",
          emoji: true
        },
        action_id: ACTION_SUBTYPE,
        value: "delay"
      }
    },
    // {
    //   type: "section",
    //   text: {
    //     type: "mrkdwn",
    //     text: "*Filter* \n_Stop the workflow if some condition is met._"
    //   },
    //   accessory: {
    //     type: "button",
    //     text: {
    //       type: "plain_text",
    //       text: "Coming soon",
    //       emoji: true
    //     },
    //     action_id: ACTION_SUBTYPE,
    //     value: "filter"
    //   }
    // },
    // {
    //   type: "section",
    //   text: {
    //     type: "mrkdwn",
    //     text: "*Webhook* \n_Call a webhook (or more technically make an HTTP request but ignore the response)._"
    //   },
    //   accessory: {
    //     type: "button",
    //     text: {
    //       type: "plain_text",
    //       text: "Coming soon",
    //       emoji: true
    //     },
    //     action_id: ACTION_SUBTYPE,
    //     value: "webhook"
    //   }
    // }
  ];

  return blocks;
};