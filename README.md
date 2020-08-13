# Slack Workflow Builder Power-Ups
A collection of simple Workflow Builder extensions (aka Steps from Apps) to serve as examples and be useful in their own right. 

This project is being developed in the open and will stagger it's way to maturity.
![under construction](https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fmondrian.mashable.com%2Fuploads%25252Fcard%25252Fimage%25252F168421%25252Ftumblr_ks4m18IymX1qz4u07o1_250.gif%25252Ffull-fit-in__950x534.gif%3Fsignature%3DQmYdcxMZN9xRJEWdrQIXh3KiiUQ%3D%26source%3Dhttps%253A%252F%252Fblueprint-api-production.s3.amazonaws.com&f=1&nofb=1)

## Setting up the Slack App
Create an app at api.slack.com and add the configuration below.

#### Oauth and Permissions
Redirect URLs:
* `<your host>/slack/oauth_redirect`
* `<your host>/update-status-step/auth/callback`

Bot Token Scopes:
* `users:read`
* `workflow.steps:execute`

User Token Scopes:
* `users.profile:write`

#### Enable Interactivity
Request URL: `<your host>/slack/events`

#### Enable Events
Request URL: `<your host>/slack/events`

#### Workflow Steps Configuration
Enable and then define these steps (Name - Callback ID):
* `Random String` - `random_string`
* `Update your status` - `update_status`
* `Flow Utilities` - `flow_utilities`

## Configuration
To run locally you'll need a `.env` file with these properties:

```
export SLACK_SIGNING_SECRET=
export SLACK_CLIENT_ID=
export SLACK_CLIENT_SECRET=
<<<<<<< HEAD
export STATE_SECRET=
=======
export STATE_SECRET=<generate some secret value for your install>
>>>>>>> added Slack app configuration details to README
export HOST=https://host
export REDIS_URL=redis://127.0.0.1:6379
```

And then to run with nodemon: `npm run-script dev`