import {
  VIEW_CALLBACK_ID,
  BLOCK_STATUS_TEXT,
  ELEMENT_STATUS_TEXT,
  BLOCK_STATUS_EMOJI,
  ELEMENT_STATUS_EMOJI,
  BLOCK_ACCOUNT,
} from "./constants.js";
import { buildOAuthURL } from "./oauth.js";

export const renderWorkflowStep = function (state = {}, blocks) {
  return {
    type: "workflow_step",
    // View identifier
    callback_id: VIEW_CALLBACK_ID,
    blocks,
    // Push the state into metadata to have access on view_submission (being kinda lazy and putting more than needed in here)
    private_metadata: JSON.stringify(state),
  };
};

export const renderConnectAccount = ({ oauthURL }) => {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `In order to run this step on behalf of you, we'd like to request some permissions from you.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          action_id: "connect_account_button",
          type: "button",
          style: "primary",
          text: {
            type: "plain_text",
            text: "Request Permissions",
          },
          url: oauthURL,
        },
      ],
    },
  ];

  return blocks;
};

export const getConfigureStepViewId = ({ userId, workflowId, stepId }) => {
  return `connect_${workflowId}_${stepId}_${userId}_${Date.now()}`;
};

// return blocks for the main form
export const renderUpdateStatusForm = function ({
  userName,
  userImage,
  statusText = "",
  statusEmoji = "",
  showChangeAccount = false,
  oauthURL = "",
}) {
  const blocks = [
    {
      type: "section",
      block_id: BLOCK_ACCOUNT,
      text: {
        type: "mrkdwn",
        text: `When this step runs, it will update the status of the following user.`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "image",
          image_url: userImage,
          alt_text: userName,
        },
        {
          type: "mrkdwn",
          text: userName,
        },
      ],
    },
  ];

  if (!showChangeAccount && buildOAuthURL) {
    blocks.push({
      type: "actions",
      elements: [
        {
          action_id: "connect_account_button",
          type: "button",
          text: {
            type: "plain_text",
            text: "Change to Me",
          },
          url: oauthURL,
        },
      ],
    });
  }

  blocks.push(
    {
      type: "divider",
    },
    {
      type: "input",
      block_id: BLOCK_STATUS_TEXT,
      optional: true,
      element: {
        action_id: ELEMENT_STATUS_TEXT,
        type: "plain_text_input",
        initial_value: statusText || "",
      },
      label: {
        type: "plain_text",
        text: "Status Text",
      },
    },
    {
      type: "input",
      block_id: BLOCK_STATUS_EMOJI,
      optional: true,
      element: {
        action_id: ELEMENT_STATUS_EMOJI,
        type: "plain_text_input",
        initial_value: statusEmoji || "",
      },
      label: {
        type: "plain_text",
        text: "Status Emoji",
      },
    }
  );

  return blocks;
};

export const serializeStateForView = (state = {}) => {
  return JSON.stringify(state);
};

export const parseStateFromView = (view) => {
  let state = {};

  try {
    state = JSON.parse(view.private_metadata);
  } catch (e) {
    console.log(e);
  }

  return state;
};
